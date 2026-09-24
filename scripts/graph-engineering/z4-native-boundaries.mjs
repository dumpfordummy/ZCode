import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { createIsolation, root } from "./isolation.mjs";
import { prepareCSharpFixture } from "./z4-fixture.mjs";
import { startZ4Fixture } from "./z4-provider-fixture.mjs";
import { createNativeToolGraph } from "./z4-native-editor.mjs";
import { approveNativePermissionOnce } from "./native-permission.mjs";
import {
  allowTool,
  capture,
  finishEvidence,
  ledger,
  modelCount,
  openToolPermission,
  readGraphRecord,
  selectNode,
  showGraph,
  waitReadyReceipt,
  waitStatus,
  waitTool,
} from "./z4-native-helpers.mjs";

const scenario = process.argv.find((arg) => arg.startsWith("--scenario="))?.slice(11) ?? "crash";
assert.ok(["crash", "lost-ack"].includes(scenario));
const isolation = await createIsolation({ noProvider: true, fixtureFactory: startZ4Fixture });
const summary = {
  scenario,
  home: isolation.home,
  workspace: isolation.workspace,
  assertions: [],
  screenshots: [],
};
let window, failure;
try {
  summary.fixture = await prepareCSharpFixture(isolation);
  if (scenario === "lost-ack") isolation.env.Z4_GRAPH_BOUNDARY_PROFILE = isolation.home;
  window = await isolation.launch({
    bootstrapEntry:
      scenario === "lost-ack"
        ? path.join(root, "scripts/graph-engineering/z4-boundary-bootstrap.cjs")
        : undefined,
  });
  const ids = await createNativeToolGraph(window, isolation, summary, scenario);
  summary.ids = ids;
  assert.equal(
    await window.getByTestId("graph-run-button").isEnabled(),
    true,
    "The Tool-only graph must be ready before starting the boundary check.",
  );
  await window.getByTestId("graph-run-button").click();
  await showGraph(window);
  await openToolPermission(isolation, window, summary, ids.build, "build");
  await allowTool(window);
  await waitTool(isolation, ids.build, (attempt) => attempt.status === "Completed");
  if (scenario === "lost-ack") {
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      try {
        summary.checkpoint = JSON.parse(
          await readFile(path.join(isolation.home, "z4-boundary-checkpoint.json"), "utf8"),
        );
        break;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      await wait(25);
    }
    assert.ok(summary.checkpoint);
    const attempt = summary.checkpoint.persisted.runs.at(-1).toolAttempts[1];
    // accepted 写入被暂停时 Graph 快照尚未发布，且无输入会话被普通搜索过滤；调用已挂载面板的原有导航回调，不造记录。
    await window.getByTestId("graph-engineering-panel").evaluate(
      (element, target) => {
        const key = Object.keys(element).find((name) => name.startsWith("__reactFiber$"));
        for (let fiber = element[key]; fiber; fiber = fiber.return) {
          const navigate = fiber.memoizedProps?.onOpenConversation;
          if (typeof navigate === "function") {
            navigate(target.workspacePath, target.sessionId, target.workspaceIdentity);
            return;
          }
        }
        throw new Error(
          "Mounted Graph panel existing conversation navigation callback unavailable.",
        );
      },
      { ...summary.checkpoint.persisted.runs.at(-1).target, sessionId: attempt.sessionId },
    );
    await window
      .locator(`[data-testid^="v4-session-pane"][data-session-id="${attempt.sessionId}"]:visible`)
      .waitFor();
    summary.sessionNavigation =
      "Harness invokes the mounted Graph panel's existing onOpenConversation callback (WorkspaceShellLayout.handleSelectTaskInChat) with the persisted session target while the accepted metadata write is held. Exact native pane session ID asserted; permission-only sessions are excluded from ordinary Search. No session creation or runtime/database state mutation.";
    await window.getByRole("option", { name: "Allow", exact: true }).waitFor({ timeout: 30000 });
    await capture(isolation, window, summary, "z4-unpersisted-ack-native-permission");
    await approveNativePermissionOnce(window);
  } else {
    await openToolPermission(isolation, window, summary, ids.test, "test");
    await allowTool(window);
    await waitTool(isolation, ids.test, (attempt) => attempt.operation?.processStarted);
  }
  summary.processReadiness = await waitReadyReceipt(isolation);
  const before = (await readGraphRecord(isolation)).runs.at(-1);
  const owned = before.toolAttempts[1];
  assert.equal(summary.processReadiness.operationId, owned.operationId);
  assert.equal(summary.processReadiness.state, "actual-process-started");
  assert.equal(owned.dispatchPhase, scenario === "lost-ack" ? "sending" : "accepted");
  assert.equal((await ledger(isolation)).length, 0);
  assert.equal(modelCount(isolation), 0);
  summary.beforeRestart = before;
  await isolation.stopApp();
  delete isolation.env.Z4_GRAPH_BOUNDARY_PROFILE;
  window = await isolation.launch();
  await showGraph(window);
  const after = await waitStatus(window, isolation, "Interrupted");
  await selectNode(window, ids.test);
  assert.equal(after.id, before.id);
  assert.equal(after.toolAttempts[1].operationId, owned.operationId);
  assert.equal(after.toolAttempts[1].sessionId, owned.sessionId);
  assert.equal(after.toolAttempts[1].dispatchPhase, owned.dispatchPhase);
  assert.notEqual(after.toolAttempts[1].verification?.acceptancePassed, true);
  assert.equal((await ledger(isolation)).length, 0);
  assert.equal(modelCount(isolation), 0);
  assert.deepEqual(await waitReadyReceipt(isolation), summary.processReadiness);
  assert.deepEqual(after.artifacts, before.artifacts);
  await capture(isolation, window, summary, "z4-uncertain-operation-reopened");
  summary.assertions.push(
    "The actual C# process produced its original operation/PID readiness receipt before owned app shutdown. Reopening preserves exact operation/session identity and uncertain interrupted outcome, retains prior artifacts, and performs no model admission or automatic recipe restart.",
  );
  if (scenario === "lost-ack")
    summary.assertions.push(
      "A profile-contained test hook paused the exact accepted metadata write after the native operation existed. The persisted sending intent, actual native permission and actual C# process are independently captured; no runtime database or native result was fabricated.",
    );
} catch (error) {
  failure = error;
}
await finishEvidence(isolation, summary, window, failure);
