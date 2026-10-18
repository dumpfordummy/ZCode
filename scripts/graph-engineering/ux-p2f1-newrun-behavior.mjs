// Z8.5-UX-P2-F1 New run behaviour: real Graph components in the synthetic Host harness. Asserts that
// "no saved checks" has exactly one setup command, that the blocked footer only locates the next
// field (and never claims one action completes everything), that the full unresolved list and count
// are kept, and that routing is focus only. Synthetic records; not native acceptance.
import assert from "node:assert/strict";
import {
  T,
  admissionCalls,
  flush,
  focused,
  setState,
  templateDraft,
  until,
  REQUEST,
} from "./ux-m1-helpers.mjs";
import { assertCleanP2 } from "./ux-p2-states.mjs";
import { EN, ZH, WIDE, assertPassive, text, unnamedControls } from "./ux-p2-helpers.mjs";
import { f1NewRunStates } from "./ux-p2f1-states.mjs";

const NARROW = { ...EN, tag: "900", width: 900, height: 640, theme: "zai-light" };
const setupCommands = (page) =>
  page.getByRole("button", { name: /^(Set up project checks|设置项目检查)$/ });

const state = (name, variant, title, body) => ({
  name: `UX-P2-F1 new run: ${title} (${variant.locale}, ${variant.width}px)`,
  async run({ page, host, url }) {
    await page.setViewportSize({ width: variant.width, height: variant.height });
    await f1NewRunStates[name]({ page, host, url });
    await setState(page, { locale: variant.locale, theme: variant.theme });
    await T(page, "graph-new-run-pane").waitFor();
    await flush(page);
    await body({ page, host, zh: variant.locale === "zh-CN" });
  },
});

/** The only unresolved fields are the two checks and none is saved. */
const onlyChecks = (variant) =>
  state(
    "no-checks",
    variant,
    "no saved checks has one setup command; the footer only locates it",
    async ({ page, host, zh }) => {
      const blocked = T(page, "graph-new-run-blocked");
      assert.equal(await blocked.getAttribute("data-blocked-by"), "fields", "same blocker");
      assert.match(
        await text(blocked),
        zh ? /尚不能审阅：还有 2 项需补全或修正/ : /Not ready to review: 2 to complete or correct/,
      );
      // One command of that name in the whole pane; the P2-only footer copy is gone.
      assert.equal(await setupCommands(page).count(), 1, "exactly one 'Set up project checks'");
      assert.equal(await T(page, "graph-new-run-setup-checks").count(), 0);
      assert.equal(await T(page, "graph-template-setup-checks").count(), 1);
      // It leads the Checks block; refreshing is secondary.
      assert.equal(
        await T(page, "graph-template-setup-checks").getAttribute("data-variant"),
        "outline",
      );
      assert.equal(
        await T(page, "graph-template-load-recipes").getAttribute("data-variant"),
        "ghost",
      );
      // The footer keeps a locator, truthful reason and disabled Review/Save.
      assert.equal(await T(page, "graph-go-to-first-field").isVisible(), true);
      assert.equal(await T(page, "graph-review-run").isDisabled(), true);
      assert.equal(await T(page, "graph-library-instantiate").isDisabled(), true);
      assert.match(
        await text(T(page, "graph-template-unresolved")),
        zh ? /构建.*测试/ : /Build.*Test/,
      );
      assert.deepEqual(await unnamedControls(page), [], "unnamed control");
      // The locator moves focus to the one actionable control, never into an empty select.
      const before = await templateDraft(page, host);
      await T(page, "graph-go-to-first-field").click();
      assert.equal(await focused(page), "graph-template-setup-checks");
      await page.keyboard.press("Escape");
      assert.equal(await focused(page), "graph-template-setup-checks", "Escape changes nothing");
      assert.deepEqual(await templateDraft(page, host), before, "routing keeps the draft");
      assert.equal(admissionCalls(host).length, 0, "the route only moves focus");
      // The unresolved-list entry for a check leads to the same single command.
      await T(page, "graph-template-unresolved").getByRole("button").first().click();
      assert.equal(await focused(page), "graph-template-setup-checks");
      // Enter on it is the navigation, and the way back keeps the draft.
      await page.keyboard.press("Enter");
      await T(page, "graph-return-to-workflow").waitFor();
      await T(page, "graph-return-to-workflow").click();
      await T(page, "graph-new-run-pane").waitFor();
      assert.deepEqual(
        await templateDraft(page, host),
        before,
        "draft identical after the round trip",
      );
      assert.equal(await T(page, "graph-template-parameter-request").inputValue(), REQUEST);
      assert.equal(await T(page, "graph-review-run").isDisabled(), true, "Review stays gated");
      assertPassive(host, "no saved checks");
    },
  );

/** Slot workflow, nothing filled, no saved checks: 10 unresolved, only 2 of them checks. */
const manyBlockers = (variant) =>
  state(
    "no-checks-many",
    variant,
    "10 blockers, 2 of them checks: setting up checks is not presented as completing all ten",
    async ({ page, host, zh }) => {
      const blocked = T(page, "graph-new-run-blocked");
      assert.match(
        await text(blocked),
        zh
          ? /尚不能审阅：还有 10 项需补全或修正/
          : /Not ready to review: 10 to complete or correct/,
      );
      // The full list is kept: eight fields plus both checks.
      const listed = await T(page, "graph-template-unresolved").getByRole("button").allInnerTexts();
      assert.equal(listed.length, 10, `unresolved list: ${listed}`);
      assert.equal(await setupCommands(page).count(), 1, "one setup command, in the Checks block");
      assert.equal(await T(page, "graph-new-run-setup-checks").count(), 0);
      // The footer does not offer the checks command as the way forward; it locates the first
      // field that can be acted on now, which is not a check.
      assert.equal(await blocked.getByRole("button").count(), 1);
      assert.equal(await T(page, "graph-go-to-first-field").isVisible(), true);
      const key = host.library.key("slot");
      const before = await templateDraft(page, host, "A", key);
      await T(page, "graph-go-to-first-field").click();
      assert.equal(await focused(page), "graph-template-parameter-request");
      assert.deepEqual(
        await templateDraft(page, host, "A", key),
        before,
        "routing keeps the draft",
      );
      // Progression: once the request is filled the route advances to the next open field.
      await T(page, "graph-template-parameter-request").fill(REQUEST);
      await T(page, "graph-go-to-first-field").click();
      assert.equal(await focused(page), "graph-template-parameter-targetEngine");
      assert.equal(
        (await templateDraft(page, host, "A", key)).parameters.request,
        REQUEST,
        "the typed request is kept",
      );
      assert.equal(await T(page, "graph-review-run").isDisabled(), true);
      assert.equal(await T(page, "graph-library-instantiate").isDisabled(), true);
      assert.equal(admissionCalls(host).length, 0);
      assertCleanP2(host);
    },
  );

const progression = state(
  "no-checks-filled",
  EN,
  "the route reaches the checks command only after every other field is resolved",
  async ({ page, host }) => {
    const listed = await T(page, "graph-template-unresolved").getByRole("button").allInnerTexts();
    assert.equal(listed.length, 3, `unresolved list: ${listed}`);
    // The context reference is still open: it is the first actionable field, not the checks.
    await T(page, "graph-go-to-first-field").click();
    await until(
      () =>
        page.evaluate(() =>
          Boolean(document.activeElement?.closest("#graph-template-field-reference-gameDoc")),
        ),
      "focus moves into the missing context",
    );
    // A check entry in the list leads to the single setup command, not into an empty select.
    await T(page, "graph-template-unresolved").getByRole("button").last().click();
    assert.equal(await focused(page), "graph-template-setup-checks");
    assert.equal(await setupCommands(page).count(), 1);
    assertPassive(host, "progression");
  },
);

const savedChecks = state(
  "checks-saved-fields-open",
  EN,
  "with saved checks nothing about the checks command or the footer route changes",
  async ({ page, host }) => {
    assert.equal(await T(page, "graph-new-run-setup-checks").count(), 0);
    assert.equal(await setupCommands(page).count(), 1);
    assert.equal(
      await T(page, "graph-template-setup-checks").getAttribute("data-variant"),
      "ghost",
      "unchanged styling when checks exist",
    );
    assert.equal(
      await T(page, "graph-template-load-recipes").getAttribute("data-variant"),
      "outline",
    );
    assert.match(
      await text(T(page, "graph-new-run-blocked")),
      /Not ready to review: 8 to complete or correct/,
    );
    await T(page, "graph-go-to-first-field").click();
    assert.equal(await focused(page), "graph-template-parameter-request");
    assertPassive(host, "saved checks");
  },
);

const validState = state(
  "valid",
  EN,
  "a valid draft is untouched: one setup command, Review enabled",
  async ({ page, host }) => {
    assert.equal(await setupCommands(page).count(), 1);
    assert.equal(await T(page, "graph-review-run").isEnabled(), true);
    assert.equal(await T(page, "graph-new-run-blocked").count(), 0);
    assert.equal(await T(page, "graph-go-to-first-field").count(), 0);
    assert.equal(admissionCalls(host).length, 0);
    assertCleanP2(host);
  },
);

const negativeControl = {
  name: "UX-P2-F1 negative control: routing and expanding in the no-checks pane save, prepare and run nothing",
  async run({ page, host, url }) {
    await page.setViewportSize({ width: WIDE.width, height: WIDE.height });
    await f1NewRunStates["no-checks-many"]({ page, host, url });
    for (let step = 0; step < 4; step += 1) {
      await T(page, "graph-go-to-first-field").click();
      await page.keyboard.press("Tab");
    }
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
    assert.equal(await T(page, "graph-review-run").isDisabled(), true, "Review stays gated");
    assertPassive(host, "no-checks routing");
  },
};

export const newRunBehaviorScenarios = [
  onlyChecks(EN),
  onlyChecks(ZH),
  onlyChecks(NARROW),
  manyBlockers(EN),
  manyBlockers(ZH),
  progression,
  savedChecks,
  validState,
  negativeControl,
];
