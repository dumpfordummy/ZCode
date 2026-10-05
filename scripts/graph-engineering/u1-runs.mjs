// Synthetic display records only; never execution, permission or verification evidence.
import {
  completedRun,
  runningRun,
  permissionWaitRun,
  failedTestRun,
  approvalWaitRun,
} from "./ux-m1-runs.mjs";

export function u1Run(kind = "sequential", state = "running") {
  const make = {
    running: runningRun,
    permission: permissionWaitRun,
    failed: failedTestRun,
    completed: completedRun,
    approval: approvalWaitRun,
  }[state];
  const run = make(`u1-${kind}-${state}`);
  run.createdAt = Date.UTC(2026, 9, 1, 8);
  run.updatedAt = run.createdAt + 120000;
  run.definition.name =
    kind === "branch" ? "Captured repair workflow" : "Captured sequential workflow";
  run.startInput = "Fix the request parser and preserve existing API behavior";
  run.definition.nodes[0].request = run.startInput;
  const task = run.definition.nodes.find((node) => node.id === "task");
  task.name = "Implement parser fix";
  const extra = ["Plan regression", "Review changes"].map((name, i) => ({
    ...structuredClone(task),
    id: `extra-${i}`,
    name,
  }));
  run.definition.nodes.splice(1, 0, extra[0]);
  run.definition.nodes.splice(-2, 0, extra[1]);
  run.definition.nodes.forEach((node, i) => {
    node.position = { x: i * 250, y: 80 };
  });
  run.definition.edges = run.definition.nodes
    .slice(1)
    .map((node, i) => ({ source: run.definition.nodes[i].id, target: node.id }));
  run.nodeAttempts[0].resolvedInstructions =
    "Use the captured parser fixture.\nPreserve all public API names.\nDo not change the configured checks.";
  if (state === "completed") {
    // Completion without a human gate or tests must never imply either happened.
    run.approvalAttempts = [];
    run.definition.nodes = run.definition.nodes.filter((node) => node.id !== "gate");
    delete run.definition.routing.finalGateId;
    run.plannedPath = run.plannedPath.filter((id) => id !== "gate");
    delete run.routing.iterations[0].attemptIds.gate;
    run.routing.iterations[0].visitedNodeIds = run.routing.iterations[0].visitedNodeIds.filter(
      (id) => id !== "gate",
    );
    run.definition.edges = run.definition.nodes
      .slice(1)
      .map((node, i) => ({ source: run.definition.nodes[i].id, target: node.id }));
    run.result = {
      text: "Updated parser.ts to preserve empty input. No tests were run.",
      turnId: "synthetic-turn",
      rowId: 1,
    };
  }
  if (kind === "branch") {
    run.definition.nodes.push({
      id: "condition",
      type: "condition",
      name: "Review outcome",
      position: { x: 750, y: 330 },
      inputs: [{ alias: "review", source: { kind: "node", nodeId: "extra-1" } }],
      branches: [
        {
          exit: "repair",
          predicate: { op: "eq", alias: "review", pointer: "/outcome", value: "needs_changes" },
        },
      ],
      defaultExit: "done",
    });
    run.definition.nodes.push({
      ...structuredClone(task),
      id: "repair",
      name: "Repair and retry",
      position: { x: 1050, y: 410 },
    });
    run.definition.edges = run.definition.edges.filter((edge) => edge.source !== "extra-1");
    run.definition.edges.push(
      { source: "extra-1", target: "condition" },
      { source: "condition", sourcePort: "done", target: "gate" },
      { source: "condition", sourcePort: "repair", target: "repair" },
      { source: "repair", target: "task" },
    );
    run.definition.routing.region = {
      id: "repair-region",
      name: "Repair cycle",
      bodyNodeIds: ["task", "extra-1", "condition", "repair"],
      entryNodeId: "task",
      exitNodeId: "condition",
      maxRepairIterations: 2,
    };
    const old = structuredClone(run.nodeAttempts[0]);
    old.attemptId = "task-previous";
    old.iterationId = "iteration-previous";
    old.status = "Completed";
    old.iteration = 0;
    run.nodeAttempts.unshift(old);
    run.nodeAttempts[1].iteration = 1;
  }
  return run;
}
