// Z8.5-UX-P2 shared state drivers and capture scenarios: real Graph components in the existing
// synthetic Host harness. Synthetic display records only; never native execution, permission or
// verification evidence. The same scenarios run unchanged on the untouched #25 baseline and on the
// P2 branch (`--shots=<dir>`): this module asserts only what is true on BOTH trees (no overflow,
// nothing admitted, nothing forbidden). Semantic assertions live in ux-p2-behavior.mjs.
import assert from "node:assert/strict";
import {
  boot,
  chooseChecks,
  chooseGeneric,
  preparedDraft,
  recipesReady,
  selectValue,
  T,
  flush,
  setState,
  admissionCalls,
  assertClean,
  REQUEST,
  editCheckByKeyboard,
} from "./ux-m1-helpers.mjs";
import { ALL_CHECKS } from "./ux-m1-checks.mjs";
import { u1Run } from "./u1-runs.mjs";
import {
  approvalWaitRun,
  completedRun,
  malformedReviewerRun,
  permissionWaitRun,
  runningRun,
} from "./ux-m1-runs.mjs";
import { addCheck } from "../../packages/ui/test/graphRunSummary.fixture.ts";
import {
  capture,
  controlledInspection,
  driveInspection,
  failedTest,
  invalidEvidence,
  reserveSidebar,
  staleRun,
  variants,
} from "./ux-p1-browser.mjs";

export { variants };

/**
 * `assertClean` of the shared helpers predates the read-only `inspection-history` call that visiting
 * Checks makes (a Codex-owned harness gap reported in UX-P1). Same rule here plus exactly that one
 * read-only operation, so the forbidden-member check stays in force.
 */
export function assertCleanP2(host) {
  const readOnly = new Set(["inspection-history"]);
  assertClean({
    ...host,
    calls: host.calls.filter((call) => !readOnly.has(call.op)),
  });
}

const dated = (run) => {
  run.createdAt = Date.UTC(2026, 9, 1, 8);
  run.updatedAt = run.createdAt + 120000;
  return run;
};
const named = (run, request = "Fix the request parser and preserve existing API behavior") => {
  run.startInput = request;
  run.definition.nodes[0].request = request;
  return dated(run);
};

/** Fixture runs (synthetic captured records). Ids bind evidence and approvals: never re-id later. */
export const fixtures = {
  running: () => u1Run("sequential", "running"),
  permission: () => u1Run("sequential", "permission"),
  approval: () => u1Run("sequential", "approval"),
  "failed-test": failedTest,
  "invalid-evidence": invalidEvidence,
  "stale-review": staleRun,
  /** Successful Build and Test with the final human decision already recorded. */
  "passed-checks": () => {
    const run = named(completedRun("uxp2-passed"));
    addCheck(run, "build", "build");
    addCheck(run, "check", "test");
    return run;
  },
  /** Completed by the agent alone: there is no Test evidence, which is not a pass. */
  "agent-only": () => u1Run("sequential", "completed"),
  /** Executor ownership is uncertain: the run was interrupted and nothing proves it stopped. */
  interrupted: () => {
    const run = named(runningRun("uxp2-interrupted"));
    run.status = "Interrupted";
    return run;
  },
  "reviewer-invalid": () => named(malformedReviewerRun("uxp2-reviewer-invalid")),
  "approval-with-checks": () => {
    const run = named(approvalWaitRun("uxp2-approval-checks"));
    addCheck(run, "build", "build");
    addCheck(run, "check", "test");
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
  name: `UX-P2 run: ${name}`,
  async run({ page, host, url, shotsDir }) {
    const run = fixtures[name]();
    host.setRuns("A", [run]);
    await boot(page, host, url);
    await reserveSidebar(page);
    await pick(page, run.id);
    await eachVariant(page, shotsDir, `run-${name}`);
    assert.equal(admissionCalls(host).length, 0);
    assertCleanP2(host);
  },
});

/** Step detail: the run's own inspect/review button opens the step, captured at the inspector. */
const stepScenario = (name, buttonTestId) => ({
  name: `UX-P2 step: ${name}`,
  async run({ page, host, url, shotsDir }) {
    const run = fixtures[name]();
    host.setRuns("A", [run]);
    await boot(page, host, url);
    await reserveSidebar(page);
    await pick(page, run.id);
    await T(page, buttonTestId).first().click();
    await T(page, "graph-node-inspector").waitFor();
    await eachVariant(page, shotsDir, `step-${name}`, {}, async () => {
      await T(page, "graph-node-inspector").scrollIntoViewIfNeeded();
    });
    assert.equal(admissionCalls(host).length, 0);
    assertCleanP2(host);
  },
});

/** One captured request across Runs → Checks → Runs: draft, request and choices must survive. */
const newRunShot = (name, prepare, { region } = {}) => ({
  name: `UX-P2 new run: ${name}`,
  async run({ page, host, url, shotsDir }) {
    await prepare({ page, host, url });
    await reserveSidebar(page);
    await eachVariant(page, shotsDir, `new-run-${name}`, { region });
    await eachVariant(page, shotsDir, `new-run-${name}-end`, {}, () =>
      page.locator("[data-view]").evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      }),
    );
    assert.equal(admissionCalls(host).length, 0);
    assertCleanP2(host);
  },
});

const FILL_SLOT = async (page) => {
  await T(page, "graph-template-parameter-request").fill(REQUEST);
  await T(page, "graph-template-parameter-targetEngine").fill("Engine X");
  await T(page, "graph-template-parameter-criteria").fill("Spin outcomes match the rules");
  for (const id of ["normal", "free", "bonus", "respin"])
    await T(page, `graph-template-parameter-${id}`).click();
  await chooseChecks(page, { build: "build-main", test: "test-unit" });
};

export const newRunStates = {
  valid: async ({ page, host, url }) => preparedDraft(page, host, url),
  /** A required context reference is missing: the one blocker, with its route. */
  "blocked-fields": async ({ page, host, url }) => {
    await host.seedRecipes("A", ALL_CHECKS);
    await boot(page, host, url);
    await selectValue(page, "graph-library-entry", "slot");
    await recipesReady(page);
    await FILL_SLOT(page);
  },
  /** A run occupies the workspace: the draft stays editable, Review is refused. */
  "blocked-running": async ({ page, host, url }) => {
    host.setRuns("A", [permissionWaitRun()]);
    await preparedDraft(page, host, url);
  },
  /** The request is empty: Review is not available yet. */
  "blocked-request": async ({ page, host, url }) => {
    await host.seedRecipes("A", ALL_CHECKS);
    await boot(page, host, url);
    await chooseGeneric(page);
    await chooseChecks(page, { build: "build-main", test: "test-unit" });
  },
  /** No saved checks yet: the checks block says so and routes to Checks. */
  "no-checks": async ({ page, host, url }) => {
    await host.seedRecipes("A", []);
    await boot(page, host, url);
    await selectValue(page, "graph-library-entry", "generic");
    await T(page, "graph-template-parameter-request").fill(REQUEST);
    await flush(page);
  },
  /** Check edits that were never saved: Review uses the saved checks, which the pane must say. */
  "unsaved-checks": async ({ page, host, url }) => {
    await preparedDraft(page, host, url);
    await editCheckByKeyboard(page, "test");
    const field = T(page, "graph-recipes-json");
    // 嵌套的 details：逐层展开，避免 `details:has(...) > summary` 同时命中外层与内层两个 summary。
    await field.evaluate((element) => {
      for (
        let node = element.closest("details");
        node;
        node = node.parentElement?.closest("details")
      )
        node.open = true;
    });
    const list = JSON.parse(await field.inputValue());
    await field.fill(
      JSON.stringify(
        list.map((recipe) =>
          recipe.id === "test-unit" ? { ...recipe, name: "Unit tests (edited)" } : recipe,
        ),
        null,
        2,
      ),
    );
    await flush(page);
    await T(page, "graph-return-to-workflow").click();
    await T(page, "graph-new-run-pane").waitFor();
    await flush(page);
  },
};

const reviewScenario = {
  name: "UX-P2 new run: command review before authorization",
  async run({ page, host, url, shotsDir }) {
    // Locale/theme changes remount the page (dropping an open review), so each variant runs the flow.
    for (const variant of variants) {
      await page.setViewportSize({ width: variant.width, height: variant.height });
      await preparedDraft(page, host, url);
      await setState(page, { locale: variant.locale, theme: variant.theme });
      await T(page, "graph-new-run-pane").waitFor();
      await reserveSidebar(page);
      await T(page, "graph-review-run").click();
      await T(page, "graph-run-confirmation").waitFor();
      await top(page);
      const facts = await capture(page, shotsDir, `review-${variant.tag}`, {});
      assert.equal(facts.horizontalOverflow, false, `review ${variant.tag} overflows`);
    }
    // Reviewing is not starting: nothing is admitted until the explicit, acknowledged Start.
    assert.equal(
      admissionCalls(host).filter((call) => call.op === "graph.run").length,
      0,
      "reviewing never admits a run",
    );
    assertCleanP2(host);
  },
};

/** Inspection records (UI fixture only), exactly the UX-P1 driver with more final statuses. */
const inspectionShot = (name, finalStatus) => ({
  name: `UX-P2 inspection: ${name}`,
  async run({ page, host, url, shotsDir }) {
    const control = controlledInspection(host, finalStatus);
    try {
      for (const variant of variants) {
        await driveInspection(page, host, url, variant, control);
        const facts = await capture(page, shotsDir, `inspection-${name}-${variant.tag}`, {
          scrollTo: "graph-project-inspection",
        });
        assert.equal(facts.horizontalOverflow, false, `${name} ${variant.tag} overflows`);
      }
    } finally {
      control.restore();
    }
  },
});

/** Passive viewing and tab changes keep the draft and the selected run; they admit nothing. */
const tabRoundTrip = {
  name: "UX-P2 new run: draft survives Checks and Runs round trip",
  async run({ page, host, url, shotsDir }) {
    host.setRuns("A", [fixtures.running()]);
    await preparedDraft(page, host, url);
    await reserveSidebar(page);
    await T(page, "graph-template-setup-checks").click();
    await T(page, "graph-return-to-workflow").click();
    await T(page, "graph-new-run-pane").waitFor();
    await flush(page);
    await eachVariant(page, shotsDir, "new-run-roundtrip", {
      region: '[data-testid="graph-new-run-pane"]',
    });
    assert.equal(admissionCalls(host).length, 0);
    assertCleanP2(host);
  },
};

export const scenarios = [
  ...[
    "running",
    "permission",
    "approval",
    "approval-with-checks",
    "failed-test",
    "invalid-evidence",
    "stale-review",
    "passed-checks",
    "agent-only",
    "interrupted",
    "reviewer-invalid",
  ].map(runScenario),
  stepScenario("failed-test", "graph-run-inspect-failure"),
  stepScenario("invalid-evidence", "graph-run-inspect-invalid"),
  stepScenario("approval-with-checks", "graph-run-review-gate"),
  stepScenario("running", "graph-run-show-step"),
  ...Object.entries(newRunStates).map(([name, prepare]) =>
    newRunShot(name, prepare, { region: '[data-testid="graph-new-run-pane"]' }),
  ),
  reviewScenario,
  tabRoundTrip,
  inspectionShot("verifying", "verifying-sources"),
  inspectionShot("permission", "awaiting-permission"),
  inspectionShot("denied", "denied"),
  inspectionShot("executor-lost", "executor-lost"),
];
