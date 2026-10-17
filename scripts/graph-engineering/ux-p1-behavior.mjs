// Z8.5-UX-P1 rendered behaviour: real Graph components in the existing synthetic Host harness.
// Asserts truthful state, the one next action, retained safety information, keyboard behaviour and
// that viewing/expanding never causes a Host call. Synthetic records; not native acceptance.
import assert from "node:assert/strict";
import { runUxBrowserSuite } from "./ux-browser-runner.mjs";
import {
  boot,
  preparedDraft,
  T,
  until,
  flush,
  selectValue,
  admissionCalls,
  assertClean,
  templateDraft,
  REQUEST,
} from "./ux-m1-helpers.mjs";
import { u1Run } from "./u1-runs.mjs";
import {
  controlledInspection,
  driveInspection,
  openChecks,
  reserveSidebar,
  staleRun,
  failedTest,
  invalidEvidence,
  CONFIRM,
} from "./ux-p1-browser.mjs";

const EN = { tag: "1366", width: 1366, height: 768, locale: "en-US", theme: "zai-dark" };
const ZH = { tag: "1093-zh", width: 1093, height: 614, locale: "zh-CN", theme: "zai-light" };
const WIDE = { tag: "1600", width: 1600, height: 900, locale: "en-US", theme: "zai-light" };
const text = async (locator) => (await locator.innerText()).replace(/\s+/g, " ").trim();
const INSPECT = /^(Inspect with installed MSBuild|使用已安装 MSBuild 检查)$/;
const CHECK = /^(Check original operation|查看原操作)$/;
const CANCEL = /^(Cancel inspection|取消检查)$/;
const inspectButton = (panel) => panel.getByRole("button").filter({ hasText: INSPECT });
const checkButton = (panel) => panel.getByRole("button").filter({ hasText: CHECK });
const cancelButton = (panel) => panel.getByRole("button").filter({ hasText: CANCEL });
const confirmButton = (panel) => panel.getByRole("button").filter({ hasText: CONFIRM });

/** What an operator must see/do in each inspection state, in both languages. */
const inspectionState = (variant, status) => ({
  name: `UX-P1 behaviour: inspection ${status} (${variant.locale})`,
  async run({ page, host, url }) {
    const zh = variant.locale === "zh-CN";
    const control = controlledInspection(host, status);
    try {
      const panel = await driveInspection(page, host, url, variant, control);
      const stage = await text(T(page, "graph-inspection-stage"));
      const comboboxes = await panel.getByRole("combobox").count();
      const started = () => control.calls.filter((call) => call === "start").length;
      assert.equal(
        started(),
        status === "review-ready" ? 0 : 1,
        "exactly the explicit confirmation",
      );
      if (status === "review-ready") {
        assert.equal(comboboxes, 2, "SDK and framework stay editable before authorization");
        assert.equal(await confirmButton(panel).isEnabled(), true, "one clear next action");
        assert.equal(await cancelButton(panel).count(), 1);
        assert.equal(await checkButton(panel).count(), 0, "no original operation to check yet");
        assert.equal(
          await T(page, "graph-inspection-conversation").count(),
          0,
          "no permission yet",
        );
        assert.equal(await T(page, "graph-inspection-permission-instruction").count(), 0);
        // Material side-effect disclosure stays visible before authorization.
        assert.match(await text(panel), zh ? /原生权限/ : /native permission/);
        // Exact command, ordered arguments and read scope are visible without any extra click.
        const command = T(page, "graph-inspection-command");
        assert.equal(await command.evaluate((node) => node.open), true);
        const shown = await text(command);
        const { recipe, inspection } = control.row.request;
        assert.ok(shown.includes(recipe.executable));
        for (const argument of recipe.args) assert.ok(shown.includes(argument), argument);
        assert.ok(shown.includes(inspection.sdkDirectory));
        assert.ok(shown.includes(String(inspection.observedFiles)));
      }
      if (status === "verifying-sources") {
        assert.match(
          stage,
          zh ? /当前无需回应权限请求/ : /no permission response is currently needed/,
        );
        assert.equal(comboboxes, 0, "no disabled controls: one summary line");
        assert.match(
          await text(T(page, "graph-inspection-selection")),
          /Api\/Api\.csproj · 8\.0\.426 · net8\.0/,
        );
        assert.equal(await T(page, "graph-inspection-conversation").count(), 0);
        assert.equal(await T(page, "graph-inspection-permission-instruction").count(), 0);
        assert.equal(await inspectButton(panel).count(), 0, "cannot start a second review");
        assert.equal(await checkButton(panel).isEnabled(), true);
        assert.equal(await cancelButton(panel).isEnabled(), true, "cancellation stays reachable");
        assert.doesNotMatch(await text(panel), /synthetic-inspection-session/);
      }
      if (status === "awaiting-permission") {
        const conversation = T(page, "graph-inspection-conversation");
        assert.equal(await conversation.isEnabled(), true);
        const instruction = await text(T(page, "graph-inspection-permission-instruction"));
        assert.match(instruction, zh ? /权限提示/ : /permission prompt/);
        assert.doesNotMatch(instruction, /synthetic-inspection-session/, "identifier is a detail");
        const command = T(page, "graph-inspection-command");
        assert.equal(await command.evaluate((node) => node.open), false);
        await command.locator(":scope > summary").focus();
        await page.keyboard.press("Enter");
        assert.equal(await command.evaluate((node) => node.open), true);
        assert.match(await text(command), /synthetic-inspection-session/, "recoverable on demand");
        assert.equal(await checkButton(panel).count(), 1);
        assert.equal(await cancelButton(panel).count(), 1);
      }
      if (status === "expired") {
        assert.match(stage, zh ? /已到期/ : /expired/);
        assert.equal(comboboxes, 2);
        assert.equal(
          await inspectButton(panel).isEnabled(),
          true,
          "review again is the next action",
        );
        assert.equal(
          await confirmButton(panel).count(),
          0,
          "an expired review cannot be confirmed",
        );
        assert.equal(await cancelButton(panel).count(), 0);
        assert.equal(await T(page, "graph-inspection-conversation").count(), 0);
      }
      if (status === "executor-lost") {
        assert.match(stage, zh ? /执行器不可用/ : /Executor unavailable/);
        assert.equal(await checkButton(panel).isEnabled(), true, "recovery stays actionable");
        assert.equal(await cancelButton(panel).isEnabled(), true);
        assert.equal(await inspectButton(panel).count(), 0);
      }
      assert.equal(started(), status === "review-ready" ? 0 : 1, "no replay from viewing");
      assert.equal(admissionCalls(host).length, 0);
    } finally {
      control.restore();
    }
  },
});

const inspectionKeyboard = {
  name: "UX-P1 behaviour: inspection keyboard, Escape and focus return",
  async run({ page, host, url }) {
    const control = controlledInspection(host, "awaiting-permission");
    try {
      const panel = await driveInspection(page, host, url, EN, control, { confirm: false });
      const command = T(page, "graph-inspection-command");
      const before = control.calls.length;
      // Enter toggles the disclosure; no Host call, no state change.
      await command.locator(":scope > summary").focus();
      await page.keyboard.press("Enter");
      assert.equal(await command.evaluate((node) => node.open), false);
      await page.keyboard.press("Enter");
      assert.equal(await command.evaluate((node) => node.open), true);
      assert.equal(control.calls.length, before, "expanding calls nothing");
      assert.equal(await panel.getAttribute("data-status"), "review-ready");
      // Escape closes the select and focus returns to its trigger.
      const sdk = panel.getByRole("combobox").nth(0);
      await sdk.click();
      await page.getByRole("option", { name: "8.0.425", exact: true }).waitFor();
      await page.keyboard.press("Escape");
      await until(async () => (await page.getByRole("option").count()) === 0, "select closed");
      assert.equal(
        await sdk.evaluate((node) => node === document.activeElement),
        true,
        "focus returns",
      );
      assert.equal(await sdk.innerText(), "8.0.426", "Escape keeps the selection");
      // Tab reaches the primary action before the secondary one.
      await confirmButton(panel).focus();
      await page.keyboard.press("Tab");
      assert.equal(
        await page.evaluate(() => document.activeElement?.textContent),
        "Inspect with installed MSBuild",
      );
      assert.equal(control.calls.filter((call) => call === "start").length, 0);
    } finally {
      control.restore();
    }
  },
};

const unsupported = (variant) => ({
  name: `UX-P1 behaviour: unsupported selected project (${variant.locale})`,
  async run({ page, host, url }) {
    const zh = variant.locale === "zh-CN";
    await page.setViewportSize({ width: variant.width, height: variant.height });
    await openChecks(page, host, url, true, { locale: variant.locale, theme: variant.theme });
    await T(page, "graph-quick-build").waitFor();
    await selectValue(page, "graph-quick-build", "Api/Api.csproj");
    await until(
      async () =>
        (await T(page, "graph-quick-dotnet").getAttribute("data-preparation")) === "unsupported",
      "Web rejection",
    );
    const blocker = T(page, "graph-quick-blocker");
    const shown = await text(blocker);
    // One blocker: names the target, keeps the exact cause and next step, appears first.
    assert.match(shown, /Api\/Api\.csproj/);
    assert.match(shown, /Microsoft\.NET\.Sdk\.Web/);
    assert.match(shown, /Razor/);
    assert.equal(
      await text(T(page, "graph-quick-proposal").locator('[role="status"]').first()),
      shown,
    );
    assert.equal(await T(page, "graph-quick-save").isEnabled(), false, "Save stays disabled");
    assert.equal(await T(page, "graph-quick-save-run").isEnabled(), false);
    const proposal = await text(T(page, "graph-quick-proposal"));
    assert.doesNotMatch(
      proposal,
      zh ? /发现多个目标/ : /Several targets were found/,
      "choice made",
    );
    assert.doesNotMatch(proposal, zh ? /清单：/ : /Inventory:/, "inventory is a detail");
    assert.doesNotMatch(proposal, /Conservative inputs|输入保守覆盖/);
    assert.doesNotMatch(proposal, /Build must produce|构建必须生成/);
    // The reason Save is disabled is visible and Save's own meaning is one short line.
    assert.match(proposal, zh ? /保存不会执行任何命令/ : /Saving does not run anything/);
    // Details hold the inventory and general explanations and open with the keyboard.
    const details = T(page, "graph-quick-details");
    assert.equal(await details.evaluate((node) => node.open), false);
    await details.locator(":scope > summary").focus();
    await page.keyboard.press("Enter");
    assert.equal(await details.evaluate((node) => node.open), true);
    const opened = await text(details);
    assert.match(opened, zh ? /清单：/ : /Inventory:/);
    assert.match(opened, zh ? /框架标签/ : /Framework labels/);
    await page.keyboard.press("Enter");
    assert.equal(await details.evaluate((node) => node.open), false);
    assert.equal(
      await page.evaluate(
        () =>
          document.activeElement ===
          document.querySelector('[data-testid="graph-quick-details"] > summary'),
      ),
      true,
      "focus stays on the disclosure summary",
    );
    assert.equal(admissionCalls(host).length, 0, "no Save, run or prepare from viewing");
  },
});

const runStates = {
  name: "UX-P1 behaviour: run result truth, one next action, retained selection",
  async run({ page, host, url }) {
    const runs = [
      u1Run("sequential", "running"),
      u1Run("sequential", "permission"),
      u1Run("sequential", "approval"),
      failedTest(),
      invalidEvidence(),
      staleRun(),
    ];
    host.setRuns("A", runs);
    const original = JSON.stringify(host.graph.A.runs);
    await boot(page, host, url);
    await reserveSidebar(page);
    for (const variant of [EN, ZH, WIDE]) {
      await page.setViewportSize({ width: variant.width, height: variant.height });
      const zh = variant.locale === "zh-CN";
      await page.evaluate((patch) => window.__harness.set(patch), {
        locale: variant.locale,
        theme: variant.theme,
      });
      const pick = async (run) => {
        await page.locator(`[data-testid="graph-run"][data-run-id="${run.id}"]`).click();
        await T(page, "graph-run-summary").waitFor();
        assert.equal(
          await page
            .locator('[data-testid="graph-run"][aria-current="true"]')
            .getAttribute("data-run-id"),
          run.id,
        );
      };
      // Assertion FAIL and invalid evidence are different facts with different actions.
      await pick(runs[3]);
      assert.equal(await T(page, "graph-run-evidence").getAttribute("data-state"), "tests-failed");
      assert.equal(
        await T(page, "graph-run-result-block").getAttribute("data-kind"),
        "test-failed",
      );
      assert.equal(await T(page, "graph-run-inspect-failure").isVisible(), true);
      // The banner states that no approval was requested (UX-M4): a stopped run never implies one is pending.
      assert.match(
        await text(T(page, "graph-run-result-block")),
        zh ? /没有可批准或拒绝/ : /nothing to approve or reject/i,
      );
      assert.equal(await T(page, "graph-run-human").getAttribute("data-state"), "not-requested");
      // Result details stay reachable by keyboard and open without any Host call.
      const details = T(page, "graph-run-result-details");
      await details.locator(":scope > summary").focus();
      await page.keyboard.press("Enter");
      assert.equal(await details.evaluate((node) => node.open), true);
      await page.keyboard.press("Enter");
      await pick(runs[4]);
      assert.equal(await T(page, "graph-run-evidence").getAttribute("data-state"), "invalid");
      assert.equal(
        await T(page, "graph-run-result-block").getAttribute("data-kind"),
        "evidence-invalid",
      );
      assert.equal(await T(page, "graph-run-inspect-invalid").isVisible(), true);
      // Stale evidence remains a visible stop with the review action.
      await pick(runs[5]);
      assert.equal(
        await T(page, "graph-run-execution").getAttribute("data-state"),
        "StaleEvidence",
      );
      assert.equal(await T(page, "graph-run-review-gate").isVisible(), true);
      // A technical check passing is not human approval.
      await pick(runs[2]);
      assert.equal(await T(page, "graph-run-human").getAttribute("data-state"), "pending");
      assert.equal(await T(page, "graph-run-review-gate").isVisible(), true);
      // A real permission wait names its native owner; Graph never answers it.
      await pick(runs[1]);
      assert.equal(await T(page, "graph-run-permission").isVisible(), true);
      assert.equal(await T(page, "graph-run-open-native").isVisible(), true);
      await pick(runs[0]);
      assert.equal(await T(page, "graph-run-execution").getAttribute("data-state"), "Running");
      assert.equal(
        await T(page, "graph-run-permission").count(),
        0,
        "running is not a permission wait",
      );
      // Selected attempt/state is retained across tab changes.
      await T(page, "graph-run-tab-technical").click();
      await T(page, "graph-run-tab-steps").click();
      assert.equal(
        await page
          .locator('[data-testid="graph-run"][aria-current="true"]')
          .getAttribute("data-run-id"),
        runs[0].id,
      );
      await flush(page);
    }
    assert.equal(JSON.stringify(host.graph.A.runs), original, "records untouched");
    assert.equal(admissionCalls(host).length, 0);
    assertClean(host);
  },
};

const draftRetention = {
  name: "UX-P1 behaviour: New run draft and choices survive Checks and back",
  async run({ page, host, url }) {
    await preparedDraft(page, host, url);
    const before = await templateDraft(page, host);
    assert.equal(before.parameters.request, REQUEST);
    await T(page, "graph-template-setup-checks").click();
    await T(page, "graph-return-to-workflow").waitFor();
    // The return note is one line; the safety nuance appears only when a choice stops fitting.
    assert.match(
      await text(T(page, "graph-return-note")),
      /Your request, context and check choices are kept/,
    );
    await T(page, "graph-return-to-workflow").focus();
    await page.keyboard.press("Enter");
    await T(page, "graph-new-run-pane").waitFor();
    assert.equal(await T(page, "graph-template-parameter-request").inputValue(), REQUEST);
    assert.deepEqual(
      await templateDraft(page, host),
      before,
      "draft identical after the round trip",
    );
    assert.equal(admissionCalls(host).length, 0);
    // The Checks page reads inspection history (read-only); nothing forbidden or admitting happened.
    assert.deepEqual(
      host.calls.filter((call) => call.op === "FORBIDDEN"),
      [],
    );
  },
};

export const behaviorScenarios = [
  inspectionState(EN, "review-ready"),
  inspectionState(EN, "verifying-sources"),
  inspectionState(EN, "awaiting-permission"),
  inspectionState(EN, "expired"),
  inspectionState(EN, "executor-lost"),
  inspectionState(ZH, "review-ready"),
  inspectionState(ZH, "verifying-sources"),
  inspectionState(ZH, "awaiting-permission"),
  inspectionState(ZH, "expired"),
  inspectionKeyboard,
  unsupported(EN),
  unsupported(ZH),
  runStates,
  draftRetention,
];

await runUxBrowserSuite({
  suite: "Z8.5-UX-P1 operator view behaviour (synthetic, not native acceptance)",
  scenarios: behaviorScenarios,
});
