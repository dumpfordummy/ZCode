import assert from "node:assert/strict";
import test from "node:test";
import { observeRecipePermission } from "../../apps/zcode-cli/packages/bootstrap/src/zcode-protocol/recipe-phase-observation.ts";
test("permission diagnostics are opt-in, private, bounded and cannot alter permission execution", () => {
  const original = console.error,
    rows = [];
  const request = {
    toolName: "GraphRecipe",
    toolCallId: "11111111-2222-4333-8444-555555555555",
    input: { secret: "must-not-appear", path: "private-path" },
  };
  try {
    console.error = (line) => rows.push(line);
    observeRecipePermission(false, request, "permission-request");
    observeRecipePermission(true, { ...request, toolName: "Other" }, "permission-request");
    observeRecipePermission(true, { ...request, toolCallId: "private-path" }, "permission-request");
    assert.equal(rows.length, 0);
    observeRecipePermission(true, request, "permission-request");
    observeRecipePermission(true, request, "permission-response");
    for (const [i, raw] of rows.entries()) {
      const row = JSON.parse(raw.slice("[graph-phase]".length));
      assert.deepEqual(Object.keys(row).sort(), ["clock", "operationId", "phase", "timeMs"]);
      assert.equal(row.operationId, request.toolCallId);
      assert.equal(row.phase, i === 0 ? "permission-request" : "permission-response");
      assert.equal(row.clock, "native-monotonic");
      assert.ok(Number.isFinite(row.timeMs));
      assert.ok(!raw.includes("secret") && !raw.includes("private-path"));
    }
    console.error = () => {
      throw Error("diagnostic sink failed");
    };
    assert.doesNotThrow(() => observeRecipePermission(true, request, "permission-response"));
    console.error = (line) => rows.push(line);
    for (let i = 0; i < 5000; i++) observeRecipePermission(true, request, "permission-request");
    assert.ok(rows.length <= 4096);
    const size = rows.length;
    observeRecipePermission(true, request, "permission-response");
    assert.equal(rows.length, size);
  } finally {
    console.error = original;
  }
});
