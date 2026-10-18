// Z8.5-UX-P2 run behaviour: real Graph components in the synthetic Host harness. Asserts the
// truth of each run state, the one next action, retained safety statements and that viewing never
// causes a Host call. Synthetic records; not native acceptance. Run via ux-p2-behavior.mjs.
import assert from "node:assert/strict";
import { T } from "./ux-m1-helpers.mjs";
import { EN, ZH, assertPassive, openRun, text } from "./ux-p2-helpers.mjs";

const banner = (page) => text(T(page, "graph-run-banner"));
const accent = (page) =>
  T(page, "graph-run-banner")
    .locator('[data-variant="default"]')
    .evaluateAll((all) => all.length);

const runningScenario = (variant) => ({
  name: `UX-P2 run: running names the stage and needs nothing (${variant.locale})`,
  async run({ page, host, url }) {
    const zh = variant.locale === "zh-CN";
    await openRun(page, host, url, "running", variant);
    const said = await banner(page);
    assert.match(
      said,
      zh ? /Implement parser fix：智能体正在工作/ : /Implement parser fix: agent work is running/,
    );
    assert.equal(await T(page, "graph-run-nothing-needed").isVisible(), true);
    assert.match(
      await text(T(page, "graph-run-nothing-needed")),
      zh ? /当前无需你操作/ : /Nothing is needed/,
    );
    assert.equal(await T(page, "graph-run-banner").getAttribute("data-tone"), "progress");
    // Running is not a permission wait, a question or an approval.
    assert.equal(await T(page, "graph-run-permission").count(), 0);
    assert.doesNotMatch(said, /permission|approval|权限|批准/i);
    // Nothing waits on the operator, so nothing in the banner is accent-filled; the actions stay.
    assert.equal(await accent(page), 0, "no false urgency");
    assert.equal(await T(page, "graph-run-open-native").isVisible(), true);
    assert.equal(await T(page, "graph-run-open-native").getAttribute("data-variant"), "outline");
    assert.equal(await T(page, "graph-cancel").isEnabled(), true, "Cancel stays reachable");
    assert.equal(await T(page, "graph-run-execution").getAttribute("data-state"), "Running");
    assertPassive(host, "running");
  },
});

const permissionScenario = {
  name: "UX-P2 run: a real native permission keeps one accent action and no 'nothing needed'",
  async run({ page, host, url }) {
    await openRun(page, host, url, "permission");
    assert.match(await banner(page), /waiting for a native permission/);
    assert.match(await banner(page), /Graph does not grant it separately/);
    assert.equal(await T(page, "graph-run-nothing-needed").count(), 0);
    assert.equal(await accent(page), 1, "exactly one accent-filled action");
    assert.equal(await T(page, "graph-run-open-native").getAttribute("data-variant"), "default");
    assert.equal(
      await T(page, "graph-run-execution").getAttribute("data-state"),
      "WaitingForPermission",
    );
    assertPassive(host, "permission");
  },
};

const approvalScenario = {
  name: "UX-P2 step: the human gate keeps its decision controls; identifiers move to Details",
  async run({ page, host, url }) {
    await openRun(page, host, url, "approval-with-checks");
    assert.match(await banner(page), /Your decision is needed/);
    assert.equal(await T(page, "graph-run-nothing-needed").count(), 0, "a decision is needed");
    assert.equal(await T(page, "graph-run-human").getAttribute("data-state"), "pending");
    assert.equal(await T(page, "graph-run-review-gate").getAttribute("data-variant"), "default");
    await T(page, "graph-run-review-gate").click();
    await T(page, "graph-approval-request").waitFor();
    const request = T(page, "graph-approval-request");
    const details = T(page, "graph-approval-correlation");
    assert.equal(await details.evaluate((node) => node.open), false);
    const requestId = await request.getAttribute("data-request-id");
    assert.ok(requestId, "the request id is still on the element for drivers");
    // The opaque request id and the optional-comment row are not in the default view...
    assert.equal(await page.getByText(requestId, { exact: false }).first().isVisible(), false);
    assert.doesNotMatch(await text(request), /Optional comment/);
    // ...but the review text, the workspace, the successor and the decision controls are.
    assert.match(await text(request), /Captured workspace/);
    assert.match(await text(request), /Intended next node/);
    for (const id of ["graph-approval-approve", "graph-approval-reject", "graph-approval-comment"])
      assert.equal(await T(page, id).isVisible(), true, id);
    assert.equal(await T(page, "graph-approval-approve").isEnabled(), true);
    assert.equal(await T(page, "graph-approval-reject").isEnabled(), true);
    // Recoverable with the keyboard, without any Host call.
    await details.locator(":scope > summary").focus();
    await page.keyboard.press("Enter");
    assert.equal(await details.evaluate((node) => node.open), true);
    assert.match(await text(details), new RegExp(requestId));
    assert.match(await text(details), /Optional comment/);
    assertPassive(host, "approval");
  },
};

const failedScenario = (variant) => ({
  name: `UX-P2 run: a genuine Test FAIL stays distinct and never implies an approval (${variant.locale})`,
  async run({ page, host, url }) {
    const zh = variant.locale === "zh-CN";
    await openRun(page, host, url, "failed-test", variant);
    assert.equal(await T(page, "graph-run-banner").getAttribute("data-tone"), "danger");
    assert.match(await banner(page), zh ? /测试失败/ : /Test failed/);
    assert.match(await banner(page), zh ? /没有可批准或拒绝/ : /nothing to approve or reject/i);
    assert.equal(await T(page, "graph-run-human").getAttribute("data-state"), "not-requested");
    assert.equal(await T(page, "graph-run-evidence").getAttribute("data-state"), "tests-failed");
    assert.equal(await T(page, "graph-run-review-gate").count(), 0, "no approval action");
    assert.equal(await T(page, "graph-run-nothing-needed").count(), 0);
    assert.equal(await T(page, "graph-run-no-action").count(), 0);
    assert.equal(
      await T(page, "graph-run-inspect-failure").getAttribute("data-variant"),
      "default",
    );
    // UX-P2-F1: this fixture stopped (NeedsHuman) with its cursor on End. Only a Completed run drops
    // the End cursor; a stopped run keeps it, because an End cursor is not proof of completion.
    assert.equal(await T(page, "graph-run-current-step").count(), 1);
    assertPassive(host, "failed test");
  },
});

const invalidScenario = {
  name: "UX-P2 run: invalid evidence is not a failed Test and also requests no approval",
  async run({ page, host, url }) {
    await openRun(page, host, url, "invalid-evidence");
    assert.equal(await T(page, "graph-run-banner").getAttribute("data-tone"), "warning");
    const said = await banner(page);
    assert.match(said, /Machine check evidence is invalid/);
    assert.doesNotMatch(said, /Test failed/);
    assert.match(said, /nothing to approve or reject/i);
    assert.equal(await T(page, "graph-run-evidence").getAttribute("data-state"), "invalid");
    assert.equal(await T(page, "graph-run-human").getAttribute("data-state"), "not-requested");
    assert.equal(await T(page, "graph-run-inspect-invalid").isVisible(), true);
    assert.equal(await T(page, "graph-run-inspect-failure").count(), 0);
    assertPassive(host, "invalid evidence");
  },
};

const staleScenario = (variant) => ({
  name: `UX-P2 run: stale evidence explains itself and is not an approval request (${variant.locale})`,
  async run({ page, host, url }) {
    const zh = variant.locale === "zh-CN";
    await openRun(page, host, url, "stale-review", variant);
    assert.equal(await T(page, "graph-run-execution").getAttribute("data-state"), "StaleEvidence");
    assert.match(
      await text(T(page, "graph-run-stale-explanation")),
      zh ? /证据或图已变化/ : /evidence or graph has changed/i,
    );
    assert.equal(await T(page, "graph-run-banner").getAttribute("data-tone"), "warning");
    // The record is genuinely unresolved: the original wording is kept, never "undetermined".
    assert.equal(await T(page, "graph-run-human").getAttribute("data-state"), "unknown");
    assert.doesNotMatch(await text(T(page, "graph-run-human")), /Undetermined|未确定——运行结果/);
    assert.equal(await T(page, "graph-cancel").isEnabled(), true);
    assert.equal(await T(page, "graph-run-nothing-needed").count(), 0);
    await T(page, "graph-run-review-gate").click();
    await T(page, "graph-approval-request").waitFor();
    assert.equal(
      await T(page, "graph-approval-approve").isDisabled(),
      true,
      "stale evidence can never be approved",
    );
    assertPassive(host, "stale");
  },
});

const interruptedScenario = (variant) => ({
  name: `UX-P2 run: uncertain executor ownership is undetermined, not an approval defect (${variant.locale})`,
  async run({ page, host, url }) {
    const zh = variant.locale === "zh-CN";
    await openRun(page, host, url, "interrupted", variant);
    assert.match(
      await banner(page),
      zh ? /执行中断；结果未确认/ : /Execution interrupted; outcome unconfirmed/,
    );
    assert.equal(await T(page, "graph-run-human").getAttribute("data-state"), "unknown");
    assert.match(
      await text(T(page, "graph-run-human")),
      zh ? /未确定——运行结果尚未确认/ : /Undetermined — the run's outcome is unconfirmed/,
    );
    assert.doesNotMatch(await text(T(page, "graph-run-summary")), /approval record is incomplete/i);
    // The primary action stays the owned native work, the recovery controls stay reachable.
    assert.equal(await T(page, "graph-run-open-native").getAttribute("data-variant"), "default");
    assert.equal(await T(page, "graph-run-show-recovery").isVisible(), true);
    assert.equal(await T(page, "graph-run-nothing-needed").count(), 0, "ownership is unconfirmed");
    assertPassive(host, "interrupted");
  },
});

const completedScenario = {
  name: "UX-P2 run: a completed run is quiet; a completion without Test evidence is not a pass",
  async run({ page, host, url }) {
    await openRun(page, host, url, "passed-checks");
    assert.equal(await T(page, "graph-run-no-action").isVisible(), true);
    assert.equal(await T(page, "graph-run-show-step").count(), 0, "no 'inspect end' action");
    assert.equal(await T(page, "graph-run-current-step").count(), 0);
    assert.equal(await T(page, "graph-run-evidence").getAttribute("data-state"), "tests-passed");
    assert.match(await text(T(page, "graph-run-evidence")), /passed/);
    assert.equal(await T(page, "graph-run-human").getAttribute("data-state"), "approved");
    assert.equal(await T(page, "graph-run-banner").getAttribute("data-tone"), "success");
    await openRun(page, host, url, "agent-only");
    const evidence = await text(T(page, "graph-run-evidence"));
    assert.match(evidence, /Agent-reported result; no Test evidence/);
    assert.doesNotMatch(evidence, /passed/i, "agent-only completion never reads as passed");
    assert.equal(await T(page, "graph-run-evidence").getAttribute("data-state"), "agent-reported");
    assert.equal(await T(page, "graph-run-show-step").count(), 0);
    assertPassive(host, "completed");
  },
};

const reviewerScenario = {
  name: "UX-P2 run: invalid reviewer output keeps its own banner and 'No approval was requested'",
  async run({ page, host, url }) {
    await openRun(page, host, url, "reviewer-invalid");
    assert.match(await banner(page), /reviewer output was rejected\. No approval was requested\./);
    assert.equal(await T(page, "graph-run-output-validation-failed").count(), 1);
    assert.equal(await T(page, "graph-run-inspect-output").isVisible(), true);
    assertPassive(host, "reviewer output");
  },
};

export const runBehaviorScenarios = [
  runningScenario(EN),
  runningScenario(ZH),
  permissionScenario,
  approvalScenario,
  failedScenario(EN),
  failedScenario(ZH),
  invalidScenario,
  staleScenario(EN),
  staleScenario(ZH),
  interruptedScenario(EN),
  interruptedScenario(ZH),
  completedScenario,
  reviewerScenario,
];
