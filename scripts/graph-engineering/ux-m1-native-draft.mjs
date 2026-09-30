// UX-M1.4 journey B (draft while running) and the Back-to-run part of D, over the real native session
// owner. The first run is a real generic v2 run; the second request is only ever a draft until the
// user explicitly reviews and starts it.
import assert from "node:assert/strict";
import { instantiateReviewer } from "./reviewer-native-ui.mjs";
import { startNativeTemplate } from "./z6-native-ui.mjs";
import { approveNativePermissionOnce } from "./native-permission.mjs";
import { addByKeyboard } from "./context-picker-helpers.mjs";
import { resolveAndReview } from "./ux-m1-native-draft-resolve.mjs";
import {
  SECOND_REQUEST,
  T,
  assertUnchanged,
  chipValue,
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

const chooseRecipes = async (window) => {
  for (const [testId, value] of [
    ["graph-template-recipe-build", "alt-build"],
    ["graph-template-recipe-test", "alt-test"],
  ]) {
    await T(window, testId).click();
    await window.locator(`[role="option"][data-value="${value}"]`).click();
    await flush(window);
  }
};

/** Everything that must hold while the first run occupies the workspace. */
async function assertDraftRefused(window, isolation, before, receipt, label, expectedRequest) {
  const blocked = T(window, "graph-new-run-blocked");
  await blocked.waitFor();
  assert.equal(await blocked.getAttribute("data-blocked-by"), "run-active", `${label}: reason`);
  await T(window, "graph-view-current-run").waitFor();
  assert.equal(await T(window, "graph-review-run").isDisabled(), true, `${label}: Review refused`);
  assert.equal(
    await T(window, "graph-library-instantiate").isDisabled(),
    true,
    `${label}: Save as workflow only refused`,
  );
  // 旁路：直接调用 React 处理函数（任何备用控件都会走这条路），以及键盘。
  for (const id of ["graph-review-run", "graph-library-instantiate"])
    assert.equal(await invokeHandler(window, id), "invoked", `${label}: ${id} handler reached`);
  await T(window, "graph-template-parameter-request").focus();
  for (const key of ["Enter", "Control+Enter", "Alt+Enter"]) await window.keyboard.press(key);
  await flush(window);
  // 文本框里的 Enter 只是换行（不会审阅或开始）；把草稿恢复成用户输入的原文再继续。
  await T(window, "graph-template-parameter-request").fill(expectedRequest);
  assert.equal(await T(window, "graph-run-confirmation").count(), 0, `${label}: no review opened`);
  assertUnchanged(before, await snapshot(isolation), label);
  observe(
    receipt,
    `${label}: Review/Save/Start refused; no second run, definition change or input`,
  );
}

export async function draftWhileRunning() {
  const { isolation, window, receipt } = await launchUx("draft-while-running", {
    scenario: "pass",
  });
  const summary = { assertions: [], screenshots: [] };
  let error;
  try {
    let firstRunId, notesPath;
    await step(
      receipt,
      "B0",
      "Start the first real run through the maintained UI path",
      async () => {
        await instantiateReviewer(isolation, window, summary, false);
        const run = await startNativeTemplate(isolation, window, summary);
        firstRunId = run.id;
      },
    );
    let permission;
    await step(receipt, "B1", "The run reaches a real native permission wait", async () => {
      const { record } = await waitRecord(
        isolation,
        pendingPermission,
        "the first native permission",
      );
      permission = pendingPermission(record);
      assert.equal(permission.status, "WaitingForPermission");
      observe(receipt, `first wait: ${permission.nodeId} (${permission.attemptId})`);
    });
    const before = await snapshot(isolation);
    const draftState = {};
    await step(
      receipt,
      "B2",
      "Prepare a different request, context and checks while the permission is pending",
      async () => {
        await openNewRun(window);
        const request = T(window, "graph-template-parameter-request");
        assert.equal(await request.isDisabled(), false, "the form stays editable");
        await request.fill(SECOND_REQUEST);
        // 替换 instructions（先移除旧的，再用键盘选择器加入不同文件），并再选一个真实技能。
        await T(window, "graph-context-remove-instructions").click();
        await addByKeyboard(window, "Notes", "instructions");
        const value = await chipValue(window, "instructions");
        notesPath = value;
        assert.match(value, /^docs[\\/]Notes\.md$/);
        await chooseRecipes(window);
        await flush(window);
        draftState.request = await request.inputValue();
        draftState.instructions = value;
        draftState.build = await T(window, "graph-selected-checks-build").innerText();
        draftState.test = await T(window, "graph-selected-checks-test").innerText();
        assert.match(draftState.build, /Alternate build/);
        assert.match(draftState.test, /Alternate test/);
        assert.equal(draftState.request, SECOND_REQUEST);
        await assertDraftRefused(
          window,
          isolation,
          before,
          receipt,
          "first permission wait",
          SECOND_REQUEST,
        );
        await shotSizes(isolation, window, receipt, "b-draft-while-permission", () =>
          T(window, "graph-new-run-blocked").scrollIntoViewIfNeeded(),
        );
      },
    );
    await step(
      receipt,
      "B3",
      "Back to run from the native conversation returns to the same run and step, unanswered",
      async () => {
        // Needs-you 是用户实际会走的路径：直达该步骤的原生会话。
        await T(window, "graph-needs-you-conversation").click();
        await window
          .locator(
            `[data-testid^="v4-session-pane"][data-session-id="${permission.sessionId}"]:visible`,
          )
          .waitFor();
        const inConversation = await snapshot(isolation);
        assertUnchanged(before, inConversation, "opening the native conversation");
        await window
          .getByRole("option", { name: "Allow", exact: true })
          .waitFor({ timeout: 30000 });
        await shot(isolation, window, receipt, "b-conversation-permission-pending", [1280, 720]);
        const back = T(window, "graph-back-to-run");
        await back.waitFor();
        assert.equal(await back.getAttribute("data-run-id"), firstRunId);
        assert.equal(await back.getAttribute("data-node-id"), permission.nodeId);
        assert.equal(await back.getAttribute("data-attempt-id"), permission.attemptId);
        await back.click();
        await T(window, "graph-run-summary").first().waitFor();
        const row = T(window, "graph-run").first();
        assert.equal(await row.getAttribute("data-run-id"), firstRunId);
        assert.equal(await row.getAttribute("aria-current"), "true");
        // 没有回答权限：Host 记录与原生输入没有变化，权限仍在等待。
        const afterBack = await snapshot(isolation);
        assertUnchanged(before, afterBack, "Back to run");
        assert.equal(pendingPermission(afterBack.record)?.attemptId, permission.attemptId);
        observe(
          receipt,
          "Back to run: same run/node/attempt, permission still pending, nothing answered",
        );
        await shot(isolation, window, receipt, "b-back-to-run", [1280, 720]);
      },
    );
    await step(receipt, "B4", "The draft is exactly restored after visiting the run", async () => {
      await T(window, "graph-new-run").click();
      await T(window, "graph-template-parameter-request").waitFor();
      assert.equal(
        await T(window, "graph-template-parameter-request").inputValue(),
        SECOND_REQUEST,
      );
      assert.equal(await chipValue(window, "instructions"), draftState.instructions);
      assert.equal(await T(window, "graph-selected-checks-build").innerText(), draftState.build);
      assert.equal(await T(window, "graph-selected-checks-test").innerText(), draftState.test);
      assert.equal(await focused(window), "graph-template-parameter-request");
    });
    // 逐个真实权限：先回答（合成测试场景，明确验证决定被原生 owner 接受），草稿保持。
    let approvalRun;
    await step(
      receipt,
      "B5",
      "Answer each real native permission; the draft survives every wait",
      async () => {
        const handled = new Set();
        for (;;) {
          const { record, value } = await waitRecord(
            isolation,
            (item) => {
              const run = item.runs.at(-1);
              const pending = pendingPermission(item);
              if (pending && !handled.has(pending.attemptId)) return { pending };
              if (run.status === "WaitingForApproval") return { approval: run };
              return undefined;
            },
            "the next permission or the final approval",
          );
          if (value.approval) {
            approvalRun = value.approval;
            break;
          }
          const pending = value.pending;
          if (pending.attemptId !== permission.attemptId) {
            const snap = await snapshot(isolation);
            await openNewRun(window);
            assert.equal(
              await T(window, "graph-template-parameter-request").inputValue(),
              SECOND_REQUEST,
            );
            await assertDraftRefused(
              window,
              isolation,
              snap,
              receipt,
              `permission wait ${pending.nodeId}`,
              SECOND_REQUEST,
            );
          }
          await T(window, "graph-needs-you-conversation").click();
          await window
            .locator(
              `[data-testid^="v4-session-pane"][data-session-id="${pending.sessionId}"]:visible`,
            )
            .waitFor();
          await approveNativePermissionOnce(window);
          handled.add(pending.attemptId);
          await T(window, "graph-back-to-run").click();
          await T(window, "graph-run-summary").first().waitFor();
          void record;
        }
        observe(
          receipt,
          `permissions answered: ${[...new Set([permission.nodeId])].join(",")} + later waits`,
        );
      },
    );
    await step(
      receipt,
      "B6",
      "At the real final-approval wait the draft is still editable and admission is still refused",
      async () => {
        const snap = await snapshot(isolation);
        await openNewRun(window);
        assert.equal(
          await T(window, "graph-template-parameter-request").inputValue(),
          SECOND_REQUEST,
        );
        assert.equal(await T(window, "graph-template-parameter-request").isDisabled(), false);
        const edited = `${SECOND_REQUEST} (edited during approval)`;
        await T(window, "graph-template-parameter-request").fill(edited);
        await assertDraftRefused(window, isolation, snap, receipt, "final approval wait", edited);
        await shotSizes(isolation, window, receipt, "b-draft-while-approval", () =>
          T(window, "graph-new-run-blocked").scrollIntoViewIfNeeded(),
        );
        assert.equal(approvalRun.status, "WaitingForApproval");
      },
    );
    await resolveAndReview({ isolation, window, receipt }, { firstRunId, notesPath });
    receipt.state = { firstRunId, notesPath, draftState, permissionNode: permission.nodeId };
    receipt.approvalRunId = approvalRun.id;
  } catch (caught) {
    error = caught;
  } finally {
    await finishReceipt(receipt, isolation, window, error);
  }
}
