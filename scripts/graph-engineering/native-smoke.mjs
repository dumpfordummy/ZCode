import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { createIsolation, instruction } from "./isolation.mjs";
import {
  COMPANION_COMPLETION,
  COMPANION_INSTRUCTION,
  COMPANION_QUESTION_OPTION,
  COMPANION_TOOL_ID,
} from "./provider-fixture.mjs";

const mode = process.argv.includes("--chat")
  ? "chat"
  : process.argv.includes("--no-provider")
    ? "no-provider"
    : "graph";
const isolation = await createIsolation({ noProvider: mode === "no-provider" });
const cancel = process.argv.includes("--cancel");
const question = process.argv.includes("--question");
const restartInterrupted = process.argv.includes("--restart-interrupted");
const taskInstruction = question
  ? `${instruction} Z1_QUESTION_TASK: Ask whether to continue before reading the file.`
  : instruction;
const summary = {
  mode,
  scenario: cancel
    ? "cancel"
    : restartInterrupted
      ? "restart-interrupted"
      : question
        ? "question"
        : "complete",
  home: isolation.home,
  workspace: isolation.workspace,
  assertions: [],
  screenshots: [],
};
let window;
const waitForSaved = () =>
  window.waitForFunction(() => {
    const name = document.querySelector('[data-testid="graph-name"]');
    const save = document.querySelector('[data-testid="graph-save"]');
    return (
      name &&
      !name.disabled &&
      save?.disabled &&
      [...document.querySelectorAll('[role="status"]')].some((node) => node.textContent === "Saved")
    );
  });
const capture = async (name) => {
  await window.evaluate(() => document.fonts.ready);
  const file = path.join(isolation.home, `${name}.png`);
  await window.screenshot({ path: file, fullPage: false });
  summary.screenshots.push(file);
};
try {
  window = await isolation.launch();
  if (isolation.graphProfile) {
    summary.packagedIdentity = await isolation.app.evaluate(({ app }) => ({
      name: app.getName(),
      isPackaged: app.isPackaged,
      version: app.getVersion(),
      userData: app.getPath("userData"),
      home: app.getPath("home"),
    }));
    assert.equal(summary.packagedIdentity.name, "ZCode Graph");
    assert.equal(summary.packagedIdentity.isPackaged, true);
    assert.equal(
      summary.packagedIdentity.userData,
      isolation.graphProfile.env.ZCODE_DESKTOP_USER_DATA_DIR,
    );
    assert.equal(summary.packagedIdentity.home, isolation.graphProfile.env.HOME);
    summary.assertions.push(
      "Uninstrumented packaged ZCode Graph uses its own home and Electron profile",
    );
  }
  if (cancel && mode === "graph") {
    await window.getByTestId("v4-composer-input").fill(COMPANION_INSTRUCTION);
    await window.getByTestId("v4-composer-send").click();
    await window
      .getByRole("option", { name: new RegExp(COMPANION_QUESTION_OPTION) })
      .waitFor({ timeout: 45000 });
    summary.companionSessionId = await window
      .locator('[data-testid^="v4-session-pane"]:visible')
      .first()
      .getAttribute("data-session-id");
    assert.ok(summary.companionSessionId, "ordinary companion must have a real native session ID");
    assert.equal(
      isolation.fixture.toolResults.some((result) => result.id === COMPANION_TOOL_ID),
      false,
    );
    summary.assertions.push(
      "An independent ordinary native chat is waiting on its own AskUserQuestion before Graph cancellation",
    );
    await capture("companion-waiting-before-cancel");
  }
  if (mode === "chat") {
    await window.getByTestId("v4-composer-input").fill(instruction);
    await window.getByTestId("v4-composer-send").click();
  } else {
    summary.stage = "edit definition";
    await window.getByTestId("graph-engineering-open").click();
    await window.getByTestId("graph-name").fill("Z1 synthetic verification");
    await window.getByTestId("graph-instructions").fill(taskInstruction);
    summary.stage = "save definition";
    await window.getByTestId("graph-save").click();
    // 原因：Save 在 pending 时也 disabled；仅等待 disabled 会在 Host ACK 前向禁用画布发键。
    // 依据 UI 状态等待 Saved 和输入重新启用，再等待节点选中；不靠固定延时掩盖竞态。
    await waitForSaved();
    const task = window.locator('.react-flow__node[data-id="task"]');
    const before = await task.getAttribute("style");
    summary.stage = "select and move node";
    await task.focus();
    await task.press("Enter");
    await window.waitForFunction(() =>
      document.querySelector('.react-flow__node[data-id="task"]')?.classList.contains("selected"),
    );
    await task.press("ArrowDown");
    summary.stage = "save layout";
    await window.getByTestId("graph-save").click();
    await waitForSaved();
    await window.getByRole("button", { name: "Back to chat", exact: true }).click();
    await window.getByTestId("graph-engineering-open").click();
    assert.equal(await window.getByTestId("graph-name").inputValue(), "Z1 synthetic verification");
    assert.equal(await window.getByTestId("graph-instructions").inputValue(), taskInstruction);
    assert.notEqual(await task.getAttribute("style"), before);
    summary.assertions.push(
      "Native tab, instructions/name and keyboard layout persist after navigation",
    );
    summary.stage = "native scenario";
    await capture("graph-saved");
    if (mode === "no-provider") {
      assert.equal(await window.getByTestId("graph-run-button").isDisabled(), true);
      assert.equal(isolation.fixture.requests.filter((req) => req.model).length, 0);
      summary.assertions.push("No provider: run unavailable without probing a model");
    } else {
      const effectiveModel = window.getByTestId("graph-effective-model");
      await effectiveModel.waitFor();
      assert.equal(await effectiveModel.getAttribute("data-provider"), "z1-local-fixture");
      assert.equal(await effectiveModel.getAttribute("data-model"), "z1-fixture");
      summary.assertions.push(
        "Before Run, Graph displays the effective native fixture provider and model",
      );
      await window.getByTestId("graph-run-button").click();
      const run = window.getByTestId("graph-run").first();
      await run.waitFor({ timeout: 30000 });
      summary.sessionId = await run.getAttribute("data-session-id");
      summary.inputId = await run.getAttribute("data-input-id");
      if (cancel) assert.notEqual(summary.sessionId, summary.companionSessionId);
      await window
        .getByText(question ? "Waiting for your response" : "Waiting for permission", {
          exact: true,
        })
        .waitFor({ timeout: 45000 });
      assert.match(await isolation.readFixture(), /Z1_BEFORE_7391/);
      await run.scrollIntoViewIfNeeded();
      await capture("graph-waiting-permission");
      if (restartInterrupted) {
        const modelRequests = isolation.fixture.requests.filter((req) => req.model).length;
        await isolation.stopApp();
        window = await isolation.launch();
        if (!(await window.getByTestId("graph-engineering-panel").isVisible()))
          await window.getByTestId("graph-engineering-open").click();
        await window
          .getByText("Interrupted — outcome unconfirmed", { exact: true })
          .waitFor({ timeout: 20000 });
        assert.equal(isolation.fixture.requests.filter((req) => req.model).length, modelRequests);
        assert.match(await isolation.readFixture(), /Z1_BEFORE_7391/);
        assert.equal(await window.getByTestId("graph-run-button").isDisabled(), true);
        summary.assertions.push(
          "Pending native execution becomes Interrupted after restart, no resubmission/file edit and Run remains blocked",
        );
        await window.getByTestId("graph-run").first().scrollIntoViewIfNeeded();
        await capture("graph-interrupted");
      }
      if (cancel) {
        await run.getByRole("button", { name: "Cancel attempt", exact: true }).click();
        await window.getByText("Cancelled", { exact: true }).waitFor({ timeout: 20000 });
        assert.match(await isolation.readFixture(), /Z1_BEFORE_7391/);
        summary.assertions.push(
          "Exact graph attempt cancelled through native stop while permission pending; file unchanged",
        );
        await capture("graph-cancelled");
      }
      await window.getByTestId("graph-open-conversation").first().click();
      if (!cancel) await window.getByTestId("graph-input-owned").waitFor();
      assert.equal(
        await window
          .locator('[data-testid^="v4-session-pane"]:visible')
          .first()
          .getAttribute("data-session-id"),
        summary.sessionId,
      );
      summary.assertions.push(
        cancel
          ? "Open conversation selects the cancelled attempt's exact native session"
          : question
            ? "Graph waits for a native question; file unchanged; same conversation owns composer"
            : restartInterrupted
              ? "Open conversation selects the interrupted attempt's exact native session and retains ownership"
              : "Graph waits for native Edit permission; file unchanged; same conversation owns composer",
      );
      if (question) {
        await window.getByRole("option", { name: /Continue fixture/ }).waitFor();
        assert.equal(await window.locator("[data-elicitation-countdown-seconds]").count(), 0);
        await capture("graph-native-question");
        await window.getByRole("option", { name: /Continue fixture/ }).press("Enter");
        summary.assertions.push(
          "Real native AskUserQuestion waits with no countdown; explicit correlated UI answer resumes input",
        );
      }
      if (cancel) {
        // Shared TID_TASK_ITEM/testId and native task-index mapping use task-item-<sessionId>.
        await window.getByTestId(`task-item-${summary.companionSessionId}`).click();
        await window
          .locator(
            `[data-testid^="v4-session-pane"][data-session-id="${summary.companionSessionId}"]:visible`,
          )
          .waitFor();
        assert.equal(
          await window
            .locator('[data-testid^="v4-session-pane"]:visible')
            .first()
            .getAttribute("data-session-id"),
          summary.companionSessionId,
        );
        const companionAnswer = window.getByRole("option", {
          name: new RegExp(COMPANION_QUESTION_OPTION),
        });
        await companionAnswer.waitFor({ timeout: 20000 });
        assert.equal(
          isolation.fixture.toolResults.some((result) => result.id === COMPANION_TOOL_ID),
          false,
        );
        assert.equal(await window.getByTestId("graph-input-owned").count(), 0);
        assert.match(await isolation.readFixture(), /Z1_BEFORE_7391/);
        await capture("companion-still-waiting-after-cancel");
        await companionAnswer.press("Enter");
        await window.getByText(COMPANION_COMPLETION, { exact: false }).waitFor({ timeout: 45000 });
        summary.companionToolResult = isolation.fixture.toolResults.find(
          (result) => result.id === COMPANION_TOOL_ID,
        );
        assert.ok(
          summary.companionToolResult,
          "native companion question must receive a correlated tool result",
        );
        assert.equal(await companionAnswer.count(), 0);
        assert.match(await isolation.readFixture(), /Z1_BEFORE_7391/);
        summary.runtimeOwnershipEvidence = {
          kind: "source plus session continuity",
          source:
            "packages/services/src/zcode-agent/zcodeAgentProcessManager.ts: workspace-scoped primary runtime; Graph uses the same existing agent/session services",
          limitation:
            "The native UI does not expose the Agent process identity; exact PID continuity is not asserted.",
        };
        summary.assertions.push(
          "Cancelling Graph leaves the distinct ordinary native session waiting; its original question accepts one explicit answer and completes without file changes",
        );
        await capture("companion-completed-after-cancel");
        await window.getByTestId("graph-engineering-open").click();
        await window.getByText("Cancelled", { exact: true }).waitFor();
        assert.equal(
          await window.getByTestId("graph-run").first().getAttribute("data-session-id"),
          summary.sessionId,
        );
        summary.assertions.push(
          "Completing the unrelated native chat leaves the original graph attempt Cancelled",
        );
      }
    }
  }
  if (mode !== "no-provider" && !cancel && !restartInterrupted) {
    await window.getByRole("option", { name: "Allow", exact: true }).waitFor({ timeout: 45000 });
    await capture(`${mode}-native-permission`);
    // 明确批准此合成 Edit 一次；不授予项目/会话全权，不修改权限模式。
    await window.getByRole("option", { name: "Allow", exact: true }).press("Enter");
    await window
      .getByText("node --test fixture.test.mjs", { exact: true })
      .first()
      .waitFor({ timeout: 30000 });
    // Bash may be classified safe by native policy or request its own one-time approval.
    await window.waitForFunction(
      () =>
        document.body.innerText.includes("Controlled provider finished") ||
        document.querySelector('[data-permission-option-kind="allowOnce"]'),
      null,
      { timeout: 30000 },
    );
    const allow = window.getByRole("option", { name: "Allow", exact: true });
    if (await allow.isVisible()) await allow.press("Enter");
    await window
      .getByText("Controlled provider finished the native Read, Edit, and Bash sequence.", {
        exact: false,
      })
      .waitFor({ timeout: 45000 });
    assert.match(await isolation.readFixture(), /Z1_AFTER_7391/);
    const test = await promisify(execFile)(process.execPath, ["--test", "fixture.test.mjs"], {
      cwd: isolation.workspace,
      env: isolation.env,
    });
    summary.testOutput = test.stdout;
    summary.nativeToolResults = isolation.fixture.toolResults;
    assert.equal(summary.nativeToolResults.length, question ? 4 : 3);
    summary.assertions.push(
      "Real CLI Read/Edit/Bash events, changed synthetic file and independent node:test pass",
    );
    await capture(`${mode}-native-result`);
    if (mode === "graph") {
      await window.getByTestId("graph-engineering-open").click();
      await window.getByText("Input completed", { exact: true }).waitFor({ timeout: 20000 });
      assert.equal(await window.getByTestId("graph-run").count(), 1);
      const run = window.getByTestId("graph-run").first();
      assert.equal(await run.getAttribute("data-session-id"), summary.sessionId);
      assert.equal(await run.getAttribute("data-input-id"), summary.inputId);
      await run.scrollIntoViewIfNeeded();
      await capture("graph-completed");
      const modelRequests = isolation.fixture.requests.filter((req) => req.model).length;
      await isolation.stopApp();
      window = await isolation.launch();
      if (!(await window.getByTestId("graph-engineering-panel").isVisible()))
        await window.getByTestId("graph-engineering-open").click();
      await window.getByText("Input completed", { exact: true }).waitFor({ timeout: 20000 });
      assert.equal(await window.getByTestId("graph-run").count(), 1);
      assert.equal(
        await window.getByTestId("graph-run").first().getAttribute("data-session-id"),
        summary.sessionId,
      );
      assert.equal(isolation.fixture.requests.filter((req) => req.model).length, modelRequests);
      summary.assertions.push(
        "Completed result persists across app restart with same IDs and no new model request",
      );
      await window.getByTestId("graph-run").first().scrollIntoViewIfNeeded();
      await capture("graph-reopened");
    }
  }
  summary.status = "PASS";
} catch (error) {
  summary.status = "FAIL";
  summary.error = error instanceof Error ? error.stack : String(error);
  if (window) {
    summary.body = await window
      .locator("body")
      .innerText()
      .catch(() => "Unavailable");
    await capture("failure").catch(() => {});
  }
  process.exitCode = 1;
} finally {
  await writeFile(path.join(isolation.home, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  await isolation.close();
}
