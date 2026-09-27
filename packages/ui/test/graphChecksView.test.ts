import assert from "node:assert/strict";
import test from "node:test";
import type { GraphChecksPreview, GraphWorkspaceTarget } from "@zcode/services";
import {
  captureGraphChecksCommand,
  graphChecksReviewKey,
  recheckGraphChecksPreview,
  graphChecksSelectionIssue,
  graphChecksRequestAfterError,
  graphChecksRequestAfterProjection,
} from "../src/graph-engineering/graphChecksView.js";
const target: GraphWorkspaceTarget = { workspacePath: "fixture" };
const preview = {
  kind: "checks-preview",
  version: 1,
  digest: "reviewed",
  recipeDigest: "recipes",
  revision: 3,
  sourceDigest: "source",
  selection: { kind: "recipes", recipeIds: ["build", "test"], buildMappings: { test: "build" } },
} as GraphChecksPreview;
test("checks admission captures direct checks intent with stable lost-ACK identity and no design save", () => {
  assert.throws(() => captureGraphChecksCommand(target, preview, false, "id"));
  const command = captureGraphChecksCommand(target, preview, true, "id");
  assert.equal(command.action, "checks");
  assert.equal(command.checks.expectedDigest, "recipes");
  assert.equal(command.checks.digest, "reviewed");
  assert.equal(captureGraphChecksCommand(target, preview, true, "unused", command), command);
  assert.throws(() =>
    captureGraphChecksCommand(target, { ...preview, digest: "changed" }, true, "new", command),
  );
});

test("a later owned projection reconciles accepted lost-ACK identity without another run call", () => {
  const scope = {};
  const command = captureGraphChecksCommand(target, preview, true, "accepted");
  const retained = { scope, command };
  assert.equal(
    graphChecksRequestAfterProjection(retained, scope, [{ requestId: "accepted" }]),
    undefined,
  );
  assert.equal(
    graphChecksRequestAfterProjection(retained, {}, [{ requestId: "accepted" }]),
    retained,
  );
  assert.equal(
    graphChecksRequestAfterProjection(retained, scope, [{ requestId: "other" }]),
    retained,
  );
});

test("only an explicit pre-admission refusal releases the exact currently owned request", () => {
  const scope = {};
  const command = captureGraphChecksCommand(target, preview, true, "owned");
  const retained = { scope, command };
  const refusal = new Error("Configuration changed");
  refusal.name = "GraphChecksAdmissionRejected";
  assert.equal(graphChecksRequestAfterError(retained, scope, scope, command, refusal), undefined);
  for (const error of [
    new Error("Network interrupted"),
    new Error("GraphChecksAdmissionRejected"),
    undefined,
  ])
    assert.equal(graphChecksRequestAfterError(retained, scope, scope, command, error), retained);
  assert.equal(graphChecksRequestAfterError(retained, scope, {}, command, refusal), retained);
  assert.equal(graphChecksRequestAfterError(retained, {}, scope, command, refusal), retained);
  assert.equal(
    graphChecksRequestAfterError(
      retained,
      scope,
      scope,
      { ...command, requestId: "newer" },
      refusal,
    ),
    retained,
  );
});

test("selection rejects missing, duplicate, out-of-order or excessive scopes while probe stays independent", () => {
  const recipes = [
    { id: "build", verifier: { kind: "build" } },
    ...Array.from({ length: 8 }, (_, index) => ({
      id: `test-${index}`,
      verifier: { kind: "test" },
    })),
  ] as GraphChecksPreview["recipes"];
  const selection = {
    kind: "recipes" as const,
    recipeIds: recipes.slice(0, 8).map((recipe) => recipe.id),
    buildMappings: Object.fromEntries(recipes.slice(1).map((recipe) => [recipe.id, "build"])),
  };
  assert.equal(graphChecksSelectionIssue(selection, recipes), undefined);
  assert.equal(
    graphChecksSelectionIssue(
      { ...selection, recipeIds: recipes.map((recipe) => recipe.id) },
      recipes,
    ),
    "checkLimit",
  );
  for (const recipeIds of [["test-0", "build"], ["build", "missing"], ["build", "build"], []])
    assert.equal(graphChecksSelectionIssue({ ...selection, recipeIds }, recipes), "selectFirst");
  assert.equal(
    graphChecksSelectionIssue({ kind: "dotnet-probe", executable: "dotnet", cwd: "." }, []),
    undefined,
  );
  const probe = {
    ...preview,
    selection: { kind: "dotnet-probe" as const, executable: "dotnet", cwd: "." },
    recipeDigest: "canonical-no-recipe-marker",
  };
  assert.equal(
    captureGraphChecksCommand(target, probe, true, "probe").checks.expectedDigest,
    "canonical-no-recipe-marker",
  );
});
test("draft, configuration, selection and revision changes invalidate a checks review", () => {
  const base = { text: "[]", digest: "d", revision: 1, selection: preview.selection };
  for (const changed of [
    { text: "[ ]" },
    { digest: "next" },
    { revision: 2 },
    { selection: { kind: "dotnet-probe" as const, executable: "dotnet", cwd: "." } },
  ])
    assert.notEqual(graphChecksReviewKey(base), graphChecksReviewKey({ ...base, ...changed }));
});
test("source or native changes detected by final read require a fresh review, never a run", async () => {
  assert.equal(
    await recheckGraphChecksPreview(
      preview,
      async () => ({ ...preview, digest: "changed", sourceDigest: "new" }),
      () => true,
    ),
    undefined,
  );
  assert.equal(
    await recheckGraphChecksPreview(
      preview,
      async () => preview,
      () => false,
    ),
    undefined,
  );
  assert.equal(
    await recheckGraphChecksPreview(
      preview,
      async () => preview,
      () => true,
    ),
    preview,
  );
});
