import assert from "node:assert/strict";
import test from "node:test";
import type { GraphRun } from "@zcode/services";
import { graphNeedsYou } from "../src/graph-engineering/graphNeedsYouQueue.js";
import { graphRunAgainDraft } from "../src/graph-engineering/graphRunAgain.js";
import { summaryRun } from "./graphRunSummary.fixture.js";

function waitingRun(id: string, status: "WaitingForPermission" | "WaitingForUser"): GraphRun {
  const run = summaryRun();
  run.id = id;
  run.status = status;
  run.nodeAttempts[0]!.status = status;
  run.nodeAttempts[0]!.iterationId = run.routing!.currentIterationId;
  run.approvalAttempts = [];
  run.routing!.cursorNodeId = "task";
  return run;
}

test("permission and question waits are surfaced with their exact step and session", () => {
  const items = graphNeedsYou([
    waitingRun("a", "WaitingForPermission"),
    waitingRun("b", "WaitingForUser"),
  ]);
  assert.deepEqual(
    items.map((item) => [item.runId, item.kind, item.nodeId, item.sessionId]),
    [
      ["a", "permission", "task", "session-task"],
      ["b", "question", "task", "session-task"],
    ],
  );
});

test("a decidable gate is surfaced and an already decided or settled run is not", () => {
  const gate = summaryRun();
  // 请求绑定 run.id，保持默认 id 才能得到完整匹配的批准请求。
  gate.status = "WaitingForApproval";
  gate.routing!.cursorNodeId = "gate";
  gate.approvalAttempts![0]!.status = "WaitingForApproval";
  delete gate.approvalAttempts![0]!.decision;
  const done = summaryRun();
  done.id = "done";
  const failed = waitingRun("failed", "WaitingForPermission");
  failed.status = "Failed";
  const items = graphNeedsYou([done, failed, gate]);
  assert.deepEqual(
    items.map((item) => [item.runId, item.kind, item.nodeId]),
    [["run", "approval", "gate"]],
  );
});

test("pending actions are found in the complete run list, not just the first history page", () => {
  // 历史每页 25 条；待处理的运行在第 2 页之后也必须被发现。
  const settled = Array.from({ length: 60 }, (_, index) => {
    const run = summaryRun();
    run.id = `settled-${index}`;
    return run as GraphRun;
  });
  const pending = waitingRun("old-pending", "WaitingForPermission");
  const items = graphNeedsYou([...settled, pending]);
  assert.deepEqual(
    items.map((item) => item.runId),
    ["old-pending"],
  );
});

test("run again copies the frozen template instance without starting anything", () => {
  const run = summaryRun();
  assert.equal(graphRunAgainDraft(run), undefined);
  run.definition.template = {
    id: "generic",
    name: "Sequential engineering",
    version: 2,
    digest: "digest",
    parameters: { request: "Modify zz-demo.txt file content to after" },
    excluded: [],
    references: [],
    bindings: {
      references: { instructions: "Context.md" },
      recipes: { build: "build", test: "test" },
      sourcePaths: ["zz-demo.txt"],
    },
  };
  const draft = graphRunAgainDraft(run)!;
  assert.deepEqual(draft.selection, { id: "generic", version: 2 });
  assert.equal(draft.templateKey, "generic:2");
  assert.equal(draft.form.parameters.request, "Modify zz-demo.txt file content to after");
  assert.deepEqual(draft.form.bindings.references, { instructions: "Context.md" });
  // 副本：改动表单不能回写历史运行的冻结定义。
  draft.form.parameters.request = "Different";
  draft.form.bindings.sourcePaths.push("x");
  assert.equal(
    run.definition.template!.parameters.request,
    "Modify zz-demo.txt file content to after",
  );
  assert.deepEqual(run.definition.template!.bindings.sourcePaths, ["zz-demo.txt"]);
});
