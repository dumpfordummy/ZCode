// Z8.3-R1: the production composition root wires the compatibility gate, so an incompatible agent is
// rejected at Run admission through the real ports (no stubbed Graph port is involved).
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createGraphEngineeringService } from "../src/graph-engineering/node.js";
import { GraphRuntimeIncompatibleError } from "../src/graph-engineering/domain/native-runtime-contract.js";
import {
  selection,
  sequenceDefinition,
  target,
} from "../src/graph-engineering/app/sequential.fixture.js";

test("createGraphEngineeringService rejects an old agent at admission and never creates a native session", async () => {
  const directory = await mkdtemp(join(tmpdir(), "graph-r1-"));
  const calls: string[] = [];
  try {
    const graph = createGraphEngineeringService({
      directory,
      agentService: {
        async readRuntimeCapabilities() {
          calls.push("capabilities");
          return { supported: false }; // an agent that predates runtime/capabilities
        },
        async getWorkspaceRuntimeIdentity() {
          calls.push("identity");
          throw new Error("must not be reached");
        },
      } as never,
      sessionService: {
        async initializeWorkspace() {
          calls.push("initialize");
          return { available: true, workspaceKey: target.workspacePath };
        },
        async createSession() {
          calls.push("createSession");
          throw new Error("must not be reached");
        },
      } as never,
      modelSelectionService: {
        async getView() {
          return { providers: [{ providerId: "fixture", models: [{ modelId: "native" }] }] };
        },
      } as never,
      settingService: {
        async get() {
          return { askUserQuestionAutoResolutionEnabled: false };
        },
      } as never,
      gitService: {} as never,
    });
    const view = await graph.getWorkspace(target);
    await graph.saveDefinition({
      target,
      definition: sequenceDefinition(),
      expectedRevision: view.definition.revision,
    });
    await assert.rejects(
      graph.run({
        target,
        requestId: "r1-composition",
        revision: view.definition.revision + 1,
        modelSelection: selection,
        mode: "build",
        planEnabled: false,
      }),
      GraphRuntimeIncompatibleError,
    );
    assert.deepEqual(calls, ["initialize", "capabilities"]);
    assert.equal((await graph.getWorkspace(target)).runs.length, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
