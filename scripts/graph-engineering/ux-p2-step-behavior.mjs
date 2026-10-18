// Z8.5-UX-P2 step and cross-cutting behaviour: the Build/Test step inspector, keyboard and
// accessible names, the passive-viewing negative control and inspection states.
// Synthetic records; not native acceptance. Run via ux-p2-behavior.mjs.
import assert from "node:assert/strict";
import { T, admissionCalls, boot, flush } from "./ux-m1-helpers.mjs";
import { controlledInspection, driveInspection } from "./ux-p1-browser.mjs";
import { fixtures } from "./ux-p2-states.mjs";
import { EN, ZH, assertPassive, openRun, text, unnamedControls } from "./ux-p2-helpers.mjs";

const toolStepScenario = {
  name: "UX-P2 step: a failed Test leads with the verdict, then cause and counts; evidence checks stay open",
  async run({ page, host, url }) {
    await openRun(page, host, url, "failed-test");
    await T(page, "graph-run-inspect-failure").click();
    await T(page, "graph-tool-inspector").waitFor();
    const inspector = T(page, "graph-tool-inspector");
    assert.equal(await T(page, "graph-tool-evidence").getAttribute("data-state"), "failed");
    assert.match(await text(T(page, "graph-tool-evidence")), /Accepted failing evidence/);
    assert.match(
      await text(T(page, "graph-tool-counts")),
      /1 discovered · 0 passed · 1 failed · 0 skipped/,
    );
    // Verdict, cause and counts come before the evidence-check facts in reading order.
    const order = await inspector.evaluate((root) => {
      const index = (id) => {
        const element = root.querySelector(`[data-testid="${id}"]`);
        return element ? [...root.querySelectorAll("*")].indexOf(element) : -1;
      };
      return [
        index("graph-tool-evidence"),
        index("graph-tool-counts"),
        index("graph-tool-evidence-checks"),
      ];
    });
    assert.ok(order[0] > 0 && order[0] < order[1] && order[1] < order[2], `order ${order}`);
    const checks = T(page, "graph-tool-evidence-checks");
    assert.equal(await checks.evaluate((node) => node.open), true);
    assert.equal(await text(T(page, "graph-tool-exitSuccessful")), "No");
    assert.equal(await text(T(page, "graph-tool-acceptancePassed")), "No");
    await checks.locator(":scope > summary").focus();
    await page.keyboard.press("Enter");
    assert.equal(await checks.evaluate((node) => node.open), false);
    await page.keyboard.press("Enter");
    assert.equal(await checks.evaluate((node) => node.open), true);
    assertPassive(host, "failed test step");
  },
};

const invalidStepScenario = {
  name: "UX-P2 step: invalid evidence keeps its facts visible and is not described as a failed Test",
  async run({ page, host, url }) {
    await openRun(page, host, url, "invalid-evidence");
    await T(page, "graph-run-inspect-invalid").click();
    await T(page, "graph-tool-inspector").waitFor();
    assert.equal(await T(page, "graph-tool-evidence").getAttribute("data-state"), "invalid");
    assert.doesNotMatch(await text(T(page, "graph-tool-evidence")), /failing/i);
    assert.equal(await T(page, "graph-tool-evidence-checks").evaluate((node) => node.open), true);
    assertPassive(host, "invalid step");
  },
};

const passedStepScenario = {
  name: "UX-P2 step: a passing check keeps its evidence checks open and readable by drivers",
  async run({ page, host, url }) {
    await openRun(page, host, url, "passed-checks");
    await T(page, "graph-select-node-build").click();
    await T(page, "graph-tool-inspector").waitFor();
    const checks = T(page, "graph-tool-evidence-checks");
    // A native driver reads these cells with innerText on a completed Build step; text inside a
    // closed `details` reads as empty, so the facts stay open in every state (spec: Contracts).
    assert.equal(await checks.evaluate((node) => node.open), true);
    assert.equal(await T(page, "graph-tool-counts").count(), 0, "a Build has no test counts");
    assert.equal(await T(page, "graph-tool-reportFresh").innerText(), "Not applicable");
    assert.equal(await T(page, "graph-tool-reportParsed").innerText(), "Not applicable");
    await T(page, "graph-select-node-check").click();
    await T(page, "graph-tool-counts").waitFor();
    assert.match(
      await text(T(page, "graph-tool-counts")),
      /1 discovered · 1 passed · 0 failed · 0 skipped/,
    );
    assert.equal(await T(page, "graph-tool-evidence").getAttribute("data-state"), "passed");
    assert.equal(await checks.evaluate((node) => node.open), true);
    assert.equal(await text(T(page, "graph-tool-exitSuccessful")), "Yes");
    // The operator can still hide them with the keyboard.
    await page.locator('[data-testid="graph-tool-evidence-checks"] > summary').focus();
    await page.keyboard.press("Enter");
    assert.equal(await checks.evaluate((node) => node.open), false);
    assertPassive(host, "passed step");
  },
};

const keyboardScenario = {
  name: "UX-P2 a11y: every visible control is named and the one next action is the first Tab stop",
  async run({ page, host, url }) {
    for (const [name, firstAction] of [
      ["failed-test", "graph-run-inspect-failure"],
      ["invalid-evidence", "graph-run-inspect-invalid"],
      ["permission", "graph-run-open-native"],
      ["approval-with-checks", "graph-run-review-gate"],
      ["stale-review", "graph-run-review-gate"],
      ["interrupted", "graph-run-open-native"],
    ]) {
      for (const variant of [EN, ZH]) {
        await openRun(page, host, url, name, variant);
        assert.deepEqual(
          await unnamedControls(page),
          [],
          `${name} ${variant.locale}: unnamed control`,
        );
        await T(page, "graph-run-summary").focus();
        // A banner may carry its own "Result details" disclosure before the actions; the one next
        // action must still be reached within a few Tab stops and before any other action.
        const passed = [];
        for (let press = 0; press < 4 && passed.at(-1) !== firstAction; press += 1) {
          await page.keyboard.press("Tab");
          passed.push(
            await page.evaluate(
              () =>
                document.activeElement?.getAttribute("data-testid") ??
                document.activeElement?.tagName,
            ),
          );
        }
        assert.equal(passed.at(-1), firstAction, `${name} ${variant.locale}: Tab stops ${passed}`);
        assert.ok(
          passed
            .slice(0, -1)
            .every((id) => !/^graph-(run-(open|inspect|review|show|again)|cancel)/.test(id ?? "")),
          `${name} ${variant.locale}: another action precedes the next action (${passed})`,
        );
      }
    }
    assertPassive(host, "keyboard");
  },
};

const negativeControl = {
  name: "UX-P2 negative control: passive viewing, expanding and tab changes cause no Save, run, call or permission",
  async run({ page, host, url }) {
    const names = [
      "running",
      "permission",
      "approval-with-checks",
      "failed-test",
      "invalid-evidence",
      "stale-review",
      "passed-checks",
      "interrupted",
    ];
    const runs = names.map((name, index) => {
      const run = fixtures[name]();
      run.id = `${run.id}-${index}`;
      return run;
    });
    host.setRuns("A", runs);
    const original = JSON.stringify(host.graph.A.runs);
    await boot(page, host, url);
    for (const run of runs) {
      await page.locator(`[data-testid="graph-run"][data-run-id="${run.id}"]`).click();
      await T(page, "graph-run-summary").waitFor();
      for (const tab of ["graph-run-tab-technical", "graph-run-tab-steps"])
        await T(page, tab).click();
      // Expand every closed disclosure on the page: expanding is reading.
      const summaries = page.locator("[data-view] details:not([open]) > summary");
      for (let index = await summaries.count(); index > 0; index -= 1)
        await summaries
          .first()
          .click({ timeout: 2000 })
          .catch(() => {});
      // Open the inspectors the run itself offers (read-only views, never an answer).
      for (const id of [
        "graph-run-inspect-failure",
        "graph-run-inspect-invalid",
        "graph-run-show-step",
      ])
        if (await T(page, id).count()) await T(page, id).first().click();
      await flush(page);
    }
    assert.equal(JSON.stringify(host.graph.A.runs), original, "records untouched");
    assertPassive(host, "negative control");
  },
};

/** Inspection states the P1 suite does not cover: a denied permission and executor loss. */
const inspectionStates = {
  name: "UX-P2 inspection: denied is terminal and offers a fresh review only; viewing starts nothing",
  async run({ page, host, url }) {
    const control = controlledInspection(host, "denied");
    try {
      const panel = await driveInspection(page, host, url, EN, control);
      const started = () => control.calls.filter((call) => call === "start").length;
      assert.equal(started(), 1, "only the explicit confirmation");
      assert.match(await text(panel), /Native permission denied/);
      assert.equal(
        await T(page, "graph-inspection-conversation").count(),
        0,
        "no permission to answer",
      );
      assert.equal(await T(page, "graph-inspection-permission-instruction").count(), 0);
      assert.equal(await panel.getByRole("button", { name: /Cancel inspection/ }).count(), 0);
      assert.equal(
        await panel.getByRole("button", { name: /^Inspect with installed MSBuild$/ }).isEnabled(),
        true,
      );
      assert.deepEqual(await unnamedControls(page, '[data-testid="graph-project-inspection"]'), []);
      assert.equal(admissionCalls(host).length, 0);
    } finally {
      control.restore();
    }
  },
};

export const stepBehaviorScenarios = [
  toolStepScenario,
  invalidStepScenario,
  passedStepScenario,
  keyboardScenario,
  negativeControl,
  inspectionStates,
];
