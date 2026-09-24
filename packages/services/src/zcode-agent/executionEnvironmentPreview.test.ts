import assert from "node:assert/strict";
import test from "node:test";
import { unknownExecutionEnvironment } from "@zcode/shared";
import { previewExistingExecutionEnvironment } from "./executionEnvironmentPreview.js";

test("cold preview has no process-start dependency and never requests native work", async () => {
  const result = await previewExistingExecutionEnvironment(undefined, {
    workspacePath: "synthetic",
    workspaceKey: "synthetic",
  });
  assert.equal(result.status, "unknown");
  assert.match(result.unknowns[0] ?? "", /did not start/);
});
test("existing preview uses only exact metadata RPC and old or failed clients remain unknown", async () => {
  const workspace = { workspacePath: "synthetic", workspaceKey: "synthetic" };
  const expected = unknownExecutionEnvironment("fixture");
  const calls: unknown[] = [];
  const request = async (...args: unknown[]) => {
    calls.push(args.slice(0, 2));
    return expected;
  };
  const client = { isDisposed: false, request } as unknown as Parameters<
    typeof previewExistingExecutionEnvironment
  >[0];
  assert.deepEqual(await previewExistingExecutionEnvironment(client, workspace), expected);
  assert.deepEqual(calls, [["workspace/previewExecutionEnvironment", { workspace }]]);
  await previewExistingExecutionEnvironment(client, workspace, ["fixture-tool"]);
  assert.deepEqual(calls[1], [
    "workspace/previewExecutionEnvironment",
    { workspace, executables: ["fixture-tool"] },
  ]);
  const failed = {
    isDisposed: false,
    request: async () => {
      throw new Error("private secret");
    },
  } as unknown as NonNullable<typeof client>;
  assert.equal((await previewExistingExecutionEnvironment(failed, workspace)).status, "unknown");
  assert.ok(
    !JSON.stringify(await previewExistingExecutionEnvironment(failed, workspace)).includes(
      "private secret",
    ),
  );
});
