import assert from "node:assert/strict";
import { test } from "node:test";
import { unknownExecutionEnvironment } from "@zcode/shared";
import { routingFixture } from "./routing.fixture.js";
import { target, selection } from "./sequential.fixture.js";
import { compileChecksDefinition } from "../domain/project-checks.js";
import type { GraphChecksPreview } from "../project-setup-types.js";
import { recordSchema } from "../domain/record.js";
import { GRAPH_CHECKS_ADMISSION_REJECTED } from "../checks-types.js";

async function fixture() {
  const f = routingFixture();
  await f.prepare();
  const checkSelection = { kind: "dotnet-probe" as const, executable: "dotnet", cwd: "." };
  const compiled = compileChecksDefinition(checkSelection, [], 1);
  const digest = (s: string) => f.options.evidence!.digest(s);
  const preview: GraphChecksPreview = {
    kind: "checks-preview",
    version: 1,
    digest: digest("preview"),
    revision: 1,
    recipeDigest: digest("marker"),
    sourceDigest: digest("source"),
    selection: checkSelection,
    ...compiled,
    environment: { ...unknownExecutionEnvironment("fixture"), status: "available" },
    effects: ["Explicit --version"],
    unknowns: ["fixture unknown"],
  };
  f.options.checks = { capture: async () => structuredClone(preview) };
  const command = {
    action: "checks" as const,
    target,
    revision: 1,
    requestId: "checks-request",
    modelSelection: selection,
    mode: "build" as const,
    checks: {
      selection: checkSelection,
      expectedDigest: preview.recipeDigest,
      digest: preview.digest,
      acknowledgedUnknowns: true,
    },
  };
  return { ...f, preview, command };
}
test("checks preserve design and one native intent after lost creation ACK, with strict cold purpose", async () => {
  const f = await fixture();
  const before = f.saved().definition;
  let creates = 0;
  f.options.recipes!.read = async () => {
    throw new Error("unrelated malformed recipes");
  };
  f.options.tools!.create = async () => {
    creates++;
    assert.equal(f.saved().runs.at(-1)!.version, 4);
    assert.deepEqual(f.saved().definition, before);
    throw new Error("synthetic lost native creation reply");
  };
  const run = await f.service.run(f.command);
  assert.equal(run.status, "Unknown");
  assert.equal(run.version !== undefined && run.purpose?.kind, "checks");
  assert.equal((await f.service.run(f.command)).id, run.id);
  assert.equal(creates, 1);
  assert.equal(f.creates.length, 0);
  assert.deepEqual(f.saved().definition, before);
  await assert.rejects(
    f.service.run({ ...f.command, checks: { ...f.command.checks, digest: "a".repeat(64) } }),
    /same Run/i,
  );
  await assert.rejects(f.service.run({ ...f.command, requestId: "another" }), /unresolved/i);
  const cold = { version: 5, workspaceKey: target.workspacePath, ...f.saved() };
  assert.equal(recordSchema.safeParse(cold).success, true);
  const changed = structuredClone(cold);
  const stored = changed.runs.at(-1)!;
  if (stored.version !== undefined && stored.purpose)
    stored.purpose.preview.recipes[0]!.args.push("--info");
  assert.equal(recordSchema.safeParse(changed).success, false);
  await f.service.dispose();
});
test("stale review, unknowns, revision and first-write failure perform zero native work", async () => {
  for (const failure of ["digest", "unknown", "revision", "write", "dispatch-drift"]) {
    const f = await fixture();
    let creates = 0,
      captures = 0;
    f.options.tools!.create = async () => {
      creates++;
      throw new Error("must not create");
    };
    const command = structuredClone(f.command);
    if (failure === "digest") command.checks.digest = "a".repeat(64);
    if (failure === "unknown") command.checks.acknowledgedUnknowns = false;
    if (failure === "revision") command.revision++;
    if (failure === "write")
      f.options.repository.write = async () => {
        throw new Error("synthetic first write failed");
      };
    if (failure === "dispatch-drift")
      f.options.checks!.capture = async () => ({
        ...f.preview,
        digest: ++captures === 1 ? f.preview.digest : "a".repeat(64),
      });
    if (failure === "dispatch-drift") assert.equal((await f.service.run(command)).status, "Failed");
    else
      await assert.rejects(f.service.run(command), (error: Error) => {
        assert.equal(error.name === GRAPH_CHECKS_ADMISSION_REJECTED, failure !== "write");
        return true;
      });
    assert.equal(creates, 0);
    assert.equal(f.sends.length, 0);
    assert.equal(f.saved().runs.length, failure === "dispatch-drift" ? 1 : 0);
    await f.service.dispose();
  }
});
test("source/config drift during native create keeps exact session ownership and makes zero starts", async () => {
  const f = await fixture();
  let changed = false,
    starts = 0;
  f.options.checks!.capture = async () => ({
    ...f.preview,
    digest: changed ? "a".repeat(64) : f.preview.digest,
  });
  f.options.tools!.create = async () => {
    changed = true;
    return { sessionId: "created-tool-session", runtimeIdentity: "exact-native-runtime" };
  };
  f.options.tools!.start = async () => {
    starts++;
    throw new Error("must not dispatch");
  };
  const run = await f.service.run(f.command);
  assert.equal(run.status, "Unknown");
  assert.equal(starts, 0);
  assert.equal(
    run.version !== undefined && run.toolAttempts![0]!.sessionId,
    "created-tool-session",
  );
  assert.ok((await f.service.protectedSessionIds(target)).includes("created-tool-session"));
  assert.equal((await f.service.run(f.command)).id, run.id);
  assert.equal(starts, 0);
  await f.service.dispose();
});
