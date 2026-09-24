import assert from "node:assert/strict";
import test from "node:test";
import {
  isLocalGraphTarget,
  graphWorkspaceTarget,
  graphConversationTarget,
  reconcileGraphDraft,
} from "../src/graph-engineering/graphEngineeringView.js";

test("remote metadata never resolves to a local graph target even with a local-looking path", () => {
  assert.equal(isLocalGraphTarget({ workspacePath: "C:/synthetic/graph" }), true);
  for (const remote of [
    { workspaceIdentity: "remote:same-path" },
    { remoteSessionId: "remote-1" },
    { remoteTarget: {} },
  ]) {
    assert.equal(isLocalGraphTarget({ workspacePath: "C:/synthetic/graph", ...remote }), false);
  }
});

test("graph requests retain explicit workspace identity instead of collapsing to the path", () => {
  assert.deepEqual(graphWorkspaceTarget({ workspacePath: "C:/synthetic/graph" }), {
    workspacePath: "C:/synthetic/graph",
  });
  assert.deepEqual(
    graphWorkspaceTarget({
      workspacePath: "C:/synthetic/graph",
      workspaceIdentity: "identity-one",
    }),
    { workspacePath: "C:/synthetic/graph", workspaceIdentity: "identity-one" },
  );
});

test("incoming progress or another editor save cannot silently overwrite an unsaved graph", () => {
  const base = {
    revision: 1,
    name: "Saved",
    taskName: "Task",
    instructions: "original",
    nodes: [],
    edges: [],
  };
  const draft = { ...base, instructions: "local edit" };
  const state = { base, draft };
  assert.equal(reconcileGraphDraft(state, base), state);
  assert.equal(
    reconcileGraphDraft(state, { ...base, revision: 2, instructions: "other editor" }),
    state,
  );
  const accepted = { ...draft, revision: 2 };
  assert.deepEqual(reconcileGraphDraft(state, accepted), { base: accepted, draft: accepted });
  const clean = { base, draft: base };
  assert.deepEqual(reconcileGraphDraft(clean, accepted), { base: accepted, draft: accepted });
});

test("conversation navigation retains the frozen attempt target and native session", () => {
  const attempt = { workspacePath: "C:/synthetic/captured", sessionId: "native-session-1" };
  assert.deepEqual(graphConversationTarget(attempt), attempt);
  const scoped = { ...attempt, workspaceIdentity: "captured-identity" };
  assert.deepEqual(graphConversationTarget(scoped), scoped);
  assert.equal(graphConversationTarget({ ...attempt, sessionId: null }), null);
  assert.equal(graphConversationTarget(null), null);
});
