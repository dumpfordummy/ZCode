import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { createIsolation, root } from "./isolation.mjs";
import { prepareZ7Fixture, contribution, z7Runner } from "./z7-fixture.mjs";
import { startZ7Provider } from "./z7-provider-fixture.mjs";
import {
  COMPANION_INSTRUCTION,
  COMPANION_QUESTION_OPTION,
  COMPANION_COMPLETION,
  COMPANION_TOOL_ID,
} from "./provider-fixture.mjs";
import { capture, ledger, nativeSessions } from "./z5-native-observe.mjs";
import { decide } from "./z3-native-helpers.mjs";
import {
  setupPlan,
  approveParallel,
  driveParallel,
  parentRun,
  childRun,
  showParallel,
  openChild,
} from "./z7-native-ui.mjs";

const scenario = process.argv.find((v) => v.startsWith("--scenario="))?.slice(11) ?? "complete";
const concurrency = Number(
  process.argv.find((v) => v.startsWith("--concurrency="))?.slice(14) ?? 2,
);
assert.ok(["complete", "combined-failure", "failure", "restart", "conflict"].includes(scenario));
const isolation = await createIsolation({ fixtureFactory: (w) => startZ7Provider(w, scenario) });
const summary = {
  scenario,
  concurrency,
  home: isolation.home,
  workspace: isolation.workspace,
  screenshots: [],
  assertions: [],
  startedAt: Date.now(),
};
console.error(`Z7 isolated profile: ${isolation.home}`);
let window, failure;
try {
  summary.fixture = await prepareZ7Fixture(isolation);
  summary.build = await Promise.all(
    [
      "apps/zcode-cli/packages/cli/dist/zcode.cjs",
      "packages/desktop/out/main/index.js",
      "packages/desktop/out/host/index.js",
      "packages/desktop/out/renderer/index.html",
    ].map(async (file) => ({
      file,
      sha256: createHash("sha256")
        .update(await readFile(path.join(root, file)))
        .digest("hex"),
    })),
  );
  window = await isolation.launch();
  if (scenario === "failure") {
    await window.getByTestId("v4-composer-input").fill(COMPANION_INSTRUCTION);
    await window.getByTestId("v4-composer-send").click();
    await window
      .getByRole("option", { name: new RegExp(COMPANION_QUESTION_OPTION) })
      .waitFor({ timeout: 45000 });
    summary.companionSessionId = await window
      .locator('[data-testid^="v4-session-pane"]:visible')
      .first()
      .getAttribute("data-session-id");
  }
  await setupPlan(isolation, window, summary, concurrency);
  const prepared = await parentRun(isolation);
  summary.prepared = prepared;
  assert.equal(
    new Set([...prepared.children, prepared.integration].map((c) => c.workspace.workspacePath))
      .size,
    3,
  );
  assert.ok(
    [...prepared.children, prepared.integration].every(
      (c) => c.workspace.base.head === summary.fixture.base,
    ),
  );
  summary.workStartedAt = Date.now();
  await approveParallel(window);
  if (scenario === "restart" || scenario === "failure") {
    const pending = await driveParallel(
      isolation,
      window,
      summary,
      async (run) => {
        const children = await Promise.all(run.children.map((c) => childRun(isolation, c)));
        return (
          children.length === 2 &&
          children.every(Boolean) &&
          children[1].status === "WaitingForPermission" &&
          (scenario !== "restart" || children[0].status === "WaitingForPermission")
        );
      },
      { approve: false },
    );
    summary.beforeInterruption = pending;
    await capture(isolation, window, summary, "z7-active-independent-native-workers");
    if (scenario === "failure") {
      isolation.fixture.failWorker();
      const stopped = await driveParallel(
        isolation,
        window,
        summary,
        async (r) =>
          r.phase === "Stopped" &&
          (await childRun(isolation, r.children[1]))?.status === "Cancelled",
        { approve: false },
      );
      assert.equal(stopped.integration.admission, undefined);
      await window.getByRole("button", { name: "Back to chat", exact: true }).click();
      await window.getByTestId(`task-item-${summary.companionSessionId}`).click();
      const answer = window.getByRole("option", { name: new RegExp(COMPANION_QUESTION_OPTION) });
      await answer.waitFor();
      assert.equal(
        isolation.fixture.toolResults.some((r) => r.id === COMPANION_TOOL_ID),
        false,
      );
      await answer.press("Enter");
      await window.getByText(COMPANION_COMPLETION, { exact: false }).waitFor({ timeout: 45000 });
      await capture(isolation, window, summary, "z7-unrelated-native-chat-survives");
      summary.assertions.push(
        "One actual worker failed while its sibling awaited Edit permission. Only that owned sibling was cancelled; unrelated native Chat retained its question and completed after an explicit answer.",
      );
    } else {
      const before = await ledger(isolation),
        requests = isolation.fixture.requests.filter((r) => r.native).length;
      await isolation.stopApp();
      window = await isolation.launch();
      await showParallel(isolation, window);
      const after = await parentRun(isolation);
      assert.equal(after.phase, "Interrupted");
      assert.deepEqual(
        (await ledger(isolation)).map((r) => r.id),
        before.map((r) => r.id),
      );
      assert.equal(isolation.fixture.requests.filter((r) => r.native).length, requests);
      assert.deepEqual(
        after.children.map((c) => c.requestId),
        pending.children.map((c) => c.requestId),
      );
      for (const c of [...after.children, after.integration])
        assert.ok((await stat(c.workspace.workspacePath)).isDirectory());
      await capture(isolation, window, summary, "z7-restarted-no-replay");
    }
    summary.assertions.push(
      "Actual native active workers did not authorize integration or additional worker admission; pinned ownership retained.",
    );
  } else {
    let run = await driveParallel(isolation, window, summary, (r) => r.phase === "JoinReview");
    summary.workerFinishedAt = Date.now();
    summary.join = run;
    const natives = await Promise.all(run.children.map((c) => childRun(isolation, c)));
    assert.ok(natives.every((r) => r.status === "Completed"));
    const sessions = natives.flatMap((r) => nativeSessions(isolation, r));
    assert.equal(new Set(sessions.map((s) => s.directory)).size, 2);
    // 本地 native 表的可选 workspace_id 为 null；实际准入使用真实目录、进程身份与精确 session/input。
    assert.equal(new Set(natives.map((r) => r.nodeAttempts[0].runtimeIdentity)).size, 2);
    assert.deepEqual(
      new Set(sessions.map((s) => s.directory)),
      new Set(run.children.map((c) => c.workspace.workspacePath)),
    );
    assert.ok(sessions.every((s) => s.parent_id === null));
    summary.workerSessions = sessions;
    for (const child of run.children) {
      const own = child.id === "worker-a" || scenario === "conflict" ? "PartA" : "PartB",
        sibling = own === "PartA" ? "PartB" : "PartA";
      assert.equal(
        await readFile(path.join(child.workspace.workspacePath, `${sibling}.cs`), "utf8"),
        contribution(sibling, 0),
      );
      const report = JSON.parse(
        await readFile(path.join(child.workspace.workspacePath, "results/branch.json"), "utf8"),
      );
      assert.equal(report.tests.length, 3);
      assert.ok(report.tests.every((t) => t.status === "passed"));
      assert.deepEqual(
        child.proposal.files.map((f) => f.path),
        [`${own}.cs`],
      );
    }
    await showParallel(isolation, window);
    await capture(isolation, window, summary, "z7-join-full-proposals");
    if (scenario === "conflict") {
      const before = await ledger(isolation);
      await window.getByTestId("parallel-conflict-PartA.cs").waitFor();
      await approveParallel(window);
      await window.getByRole("alert").filter({ hasText: "conflict choice" }).waitFor();
      assert.equal((await parentRun(isolation)).phase, "JoinReview");
      assert.equal((await parentRun(isolation)).integration.admission, undefined);
      assert.deepEqual(await ledger(isolation), before);
      await capture(isolation, window, summary, "z7-conflict-stops-unreviewed-integration");
      await window.getByTestId("parallel-conflict-PartA.cs").selectOption("worker-b");
      summary.assertions.push(
        "Two native workers proposed different complete contents for PartA.cs. Missing conflict choice refused integration without any new input; explicit reviewed worker B selection was required.",
      );
    }
    await approveParallel(window);
    run = await driveParallel(
      isolation,
      window,
      summary,
      async (r) =>
        r.phase === "Stopped" ||
        (await childRun(isolation, r.validation))?.status === "WaitingForApproval",
    );
    const combined = await childRun(isolation, run.validation);
    summary.combined = combined;
    if (scenario === "combined-failure") {
      assert.equal(run.phase, "Stopped");
      assert.equal(combined.status, "Failed");
      assert.equal(combined.toolAttempts.find((t) => t.nodeId === "test").status, "Failed");
      assert.ok(
        !combined.approvalAttempts.some(
          (g) => g.status === "WaitingForApproval" || g.status === "Approved",
        ),
      );
      summary.assertions.push(
        "Both actual branch test processes passed all three tests. Actual integrated Build succeeded, but combined native Test failed; final human approval and success were blocked.",
      );
      await showParallel(isolation, window);
      await capture(isolation, window, summary, "z7-combined-test-failure-blocks-success");
    } else {
      assert.equal(combined.status, "WaitingForApproval");
      assert.equal(combined.toolAttempts.find((t) => t.nodeId === "test").verification.passed, 3);
      await showParallel(isolation, window);
      await window.getByTestId("parallel-inspect-validation").click();
      await window.getByTestId("parallel-child-node-final-review").click();
      await window.getByTestId("graph-approval-request").scrollIntoViewIfNeeded();
      await capture(isolation, window, summary, "z7-combined-diff-tests-final-review");
      await decide(
        window,
        "approve",
        "Reviewed exact integrated source and all three actual independent combined tests. Synthetic acceptance only; no publication.",
      );
      run = await driveParallel(isolation, window, summary, (r) => r.phase === "Completed");
      summary.completedAt = Date.now();
      assert.equal(run.admissions, 5);
      if (scenario === "conflict") {
        assert.equal(run.integrationDecision.resolutions["PartA.cs"], "worker-b");
        assert.equal(
          await readFile(path.join(run.integration.workspace.workspacePath, "PartA.cs"), "utf8"),
          contribution("PartA", 2),
        );
        assert.equal(
          await readFile(path.join(run.integration.workspace.workspacePath, "PartB.cs"), "utf8"),
          contribution("PartB", 0),
        );
      }
      summary.assertions.push(
        "Two exact native worker sessions modified distinct app-owned clones; full proposals were reviewed and applied by a fresh native integration session, rebuilt/retested by two native Tool sessions and approved at the final gate.",
      );
      const before = await ledger(isolation);
      await openChild(isolation, window, summary, run.children[0], natives[0].nodeAttempts[0]);
      assert.deepEqual(
        await ledger(isolation),
        before,
        "Opening a worker conversation must reuse its existing input/session.",
      );
      await showParallel(isolation, window);
      await window
        .getByTestId("parallel-review-comment")
        .fill("Retain active runtime; explicit cleanup must wait for inactivity.");
      await window
        .getByTestId("parallel-cleanup-worker-a")
        .locator("..")
        .locator("..")
        .locator(":scope > summary")
        .click();
      await window.getByTestId("parallel-cleanup-worker-a").click();
      await window
        .getByRole("alert")
        .filter({ hasText: "runtime still owns" })
        .waitFor({ timeout: 30000 });
      for (const c of [...run.children, run.integration]) {
        const item = window.getByTestId(`workspace-item-${c.workspace.workspacePath}`);
        if (await item.count()) {
          await item.hover();
          await item.getByRole("button", { name: "More", exact: true }).click();
          await window.getByTestId(`workspace-close-${c.workspace.workspacePath}`).click();
        }
      }
      await isolation.stopApp();
      window = await isolation.launch();
      await showParallel(isolation, window);
      assert.equal((await parentRun(isolation)).phase, "Completed");
      assert.deepEqual(
        (await ledger(isolation)).map((r) => r.id),
        before.map((r) => r.id),
      );
      await capture(isolation, window, summary, "z7-completed-history-after-restart");
      await window
        .getByTestId("parallel-review-comment")
        .fill(
          "Explicitly remove only inactive owned worker A; retain sibling and integrated result.",
        );
      await window
        .getByTestId("parallel-cleanup-worker-a")
        .locator("..")
        .locator("..")
        .locator(":scope > summary")
        .click();
      await window.getByTestId("parallel-cleanup-worker-a").click();
      const cleaned = await driveParallel(
        isolation,
        window,
        summary,
        (r) => r.children[0].workspace.cleaned,
        { approve: false },
      );
      await assert.rejects(stat(cleaned.children[0].workspace.workspacePath));
      assert.ok((await stat(cleaned.children[1].workspace.workspacePath)).isDirectory());
      assert.ok((await stat(cleaned.integration.workspace.workspacePath)).isDirectory());
      assert.equal(
        cleaned.cleanup[0].reason,
        "Explicitly remove only inactive owned worker A; retain sibling and integrated result.",
      );
      await capture(isolation, window, summary, "z7-explicit-inactive-worker-cleanup");
    }
  }
  for (const part of ["PartA", "PartB"])
    assert.equal(
      await readFile(path.join(isolation.workspace, `${part}.cs`), "utf8"),
      contribution(part, 0),
    );
  assert.equal(await readFile(path.join(isolation.workspace, "Runner.cs"), "utf8"), z7Runner);
  assert.deepEqual(isolation.fixture.errors, []);
} catch (error) {
  failure = error;
  process.exitCode = 1;
  summary.error = String(error.stack ?? error);
  summary.body = await window
    ?.locator("body")
    .innerText()
    .catch(() => "Unavailable");
  if (window) await capture(isolation, window, summary, "z7-failure").catch(() => {});
}
summary.status = failure ? "FAIL" : "PASS";
summary.finishedAt = Date.now();
summary.final = await parentRun(isolation).catch(() => undefined);
summary.ledger = await ledger(isolation).catch(() => undefined);
summary.toolResults = isolation.fixture.toolResults;
summary.providerErrors = isolation.fixture.errors;
summary.modelRequests = isolation.fixture.requests.filter((r) => r.model).length;
await writeFile(path.join(isolation.home, "z7-summary.json"), JSON.stringify(summary, null, 2));
console.log(
  JSON.stringify({
    status: summary.status,
    scenario,
    concurrency,
    home: isolation.home,
    error: summary.error,
    modelRequests: summary.modelRequests,
  }),
);
await isolation.close();
