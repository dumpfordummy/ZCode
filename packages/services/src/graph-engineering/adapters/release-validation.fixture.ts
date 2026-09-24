import type {
  GraphNodeAttempt,
  GraphSequentialDefinition,
  GraphSequentialRun,
} from "../contract.js";

export const target = {
  workspacePath: "C:/synthetic/release-validation",
  workspaceIdentity: "synthetic-release-identity",
};
export const settings = {
  modelSelection: { providerId: "fixture", modelId: "controlled" },
  mode: "build" as const,
  planEnabled: false,
};
export function recordFixture() {
  const definition: GraphSequentialDefinition = {
    version: 2,
    revision: 1,
    name: "Release fixture",
    nodes: [
      { id: "start", type: "start", position: { x: 0, y: 0 }, request: "synthetic request" },
      {
        id: "a",
        type: "task",
        position: { x: 1, y: 0 },
        name: "A",
        instructions: "Analyze",
        instructionMode: "literal",
        inputs: [],
        configuration: { kind: "inherit" },
      },
      {
        id: "b",
        type: "task",
        position: { x: 2, y: 0 },
        name: "B",
        instructions: "Use {{inputs.previous}}",
        instructionMode: "bound",
        inputs: [{ alias: "previous", source: { kind: "node", nodeId: "a" } }],
        configuration: { kind: "inherit" },
      },
      { id: "end", type: "end", position: { x: 3, y: 0 }, outputNodeId: "b" },
    ],
    edges: [
      { source: "start", target: "a" },
      { source: "a", target: "b" },
      { source: "b", target: "end" },
    ],
  };
  const first: GraphNodeAttempt = {
    nodeId: "a",
    attemptId: "attempt-a",
    commandId: "command-a",
    inputId: "command-a",
    status: "Completed",
    dispatchPhase: "accepted",
    settings: { ...settings, source: "workspace" },
    createdAt: 1,
    updatedAt: 5,
    sessionId: "session-a",
    runtimeIdentity: "runtime-a",
    observationEpoch: "epoch-a",
    resolvedInstructions: "Analyze",
    bindings: [],
    terminalProof: {
      sourceCommandId: "command-a",
      state: "completedSuccess",
      logEpoch: "epoch-a",
      seq: 5,
      turnId: "turn-a",
    },
    finalOutput: { text: "frozen-a", turnId: "turn-a", rowId: 3 },
  };
  const second: GraphNodeAttempt = {
    nodeId: "b",
    attemptId: "attempt-b",
    commandId: "command-b",
    inputId: "command-b",
    status: "Unknown",
    dispatchPhase: "accepted",
    settings: { ...settings, source: "workspace" },
    createdAt: 1,
    updatedAt: 7,
    sessionId: "session-b",
    runtimeIdentity: "runtime-b",
    observationEpoch: "epoch-b",
    resolvedInstructions: "Use frozen-a",
    bindings: [
      {
        alias: "previous",
        source: { kind: "node", nodeId: "a" },
        text: "frozen-a",
        sourceSessionId: "session-a",
        sourceInputId: "command-a",
        sourceCommandId: "command-a",
      },
    ],
  };
  const run: GraphSequentialRun = {
    version: 2,
    id: "run",
    requestId: "request",
    requestFingerprint: "fixture",
    target,
    definition,
    defaults: settings,
    plannedPath: ["a", "b"],
    startInput: "synthetic request",
    nodeAttempts: [first, second],
    status: "Interrupted",
    createdAt: 1,
    updatedAt: 10,
    release: {
      releasedAt: 10,
      reason: "Synthetic owner inspected the original runtime",
      inspection: {
        inspectedAt: 9,
        state: "inactive",
        reason: "Confirmed inactive",
        attempts: [
          {
            attemptId: first.attemptId,
            state: "inactive",
            reason: "Exact terminal",
            proof: {
              kind: "input-terminal",
              sessionId: first.sessionId!,
              runtimeIdentity: first.runtimeIdentity!,
              commandId: first.commandId,
              inputId: first.inputId,
              terminalProof: { ...first.terminalProof! },
            },
          },
          {
            attemptId: second.attemptId,
            state: "inactive",
            reason: "Original runtime retired",
            proof: {
              kind: "runtime-retired",
              runtimeIdentity: second.runtimeIdentity!,
              workspaceKey: target.workspaceIdentity,
              retiredAt: 8,
            },
          },
        ],
      },
    },
  };
  return { version: 2 as const, workspaceKey: target.workspaceIdentity, definition, runs: [run] };
}
