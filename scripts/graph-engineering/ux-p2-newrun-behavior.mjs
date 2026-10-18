// Z8.5-UX-P2 New run behaviour: real Graph components in the synthetic Host harness. Asserts the
// one blocker with its one route, preserved request/choices/workspace across tab changes, the exact
// command review before authorization, and that viewing never saves, prepares or runs.
// Synthetic records; not native acceptance. Run via ux-p2-behavior.mjs.
import assert from "node:assert/strict";
import {
  REQUEST,
  T,
  admissionCalls,
  flush,
  focused,
  stepRows,
  templateDraft,
  until,
} from "./ux-m1-helpers.mjs";
import { newRunStates, assertCleanP2, fixtures } from "./ux-p2-states.mjs";
import { EN, WIDE, ZH, assertPassive, text, unnamedControls } from "./ux-p2-helpers.mjs";
import { setState } from "./ux-m1-helpers.mjs";

const state = (name, variant, body) => ({
  name: `UX-P2 new run: ${name} (${variant.locale})`,
  async run({ page, host, url }) {
    await page.setViewportSize({ width: variant.width, height: variant.height });
    await newRunStates[name.split(":")[0]]({ page, host, url });
    await setState(page, { locale: variant.locale, theme: variant.theme });
    await T(page, "graph-new-run-pane").waitFor();
    await flush(page);
    await body({ page, host, url, zh: variant.locale === "zh-CN" });
  },
});

const validState = (variant) => ({
  name: `UX-P2 new run: valid draft has a compact checks row and one ready line (${variant.locale})`,
  async run({ page, host, url }) {
    await page.setViewportSize({ width: variant.width, height: variant.height });
    await newRunStates.valid({ page, host, url });
    await setState(page, { locale: variant.locale, theme: variant.theme });
    await T(page, "graph-new-run-pane").waitFor();
    await flush(page);
    const zh = variant.locale === "zh-CN";
    const status = T(page, "graph-recipe-read-state");
    assert.equal(await status.getAttribute("data-state"), "ready");
    assert.match(await text(status), zh ? /已加载 5 个已保存的检查/ : /5 saved checks loaded\./);
    // The status sentence and its two actions share one row.
    const rows = await status.evaluate((root) =>
      [...root.querySelectorAll("p, button")].map((node) =>
        Math.round(node.getBoundingClientRect().top),
      ),
    );
    assert.ok(Math.max(...rows) - Math.min(...rows) <= 14, `one row: ${rows}`);
    assert.equal(await T(page, "graph-template-load-recipes").isVisible(), true);
    assert.equal(await T(page, "graph-template-setup-checks").isVisible(), true);
    // The single-Build relationship is not repeated in the default view.
    assert.doesNotMatch(await text(T(page, "graph-new-run-pane")), /Build relationship|关联构建/);
    // The safety statement stays where the action is, and the saved-check rows still say not run.
    assert.match(
      await text(T(page, "graph-new-run-ready")),
      /Nothing starts until you confirm|确认之前不会开始/,
    );
    for (const step of ["build", "test"]) {
      const [row] = await stepRows(page, step);
      assert.match(row.text, zh ? /已保存 · 未运行/ : /Saved · not run/);
    }
    assert.equal(await T(page, "graph-review-run").isEnabled(), true);
    assert.equal(await T(page, "graph-new-run-setup-checks").count(), 0);
    assert.equal(await T(page, "graph-new-run-blocked").count(), 0);
    assert.deepEqual(await unnamedControls(page), [], "unnamed control");
    assert.equal(admissionCalls(host).length, 0);
    assertCleanP2(host);
  },
});

const blockedFields = state("blocked-fields:missing context", EN, async ({ page, host }) => {
  const blocked = T(page, "graph-new-run-blocked");
  assert.equal(await blocked.getAttribute("data-blocked-by"), "fields");
  assert.match(await text(blocked), /Not ready to review: 1 to complete or correct/);
  assert.equal(await T(page, "graph-review-run").isDisabled(), true);
  assert.equal(await T(page, "graph-library-instantiate").isDisabled(), true);
  // The route to a missing field is unchanged: a field exists, so focus goes to it.
  assert.equal(await T(page, "graph-new-run-setup-checks").count(), 0);
  assert.match(await text(T(page, "graph-template-unresolved")), /Authoritative GameDoc/);
  await T(page, "graph-go-to-first-field").click();
  await until(
    () =>
      page.evaluate(() =>
        Boolean(document.activeElement?.closest("#graph-template-field-reference-gameDoc")),
      ),
    "focus moves into the missing context",
  );
  assert.equal(admissionCalls(host).length, 0, "the route only moves focus");
});

const blockedRequest = state("blocked-request:empty request", EN, async ({ page, host }) => {
  assert.equal(await T(page, "graph-new-run-blocked").getAttribute("data-blocked-by"), "fields");
  assert.equal(await T(page, "graph-review-run").isDisabled(), true);
  await T(page, "graph-go-to-first-field").click();
  assert.equal(await focused(page), "graph-template-parameter-request");
  assert.equal(admissionCalls(host).length, 0);
});

const blockedRunning = state(
  "blocked-running:a run occupies the workspace",
  EN,
  async ({ page, host }) => {
    const blocked = T(page, "graph-new-run-blocked");
    assert.equal(await blocked.getAttribute("data-blocked-by"), "run-active");
    assert.match(await text(blocked), /current run still owns this workspace/);
    assert.equal(await T(page, "graph-review-run").isDisabled(), true);
    assert.equal(await T(page, "graph-new-run-setup-checks").count(), 0);
    // The draft is kept and the way to the occupying run is a button.
    assert.equal(await T(page, "graph-template-parameter-request").inputValue(), REQUEST);
    await T(page, "graph-view-current-run").click();
    await T(page, "graph-run-summary").waitFor();
    assert.equal(admissionCalls(host).length, 0);
  },
);

const noChecks = (variant) =>
  state("no-checks:no saved checks route to Checks setup", variant, async ({ page, host, zh }) => {
    const blocked = T(page, "graph-new-run-blocked");
    assert.equal(
      await blocked.getAttribute("data-blocked-by"),
      "fields",
      "same blocker, same reason",
    );
    assert.match(
      await text(blocked),
      zh ? /尚不能审阅：还有 2 项需补全或修正/ : /Not ready to review: 2 to complete or correct/,
    );
    assert.equal(await T(page, "graph-review-run").isDisabled(), true);
    assert.equal(await T(page, "graph-library-instantiate").isDisabled(), true);
    // UX-P2-F1: one setup command, in the Checks row. The footer only locates it: the first field
    // would be an empty select, so "Go to first field" moves focus to that command instead.
    assert.equal(await T(page, "graph-new-run-setup-checks").count(), 0);
    const setup = T(page, "graph-template-setup-checks");
    assert.equal(await setup.isVisible(), true);
    assert.equal(await setup.isEnabled(), true);
    await T(page, "graph-go-to-first-field").click();
    await until(
      async () => (await focused(page)) === "graph-template-setup-checks",
      "the locator reaches the one setup command",
    );
    assert.match(await text(T(page, "graph-template-unresolved")), zh ? /构建/ : /Build/);
    assert.deepEqual(await unnamedControls(page), [], "unnamed control");
    // It is navigation only: the draft survives the round trip and nothing is admitted.
    const before = await templateDraft(page, host);
    await setup.click();
    await T(page, "graph-return-to-workflow").waitFor();
    await T(page, "graph-return-to-workflow").click();
    await T(page, "graph-new-run-pane").waitFor();
    assert.deepEqual(await templateDraft(page, host), before, "draft identical");
    assert.equal(await T(page, "graph-template-parameter-request").inputValue(), REQUEST);
    assert.equal(admissionCalls(host).length, 0);
    assertCleanP2(host);
  });

const unsavedChecks = state(
  "unsaved-checks:both unsaved notices stay",
  EN,
  async ({ page, host }) => {
    // Asserted by UX-M2/native drivers: the block and the row marker both stay.
    assert.match(
      await text(T(page, "graph-new-run-unsaved-checks")),
      /Review and the next run use the saved checks shown here/,
    );
    assert.equal(
      await page
        .locator(
          '[data-testid="graph-selected-checks-test"] [data-testid="graph-selected-check-unsaved"]',
        )
        .getAttribute("data-change"),
      "modified",
    );
    const [row] = await stepRows(page, "test");
    assert.match(row.text, /^Unit tests Test · Saved · not run/, "the SAVED name, not the edit");
    assert.equal(admissionCalls(host).length, 0);
  },
);

const reviewScenario = {
  name: "UX-P2 new run: Review shows the exact command before authorization and starts nothing",
  async run({ page, host, url }) {
    await page.setViewportSize({ width: EN.width, height: EN.height });
    await newRunStates.valid({ page, host, url });
    await T(page, "graph-review-run").click();
    await T(page, "graph-run-confirmation").waitFor();
    const review = await T(page, "graph-run-confirmation").evaluate((node) => node.textContent);
    for (const expected of ["build-main", "test-unit", "dotnet --version", REQUEST])
      assert.ok(review.includes(expected), `review shows ${expected}`);
    assert.match(review, /Saved checks only/);
    assert.match(review, /not a filesystem or network sandbox/);
    // Start stays unavailable until the explicit, per-run acknowledgment.
    const start = page.getByRole("button", { name: /^Start run$/ });
    assert.equal(await start.isDisabled(), true);
    assert.equal(
      host.calls.filter((call) => call.op === "graph.run" && call.phase === "start").length,
      0,
    );
    assert.equal(host.calls.filter((call) => call.op === "wf.prepare").length > 0, true);
    assertCleanP2(host);
  },
};

const roundTrip = {
  name: "UX-P2 new run: request, check choices and the selected run survive tab changes",
  async run({ page, host, url }) {
    const run = fixtures.running();
    host.setRuns("A", [run]);
    await newRunStates.valid({ page, host, url });
    const before = await templateDraft(page, host);
    assert.equal(before.parameters.request, REQUEST);
    const rows = { build: await stepRows(page, "build"), test: await stepRows(page, "test") };
    for (const tab of ["graph-template-setup-checks"]) await T(page, tab).click();
    await T(page, "graph-return-to-workflow").click();
    await T(page, "graph-new-run-pane").waitFor();
    assert.deepEqual(await templateDraft(page, host), before, "draft identical");
    assert.deepEqual(await stepRows(page, "build"), rows.build);
    assert.deepEqual(await stepRows(page, "test"), rows.test);
    // The run view and the pane do not overwrite each other.
    await page.locator(`[data-testid="graph-run"][data-run-id="${run.id}"]`).click();
    await T(page, "graph-run-summary").waitFor();
    await T(page, "graph-new-run").click();
    await T(page, "graph-new-run-pane").waitFor();
    assert.equal(await T(page, "graph-template-parameter-request").inputValue(), REQUEST);
    assert.deepEqual(await templateDraft(page, host), before);
    assertPassive(host, "round trip");
  },
};

const negativeControl = {
  name: "UX-P2 negative control: opening every New run disclosure saves, prepares and runs nothing",
  async run({ page, host, url }) {
    await page.setViewportSize({ width: WIDE.width, height: WIDE.height });
    await newRunStates.valid({ page, host, url });
    const summaries = page.locator(
      '[data-testid="graph-new-run-pane"] details:not([open]) > summary',
    );
    for (let index = await summaries.count(); index > 0; index -= 1)
      await summaries
        .first()
        .click({ timeout: 2000 })
        .catch(() => {});
    await T(page, "graph-template-load-recipes").click();
    await flush(page);
    assert.equal(
      host.calls.filter((call) =>
        [
          "wf.instantiate",
          "wf.prepare",
          "graph.saveDefinition",
          "graph.recipes.save",
          "graph.run",
        ].includes(call.op),
      ).length,
      0,
    );
    assertPassive(host, "new run disclosures");
  },
};

export const newRunBehaviorScenarios = [
  validState(EN),
  validState(ZH),
  blockedFields,
  blockedRequest,
  blockedRunning,
  noChecks(EN),
  noChecks(ZH),
  unsavedChecks,
  reviewScenario,
  roundTrip,
  negativeControl,
];
