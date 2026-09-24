import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { approveNativePermissionOnce } from "./native-permission.mjs";
import {
  captureFixtureDiff,
  openRunNode,
  readGraphRecord,
  selectNode,
  showVerifyToolEvidence,
  waitForRecord,
} from "./z2-native-helpers.mjs";
import { assertSourceEvidence, AFTER_SOURCE } from "./z3-fixture.mjs";
import {
  capture,
  captureGateEvidence,
  decide,
  ledger,
  modelCount,
  showGraph,
  waitGate,
  waitStatus,
} from "./z3-native-helpers.mjs";

export async function finishNativeSequence(isolation, window, summary, ids, pristineTest) {
  const permission = await waitStatus(window, isolation, "WaitingForPermission");
  assert.equal(permission.nodeAttempts[2].sessionId, undefined);
  assert.equal(await openRunNode(window, ids.tasks[1]), permission.nodeAttempts[1].sessionId);
  await window.getByTestId("graph-input-owned").waitFor();
  await capture(isolation, window, summary, "z3-native-edit-permission");
  await approveNativePermissionOnce(window);
  await showGraph(window);
  const ready = (
    await waitForRecord(isolation, (record) => {
      const run = record.runs.at(-1);
      return (
        run.status === "WaitingForApproval" || run.nodeAttempts[2].status === "WaitingForPermission"
      );
    })
  ).runs.at(-1);
  if (ready.status === "WaitingForPermission") {
    assert.equal(await openRunNode(window, ids.tasks[2]), ready.nodeAttempts[2].sessionId);
    await approveNativePermissionOnce(window);
    await showGraph(window);
  }
  const final = await waitGate(window, isolation, ids.gates[2]);
  assert.equal(
    final.run.nodeAttempts.every((attempt) => attempt.status === "Completed"),
    true,
  );
  assert.equal(final.run.status, "WaitingForApproval");
  assert.equal(final.gate.decision, undefined);
  assertSourceEvidence(
    final.gate.request.evidence.find((evidence) => evidence.alias === "source"),
    { afterEdit: true, head: summary.sourceFixture.head },
  );
  const verification = final.gate.request.evidence.find(
    (evidence) => evidence.alias === "verification",
  );
  assert.equal(verification.text, isolation.fixture.outputs.verify);
  assert.equal(verification.sourceSessionId, final.run.nodeAttempts[2].sessionId);
  assert.equal(verification.sourceInputId, final.run.nodeAttempts[2].inputId);
  await capture(isolation, window, summary, "z3-final-source-review");
  await captureGateEvidence(isolation, window, summary, "verification", "fixture.mjs");
  const inputs = await ledger(isolation);
  assert.equal(inputs.length, 3);
  assert.equal(new Set(inputs.map((row) => row.session_id)).size, 3);
  for (const [index, node] of final.run.nodeAttempts.entries()) {
    const input = inputs.find((row) => row.session_id === node.sessionId);
    // 原生队列行标识与 Graph 输入命令标识不同，按已持久化 intent 分别核对，不能混为同一字段。
    assert.equal(input.id, input.payload.intent.queueItemId);
    assert.equal(node.inputId, input.payload.intent.sourceCommandId);
    assert.equal(input.payload.intent.sourceCommandId, node.commandId);
    assert.equal(input.payload.text, node.resolvedInstructions);
    assert.equal(node.terminalProof.state, "completedSuccess");
    if (index > 0) assert.ok(input.time_created >= final.run.nodeAttempts[index - 1].updatedAt);
  }
  assert.equal(await isolation.readFixture(), AFTER_SOURCE);
  assert.equal(
    await readFile(path.join(isolation.workspace, "fixture.test.mjs"), "utf8"),
    pristineTest,
  );
  summary.testOutput = (
    await promisify(execFile)(process.execPath, ["--test", "fixture.test.mjs"], {
      cwd: isolation.workspace,
      env: isolation.env,
    })
  ).stdout;
  summary.fixtureDiff = await captureFixtureDiff(isolation);
  summary.finalApprovalRequest = final.gate.request;
  await decide(
    window,
    "approve",
    "Actual source diff and native/independent test reviewed. No Git publication is authorized.",
  );
  const completed = await waitStatus(window, isolation, "Completed");
  assert.equal(completed.approvalAttempts.length, 3);
  assert.equal(
    completed.approvalAttempts.every((gate) => gate.status === "Approved"),
    true,
  );
  assert.equal(completed.result.text, isolation.fixture.outputs.verify);
  assert.deepEqual(await ledger(isolation), inputs);
  for (const node of completed.nodeAttempts) {
    assert.equal(await openRunNode(window, node.nodeId), node.sessionId);
    assert.equal(await window.getByTestId("graph-input-owned").count(), 0);
    if (node.nodeId === ids.tasks[2]) {
      await showVerifyToolEvidence(window);
      await capture(isolation, window, summary, "z3-native-verify-test-result");
    }
    await showGraph(window);
  }
  assert.deepEqual(await ledger(isolation), inputs);
  await selectNode(window, ids.gates[2]);
  await capture(isolation, window, summary, "z3-final-approved");
  summary.assertions.push(
    "Three distinct real native tasks execute Read/Read, Read/Edit, Read/Bash with explicit native permissions, exact fresh text handoffs and three owned inputs; source diff and unchanged independent test pass. Final approval is separately required and adds zero native work.",
  );
  summary.assertions.push(
    "Every Open conversation resolves to its exact stored existing native SessionPane; navigation creates no input, and completed approval history retains exact source evidence and local decision attribution.",
  );
  await isolation.stopApp();
  const requests = modelCount(isolation);
  window = await isolation.launch();
  await showGraph(window);
  await waitStatus(window, isolation, "Completed");
  assert.deepEqual((await readGraphRecord(isolation)).runs.at(-1), completed);
  assert.deepEqual(await ledger(isolation), inputs);
  assert.equal(modelCount(isolation), requests);
  summary.completedRun = completed;
  summary.assertions.push(
    "Completed app restart preserves frozen requests, decisions, native identities and source snapshots with zero new model/input activity.",
  );
  await capture(isolation, window, summary, "z3-completed-reopened");
  return window;
}
