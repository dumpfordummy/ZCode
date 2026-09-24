import assert from "node:assert/strict";
import test from "node:test";
import {
  captureGraphSubmission,
  prepareGraphRunConfirmation,
} from "../src/graph-engineering/graphSubmission.js";
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

test("v5 retry rejects changed confirmation before saving or dispatching a retained intent", async () => {
  const definition = {
    version: 5,
    revision: 2,
    name: "confirmed",
    nodes: [],
    edges: [],
    routing: { finalGateId: "gate", limits: { maxNodeAdmissions: 8, deadlineMs: 10000 } },
  } as const;
  const request = {
    target: { workspacePath: "C:/synthetic" },
    revision: 3,
    requestId: "retained",
    modelSelection: { providerId: "synthetic", modelId: "model" },
    mode: "edit",
    planEnabled: false,
  } as const;
  let saves = 0;
  const retry = {
    retained: request,
    retainedDefinition: definition,
    definition,
    intent: { ...request, requestId: "unused" },
    save: async () => {
      saves++;
      return definition;
    },
  };
  assert.deepEqual(await captureGraphSubmission(retry), request);
  await assert.rejects(
    captureGraphSubmission({ ...retry, definition: { ...definition, name: "changed" } }),
    /confirmation/,
  );
  await assert.rejects(
    captureGraphSubmission({ ...retry, intent: { ...retry.intent, mode: "build" } }),
    /confirmation/,
  );
  assert.equal(saves, 0);
});

test("v5 confirmation saves captured content once and dispatches the exact displayed revision", async () => {
  const definition = {
    version: 5 as const,
    revision: 1,
    name: "before",
    nodes: [],
    edges: [],
    routing: { finalGateId: "gate", limits: { maxNodeAdmissions: 8, deadlineMs: 10000 } },
  };
  const settings = {
    modelSelection: { providerId: "synthetic", modelId: "one" },
    mode: "edit" as const,
    planEnabled: false,
  };
  let saves = 0;
  const prepared = prepareGraphRunConfirmation({
    definition,
    settings,
    save: async (draft) => {
      saves++;
      await Promise.resolve();
      return { ...draft, revision: 2 };
    },
  });
  definition.name = "later";
  settings.modelSelection.modelId = "later";
  const snapshot = (await prepared)!;
  assert.equal(snapshot.definition.name, "before");
  assert.equal(snapshot.settings.modelSelection.modelId, "one");
  assert.equal(snapshot.definition.revision, 2);
  const request = await captureGraphSubmission({
    retained: null,
    definition: snapshot.definition,
    confirmed: true,
    intent: {
      target: { workspacePath: "C:/synthetic" },
      requestId: "request",
      ...snapshot.settings,
    },
    save: async () => {
      saves++;
      throw Error("Confirmation cannot save again");
    },
  });
  assert.equal(saves, 1);
  assert.equal(request.revision, snapshot.definition.revision);
  assert.deepEqual(request.modelSelection, snapshot.settings.modelSelection);
});

test("reopening v5 confirmation after a lost ACK never saves or advances the retained revision", async () => {
  const definition = {
    version: 5 as const,
    revision: 2,
    name: "saved",
    nodes: [],
    edges: [],
    routing: { finalGateId: "gate", limits: { maxNodeAdmissions: 8, deadlineMs: 10000 } },
  };
  const settings = {
    modelSelection: { providerId: "synthetic", modelId: "one" },
    mode: "edit" as const,
    planEnabled: false,
  };
  const retained = {
    target: { workspacePath: "C:/synthetic" },
    requestId: "retained",
    revision: 2,
    ...settings,
  };
  const options = {
    definition: { ...definition, revision: 3 },
    settings,
    retained,
    retainedDefinition: definition,
    save: async () => {
      throw Error("Must not save a retained confirmation");
    },
  };
  const confirmation = (await prepareGraphRunConfirmation(options))!;
  assert.equal(confirmation.definition.revision, 2);
  await assert.rejects(
    prepareGraphRunConfirmation({ ...options, definition: { ...definition, name: "new" } }),
    /confirmation/,
  );
});
