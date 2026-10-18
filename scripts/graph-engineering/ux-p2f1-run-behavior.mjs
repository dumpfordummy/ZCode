// Z8.5-UX-P2-F1 run and step behaviour: real Graph components in the synthetic Host harness.
// Asserts the fail-closed banner for a run/attempt disagreement, the End-cursor status matrix, the
// "reported, not accepted" counts under unaccepted evidence, and that viewing never answers,
// approves, starts, replays or opens anything. Synthetic records; not native acceptance.
import assert from "node:assert/strict";
import { T, boot, flush } from "./ux-m1-helpers.mjs";
import { EN, ZH, assertPassive, text, unnamedControls } from "./ux-p2-helpers.mjs";
import { f1Fixtures } from "./ux-p2f1-states.mjs";

async function open(page, host, url, name, variant = EN) {
  const run = f1Fixtures[name]();
  host.setRuns("A", [run]);
  await boot(page, host, url, { locale: variant.locale, theme: variant.theme });
  await page.setViewportSize({ width: variant.width, height: variant.height });
  await page.locator(`[data-testid="graph-run"][data-run-id="${run.id}"]`).click();
  await T(page, "graph-run-summary").waitFor();
  await flush(page);
  return run;
}
const banner = (page) => text(T(page, "graph-run-banner"));
const accent = (page) =>
  T(page, "graph-run-banner")
    .locator('[data-variant="default"]')
    .evaluateAll((all) => all.length);
const spinning = (page) =>
  T(page, "graph-run-banner")
    .locator(".animate-spin")
    .evaluateAll((all) => all.length);

/** A Running run whose current attempt says something else: never "nothing is needed". */
const mismatch = (name, attempt, variant, expect) => ({
  name: `UX-P2-F1 run: a Running run with a ${attempt} attempt never says nothing is needed (${name}, ${variant.locale})`,
  async run({ page, host, url }) {
    const zh = variant.locale === "zh-CN";
    const run = await open(page, host, url, name, variant);
    const said = await banner(page);
    assert.doesNotMatch(said, /Nothing is needed|当前无需你操作/);
    assert.doesNotMatch(said, /agent work is running|智能体正在工作/);
    assert.equal(await T(page, "graph-run-nothing-needed").count(), 0);
    assert.equal(await T(page, "graph-run-banner").getAttribute("data-tone"), "warning");
    assert.equal(await spinning(page), 0, "no in-progress spinner for a disagreeing status");
    expect.banner(said, zh);
    // The run-level fact is reported as recorded; the disagreement is stated once, beside it.
    assert.equal(await T(page, "graph-run-execution").getAttribute("data-state"), "Running");
    if (expect.note) assert.match(await text(T(page, "graph-run-attempt-status")), expect.note(zh));
    // The owned conversation is the one accent action; Cancel stays reachable; nothing is invented.
    assert.equal(await T(page, "graph-run-open-native").getAttribute("data-variant"), "default");
    assert.equal(await accent(page), 1, "exactly one accent-filled action");
    assert.equal(await T(page, "graph-cancel").isEnabled(), true);
    assert.equal(await T(page, "graph-run-review-gate").count(), 0, "no approval is invented");
    assert.equal(await T(page, "graph-run-human").getAttribute("data-state"), "not-reached");
    assert.equal(await T(page, "graph-approval-approve").count(), 0);
    // The run record is untouched by looking at it.
    assert.equal(
      JSON.stringify(host.graph.A.runs.find((item) => item.id === run.id)),
      JSON.stringify(f1Fixtures[name]()),
      "record untouched",
    );
    assertPassive(host, name);
  },
});

const questionMismatch = (variant) =>
  mismatch("mismatch-question", "WaitingForUser", variant, {
    banner(said, zh) {
      assert.match(
        said,
        zh ? /有待回答的问题：Implement parser fix/ : /Question waiting: Implement parser fix/,
      );
    },
    note: (zh) => (zh ? /原生尝试：等待你的回答/ : /Native attempt: Waiting for your answer/),
  });
const permissionMismatch = (variant) =>
  mismatch("mismatch-permission", "WaitingForPermission", variant, {
    banner(said, zh) {
      assert.match(said, zh ? /正在等待原生权限/ : /waiting for a native permission/);
      assert.match(said, zh ? /不会另外授予权限/ : /Graph does not grant it separately/);
    },
    note: (zh) => (zh ? /原生尝试：等待权限/ : /Native attempt: Waiting for permission/),
  });
const unknownMismatch = (variant) =>
  mismatch("mismatch-unknown", "Unknown", variant, {
    banner(said, zh) {
      assert.match(
        said,
        zh
          ? /原生状态为“未知”，而运行记录为“运行中”。请视为未确认/
          : /the native status is “Unknown” while the run says Running\. Treat it as unconfirmed\./,
      );
      assert.match(
        said,
        zh ? /决定前先检查拥有的原生任务/ : /Inspect the owned native work before deciding/,
      );
    },
    note: (zh) => (zh ? /原生尝试：未知/ : /Native attempt: Unknown/),
  });
const interruptedMismatch = mismatch("mismatch-interrupted", "Interrupted", EN, {
  banner(said) {
    assert.match(said, /the native status is “Interrupted” while the run says Running/);
  },
  note: () => /Native attempt: Interrupted/,
});
const cancelMismatch = mismatch("mismatch-cancel", "CancelRequested", EN, {
  banner(said) {
    assert.match(said, /the native status is “Stop requested” while the run says Running/);
  },
  note: () => /Native attempt: Stop requested/,
});

const consistentControls = {
  name: "UX-P2-F1 run: consistent runs are unchanged (running, question, interrupted + question)",
  async run({ page, host, url }) {
    await open(page, host, url, "running");
    assert.match(await banner(page), /agent work is running/);
    assert.equal(await T(page, "graph-run-nothing-needed").isVisible(), true);
    assert.equal(await T(page, "graph-run-banner").getAttribute("data-tone"), "progress");
    assert.equal(await T(page, "graph-run-attempt-status").count(), 0);
    assert.equal(await accent(page), 0);
    await open(page, host, url, "attempt-question");
    assert.match(await banner(page), /Question waiting: Implement parser fix/);
    assert.equal(await T(page, "graph-run-attempt-status").count(), 0, "no disagreement to state");
    assert.equal(await T(page, "graph-run-nothing-needed").count(), 0);
    // Reachable disagreement (run Interrupted, attempt later observed waiting) is already truthful.
    await open(page, host, url, "interrupted-question");
    assert.match(await banner(page), /Execution interrupted; outcome unconfirmed/);
    assert.equal(await T(page, "graph-run-nothing-needed").count(), 0);
    assert.equal(await T(page, "graph-run-attempt-status").count(), 0);
    assert.equal(await T(page, "graph-run-open-native").getAttribute("data-variant"), "default");
    assert.match(await text(T(page, "graph-run-required-actions")), /Answer the question/);
    assertPassive(host, "consistent");
  },
};

const keyboardMismatch = {
  name: "UX-P2-F1 a11y: a disagreeing run names every control and its first Tab stop is the owned conversation",
  async run({ page, host, url }) {
    for (const name of ["mismatch-question", "mismatch-permission", "mismatch-unknown"]) {
      for (const variant of [EN, ZH]) {
        await open(page, host, url, name, variant);
        assert.deepEqual(await unnamedControls(page), [], `${name} ${variant.locale}: unnamed`);
        await T(page, "graph-run-summary").focus();
        const passed = [];
        for (let press = 0; press < 4 && passed.at(-1) !== "graph-run-open-native"; press += 1) {
          await page.keyboard.press("Tab");
          passed.push(
            await page.evaluate(
              () =>
                document.activeElement?.getAttribute("data-testid") ??
                document.activeElement?.tagName,
            ),
          );
        }
        assert.equal(
          passed.at(-1),
          "graph-run-open-native",
          `${name} ${variant.locale}: ${passed}`,
        );
      }
    }
    assertPassive(host, "keyboard");
  },
};

/**
 * End-cursor matrix. `Current step: end` and `end · Inspect step` are dropped only for a run that is
 * recorded Completed; every other status keeps both, never reads "No action required" and never
 * takes the success tone.
 */
const endMatrix = {
  name: "UX-P2-F1 run: the End cursor is dropped only for Completed; every other status keeps its actions",
  async run({ page, host, url }) {
    await open(page, host, url, "end-completed");
    assert.equal(await T(page, "graph-run-current-step").count(), 0);
    assert.equal(await T(page, "graph-run-show-step").count(), 0);
    assert.equal(await T(page, "graph-run-no-action").isVisible(), true);
    assert.equal(await T(page, "graph-run-banner").getAttribute("data-tone"), "success");
    for (const [name, status] of [
      ["end-failed", "Failed"],
      ["end-cancelled", "Cancelled"],
      ["end-interrupted", "Interrupted"],
      ["end-needs-human", "NeedsHuman"],
      ["end-running", "Running"],
    ]) {
      await open(page, host, url, name);
      assert.equal(await T(page, "graph-run-execution").getAttribute("data-state"), status);
      assert.equal(await T(page, "graph-run-current-step").count(), 1, `${status}: fact kept`);
      assert.equal(
        await T(page, "graph-run-current-step").getAttribute("data-node-id"),
        "end",
        `${status}: the cursor is the End node`,
      );
      assert.equal(await T(page, "graph-run-show-step").count(), 1, `${status}: action kept`);
      assert.equal(await T(page, "graph-run-no-action").count(), 0, `${status}: not 'no action'`);
      assert.notEqual(
        await T(page, "graph-run-banner").getAttribute("data-tone"),
        "success",
        `${status}: an End cursor is not completion`,
      );
    }
    // The next action of a stopped or interrupted run stays visible.
    await open(page, host, url, "end-interrupted");
    assert.equal(await T(page, "graph-run-show-recovery").isVisible(), true);
    assert.equal(await T(page, "graph-run-open-native").isVisible(), true);
    await open(page, host, url, "end-needs-human");
    assert.match(await banner(page), /The run stopped and needs a human decision/);
    // A genuine failed Test still leads with its own action; the End fact is additional, not primary.
    await open(page, host, url, "failed-test");
    assert.equal(
      await T(page, "graph-run-inspect-failure").getAttribute("data-variant"),
      "default",
    );
    assert.equal(await accent(page), 1);
    assertPassive(host, "end matrix");
  },
};

const toolStep = async (page, host, url, name, openId, variant = EN) => {
  await open(page, host, url, name, variant);
  await T(page, openId).click();
  await T(page, "graph-tool-inspector").waitFor();
};

const countsScenario = (variant) => ({
  name: `UX-P2-F1 step: counts under unverified evidence are reported, not accepted (${variant.locale})`,
  async run({ page, host, url }) {
    const zh = variant.locale === "zh-CN";
    await toolStep(page, host, url, "invalid-evidence", "graph-run-inspect-invalid", variant);
    const evidence = T(page, "graph-tool-evidence");
    assert.equal(await evidence.getAttribute("data-state"), "invalid");
    assert.match(await text(evidence), zh ? /未验证或无效证据/ : /Unverified or invalid evidence/);
    assert.doesNotMatch(await text(evidence), /Accepted|已接受/);
    const counts = T(page, "graph-tool-counts");
    assert.equal(await counts.getAttribute("data-accepted"), "false");
    assert.match(
      await text(counts),
      zh
        ? /^测试运行器的报告，未被接受：发现 1 个 · 通过 1 · 失败 0 · 跳过 0$/
        : /^Reported by the test runner, not accepted: 1 discovered · 1 passed · 0 failed · 0 skipped$/,
    );
    // Invalid evidence is still not a failed Test, and the raw verification stays available.
    assert.doesNotMatch(await text(T(page, "graph-tool-inspector")), /failing|失败的证据/i);
    const json = await T(page, "graph-tool-inspector")
      .locator("details pre")
      .last()
      .evaluate((node) => node.textContent);
    assert.match(json, /"observationValid": false/, "observationValid is untouched");
    assert.match(json, /"passed": 1/, "the raw report is still there");
    assert.equal(await T(page, "graph-tool-evidence-checks").evaluate((node) => node.open), true);
    assert.equal(await text(T(page, "graph-tool-reportFresh")), zh ? "是" : "Yes");
    assertPassive(host, "invalid counts");
  },
});

const noCounts = {
  name: "UX-P2-F1 step: unverified evidence without any reported count shows no placeholder row",
  async run({ page, host, url }) {
    await toolStep(page, host, url, "invalid-no-counts", "graph-run-inspect-invalid");
    assert.equal(await T(page, "graph-tool-counts").count(), 0);
    assert.doesNotMatch(await text(T(page, "graph-tool-inspector")), /— discovered|— passed/);
    assert.equal(await T(page, "graph-tool-evidence").getAttribute("data-state"), "invalid");
    assert.equal(await T(page, "graph-tool-evidence-checks").evaluate((node) => node.open), true);
    assertPassive(host, "invalid without counts");
  },
};

const acceptedCounts = {
  name: "UX-P2-F1 step: accepted failing and passing counts keep their unlabelled form",
  async run({ page, host, url }) {
    await toolStep(page, host, url, "failed-test", "graph-run-inspect-failure");
    assert.equal(await T(page, "graph-tool-counts").getAttribute("data-accepted"), "true");
    assert.match(await text(T(page, "graph-tool-evidence")), /Accepted failing evidence/);
    assert.equal(
      await text(T(page, "graph-tool-counts")),
      "1 discovered · 0 passed · 1 failed · 0 skipped",
    );
    await open(page, host, url, "passed-checks");
    await T(page, "graph-select-node-check").click();
    await T(page, "graph-tool-counts").waitFor();
    assert.equal(await T(page, "graph-tool-counts").getAttribute("data-accepted"), "true");
    assert.equal(
      await text(T(page, "graph-tool-counts")),
      "1 discovered · 1 passed · 0 failed · 0 skipped",
    );
    assert.equal(await T(page, "graph-tool-evidence").getAttribute("data-state"), "passed");
    // Keyboard: Space and Enter fold and unfold the evidence checks; the driver cells stay readable.
    const checks = T(page, "graph-tool-evidence-checks");
    assert.equal(await checks.evaluate((node) => node.open), true);
    assert.equal(await text(T(page, "graph-tool-reportParsed")), "Yes");
    await checks.locator(":scope > summary").focus();
    await page.keyboard.press("Space");
    assert.equal(await checks.evaluate((node) => node.open), false);
    await page.keyboard.press("Enter");
    assert.equal(await checks.evaluate((node) => node.open), true);
    assertPassive(host, "accepted counts");
  },
};

export const runBehaviorScenarios = [
  questionMismatch(EN),
  questionMismatch(ZH),
  permissionMismatch(EN),
  permissionMismatch(ZH),
  unknownMismatch(EN),
  unknownMismatch(ZH),
  interruptedMismatch,
  cancelMismatch,
  consistentControls,
  keyboardMismatch,
  endMatrix,
  countsScenario(EN),
  countsScenario(ZH),
  noCounts,
  acceptedCounts,
];
