import assert from "node:assert/strict";
import test from "node:test";
import { captureGraphSubmission } from "../src/graph-engineering/graphSubmission.js";
import type { GraphLegacyDefinition } from "@zcode/services";

const definition: GraphLegacyDefinition = {
  revision: 4,
  name: "Graph",
  taskName: "Task",
  instructions: "original",
  nodes: [],
  edges: [],
};
const intent = {
  target: { workspacePath: "C:/synthetic" },
  requestId: "stable",
  modelSelection: { providerId: "fixture", modelId: "model" },
  mode: "build" as const,
  planEnabled: false,
};

test("lost Run reply retry retains exact revision/config and does not save the changed draft", async () => {
  let saves = 0;
  const save = async (draft: GraphLegacyDefinition) => {
    saves++;
    return { ...draft, revision: draft.revision + 1 };
  };
  const first = await captureGraphSubmission({ retained: null, definition, intent, save });
  const retry = await captureGraphSubmission({
    retained: first,
    definition: { ...definition, instructions: "different" },
    intent: { ...intent, requestId: "new", mode: "yolo" },
    save,
  });
  assert.equal(saves, 1);
  assert.equal(retry, first);
  assert.equal(retry.revision, 5);
  assert.equal(retry.mode, "build");
  assert.equal(retry.requestId, "stable");
});

test("captured settings cannot change during asynchronous Save", async () => {
  const mutable = structuredClone(intent);
  let resolve: ((definition: GraphLegacyDefinition) => void) | undefined;
  const request = captureGraphSubmission({
    retained: null,
    definition,
    intent: mutable,
    save: () =>
      new Promise((done) => {
        resolve = done;
      }),
  });
  mutable.modelSelection.modelId = "changed";
  resolve?.({ ...definition, revision: 6 });
  assert.equal((await request).modelSelection.modelId, "model");
});

test("failed Save cannot create a dispatch payload", async () => {
  await assert.rejects(
    captureGraphSubmission({
      retained: null,
      definition,
      intent,
      save: async () => {
        throw new Error("storage unavailable");
      },
    }),
    /storage unavailable/,
  );
});
