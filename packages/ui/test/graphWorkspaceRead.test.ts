import assert from "node:assert/strict";
import test from "node:test";
import type { GraphDefinition, GraphWorkspaceView } from "@zcode/services";
import {
  graphWorkspaceReadState,
  readGraphWorkspaceProjection,
  type GraphWorkspaceReadProjection,
  type GraphWorkspaceReadScope,
} from "../src/graph-engineering/graphWorkspaceRead.js";
import { createGraphDraftStore } from "../src/store/graphDraftStore.js";

function workspace(name: string, revision: number): GraphWorkspaceView {
  const definition: GraphDefinition = {
    name,
    revision,
    taskName: name,
    instructions: name,
    nodes: [],
    edges: [],
  };
  return { definition, runs: [], availability: { available: true } } as GraphWorkspaceView;
}
function deferred() {
  let resolve!: (value: GraphWorkspaceView) => void;
  const promise = new Promise<GraphWorkspaceView>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("workspace switch hides the old projection before effects and rejects its late read", async () => {
  const a: GraphWorkspaceReadScope = { sequence: 0 };
  const b: GraphWorkspaceReadScope = { sequence: 0 };
  const aView = workspace("A", 5);
  const bView = workspace("B", 1);
  let current = a;
  let stored: GraphWorkspaceReadProjection = {
    scope: a,
    state: { view: aView, loading: false, error: null },
  };
  const store = createGraphDraftStore();
  store.getState().observeDefinition("a", aView.definition);
  const delayedA = deferred();
  const oldRead = readGraphWorkspaceProjection({
    scope: a,
    isCurrent: () => current === a,
    read: () => delayedA.promise,
    publish: (patch) => {
      stored = { scope: a, state: { ...graphWorkspaceReadState(a, stored), ...patch } };
    },
  });
  current = b;
  const transition = graphWorkspaceReadState(b, stored);
  assert.equal(transition.view, null);
  assert.equal(transition.loading, true);
  if (transition.view) store.getState().observeDefinition("b", transition.view.definition);
  assert.equal(store.getState().workspaces.b, undefined);
  await readGraphWorkspaceProjection({
    scope: b,
    isCurrent: () => current === b,
    read: async () => bView,
    publish: (patch) => {
      stored = { scope: b, state: { ...graphWorkspaceReadState(b, stored), ...patch } };
    },
  });
  delayedA.resolve(aView);
  assert.equal(await oldRead, undefined);
  const selected = graphWorkspaceReadState(b, stored).view!;
  store.getState().observeDefinition("b", selected.definition);
  assert.equal(selected.definition.revision, 1);
  assert.equal(store.getState().workspaces.b?.definition?.draft.name, "B");
  assert.equal(store.getState().workspaces.a?.definition?.draft.name, "A");
});

test("returning to an existing dirty workspace never reconciles another workspace revision", () => {
  const a: GraphWorkspaceReadScope = { sequence: 0 };
  const b: GraphWorkspaceReadScope = { sequence: 0 };
  const bView = workspace("B", 1);
  const store = createGraphDraftStore();
  store.getState().observeDefinition("b", bView.definition);
  store
    .getState()
    .editDefinition("b", { ...bView.definition, name: "B unsaved" }, bView.definition);
  const stale = graphWorkspaceReadState(b, {
    scope: a,
    state: { view: workspace("A", 5), loading: false, error: "A error" },
  });
  assert.equal(stale.view, null);
  assert.equal(stale.error, null);
  store.getState().observeDefinition("b", bView.definition);
  assert.equal(store.getState().workspaces.b?.definition?.draft.name, "B unsaved");
  assert.equal(store.getState().workspaces.b?.definition?.base.revision, 1);
});

test("a successful workspace retry clears read failure while newest read retains authority", async () => {
  const scope: GraphWorkspaceReadScope = { sequence: 0 };
  let stored: GraphWorkspaceReadProjection | undefined;
  const options = {
    scope,
    isCurrent: () => true,
    publish: (patch: Partial<GraphWorkspaceReadProjection["state"]>) => {
      stored = { scope, state: { ...graphWorkspaceReadState(scope, stored), ...patch } };
    },
  };
  await readGraphWorkspaceProjection({
    ...options,
    read: async () => {
      throw Error("read failed");
    },
  });
  assert.equal(graphWorkspaceReadState(scope, stored).error, "read failed");
  const delayed = deferred();
  const oldRead = readGraphWorkspaceProjection({ ...options, read: () => delayed.promise });
  const latest = workspace("Latest", 3);
  await readGraphWorkspaceProjection({ ...options, read: async () => latest });
  delayed.resolve(workspace("Old", 2));
  assert.equal(await oldRead, undefined);
  assert.deepEqual(graphWorkspaceReadState(scope, stored), {
    view: latest,
    loading: false,
    error: null,
  });
});
