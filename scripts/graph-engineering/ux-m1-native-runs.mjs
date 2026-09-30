// UX-M1.4 journeys D/E over real runs: the real Workflows "Review and run" path (the Cloud browser
// harness stubbed that panel), keyboard navigation and focus in Electron, and Needs-you across a
// real history longer than one page. Runs are real native Graph runs on the loopback provider; a
// run is only ever stopped with the real Cancel control.
import assert from "node:assert/strict";
import { instantiateReviewer } from "./reviewer-native-ui.mjs";
import { startNativeTemplate } from "./z6-native-ui.mjs";
import {
  T,
  assertUnchanged,
  finishReceipt,
  flush,
  focused,
  invokeHandler,
  launchUx,
  observe,
  openNewRun,
  pendingPermission,
  shot,
  shotSizes,
  snapshot,
  step,
  waitRecord,
} from "./ux-m1-native-common.mjs";

/** Does the focused element look different from the same element unfocused (the Graph focus treatment)? */
const hasFocusTreatment = (window) =>
  window.evaluate(() => {
    const element = document.activeElement;
    if (!document.getElementById("no-transitions")) {
      const style = document.createElement("style");
      style.id = "no-transitions";
      style.textContent =
        "*,*::before,*::after{transition:none !important;animation:none !important}";
      document.head.append(style);
    }
    const look = () => {
      const style = getComputedStyle(element);
      return [
        style.borderTopColor,
        style.backgroundColor,
        style.textDecorationLine,
        style.outlineStyle,
      ].join("|");
    };
    const focusedLook = look();
    element.blur();
    const blurredLook = look();
    element.focus();
    return focusedLook !== blurredLook;
  });
async function pressUntilFocused(window, testId, key = "Tab", max = 80) {
  const passed = [];
  for (let index = 0; index < max; index += 1) {
    await window.keyboard.press(key);
    const now = await focused(window);
    passed.push(now);
    if (now === testId) return passed;
  }
  throw new Error(`Focus never reached ${testId} with ${key}; passed: ${passed.join(" > ")}`);
}
const waitFocused = (window, testId, what) =>
  window
    .waitForFunction((id) => document.activeElement?.getAttribute("data-testid") === id, testId, {
      timeout: 15000,
    })
    .catch(async () => {
      throw new Error(`${what}: expected focus on ${testId}, got ${await focused(window)}`);
    });

/** Review and run from the Workflows destination, then the explicit acknowledgment and Start. */
async function startFromWorkflows(window, isolation) {
  await T(window, "graph-view-design").click();
  const run = T(window, "graph-run-button");
  await run.waitFor();
  await window.waitForFunction(
    () => !document.querySelector('[data-testid="graph-run-button"]')?.disabled,
    undefined,
    { timeout: 30000 },
  );
  await run.click();
  await T(window, "graph-run-confirmation").waitFor({ timeout: 30000 });
  assert.equal(await T(window, "graph-preflight-ack").getAttribute("aria-checked"), "false");
  assert.equal(await T(window, "graph-confirm-run").isDisabled(), true);
  const before = (await snapshot(isolation)).runCount;
  await T(window, "graph-preflight-ack").click();
  await T(window, "graph-confirm-run").click();
  const { record } = await waitRecord(
    isolation,
    (item) => item.runs.length === before + 1,
    "the admitted run",
  );
  return record.runs.at(-1);
}
async function cancelCurrent(window, isolation, runId) {
  // 历史最多 25 条一页且按时间从旧到新排列：超过一页后最新的运行不在当前页，
  // 但刚开始的运行本身已被选中；此时直接确认详情属于这条运行再取消。
  const row = window.locator(`[data-testid="graph-run"][data-run-id="${runId}"]`);
  if (await row.count()) await row.click();
  await T(window, "graph-run-summary").waitFor();
  assert.equal(await T(window, "graph-run-summary").getAttribute("data-run-id"), runId);
  await T(window, "graph-cancel").click();
  await waitRecord(
    isolation,
    (item) =>
      ["Cancelled", "Interrupted"].includes(item.runs.find((run) => run.id === runId)?.status),
    `run ${runId} to stop`,
  );
}

export async function runsJourney() {
  const { isolation, window, receipt } = await launchUx("runs", { scenario: "pass" });
  const summary = { assertions: [], screenshots: [] };
  let error;
  try {
    let first;
    await step(receipt, "D0", "Real run #1 reaches a native permission wait", async () => {
      await instantiateReviewer(isolation, window, summary, false);
      first = await startNativeTemplate(isolation, window, summary);
      await waitRecord(isolation, pendingPermission, "a native permission wait");
    });

    await step(
      receipt,
      "D1",
      "Workflows → Review and run is refused while run #1 owns the workspace (real panel, real Host)",
      async () => {
        const before = await snapshot(isolation);
        await T(window, "graph-view-design").click();
        await T(window, "graph-run-button").waitFor();
        assert.equal(await T(window, "graph-run-button").isDisabled(), true);
        const reason = await T(window, "graph-run-blocked-reason")
          .innerText()
          .catch(() => "");
        observe(receipt, "Workflows Review-and-run refusal reason", reason);
        assert.ok(reason.length > 0, "a reason is shown beside the action");
        await shotSizes(isolation, window, receipt, "d-workflows-review-refused", () =>
          T(window, "graph-run-button").scrollIntoViewIfNeeded(),
        );
        // 备用控件（React 处理函数）：即使被调用也不进入准入；界面只是把用户带回 Runs 的原因说明。
        assert.equal(await invokeHandler(window, "graph-run-button"), "invoked");
        await flush(window);
        assert.equal(await T(window, "graph-run-confirmation").count(), 0);
        assertUnchanged(
          before,
          await snapshot(isolation),
          "Workflows Review and run while occupied",
        );
        await T(window, "graph-view-runs").click();
      },
    );

    await step(
      receipt,
      "E1",
      "Keyboard only in Electron: prepare → View current run → return; focus lands correctly and is visible",
      async () => {
        await openNewRun(window);
        await T(window, "graph-template-parameter-request").fill("");
        await T(window, "graph-template-parameter-request").focus();
        await window.keyboard.type("Prepare the next task");
        const forward = await pressUntilFocused(window, "graph-view-current-run");
        assert.ok(
          !forward.includes("graph-review-run") && !forward.includes("graph-library-instantiate"),
          "disabled actions are not focusable",
        );
        assert.equal(
          await hasFocusTreatment(window),
          true,
          "View current run shows the focus treatment",
        );
        await shot(isolation, window, receipt, "e-focus-view-current-run", [1280, 720]);
        await window.keyboard.press("Enter");
        await T(window, "graph-run-summary").waitFor();
        await waitFocused(window, "graph-run-summary", "after View current run");
        assert.equal(
          await hasFocusTreatment(window),
          true,
          "the run summary shows the focus treatment",
        );
        await shot(isolation, window, receipt, "e-focus-run-summary", [1280, 720]);
        await pressUntilFocused(window, "graph-new-run", "Shift+Tab");
        assert.equal(await hasFocusTreatment(window), true, "New run shows the focus treatment");
        await window.keyboard.press("Space");
        await T(window, "graph-template-parameter-request").waitFor();
        await waitFocused(window, "graph-template-parameter-request", "after New run");
        assert.equal(
          await T(window, "graph-template-parameter-request").inputValue(),
          "Prepare the next task",
        );
        await shot(isolation, window, receipt, "e-focus-request-field", [1280, 720]);
      },
    );

    await step(
      receipt,
      "E2",
      "No refresh or Host event moves focus: it stays on the request field while the Host projection changes",
      async () => {
        await T(window, "graph-template-parameter-request").focus();
        const before = await snapshot(isolation);
        // Host 事件：真实地回答第一个权限，运行继续推进，投影变化。
        const { approveNativePermissionOnce } = await import("./native-permission.mjs");
        await T(window, "graph-needs-you-conversation").click();
        await approveNativePermissionOnce(window);
        await T(window, "graph-back-to-run").click();
        await T(window, "graph-new-run").click();
        await T(window, "graph-template-parameter-request").focus();
        await waitRecord(
          isolation,
          (item) =>
            item.runs
              .at(-1)
              .toolAttempts?.some((attempt) => attempt.status === "WaitingForPermission") ||
            item.runs.at(-1).status !== "Running",
          "the run to progress",
        );
        await flush(window);
        assert.equal(
          await focused(window),
          "graph-template-parameter-request",
          "Host progress did not move focus",
        );
        assert.notEqual(
          before.recordDigest,
          (await snapshot(isolation)).recordDigest,
          "the Host projection did change",
        );
      },
    );

    await step(
      receipt,
      "D2",
      "Stop run #1 with the real Cancel control (cleanup, explicit)",
      async () => {
        await cancelCurrent(window, isolation, first.id);
      },
    );

    await step(
      receipt,
      "D3",
      "Workflows → Review and run works once released: fresh preflight, unticked acknowledgment, explicit Start",
      async () => {
        const second = await startFromWorkflows(window, isolation);
        assert.notEqual(second.id, first.id);
        assert.equal(second.provenance.operationalDecision.acknowledgedUnknowns, true);
        assert.deepEqual(second.definition.template.bindings.recipes, {
          build: "reviewer-build",
          test: "reviewer-test",
        });
        await shot(isolation, window, receipt, "d-workflows-review-started", [1280, 720]);
        await cancelCurrent(window, isolation, second.id);
      },
    );

    const ids = [];
    await step(
      receipt,
      "E3",
      "Build a real history longer than one page (25 real runs, each stopped with Cancel)",
      async () => {
        for (let count = 0; count < 23; count += 1) {
          const run = await startFromWorkflows(window, isolation);
          ids.push(run.id);
          await cancelCurrent(window, isolation, run.id);
        }
        const { record } = await waitRecord(
          isolation,
          (item) => item.runs.length === 25,
          "25 runs",
        );
        assert.ok(record.runs.every((run) => ["Cancelled", "Interrupted"].includes(run.status)));
        observe(receipt, `history length before the pending run: ${record.runs.length}`);
      },
    );

    await step(
      receipt,
      "E4",
      "Needs-you reaches a real pending run that the selected history page does not list",
      async () => {
        const pending = await startFromWorkflows(window, isolation);
        await waitRecord(isolation, pendingPermission, "the pending run's native permission");
        await T(window, "graph-view-runs").click();
        await T(window, "graph-new-run").click();
        await T(window, "graph-needs-you").waitFor();
        assert.equal(await T(window, "graph-needs-you").getAttribute("data-run-id"), pending.id);
        // UX-M2.1：历史由新到旧，待处理运行（唯一未结束的，因而最新）在第 1 页。保留原语义：
        // 用户翻到较早的一页，所示页不含待处理运行，Needs-you 仍能到达它。
        await T(window, "graph-history-next").click();
        const range = await T(window, "graph-history-range").innerText();
        observe(receipt, "history page shown (26 real runs, 25 per page)", range);
        assert.equal(
          await window.locator(`[data-testid="graph-run"][data-run-id="${pending.id}"]`).count(),
          0,
          "the pending run is not on the selected history page",
        );
        assert.match(
          await T(window, "graph-needs-you-scope").innerText(),
          /this workspace.*this Host.*not a queue across/i,
        );
        await shot(isolation, window, receipt, "e-needs-you-beyond-one-page", [1280, 720]);
        await T(window, "graph-needs-you-go").focus();
        await window.keyboard.press("Enter");
        await T(window, "graph-run-summary").waitFor();
        assert.equal(await T(window, "graph-run-summary").getAttribute("data-run-id"), pending.id);
        await waitFocused(window, "graph-run-summary", "after Go to run");
        // UX-M2.1：Go to run 是显式导航，历史翻回待处理运行所在的页。
        await window
          .locator(`[data-testid="graph-run"][data-run-id="${pending.id}"][aria-current="true"]`)
          .waitFor();
        await shot(isolation, window, receipt, "e-needs-you-go-to-run", [1280, 720]);
        // Open conversation now → Back to run，不回答权限。
        const before = await snapshot(isolation);
        await T(window, "graph-needs-you-conversation").click();
        await window
          .getByRole("option", { name: "Allow", exact: true })
          .waitFor({ timeout: 30000 });
        await T(window, "graph-back-to-run").click();
        await T(window, "graph-run-summary").waitFor();
        assert.equal(await T(window, "graph-run-summary").getAttribute("data-run-id"), pending.id);
        assertUnchanged(
          before,
          await snapshot(isolation),
          "Needs-you → conversation → Back to run",
        );
        await cancelCurrent(window, isolation, pending.id);
      },
    );
  } catch (caught) {
    error = caught;
  } finally {
    await finishReceipt(receipt, isolation, window, error);
  }
}
