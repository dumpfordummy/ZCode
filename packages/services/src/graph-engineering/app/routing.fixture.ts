import { createHash } from "node:crypto";
import type {
  GraphArtifact,
  GraphArtifactWrite,
  GraphSequentialDefinition,
  GraphSequentialRun,
} from "../contract.js";
import type { GraphNativeExecution, GraphNativeFact } from "./ports.js";
import type { GraphOptions } from "./state.js";
import type { GraphRecord } from "./ports.js";
import { GraphEngineeringService } from "./service.js";
import { recordSchema } from "../domain/record.js";
import { target, selection } from "./sequential.fixture.js";

export function routingDefinition(): GraphSequentialDefinition {
  const task = (id: string) => ({
    id,
    type: "task" as const,
    position: { x: 0, y: 0 },
    name: id,
    instructions: "Fixture {{inputs.request}}",
    instructionMode: "bound" as const,
    inputs: [{ alias: "request", source: { kind: "start" as const } }],
    configuration: { kind: "inherit" as const },
  });
  return {
    version: 5,
    revision: 0,
    name: "Bounded exclusive fixture",
    routing: { finalGateId: "gate", limits: { maxNodeAdmissions: 12, deadlineMs: 3600000 } },
    nodes: [
      {
        id: "start",
        type: "start",
        position: { x: 0, y: 0 },
        request: "Synthetic routing request",
      },
      {
        ...task("producer"),
        output: {
          kind: "json",
          schema: {
            type: "object",
            properties: { value: { type: "number" } },
            required: ["value"],
            additionalProperties: false,
          },
        },
      },
      {
        id: "condition",
        type: "condition",
        position: { x: 0, y: 0 },
        name: "Typed route",
        inputs: [
          {
            alias: "data",
            source: { kind: "artifact", nodeId: "producer", selector: "structured" },
          },
        ],
        branches: [
          { exit: "positive", predicate: { op: "gt", alias: "data", pointer: "/value", value: 0 } },
        ],
        defaultExit: "other",
        errorPolicy: "needs-human",
      },
      task("positive"),
      task("other"),
      task("merge"),
      {
        id: "gate",
        type: "approval",
        position: { x: 0, y: 0 },
        name: "Final review",
        reviewInstructions: "Review exact current result",
        commentPolicy: "required",
        evidence: [{ alias: "result", source: { kind: "node", nodeId: "merge" } }],
      },
      { id: "end", type: "end", position: { x: 0, y: 0 }, outputNodeId: "merge" },
    ],
    edges: [
      { source: "start", target: "producer" },
      { source: "producer", target: "condition" },
      { source: "condition", sourcePort: "positive", target: "positive" },
      { source: "condition", sourcePort: "other", target: "other" },
      { source: "positive", target: "merge" },
      { source: "other", target: "merge" },
      { source: "merge", target: "gate" },
      { source: "gate", target: "end" },
    ],
  };
}

export function routingFixture(
  initial?: GraphRecord,
  retained?: Map<string, { artifact: GraphArtifact; content: string }>,
) {
  let saved = initial ? structuredClone(initial) : null;
  let id = initial ? 1000 : 0;
  let clock = Date.now();
  const digest = (s: string) => createHash("sha256").update(s).digest("hex");
  const listeners = new Map<string, (fact: GraphNativeFact) => void>();
  const sends: GraphNativeExecution[] = [],
    creates: GraphNativeExecution[] = [],
    cancels: GraphNativeExecution[] = [];
  const artifacts = retained ?? new Map<string, { artifact: GraphArtifact; content: string }>();
  const options: GraphOptions = {
    id: () => `routing-${++id}`,
    now: () => clock,
    repository: {
      read: async () => structuredClone(saved),
      write: async (_t, record) => {
        recordSchema.parse({ version: 5, workspaceKey: target.workspacePath, ...record });
        saved = structuredClone(record);
      },
    },
    evidence: {
      digest,
      captureSource: async () => ({
        baseline: "synthetic",
        scope: "fixture",
        files: [],
        complete: true,
        issues: [],
      }),
    },
    recipes: {
      read: async () => ({
        recipes: [],
        digest: digest("recipes"),
        sourcePath: ".zcode/config.json",
      }),
      save: async () => {
        throw Error("unused");
      },
      fingerprint: async () => ({ digest: digest("source"), files: [] }),
      validatePaths: async () => {},
      observeFiles: async () => [],
    },
    artifacts: {
      put: async (input: GraphArtifactWrite) => {
        const artifact: GraphArtifact = {
          id: input.artifactId,
          runId: input.runId,
          nodeId: input.nodeId,
          attemptId: input.attemptId,
          workspaceKey: target.workspacePath,
          type: input.type,
          provenance: input.provenance,
          bytes: Buffer.byteLength(input.content),
          digest: digest(input.content),
          capturedAt: input.capturedAt,
          validation: input.validation ?? "valid",
          sessionId: input.sessionId,
          inputId: input.inputId,
          commandId: input.commandId,
          issue: input.issue,
        };
        artifacts.set(artifact.id, { artifact: structuredClone(artifact), content: input.content });
        return artifact;
      },
      read: async (identity) => structuredClone(artifacts.get(identity.artifactId)!),
      captureFile: async () => {
        throw Error("unused");
      },
    },
    tools: {
      available: async () => ({ available: true }),
      create: async () => {
        throw Error("unused");
      },
      start: async () => {
        throw Error("unused");
      },
      inspect: async () => {
        throw Error("unused");
      },
      cancel: async () => {
        throw Error("unused");
      },
    },
    native: {
      available: async () => ({ available: true }),
      validateSelection: async () => {},
      create: async (input) => {
        creates.push(structuredClone(input));
        return { sessionId: `session-${input.attemptId}`, runtimeIdentity: "fixture-runtime" };
      },
      send: async (input) => {
        sends.push(structuredClone(input));
        return { accepted: true };
      },
      observe: async (input, onFact) => {
        listeners.set(input.attemptId, onFact);
        return { dispose: () => {} };
      },
      cancel: async (input) => {
        cancels.push(input);
      },
      reconcile: async () => "same-runtime",
      inspect: async () => ({
        kind: "unknown",
        reason: "Fixture deliberately withholds runtime proof.",
      }),
    },
  };
  const service = new GraphEngineeringService(options);
  const view = () => service.getWorkspace(target);
  const current = async () => (await view()).runs.at(-1) as GraphSequentialRun;
  return {
    service,
    options,
    sends,
    creates,
    cancels,
    artifacts,
    saved: () => structuredClone(saved!),
    current,
    advanceClock: (ms: number) => {
      clock += ms;
    },
    prepare: async (definition = routingDefinition()) =>
      service.saveDefinition({
        target,
        definition,
        expectedRevision: (await view()).definition.revision,
      }),
    run: () =>
      service.run({
        target,
        requestId: "routing-request",
        revision: 1,
        modelSelection: selection,
        mode: "build",
        planEnabled: false,
      }),
    emit: async (
      nodeId: string,
      text: string,
      state: GraphNativeFact["state"] = "completedSuccess",
      extra: Partial<GraphNativeFact> = {},
    ) => {
      const run = await current();
      const node = run.nodeAttempts.find(
        (a) =>
          a.attemptId ===
          run.routing!.iterations.find((i) => i.id === run.routing!.currentIterationId)!.attemptIds[
            nodeId
          ],
      )!;
      listeners.get(node.attemptId)?.({
        sourceCommandId: node.commandId,
        state,
        logEpoch: `epoch-${node.attemptId}`,
        seq: ++clock,
        turnId: `turn-${node.attemptId}`,
        finalOutput: { text, rowId: 1, turnId: `turn-${node.attemptId}` },
        ...extra,
      });
      for (let i = 0; i < 6; i++) await view();
    },
  };
}
