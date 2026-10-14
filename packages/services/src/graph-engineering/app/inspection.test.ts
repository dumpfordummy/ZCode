import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import {
  inspectionArguments,
  INSPECTION_PURPOSE,
  zcodeRecipeRequestSchema,
  projectInspectionOutput,
  INSPECTION_PROPERTIES,
  INSPECTION_ITEMS,
} from "@zcode/shared";
import type { ZCodeRecipeSnapshot } from "@zcode/shared";
import type { GraphInspection } from "../inspection-types.js";
import type { GraphInspectionPort } from "./inspection-ports.js";
import type { GraphEvidencePort } from "./ports.js";
import { GraphState } from "./state.js";
import { fixture as legacy, target } from "./legacy.fixture.js";

const selection = {
  project: "Web/Web.csproj",
  configuration: "Debug",
  framework: "net8.0",
  sdkVersion: "8.0.426",
} as const;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const output = () => ({
  Properties: Object.fromEntries(INSPECTION_PROPERTIES.map((key) => [key, ""])),
  Items: Object.fromEntries(INSPECTION_ITEMS.map((key) => [key, []])),
});
function fixture() {
  const base = legacy();
  let history: GraphInspection[] = [],
    starts = 0,
    now = 1000,
    fresh: "current" | "source-changed" | "runtime-changed" = "current";
  let snapshot: ZCodeRecipeSnapshot;
  const port: GraphInspectionPort = {
    read: async () => structuredClone(history),
    write: async (_target, rows) => {
      history = structuredClone(rows);
    },
    review: async (row) => {
      const inspection = {
        ...selection,
        purpose: INSPECTION_PURPOSE,
        sdkDirectory: "C:/dotnet/sdk/8.0.426",
        observationDigest: "a".repeat(64),
        expiresAt: now + 300000,
        observedFiles: 55,
        observedBytes: 456,
      };
      return {
        sessionId: "owned",
        runtimeIdentity: "runtime-1",
        environmentDigest: "env",
        request: zcodeRecipeRequestSchema.parse({
          operationId: row.id,
          inspection,
          recipe: {
            id: INSPECTION_PURPOSE,
            executable: "C:/dotnet/dotnet.exe",
            cwdRelative: ".",
            timeoutMs: 30000,
            args: inspectionArguments(inspection),
          },
        }),
      };
    },
    fresh: async () => fresh,
    start: async (row) => {
      starts++;
      const input = {
        ...target,
        sessionId: row.sessionId!,
        commandId: row.id,
        commandType: "startRecipe",
        expectedRuntimeIdentity: row.runtimeIdentity,
        request: row.request,
      };
      await state.inspections.guard(input);
      await assert.rejects(state.inspections.guard(input), /only its exact/);
      snapshot = {
        operationId: row.id,
        sessionId: row.sessionId!,
        requestDigest: row.requestDigest,
        status: "awaiting_permission",
        processStarted: false,
        inspectionVerifying: true,
      };
      return snapshot;
    },
    inspect: async () => snapshot,
    cancel: async () => ({
      ...snapshot,
      status: "cancelled",
      completedAt: now,
      inspectionOutcome: "cancelled",
    }),
  };
  const make = () =>
    new GraphState({
      repository: base.repository,
      native: base.native,
      inspection: port,
      evidence: { digest } as GraphEvidencePort,
      id: randomUUID,
      now: () => now,
      monotonic: () => now,
    });
  const state = make();
  const command = state.inspections.command.bind(state.inspections);
  const review = () => command({ target, action: "review", selection });
  const start = (row: GraphInspection) =>
    command({ target, action: "start", id: row.id, selection, requestDigest: row.requestDigest! });
  return {
    state,
    port,
    make,
    review,
    start,
    command,
    counts: () => starts,
    history: () => history,
    clock: () => {
      now += 300001;
    },
    fresh: (value: typeof fresh) => {
      fresh = value;
    },
    finish: (value: Partial<ZCodeRecipeSnapshot>) => {
      snapshot = { ...snapshot, inspectionVerifying: false, ...value };
    },
  };
}
test("inspection review is non-executing, immutable, single-use and creates no Graph evidence", async () => {
  const f = fixture(),
    row = await f.review();
  assert.equal(row.status, "review-ready");
  assert.equal(f.counts(), 0);
  assert.equal(row.scopeComplete, false);
  const started = await f.start(row);
  assert.equal(started.status, "verifying-sources");
  assert.equal(f.counts(), 1);
  await assert.rejects(f.start(row), /identity or selection/);
  await assert.rejects(f.state.inspections.assertIdle(target), /owns this workspace/);
  assert.deepEqual(await f.state.inspections.sessions(target), ["owned"]);
  assert.deepEqual((await f.state.load(target)).runs, []);
  f.finish({
    status: "completed",
    completedAt: 2000,
    processStarted: true,
    inspectionOutcome: "succeeded",
    inspectionProjection: projectInspectionOutput(JSON.stringify(output())),
    result: {
      status: "completed",
      exitCode: 0,
      processExitObserved: true,
      cancelled: false,
      durationMs: 100,
      timedOut: false,
      stdout: { text: "", bytes: 0, truncated: false },
      stderr: { text: "", bytes: 0, truncated: false },
    },
  });
  const observed = await f.command({ target, action: "status", id: row.id });
  assert.equal(observed.status, "succeeded");
  assert.equal(observed.reserved, false);
  assert.equal(observed.scopeComplete, false);
  assert.deepEqual((await f.state.load(target)).runs, []);
});
test("denial, cancellation and invalid output release only proven inactive owned inspection", async () => {
  for (const outcome of ["denied", "cancelled", "invalid-output", "failed"] as const) {
    const f = fixture(),
      row = await f.review();
    await f.start(row);
    f.finish({ status: "failed", completedAt: 2000, inspectionOutcome: outcome });
    const observed = await f.command({ target, action: "status", id: row.id });
    assert.equal(observed.status, outcome);
    assert.equal(observed.reserved, false);
    await f.state.inspections.assertIdle(target);
  }
  const f = fixture(),
    row = await f.review();
  assert.equal((await f.command({ target, action: "cancel", id: row.id })).status, "cancelled");
  assert.equal(f.counts(), 0);
});
test("expiry and changed source/runtime/configuration fail before native dispatch", async () => {
  for (const change of ["source-changed", "runtime-changed"] as const) {
    const f = fixture(),
      row = await f.review();
    f.fresh(change);
    assert.equal((await f.start(row)).status, change);
    assert.equal(f.counts(), 0);
  }
  const f = fixture(),
    row = await f.review();
  await assert.rejects(
    f.command({
      target,
      action: "start",
      id: row.id,
      requestDigest: row.requestDigest!,
      selection: { ...selection, configuration: "Release" },
    }),
    /identity or selection/,
  );
  f.clock();
  assert.equal((await f.start(row)).status, "expired");
  assert.equal(f.counts(), 0);
});
test("lost executor reply and Host restart quarantine original operation without replay", async () => {
  const f = fixture(),
    row = await f.review();
  f.port.start = async () => {
    throw Error("lost reply");
  };
  assert.equal((await f.start(row)).status, "executor-lost");
  const cold = f.make();
  assert.equal((await cold.inspections.history(target))[0]!.status, "executor-lost");
  await assert.rejects(cold.inspections.assertIdle(target), /owns this workspace/);
  f.port.inspect = async () => ({
    operationId: row.id,
    sessionId: "owned",
    status: "unknown",
    processStarted: false,
  });
  assert.equal(
    (await cold.inspections.command({ target, action: "status", id: row.id })).reserved,
    true,
  );
  await assert.rejects(f.review(), /owns this workspace/);
});
test("missing capability yields unavailable; unowned inspection and altered request cannot bypass Host", async () => {
  const f = fixture();
  f.port.review = async () => {
    throw Error("old runtime");
  };
  assert.equal((await f.review()).status, "unavailable");
  assert.equal(f.counts(), 0);
  await assert.rejects(
    f.state.inspections.guard({
      ...target,
      sessionId: "unowned",
      commandType: "startRecipe",
      request: { inspection: {} },
    }),
    /no live Host/,
  );
});
test("fixed query rejects targets, environment injection, extra fields and oversized projection", () => {
  const raw = output();
  assert.equal(projectInspectionOutput(JSON.stringify(raw)).scopeComplete, false);
  assert.throws(() =>
    projectInspectionOutput(JSON.stringify({ ...raw, Environment: { SECRET: "not allowed" } })),
  );
  assert.throws(() => projectInspectionOutput(" ".repeat(65537)));
  assert.throws(() => projectInspectionOutput("broken"));
  assert.throws(() =>
    projectInspectionOutput(
      JSON.stringify({
        ...raw,
        Items: { ...raw.Items, Content: [{ Identity: "a", Credential: "no" }] },
      }),
    ),
  );
  assert.equal(
    inspectionArguments({ ...selection, sdkDirectory: "sdk" }).some((arg) =>
      /^-target|^-getTargetResult|^Restore$|^Build$/.test(arg),
    ),
    false,
  );
});

test("frozen query cannot acquire Build targets, custom switches, or environment values", async () => {
  const f = fixture(),
    row = await f.review();
  for (const arg of ["-target:Build", "-getTargetResult:Build", "-restore", "-p:Arbitrary=value"]) {
    const request = structuredClone(row.request!);
    request.recipe.args.push(arg);
    assert.equal(zcodeRecipeRequestSchema.safeParse(request).success, false);
  }
  const request = structuredClone(row.request!);
  request.recipe.redactEnvironmentVariables = ["SYNTHETIC_SECRET"];
  assert.equal(zcodeRecipeRequestSchema.safeParse(request).success, false);
  assert.equal(f.counts(), 0);
});

test("inspection project argument cannot become an MSBuild response file or switch", async () => {
  const f = fixture();
  for (const project of ["@commands.csproj", "-switch.csproj", " @commands.csproj"]) {
    await assert.rejects(
      f.command({ target, action: "review", selection: { ...selection, project } }),
    );
  }
  assert.equal(f.counts(), 0);
});

test("history and cold reconciliation preserve original identity without replay", async () => {
  const f = fixture(),
    row = await f.review();
  await f.start(row);
  const cold = f.make();
  const records = structuredClone(await cold.inspections.history(target));
  assert.equal(records.length, 1);
  assert.equal(records[0]!.id, row.id);
  assert.equal(records[0]!.status, "executor-lost");
  assert.equal(records[0]!.reserved, true);
  assert.equal(f.counts(), 1);
  records[0]!.reserved = false;
  await assert.rejects(cold.inspections.assertIdle(target), /owns this workspace/);
  const observed = await cold.inspections.command({ target, action: "status", id: row.id });
  assert.equal(observed.id, row.id);
  assert.equal(observed.sessionId, "owned");
  assert.equal(f.counts(), 1);
  await cold.inspections.command({ target, action: "cancel", id: row.id });
  await cold.inspections.assertIdle(target);
  assert.equal(f.counts(), 1);
});
