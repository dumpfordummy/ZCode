// Z8.5-UX-P2-F1 shared fixtures and capture scenarios: real Graph components in the existing
// synthetic Host harness. Synthetic display records only; never native execution, permission or
// verification evidence. The same scenarios run unchanged on the frozen UX-P2 head (before) and on
// the P2-F1 branch (after): `--shots=<dir>`. This module asserts only what is true on BOTH trees
// (no overflow, nothing admitted, nothing forbidden); semantic assertions are in
// ux-p2f1-behavior.mjs.
import assert from "node:assert/strict";
import {
  boot,
  chooseChecks,
  flush,
  selectValue,
  setState,
  T,
  admissionCalls,
  REQUEST,
} from "./ux-m1-helpers.mjs";
import { ALL_CHECKS } from "./ux-m1-checks.mjs";
import { u1Run } from "./u1-runs.mjs";
import { completedRun } from "./ux-m1-runs.mjs";
import { capture, reserveSidebar } from "./ux-p1-browser.mjs";
import { assertCleanP2, fixtures, newRunStates } from "./ux-p2-states.mjs";

/** Normal and narrow widths, both locales, both themes (the F1 matrix). */
export const variants = [
  { tag: "1366", width: 1366, height: 768, locale: "en-US", theme: "zai-dark" },
  { tag: "1366-light", width: 1366, height: 768, locale: "en-US", theme: "zai-light" },
  { tag: "1093-zh", width: 1093, height: 614, locale: "zh-CN", theme: "zai-light" },
  { tag: "1093-zh-dark", width: 1093, height: 614, locale: "zh-CN", theme: "zai-dark" },
  { tag: "900", width: 900, height: 640, locale: "en-US", theme: "zai-light" },
  { tag: "900-zh-dark", width: 900, height: 640, locale: "zh-CN", theme: "zai-dark" },
];

const dated = (run) => {
  run.createdAt = Date.UTC(2026, 9, 1, 8);
  run.updatedAt = run.createdAt + 120000;
  return run;
};

/** A running run (u1 decorated) whose agent attempt carries `attempt` while the run says `run`. */
const agentRun = (run, attempt, id) => {
  const record = u1Run("sequential", "running");
  record.id = id;
  record.status = run;
  record.nodeAttempts[0].status = attempt;
  return dated(record);
};

/**
 * The service finishes a run only after the final gate is approved, so an End cursor on a run that
 * is not Completed is a real (if rare) record: the gate was approved and the run never settled.
 */
const endCursor = (id, status, { gate = true } = {}) => {
  const run = dated(completedRun(id));
  run.startInput = "Fix the request parser and preserve existing API behavior";
  run.definition.nodes[0].request = run.startInput;
  run.status = status;
  run.result = undefined;
  if (!gate) run.approvalAttempts = [];
  return run;
};

/** Frozen-P2 fixtures plus the F1 matrix. Ids bind evidence and approvals: never re-id later. */
export const f1Fixtures = {
  ...fixtures,
  // Run/attempt agreement and disagreement (finding 3).
  "attempt-question": () => agentRun("WaitingForUser", "WaitingForUser", "f1-question"),
  "mismatch-question": () => agentRun("Running", "WaitingForUser", "f1-mm-question"),
  "mismatch-permission": () => agentRun("Running", "WaitingForPermission", "f1-mm-permission"),
  "mismatch-unknown": () => agentRun("Running", "Unknown", "f1-mm-unknown"),
  "mismatch-interrupted": () => agentRun("Running", "Interrupted", "f1-mm-interrupted"),
  "mismatch-cancel": () => agentRun("Running", "CancelRequested", "f1-mm-cancel"),
  "interrupted-question": () => agentRun("Interrupted", "WaitingForUser", "f1-int-question"),
  // The End cursor matrix (finding 5).
  // Ids bind evidence and approvals: the frozen UX-P2 record is used as it is.
  "end-completed": () => fixtures["passed-checks"](),
  "end-failed": () => endCursor("f1-end-failed", "Failed"),
  "end-cancelled": () => endCursor("f1-end-cancelled", "Cancelled"),
  "end-interrupted": () => endCursor("f1-end-interrupted", "Interrupted"),
  "end-needs-human": () => endCursor("f1-end-needs-human", "NeedsHuman", { gate: false }),
  "end-running": () => endCursor("f1-end-running", "Running"),
  // Invalid evidence that carries raw runner counts, and one that carries none (finding 4).
  "invalid-no-counts": () => {
    const run = fixtures["invalid-evidence"]();
    const attempt = run.toolAttempts.find((item) => item.verification);
    delete attempt.verification.testCount;
    delete attempt.verification.passed;
    delete attempt.verification.failed;
    delete attempt.verification.skipped;
    return run;
  },
};

const top = (page) =>
  page.locator("[data-view]").evaluate((element) => {
    element.scrollTop = 0;
  });

async function eachVariant(page, dir, name, options, before = () => top(page)) {
  const facts = [];
  for (const variant of variants) {
    await setState(page, { locale: variant.locale, theme: variant.theme });
    await page.setViewportSize({ width: variant.width, height: variant.height });
    await before(variant);
    facts.push(await capture(page, dir, `${name}-${variant.tag}`, options));
    assert.equal(facts.at(-1).horizontalOverflow, false, `${name} ${variant.tag} overflows`);
  }
  return facts;
}

const pick = async (page, id) => {
  await page.locator(`[data-testid="graph-run"][data-run-id="${id}"]`).click();
  await T(page, "graph-run-summary").waitFor();
  await top(page);
};

const runScenario = (name) => ({
  name: `UX-P2-F1 run: ${name}`,
  async run({ page, host, url, shotsDir }) {
    const run = f1Fixtures[name]();
    host.setRuns("A", [run]);
    await boot(page, host, url);
    await reserveSidebar(page);
    await pick(page, run.id);
    await eachVariant(page, shotsDir, `run-${name}`);
    assert.equal(admissionCalls(host).length, 0);
    assertCleanP2(host);
  },
});

/** The step inspector the run itself offers: failed Test, invalid evidence or the passed Test. */
const stepScenario = (name, open) => ({
  name: `UX-P2-F1 step: ${name}`,
  async run({ page, host, url, shotsDir }) {
    const run = f1Fixtures[name]();
    host.setRuns("A", [run]);
    await boot(page, host, url);
    await reserveSidebar(page);
    await pick(page, run.id);
    await open(page);
    await T(page, "graph-tool-inspector").waitFor();
    await eachVariant(page, shotsDir, `step-${name}`, {}, async () => {
      await T(page, "graph-tool-inspector").scrollIntoViewIfNeeded();
    });
    assert.equal(admissionCalls(host).length, 0);
    assertCleanP2(host);
  },
});

const FILL = async (page) => {
  await T(page, "graph-template-parameter-request").fill(REQUEST);
  await T(page, "graph-template-parameter-targetEngine").fill("Engine X");
  await T(page, "graph-template-parameter-criteria").fill("Spin outcomes match the rules");
  for (const id of ["normal", "free", "bonus", "respin"])
    await T(page, `graph-template-parameter-${id}`).click();
};

/** New run states that need no saved checks (findings 1 and 2) plus the ones that need them. */
export const f1NewRunStates = {
  valid: newRunStates.valid,
  "no-checks": newRunStates["no-checks"],
  /** The Slot-game workflow with nothing filled in and no saved checks: many blockers, two checks. */
  "no-checks-many": async ({ page, host, url }) => {
    await host.seedRecipes("A", []);
    await boot(page, host, url);
    await selectValue(page, "graph-library-entry", "slot");
    await flush(page);
  },
  /** Slot workflow, every parameter filled, no saved checks: only context and the checks remain. */
  "no-checks-filled": async ({ page, host, url }) => {
    await host.seedRecipes("A", []);
    await boot(page, host, url);
    await selectValue(page, "graph-library-entry", "slot");
    await FILL(page);
    await flush(page);
  },
  /** Saved checks exist; the Slot workflow has other required fields open: no "no checks" route. */
  "checks-saved-fields-open": async ({ page, host, url }) => {
    await host.seedRecipes("A", ALL_CHECKS);
    await boot(page, host, url);
    await selectValue(page, "graph-library-entry", "slot");
    await chooseChecks(page, { build: "build-main", test: "test-unit" });
    await flush(page);
  },
};

const newRunScenario = (name) => ({
  name: `UX-P2-F1 new run: ${name}`,
  async run({ page, host, url, shotsDir }) {
    await f1NewRunStates[name]({ page, host, url });
    await reserveSidebar(page);
    await eachVariant(page, shotsDir, `new-run-${name}`, {
      region: '[data-testid="graph-new-run-pane"]',
    });
    await eachVariant(page, shotsDir, `new-run-${name}-end`, {}, () =>
      page.locator("[data-view]").evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      }),
    );
    assert.equal(admissionCalls(host).length, 0);
    assertCleanP2(host);
  },
});

export const scenarios = [
  ...[
    "running",
    "attempt-question",
    "mismatch-question",
    "mismatch-permission",
    "mismatch-unknown",
    "mismatch-interrupted",
    "mismatch-cancel",
    "interrupted-question",
    "end-completed",
    "end-failed",
    "end-cancelled",
    "end-interrupted",
    "end-needs-human",
    "end-running",
    "failed-test",
    "invalid-evidence",
  ].map(runScenario),
  stepScenario("failed-test", (page) => T(page, "graph-run-inspect-failure").click()),
  stepScenario("invalid-evidence", (page) => T(page, "graph-run-inspect-invalid").click()),
  stepScenario("invalid-no-counts", (page) => T(page, "graph-run-inspect-invalid").click()),
  stepScenario("passed-checks", (page) => T(page, "graph-select-node-check").click()),
  ...["valid", "no-checks", "no-checks-many", "no-checks-filled", "checks-saved-fields-open"].map(
    newRunScenario,
  ),
];
