import assert from "node:assert/strict";
import test from "node:test";
import { graphCommandLine } from "../src/graph-engineering/graphCommandLine.js";
import { graphPermissionInfo } from "../src/graph-engineering/graphPermissionInfo.js";
import { graphRunTrail } from "../src/graph-engineering/graphRunTrailModel.js";
import { graphRunSummary } from "../src/graph-engineering/graphRunSummary.js";
import { nextSummaryIteration, summaryRun } from "./graphRunSummary.fixture.js";

test("the trail lists actual visits in execution order and groups unvisited nodes apart", () => {
  const run = summaryRun();
  run.routing!.iterations[0]!.visitedNodeIds = ["task", "gate"];
  const trail = graphRunTrail(run);
  assert.deepEqual(
    trail.visits.map((visit) => [visit.nodeId, visit.iteration, visit.latest]),
    [
      ["task", 0, true],
      ["gate", 0, true],
      // 路由光标停在 End（已完成的运行）：它是最后一次到达的位置，即使未记录为已访问。
      ["end", 0, true],
    ],
  );
  // start 没有被访问记录：作为“未访问”分组，不推断固定顺序。
  assert.deepEqual(trail.notVisited, ["start"]);
  assert.equal(trail.iterations, 1);
});

test("a repair loop shows each iteration's visit; only the newest visit is the latest", () => {
  const run = summaryRun();
  nextSummaryIteration(run);
  run.routing!.iterations[1]!.visitedNodeIds = ["task"];
  run.routing!.iterations[1]!.attemptIds.task = "task-1";
  const trail = graphRunTrail(run);
  const task = trail.visits.filter((visit) => visit.nodeId === "task");
  assert.deepEqual(
    task.map((visit) => [visit.iteration, visit.latest]),
    [
      [0, false],
      [1, true],
    ],
  );
  assert.equal(trail.iterations, 2);
});

test("the routing cursor becomes the current step even before it is recorded as visited", () => {
  const run = summaryRun();
  run.routing!.iterations[0]!.visitedNodeIds = ["task"];
  run.routing!.cursorNodeId = "gate";
  const trail = graphRunTrail(run);
  const gate = trail.visits.find((visit) => visit.nodeId === "gate");
  assert.equal(gate?.current, true);
  assert.equal(trail.visits.find((visit) => visit.nodeId === "task")?.current, false);
});

test("older sequential runs use their frozen planned path", () => {
  const run = summaryRun();
  run.version = 3;
  delete run.routing;
  run.plannedPath = ["task", "gate"];
  assert.deepEqual(
    graphRunTrail(run).visits.map((visit) => visit.nodeId),
    ["task", "gate"],
  );
});

test("recipe commands stored as an argv array are shown as a command line", () => {
  assert.equal(
    graphCommandLine('["node","build.mjs","{operationId}","{sourceDigest}"]'),
    "node build.mjs {operationId} {sourceDigest}",
  );
  assert.equal(graphCommandLine("node build.mjs"), "node build.mjs");
  assert.equal(graphCommandLine('{"not":"argv"}'), '{"not":"argv"}');
});

test("permission information is read-only configuration, never the exact request", () => {
  const run = summaryRun();
  run.status = "WaitingForPermission";
  run.nodeAttempts[0]!.status = "WaitingForPermission";
  run.nodeAttempts[0]!.iterationId = run.routing!.currentIterationId;
  run.provenance = {
    digest: "d",
    template: {
      id: "generic",
      name: "n",
      version: 2,
      digest: "t",
      parameters: {},
      bindings: { references: {}, recipes: {}, sourcePaths: [] },
      references: [],
      excluded: [],
    },
    environment: {} as never,
    models: [],
    auxiliary: [],
    references: [],
    recipes: [{ nodeId: "task", id: "r", digest: "x", command: '["node","x.mjs"]', cwd: "." }],
    permissions: [],
    unknowns: [],
  };
  const info = graphPermissionInfo(run, graphRunSummary(run));
  assert.equal(info.length, 1);
  assert.equal(info[0]!.configuredCommand, "node x.mjs");
  assert.equal(info[0]!.sessionId, "session-task");
  // 没有配置命令的步骤不伪造命令。
  run.provenance.recipes = [];
  assert.equal(graphPermissionInfo(run, graphRunSummary(run))[0]!.configuredCommand, undefined);
});
