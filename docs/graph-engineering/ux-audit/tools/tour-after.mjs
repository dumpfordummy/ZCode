// 实现后的原生验收：同一批受控场景、同一套原生 harness，驱动新的 Runs / Workflows / Checks 流程。
// 只有模型回复受控；编辑、Build/Test、权限、产物与闸门都是真实原生行为。权限逐条通过既有 Allow 放行。
// 用法：node tour-after.mjs --scenario=<pass|prose-fence|unbound-report|needs_changes|needs_human|test-failure>
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createIsolation } from "../../../../scripts/graph-engineering/isolation.mjs";
import { startZ6Fixture } from "../../../../scripts/graph-engineering/z6-provider-fixture.mjs";
import {
  reviewerNativeResponse,
  SCENARIOS,
} from "../../../../scripts/graph-engineering/reviewer-native-responses.mjs";
import {
  prepareReviewerFixture,
  REQUEST,
} from "../../../../scripts/graph-engineering/reviewer-native-fixture.mjs";
import {
  readGraphRecord,
  selectValue,
  showGraph,
  ledger,
  modelCount,
} from "../../../../scripts/graph-engineering/z5-native-observe.mjs";
import { waitForRecord } from "../../../../scripts/graph-engineering/z2-native-helpers.mjs";
import { shot, auditRoot, useShotsDir } from "./audit-common.mjs";

// 权限选项在 zh-CN 下叫“允许”；仍然是逐条的既有原生 Allow-once，不是新的授权路径。
const allowOption = (window) => window.getByRole("option", { name: /^(Allow|允许)$/ });
async function approveNativePermissionOnce(window) {
  const allow = allowOption(window);
  await allow.waitFor({ timeout: 45000 });
  const original = await allow.elementHandle();
  await allow.press("Enter");
  await window.waitForFunction((button) => !button.isConnected, original, { timeout: 45000 });
  await original.dispose();
}

const scenario = process.argv.find((a) => a.startsWith("--scenario="))?.slice(11) ?? "pass";
const locale = process.argv.find((a) => a.startsWith("--locale="))?.slice(9);
const theme = process.argv.find((a) => a.startsWith("--theme="))?.slice(8);
if (!SCENARIOS.includes(scenario)) throw new Error(`unknown scenario ${scenario}`);
useShotsDir("after");
const p = `${locale ? locale + "-" : ""}${theme ? theme + "-" : ""}${scenario}`;
const isolation = await createIsolation({
  fixtureFactory: (workspace) => startZ6Fixture(workspace, scenario, reviewerNativeResponse),
});
const notes = { scenario, locale, assertions: [], steps: [] };
const ok = (name) => notes.assertions.push(name);
let window;
try {
  await prepareReviewerFixture(isolation);
  if (locale === "zh-CN") {
    const { readFile } = await import("node:fs/promises");
    const file = path.join(isolation.home, "home", ".zcode/v2/setting.json");
    const value = JSON.parse(await readFile(file, "utf8"));
    await writeFile(file, JSON.stringify({ ...value, localePreference: "zh-CN" }));
  }
  window = await isolation.launch();
  if (theme === "light") {
    // 主题由渲染进程的本地设置持有；写入后重新加载即可在 Zai Light 下验证。
    await window.evaluate(() => localStorage.setItem("zcode-theme", "zai-light"));
    await window.reload();
    await window.getByTestId("graph-engineering-open").waitFor({ timeout: 45000 });
  }
  await window.getByTestId("graph-engineering-open").click();
  await window.getByTestId("graph-engineering-panel").waitFor();

  // 首次进入：落在 Runs / 新建运行，而不是空白设计草稿。
  await window.getByTestId("graph-new-run-pane").waitFor();
  assert.equal(await window.getByTestId("graph-view-runs").getAttribute("aria-current"), "page");
  assert.equal(await window.getByTestId("graph-name").count(), 0, "no design draft on first paint");
  ok("first entry lands on Runs / New run with no design draft");
  await shot(isolation, window, `${p}-01-first-entry`, [
    [1280, 720],
    [1920, 1080],
  ]);

  await selectValue(window, "graph-library-entry", "generic");
  await window.getByTestId("graph-template-parameter-request").fill(REQUEST);
  await window.getByTestId("graph-template-load-recipes").click();
  await window.locator('[data-testid="graph-recipe-read-state"][data-state="ready"]').waitFor();
  for (const details of await window
    .getByTestId("graph-template-reference-instructions")
    .locator("xpath=ancestor::details")
    .all())
    if ((await details.getAttribute("open")) === null)
      await details.locator(":scope > summary").click();
  await window.getByTestId("graph-template-reference-instructions").fill("Context.md");
  await selectValue(window, "graph-template-recipe-build", "reviewer-build");
  await selectValue(window, "graph-template-recipe-test", "reviewer-test");
  assert.equal(await ledger(isolation).then((l) => l.length), 0);
  await shot(isolation, window, `${p}-02-new-run-filled`, [
    [1280, 720],
    [1920, 1080],
  ]);

  // 草稿在导航后保留：离开再回来，请求与所选检查仍在。
  await window.getByTestId("graph-view-design").click();
  await window.getByTestId("graph-view-runs").click();
  await window.getByTestId("graph-new-run").click();
  assert.equal(await window.getByTestId("graph-template-parameter-request").inputValue(), REQUEST);
  ok("new-run draft survives navigation to Workflows and back");

  // Review and run：现有 instantiate + preflight，不执行任何原生工作。
  await window.getByTestId("graph-review-run").click();
  await window.getByTestId("graph-run-confirmation").waitFor({ timeout: 30000 });
  const reviewed = await readGraphRecord(isolation);
  assert.equal(reviewed.definition.template.id, "generic");
  assert.equal(reviewed.definition.template.parameters.request, REQUEST);
  assert.equal((await ledger(isolation)).length, 0);
  assert.equal(modelCount(isolation), 0);
  ok("Review and run saved the workflow and opened the review; no native input or model request");
  const revisionAfterReview = reviewed.definition.revision;
  await shot(isolation, window, `${p}-03-review`, [
    [1280, 720],
    [1920, 1080],
  ]);

  // 提交区在 1280x720 内可见，确认初始未勾选，Start 在勾选前禁用。
  const geometry = await window.evaluate(() => {
    const bar = document
      .querySelector('[data-testid="graph-review-commit"]')
      .getBoundingClientRect();
    return { top: bar.top, bottom: bar.bottom, vh: innerHeight };
  });
  notes.commitGeometry = geometry;
  assert.ok(geometry.bottom <= geometry.vh + 1, "commit bar inside the viewport");
  assert.equal(
    await window.getByTestId("graph-preflight-ack").getAttribute("aria-checked"),
    "false",
  );
  assert.equal(await window.getByTestId("graph-confirm-run").isDisabled(), true);
  ok("commit bar visible without scrolling; acknowledgment unchecked; Start disabled");

  // 返回后再次 Review and run：不重复创建定义（修订不变）。
  await window.getByRole("button", { name: /Back to design|返回设计/ }).click();
  await window.getByTestId("graph-review-run").click();
  await window.getByTestId("graph-run-confirmation").waitFor({ timeout: 30000 });
  const again = await readGraphRecord(isolation);
  assert.equal(again.definition.revision, revisionAfterReview, "no new definition revision");
  assert.equal(again.runs.length, 0, "no run before Start");
  ok(
    "repeating Review and run with an unchanged form creates no new definition revision and no run",
  );

  await window.getByTestId("graph-preflight-ack").setChecked(true);
  await window.getByTestId("graph-confirm-run").click();
  await showGraph(window);

  const handled = new Set();
  const deadline = Date.now() + 180000;
  let run;
  let backChecked = false;
  while (Date.now() < deadline) {
    run = (await readGraphRecord(isolation)).runs.at(-1);
    if (run && ["Failed", "WaitingForApproval", "NeedsHuman", "Completed"].includes(run.status))
      break;
    const pending = run
      ? [...run.nodeAttempts, ...(run.toolAttempts ?? [])].find(
          (a) => a.status === "WaitingForPermission" && !handled.has(a.attemptId),
        )
      : undefined;
    if (pending) {
      handled.add(pending.attemptId);
      await window.getByTestId("graph-needs-you").waitFor({ timeout: 30000 });
      assert.equal(
        await window.getByTestId("graph-needs-you").getAttribute("data-kind"),
        "permission",
      );
      // Needs-you 在其他目的地也可见。
      await window.getByTestId("graph-view-design").click();
      assert.equal(await window.getByTestId("graph-needs-you").count(), 1);
      await window.getByTestId("graph-view-runs").click();
      await window.getByTestId("graph-needs-you-go").click();
      await window.getByTestId("graph-run-permission").waitFor();
      const permissionText = await window.getByTestId("graph-run-permission").innerText();
      notes.steps.push({ node: pending.nodeId, permissionText });
      if (pending.nodeId === "build")
        await shot(isolation, window, `${p}-04-permission-wait`, [
          [1280, 720],
          [1920, 1080],
        ]);
      await window.getByTestId("graph-needs-you-conversation").click();
      await window
        .locator(`[data-testid^="v4-session-pane"][data-session-id="${pending.sessionId}"]:visible`)
        .waitFor();
      await allowOption(window).waitFor({ timeout: 30000 });
      const back = window.getByTestId("graph-back-to-run");
      await back.waitFor({ timeout: 15000 });
      assert.equal(await back.getAttribute("data-run-id"), run.id);
      assert.equal(await back.getAttribute("data-node-id"), pending.nodeId);
      assert.equal(await back.getAttribute("data-attempt-id"), pending.attemptId);
      if (pending.nodeId === "build")
        await shot(isolation, window, `${p}-05-conversation-back-to-run`, [
          [1280, 720],
          [1920, 1080],
        ]);
      // 返回链接不授予权限：先返回，再回到会话逐条 Allow，证明 Back to run 不会回答权限。
      if (!backChecked) {
        await back.click();
        await window.getByTestId("graph-runs-detail").waitFor();
        assert.equal(
          await window.getByTestId("graph-view-runs").getAttribute("aria-current"),
          "page",
        );
        assert.equal(
          await window
            .locator(`[data-testid="graph-run"][data-run-id="${run.id}"]`)
            .getAttribute("aria-current"),
          "true",
        );
        assert.equal(
          await window
            .getByTestId(`graph-select-node-${pending.nodeId}`)
            .getAttribute("aria-current"),
          "step",
        );
        const stillWaiting = (await readGraphRecord(isolation)).runs.at(-1);
        const attempt = [...stillWaiting.nodeAttempts, ...(stillWaiting.toolAttempts ?? [])].find(
          (a) => a.attemptId === pending.attemptId,
        );
        assert.equal(attempt.status, "WaitingForPermission", "Back to run answered nothing");
        ok("Back to run restored the workspace, run and step and did not answer the permission");
        backChecked = true;
        await window.getByTestId("graph-needs-you-conversation").click();
        await allowOption(window).waitFor({ timeout: 30000 });
      }
      await approveNativePermissionOnce(window);
      await showGraph(window);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  notes.finalStatus = run?.status;
  await showGraph(window);
  await window.waitForTimeout(700);
  await shot(isolation, window, `${p}-06-result`, [
    [1280, 720],
    [1920, 1080],
  ]);
  notes.resultText = await window.getByTestId("graph-runs-detail").innerText();
  notes.humanState = await window.getByTestId("graph-run-human").getAttribute("data-state");
  notes.hasResultBlock = await window.getByTestId("graph-run-result-block").count();
  notes.outputValidationAlerts = await window
    .getByTestId("graph-run-output-validation-failed")
    .count();
  // 步骤轨迹是主视图；运行图只读且可切换。
  assert.ok((await window.getByTestId("graph-run-trail").count()) === 1);
  await window.getByTestId("graph-run-graph-toggle").click();
  await window.locator(".react-flow__node").first().waitFor();
  await shot(isolation, window, `${p}-07-run-graph`, [[1280, 720]]);
  await window.getByTestId("graph-run-graph-toggle").click();

  // Run again：预填、不启动任何工作。
  const runsBefore = (await readGraphRecord(isolation)).runs.length;
  if ((await window.getByTestId("graph-run-again").count()) === 1) {
    await window.getByTestId("graph-run-again").click();
    await window.getByTestId("graph-new-run-pane").waitFor();
    assert.equal(
      await window.getByTestId("graph-template-parameter-request").inputValue(),
      REQUEST,
    );
    assert.equal((await readGraphRecord(isolation)).runs.length, runsBefore);
    ok("Run again pre-fills the new-run form and starts nothing");
    await shot(isolation, window, `${p}-08-run-again`, [[1280, 720]]);
  }
  // Workflows 与 Checks 目的地。
  await window.getByTestId("graph-view-design").click();
  await window.getByTestId("graph-name").waitFor();
  await shot(isolation, window, `${p}-09-workflows`, [
    [1280, 720],
    [1920, 1080],
  ]);
  await window.getByTestId("graph-view-setup").click();
  await window.getByTestId("graph-recipe-list").waitFor();
  await shot(isolation, window, `${p}-10-checks`, [
    [1280, 720],
    [1920, 1080],
  ]);

  // 批准：绑定精确的 request id / version / digest；只在一次性合成 profile 中做，不发布任何东西。
  if (scenario === "pass" && !locale) {
    await window.getByTestId("graph-view-runs").click();
    await window.locator(`[data-testid="graph-run"][data-run-id="${run.id}"]`).click();
    await window.getByTestId("graph-run-review-gate").click();
    const gateNode = run.definition.nodes.find((node) => node.id === "final-gate");
    notes.gateCommentPolicy = gateNode.commentPolicy;
    if (gateNode.commentPolicy === "required") {
      assert.equal(await window.getByTestId("graph-approval-approve").isDisabled(), true);
      ok("Approve is disabled without the required comment");
    }
    await window
      .getByTestId("graph-approval-comment")
      .fill("Reviewed the frozen synthetic evidence.");
    await window.getByTestId("graph-approval-approve").click();
    const decided = await waitForRecord(
      isolation,
      (record) => record.runs.at(-1)?.status === "Completed",
    );
    const finished = decided.runs.at(-1);
    const gate = finished.approvalAttempts.find((a) => a.nodeId === "final-gate");
    assert.equal(gate.decision.requestId, gate.request.id);
    assert.equal(gate.decision.requestVersion, gate.request.version);
    assert.equal(gate.decision.requestDigest, gate.request.digest);
    assert.equal(gate.decision.value, "approve");
    assert.equal(gate.decision.comment, "Reviewed the frozen synthetic evidence.");
    notes.approvalBinding = {
      requestId: gate.request.id,
      version: gate.request.version,
      digest: gate.request.digest,
    };
    ok("Approve recorded the exact request id/version/digest with the comment; the run Completed");
    await shot(isolation, window, `${p}-11-approved`, [[1280, 720]]);
  }
} catch (error) {
  notes.error = error.stack ?? String(error);
  if (window) await shot(isolation, window, `${p}-error`).catch(() => {});
} finally {
  const record = await readGraphRecord(isolation).catch(() => undefined);
  notes.runIds = record?.runs?.map((r) => ({ id: r.id, status: r.status })) ?? [];
  await writeFile(
    path.join(auditRoot, "tools", `after-notes-${p}.json`),
    JSON.stringify(notes, null, 2),
  );
  await isolation.close();
  console.log(
    notes.error ?? "ok",
    notes.finalStatus ?? "",
    `assertions=${notes.assertions.length}`,
  );
}
