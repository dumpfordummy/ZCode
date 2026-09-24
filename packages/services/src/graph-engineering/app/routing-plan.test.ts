import assert from "node:assert/strict";
import test from "node:test";
import type { GraphSequentialRun } from "../contract.js";
import { appendIteration, frozenRoutingConfiguration } from "./routing-plan.js";
import { sequenceDefinition } from "./sequential.fixture.js";

test("repair appends fresh attempts without changing prior proof or frozen configuration", () => {
  let id = 0;
  const definition = sequenceDefinition();
  definition.version = 5;
  const run = {
    version: 5,
    definition,
    defaults: {
      modelSelection: { providerId: "fixture", modelId: "local" },
      mode: "build",
      planEnabled: false,
    },
    nodeAttempts: [
      {
        nodeId: "analyze",
        attemptId: "old",
        commandId: "cmd",
        inputId: "cmd",
        status: "Completed",
        dispatchPhase: "accepted",
        settings: {
          modelSelection: { providerId: "fixture", modelId: "local" },
          mode: "build",
          planEnabled: false,
          source: "workspace",
        },
        createdAt: 1,
        updatedAt: 2,
        finalOutput: { text: "first", rowId: 1, turnId: "turn" },
      },
    ],
    toolAttempts: [],
    approvalAttempts: [],
    routing: {
      iterations: [],
      conditionAttempts: [],
      currentIterationId: "",
      cursorNodeId: "analyze",
      configurationDigest: "",
      recipeConfigurationDigest: "",
      admissions: 0,
      deadlineAt: 1000,
      checkpoints: [],
      continuations: [],
    },
  } as unknown as GraphSequentialRun;
  const options = { id: () => `fresh-${++id}`, now: () => 10 };
  appendIteration(run, options);
  const original = structuredClone(run.nodeAttempts[0]);
  const frozen = frozenRoutingConfiguration(run);
  appendIteration(run, options);
  assert.deepEqual(run.nodeAttempts[0], original);
  assert.equal(run.nodeAttempts.length, 2);
  assert.notEqual(run.nodeAttempts[0]!.attemptId, run.nodeAttempts[1]!.attemptId);
  assert.notEqual(run.nodeAttempts[0]!.commandId, run.nodeAttempts[1]!.commandId);
  assert.equal(run.nodeAttempts[1]!.dispatchPhase, "planned");
  assert.equal(run.nodeAttempts[1]!.finalOutput, undefined);
  assert.deepEqual(frozenRoutingConfiguration(run), frozen);
  assert.equal(new Set(run.routing!.iterations.map((i) => i.id)).size, 2);
});
