import assert from "node:assert/strict";
import test from "node:test";
import {
  graphRecipeChangeOf,
  graphRecipeChanges,
} from "../src/graph-engineering/graphRecipeChanges.js";

const recipe = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Check ${id}`,
  executable: "dotnet",
  args: ["test"],
  verifier: { kind: "test" },
  ...extra,
});
const form = (base: unknown[], draft: unknown[] | string) => ({
  baseText: JSON.stringify(base, null, 2),
  text: typeof draft === "string" ? draft : JSON.stringify(draft, null, 2),
});

test("clean when there is no draft or the text is the saved text", () => {
  assert.deepEqual(graphRecipeChanges(undefined), { kind: "clean" });
  const saved = [recipe("a")];
  assert.deepEqual(graphRecipeChanges(form(saved, saved)), { kind: "clean" });
});

test("added, modified and removed checks by stable id, with names from the right side", () => {
  const base = [recipe("a"), recipe("b"), recipe("c", { name: "Old C" })];
  const draft = [recipe("a"), recipe("b", { args: ["test", "--no-build"] }), recipe("d")];
  const changes = graphRecipeChanges(form(base, draft));
  assert.equal(changes.kind, "changes");
  if (changes.kind !== "changes") return;
  assert.deepEqual(changes.added, [{ id: "d", name: "Check d" }]);
  assert.deepEqual(changes.modified, [{ id: "b", name: "Check b" }]);
  assert.deepEqual(
    changes.removed,
    [{ id: "c", name: "Old C" }],
    "a removed check keeps its saved name",
  );
  assert.equal(changes.reordered, false);
  assert.equal(changes.formattingOnly, false);
  assert.equal(graphRecipeChangeOf(changes, "b"), "modified");
  assert.equal(graphRecipeChangeOf(changes, "c"), "removed");
  assert.equal(graphRecipeChangeOf(changes, "a"), undefined);
});

test("a rename is a modification of the same id; key order alone is not a change", () => {
  const base = [recipe("a")];
  const renamed = graphRecipeChanges(form(base, [recipe("a", { name: "New name" })]));
  assert.ok(renamed.kind === "changes" && renamed.modified[0]?.name === "New name");
  const { id, name, ...rest } = recipe("a");
  const reKeyed = graphRecipeChanges(form(base, [{ ...rest, name, id }]));
  assert.ok(reKeyed.kind === "changes" && reKeyed.formattingOnly, "only formatting");
  const compact = graphRecipeChanges({
    baseText: JSON.stringify(base, null, 2),
    text: JSON.stringify(base),
  });
  assert.ok(compact.kind === "changes" && compact.formattingOnly);
});

test("order changes are reported, since the whole list is saved in order", () => {
  const changes = graphRecipeChanges(form([recipe("a"), recipe("b")], [recipe("b"), recipe("a")]));
  assert.ok(changes.kind === "changes" && changes.reordered && !changes.formattingOnly);
});

test("a list that cannot be complete is unsummarizable, never partial", () => {
  const base = [recipe("a")];
  assert.deepEqual(graphRecipeChanges(form(base, "[{")), {
    kind: "unsummarizable",
    reason: "invalid-json",
  });
  assert.deepEqual(graphRecipeChanges(form(base, "{}")), {
    kind: "unsummarizable",
    reason: "invalid-json",
  });
  assert.deepEqual(graphRecipeChanges(form(base, [{ name: "no id" }])), {
    kind: "unsummarizable",
    reason: "missing-id",
  });
  assert.deepEqual(graphRecipeChanges(form(base, [recipe("a"), recipe("a")])), {
    kind: "unsummarizable",
    reason: "duplicate-id",
  });
  const unsure = graphRecipeChanges(form(base, "[{"));
  assert.equal(graphRecipeChangeOf(unsure, "a"), undefined, "no per-row claim when unsure");
});
