import assert from "node:assert/strict";
import test from "node:test";
import { createGraphToolPort } from "./tools.js";

test("Tool session adapter explicitly requests non-model initialization and deferred creation", async () => {
  const target = { workspacePath: "C:/synthetic/no-provider", workspaceIdentity: "synthetic" };
  const calls: string[] = [];
  const tool = createGraphToolPort({
    agentService: {
      async getWorkspaceRuntimeIdentity(params) {
        assert.deepEqual(params, target);
        calls.push("identity");
        return { generation: 1, identity: "native-runtime", workspaceKey: "synthetic" };
      },
      async startRecipe() {
        throw new Error("unexpected dispatch");
      },
      async inspectRecipe() {
        throw new Error("unexpected inspect");
      },
      async cancelRecipe() {
        throw new Error("unexpected cancel");
      },
    },
    sessionService: {
      async initializeWorkspace(params) {
        assert.deepEqual(params, { ...target, purpose: "native-recipe" });
        calls.push("initialize");
        return { available: true, workspaceKey: "synthetic" };
      },
      async createSession(params) {
        assert.deepEqual(params, {
          ...target,
          purpose: "native-recipe",
          persistence: "deferred",
          mode: "edit",
        });
        calls.push("create");
        throw new Error("synthetic stop before native creation");
      },
    },
  });
  await assert.rejects(tool.create(target), /synthetic stop/);
  assert.deepEqual(calls, ["initialize", "identity", "create"]);
});
