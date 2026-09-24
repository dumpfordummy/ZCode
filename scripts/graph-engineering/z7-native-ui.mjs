import assert from "node:assert/strict";
import { setTimeout as wait } from "node:timers/promises";
import { readFile } from "node:fs/promises";
import { acceptancePaths } from "./acceptance-paths.mjs";
import { ledger } from "./z3-native-helpers.mjs";
import { approveNativePermissionOnce } from "./native-permission.mjs";
import { capture } from "./z5-native-observe.mjs";

export async function parentRun(isolation) {
  return JSON.parse(await readFile(acceptancePaths(isolation).record, "utf8")).parallel?.runs.at(
    -1,
  );
}
export async function childRun(isolation, child) {
  if (!child.workspace) return undefined;
  const record = JSON.parse(
    await readFile(
      acceptancePaths({ ...isolation, workspace: child.workspace.workspacePath }).record,
      "utf8",
    ),
  );
  return record.runs.find((r) => r.requestId === child.requestId);
}
export async function showParallel(isolation, window) {
  const item = window.getByTestId(`workspace-item-${isolation.workspace}`);
  if ((await item.getAttribute("aria-expanded")) === "true") await item.click();
  await item.click();
  if (!(await window.getByTestId("graph-engineering-panel").isVisible()))
    await window.getByTestId("graph-engineering-open").click();
  if (!(await window.getByTestId("parallel-panel").isVisible()))
    await window.getByTestId("graph-parallel-toggle").click();
  await window.getByTestId("parallel-runs").click();
}
export async function setupPlan(isolation, window, summary, concurrency) {
  await window.getByTestId("graph-engineering-open").click();
  await window.getByTestId("graph-parallel-toggle").click();
  assert.equal(await window.getByTestId("parallel-enabled").isChecked(), false);
  assert.equal(await window.getByTestId("parallel-preview").isDisabled(), true);
  await window.getByTestId("parallel-enabled").setChecked(true);
  for (const [id, value] of Object.entries({
    request:
      summary.scenario === "conflict"
        ? "Propose conflicting PartA.cs values: worker A proposes 1 and worker B proposes 2. Keep PartB=0. Human must choose exactly one complete proposal; preserve all tests."
        : summary.scenario === "combined-failure"
          ? "Negative acceptance: set A=1 and B=1, each branch passes alone but the existing combined test must reject integration. Preserve all assertions."
          : "Implement independent contributions A=1 and B=2; preserve all independent tests.",
    sharedContract:
      "Only PartA.cs and PartB.cs may change. Preserve Runner.cs and MathOps.cs. The combined (1,1) state must fail existing tests.",
    resultRequirements:
      "Full reviewed integration and fresh native Build/Test of all three independent assertions; no original publication.",
    buildRecipeId: "fixture-build",
    testRecipeId: "fixture-test",
    deadlineMs: "1200000",
    admissionBudget: "5",
  }))
    await window.getByTestId(`parallel-${id}`).fill(value);
  await window.getByTestId("parallel-concurrency").selectOption(String(concurrency));
  for (const [id, name] of [
    ["worker-a", "PartA"],
    ["worker-b", summary.scenario === "conflict" ? "PartA" : "PartB"],
  ]) {
    await window
      .getByTestId(`parallel-${id}-instructions`)
      .fill(
        `Read ${name}.cs and update its Value to the controlled requested value. Run actual offline Build/Test, preserve test authority, report actual result.`,
      );
    await window.getByTestId(`parallel-${id}-files`).fill(`${name}.cs`);
  }
  await window.getByTestId("parallel-save").click();
  await window.getByTestId("parallel-preview").click();
  await window.getByTestId("parallel-preflight").waitFor({ timeout: 30000 });
  await capture(isolation, window, summary, "z7-approved-native-preflight");
  const before = await ledger(isolation);
  await window.getByTestId("parallel-prepare-ack").setChecked(true);
  await window.getByTestId("parallel-prepare").click();
  await window
    .locator('[data-testid="parallel-run"][data-phase="Prepared"]')
    .waitFor({ timeout: 90000 });
  assert.deepEqual(await ledger(isolation), before, "Preparation must not submit agent input.");
  await capture(isolation, window, summary, "z7-prepared-separate-workspaces");
}
export async function approveParallel(window) {
  await window
    .getByTestId("parallel-review-comment")
    .fill(
      "Reviewed exact synthetic plan, separate directories, full proposals and native configuration; no publication.",
    );
  await window.getByTestId("parallel-review-ack").setChecked(true);
  await window.getByTestId("parallel-approve").click();
}
export async function openChild(isolation, window, summary, child, attempt) {
  await showParallel(isolation, window);
  await window.getByTestId(`parallel-inspect-${child.id}`).click();
  if (attempt.nodeId === "build" || attempt.nodeId === "test") {
    await window.getByTestId(`parallel-child-node-${attempt.nodeId}`).click();
    await window.getByTestId("graph-open-conversation").click();
  } else await window.getByTestId(`parallel-conversation-${child.id}`).click();
  await window
    .locator(`[data-testid^="v4-session-pane"][data-session-id="${attempt.sessionId}"]:visible`)
    .waitFor({ timeout: 30000 });
  (summary.conversations ??= []).push({
    slot: child.id,
    sessionId: attempt.sessionId,
    inputId: attempt.inputId,
    workspace: child.workspace.workspacePath,
  });
}
export async function driveParallel(
  isolation,
  window,
  summary,
  predicate,
  { approve = true, timeout = 180000 } = {},
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const run = await parentRun(isolation);
    if (run && (await predicate(run))) return run;
    if (run?.phase === "Stopped" && approve)
      throw new Error(`Unexpected parent stop: ${run.message}`);
    for (const child of [...(run?.children ?? []), run?.integration, run?.validation].filter(
      Boolean,
    )) {
      const native = await childRun(isolation, child);
      const pending =
        native &&
        [...native.nodeAttempts, ...(native.toolAttempts ?? [])].find(
          (a) => a.status === "WaitingForPermission",
        );
      if (pending && approve) {
        await openChild(isolation, window, summary, child, pending);
        await capture(isolation, window, summary, `z7-permission-${child.id}-${pending.nodeId}`);
        await approveNativePermissionOnce(window);
        await showParallel(isolation, window);
      }
    }
    await wait(100);
  }
  const current = await parentRun(isolation);
  throw new Error(
    `Timed out waiting for Z7 state: ${JSON.stringify({ id: current?.id, phase: current?.phase, message: current?.message })}`,
  );
}
