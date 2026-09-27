import assert from "node:assert/strict";
import test from "node:test";
import type { GraphDefinition, GraphRecipeSnapshot } from "@zcode/services";
import { createGraphDraftStore } from "../src/store/graphDraftStore.js";

const base: GraphDefinition = {
  revision: 1,
  name: "Saved",
  taskName: "Task",
  instructions: "saved",
  nodes: [],
  edges: [],
};
const snapshot: GraphRecipeSnapshot = {
  recipes: [],
  digest: "first",
  sourcePath: ".zcode/config.json",
};

test("workspace and immutable template keys retain independent unsubmitted drafts", () => {
  const store = createGraphDraftStore();
  store.getState().observeDefinition("local-a", base);
  store.getState().editDefinition("local-a", { ...base, instructions: "A unsaved" }, base);
  store.getState().observeDefinition("remote-a", { ...base, name: "Other identity" });
  const form = {
    parameters: { request: "keep my task" },
    bindings: { references: {}, recipes: {}, sourcePaths: [] },
  };
  store.getState().setTemplateDraft("local-a", "template:1", form);
  store
    .getState()
    .setTemplateDraft("local-a", "template:2", { ...form, parameters: { request: "new version" } });
  store.getState().observeDefinition("local-a", base);
  assert.equal(store.getState().workspaces["local-a"]?.definition?.draft.instructions, "A unsaved");
  assert.equal(store.getState().workspaces["remote-a"]?.definition?.draft.name, "Other identity");
  assert.deepEqual(store.getState().workspaces["local-a"]?.templates["template:1"], form);
  assert.equal(
    store.getState().workspaces["local-a"]?.templates["template:2"]?.parameters.request,
    "new version",
  );
  assert.equal(store.getState().workspaces["remote-a"]?.templates["template:1"], undefined);
});

test("host updates preserve conflicts and acknowledge only the matching saved content", () => {
  const store = createGraphDraftStore();
  store.getState().observeDefinition("a", base);
  const local = { ...base, instructions: "local" };
  store.getState().editDefinition("a", local, base);
  store.getState().observeDefinition("a", { ...base, revision: 2, instructions: "external" });
  assert.deepEqual(store.getState().workspaces.a?.definition, { base, draft: local });
  const accepted = { ...local, revision: 3 };
  store.getState().observeDefinition("a", accepted);
  assert.deepEqual(store.getState().workspaces.a?.definition, { base: accepted, draft: accepted });
  store.getState().acceptDefinition("a", { ...base, revision: 4, name: "Explicit replacement" });
  assert.equal(store.getState().workspaces.a?.definition?.draft.name, "Explicit replacement");
});

test("refresh and a delayed save cannot erase unsaved project-check text", () => {
  const store = createGraphDraftStore();
  store.getState().observeRecipes("a", snapshot);
  const original = store.getState().workspaces.a!.recipes!;
  store.getState().setRecipeDraft("a", { ...original, text: "[{ pending edit }]" });
  store.getState().observeRecipes("a", { ...snapshot, digest: "external" });
  assert.equal(store.getState().workspaces.a?.recipes?.text, "[{ pending edit }]");
  assert.equal(store.getState().workspaces.a?.recipes?.digest, "first");
  store.getState().acceptRecipes("a", { ...snapshot, digest: "saved" }, "earlier submitted text");
  assert.equal(store.getState().workspaces.a?.recipes?.text, "[{ pending edit }]");
  assert.equal(store.getState().workspaces.a?.recipes?.digest, "saved");
});
