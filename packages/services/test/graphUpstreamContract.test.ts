// Z8.3-R1 upstream-compatibility contract suite.
// It covers only the upstream boundaries Graph relies on (see docs/graph-engineering/z8/Z8_3_R1_SPEC.md and
// Z8_3_R1_UPSTREAM_MERGE_CHECKLIST.md). It is NOT a snapshot of the native API. Real shared parsers, the real
// V4 interaction registry, the real agent-side declaration builder and the real Host evaluator are used.
// The few literals in FROZEN are the contract Graph was built against; changing one must be a reviewed decision.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { z } from "zod";
import {
  ZCODE_PROTOCOL_NAME,
  ZCODE_PROTOCOL_V4_WIRE_VERSION,
  ZCODE_PROTOCOL_VERSION,
  zcodeNativeContractSchema,
  zcodeProtocolMethods,
  zcodeProtocolSessionMethodContracts,
  zcodeRecipeSnapshotSchema,
  zcodeSessionStateSnapshotSchema,
  zcodeWorkspaceUpdateInteractionPreferencesParamsSchema,
} from "@zcode/shared";
import {
  commandTypeSchema,
  parseCommandEnvelope,
  V4_METHODS,
  V4_WIRE_PROTOCOL_VERSION,
} from "@zcode/shared/zcode-protocol-v4";
import { fixture } from "../src/graph-engineering/adapters/native.fixture.js";
import { createGraphToolPort } from "../src/graph-engineering/adapters/tools.js";
import {
  evaluateGraphNativeRuntime,
  GRAPH_NATIVE_REQUIREMENTS,
} from "../src/graph-engineering/domain/native-runtime-contract.js";
import { buildNativeContract } from "../../../apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/native-contract.js";
import { V4InteractionRegistry } from "../../../apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/interaction-registry.js";

const repoRoot = join(import.meta.dirname, "../../..");
const handlersDir = join(
  repoRoot,
  "apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers",
);

/** The contract Graph was built against. Literal on purpose: a consistent upstream rename must still turn this red. */
const FROZEN = {
  protocol: { name: "ZCode Protocol", version: 1, v4WireVersion: 3 },
  sessionMethods: [
    "session/create",
    "v4/conversation/subscribe",
    "v4/command",
    "workspace/updateInteractionPreferences",
  ],
  recipeMethods: ["session/recipe/start", "session/recipe/inspect", "session/recipe/cancel"],
  commands: ["sendText", "stop", "resolveInteraction"],
  features: ["interaction.protectedSessions"],
};

/** Command types with a native handler, read from the handler registry sources (the registry itself needs built packages). */
async function nativeHandlerCommands(): Promise<string[]> {
  const names = new Set<string>();
  for (const file of await readdir(handlersDir)) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts") || file === "index.ts") continue;
    const text = (await readFile(join(handlersDir, file), "utf8")).replace(/\s+/g, " ");
    for (const match of text.matchAll(/export const \w+Handlers = \{([^}]*)\}/g))
      for (const entry of match[1]!.split(","))
        if (entry.trim()) names.add(entry.trim().split(/[\s:]/)[0]!);
  }
  return [...names];
}

const uuid = "11111111-1111-4111-8111-111111111111";
const recipeSnapshot = {
  operationId: uuid,
  sessionId: "session",
  status: "completed",
  processStarted: true,
  startedAt: 1,
  completedAt: 2,
  result: {
    processExitObserved: true,
    status: "completed",
    exitCode: 0,
    stdout: { text: "ok", bytes: 2, truncated: false },
    stderr: { text: "", bytes: 0, truncated: false },
    durationMs: 3,
    timedOut: false,
    cancelled: false,
  },
};

interface BoundaryView {
  identity: { name: string; version: number; v4WireVersion: number; domainWire: number };
  snapshotProtocol: z.ZodTypeAny;
  methodTable: Record<string, string>;
  recipeContracts: Record<string, { params: z.ZodTypeAny; result: z.ZodTypeAny }>;
  recipeSample: unknown;
  advertised: unknown;
  protectsGraphQuestion: () => Promise<boolean>;
}

/** One audit used by both the real run and the seeded-mutation proofs. */
async function boundaryViolations(view: BoundaryView): Promise<string[]> {
  const out: string[] = [];
  const { identity } = view;
  if (
    identity.name !== FROZEN.protocol.name ||
    identity.version !== FROZEN.protocol.version ||
    identity.v4WireVersion !== FROZEN.protocol.v4WireVersion ||
    identity.domainWire !== FROZEN.protocol.v4WireVersion
  )
    out.push("protocol identity or wire version differs from the Graph-built contract");
  if (
    !view.snapshotProtocol.safeParse({
      name: FROZEN.protocol.name,
      version: FROZEN.protocol.version,
    }).success
  )
    out.push("session/create result no longer accepts the Graph protocol identity");
  if (view.snapshotProtocol.safeParse({ name: FROZEN.protocol.name, version: 0 }).success)
    out.push("session/create result accepts an older protocol version");
  const wire = new Set(Object.values(view.methodTable));
  for (const method of [...FROZEN.sessionMethods, ...FROZEN.recipeMethods])
    if (!wire.has(method)) out.push(`protocol method ${method} is not defined`);
  for (const method of FROZEN.recipeMethods) {
    const contract = view.recipeContracts[method];
    if (!contract) out.push(`recipe method ${method} has no parameter/result contract`);
    else if (!contract.result.safeParse(view.recipeSample).success)
      out.push(`recipe method ${method} no longer parses the snapshot Graph reads`);
  }
  const advertised = zcodeNativeContractSchema.safeParse(view.advertised);
  if (!advertised.success) out.push("the runtime declaration is unreadable");
  else {
    const verdict = evaluateGraphNativeRuntime({
      kind: "response",
      value: { independentPlanState: true, nativeContract: view.advertised },
    });
    if (!verdict.compatible)
      out.push(
        `the runtime declaration is rejected by the Host: ${verdict.diagnostic.failures.map((f) => `${f.class}:${f.expected}`).join(",")}`,
      );
  }
  if (!(await view.protectsGraphQuestion()))
    out.push("protected sessions no longer prevent automatic question answers");
  return out;
}

async function protectsWith(
  registry: {
    setAskUserQuestionAutoResolutionEnabled(...args: any[]): Promise<number>;
    register(...args: any[]): unknown;
    has(id: string): boolean;
  },
  tick: () => void,
) {
  await registry.setAskUserQuestionAutoResolutionEnabled(true, ["graph"]);
  let answered = false;
  registry.register("q", () => (answered = true), { sessionId: "graph", kind: "askUserQuestion" });
  tick();
  return !answered && registry.has("q");
}

async function realView(t: {
  mock: { timers: { enable(o: object): void; tick(ms: number): void } };
}): Promise<BoundaryView> {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1 });
  return {
    identity: {
      name: ZCODE_PROTOCOL_NAME,
      version: ZCODE_PROTOCOL_VERSION,
      v4WireVersion: ZCODE_PROTOCOL_V4_WIRE_VERSION,
      domainWire: V4_WIRE_PROTOCOL_VERSION,
    },
    snapshotProtocol: zcodeSessionStateSnapshotSchema.shape.protocol,
    methodTable: { ...zcodeProtocolMethods, ...V4_METHODS },
    recipeContracts: zcodeProtocolSessionMethodContracts as never,
    recipeSample: recipeSnapshot,
    advertised: buildNativeContract(await nativeHandlerCommands()),
    protectsGraphQuestion: () =>
      protectsWith(new V4InteractionRegistry({ hiddenGraceMs: 5, autoResolutionMs: 20 }), () =>
        t.mock.timers.tick(100),
      ),
  };
}

test("the Graph requirement set is exactly the frozen contract, and real constants still provide it", () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(GRAPH_NATIVE_REQUIREMENTS)),
    JSON.parse(JSON.stringify(FROZEN)),
  );
});

test("the real boundary passes the audit: identity, methods, recipe parsing, declaration, interaction registry", async (t) => {
  assert.deepEqual(await boundaryViolations(await realView(t)), []);
});

test("seeded breaking changes turn the audit red", async (t) => {
  const real = await realView(t);
  const mutations: Array<[string, (v: BoundaryView) => BoundaryView, RegExp]> = [
    [
      "required recipe method removed from the protocol table",
      (v) => {
        const { sessionRecipeInspect: _removed, ...rest } = v.methodTable;
        return { ...v, methodTable: rest };
      },
      /session\/recipe\/inspect is not defined/,
    ],
    [
      "recipe method renamed (contract keyed by the old name is gone)",
      (v) => {
        const { "session/recipe/cancel": cancel, ...rest } = v.recipeContracts;
        return { ...v, recipeContracts: { ...rest, "session/recipe/abort": cancel! } };
      },
      /session\/recipe\/cancel has no parameter/,
    ],
    [
      "recipe response shape changed (status vocabulary)",
      (v) => ({ ...v, recipeSample: { ...recipeSnapshot, status: "done" } }),
      /no longer parses the snapshot/,
    ],
    [
      "older incompatible protocol identity reported by the runtime",
      (v) => {
        const advertised = structuredClone(v.advertised) as { protocol: { version: number } };
        advertised.protocol.version = 0;
        return { ...v, advertised };
      },
      /rejected by the Host: protocol-version/,
    ],
    [
      "required interaction feature removed from the declaration",
      (v) => {
        const advertised = structuredClone(v.advertised) as { features: string[] };
        advertised.features = [];
        return { ...v, advertised };
      },
      /missing-feature:interaction\.protectedSessions/,
    ],
    [
      "protocol schema moved to a new version",
      (v) => ({
        ...v,
        snapshotProtocol: z.object({
          name: z.literal(FROZEN.protocol.name),
          version: z.literal(2),
        }),
      }),
      /no longer accepts the Graph protocol identity/,
    ],
    [
      "interaction registry stops protecting sessions",
      (v) => ({
        ...v,
        protectsGraphQuestion: async () => {
          class Broken extends V4InteractionRegistry {
            override async setAskUserQuestionAutoResolutionEnabled(enabled: boolean) {
              return super.setAskUserQuestionAutoResolutionEnabled(enabled); // drops the protected list
            }
          }
          return protectsWith(new Broken({ hiddenGraceMs: 5, autoResolutionMs: 20 }), () =>
            t.mock.timers.tick(100),
          );
        },
      }),
      /protected sessions no longer prevent/,
    ],
    [
      "wire version bumped",
      (v) => ({ ...v, identity: { ...v.identity, domainWire: 4 } }),
      /identity or wire version/,
    ],
  ];
  for (const [name, mutate, expected] of mutations) {
    const violations = await boundaryViolations(mutate(real));
    assert.ok(
      violations.some((v) => expected.test(v)),
      `${name}: ${JSON.stringify(violations)}`,
    );
  }
});

test("a command handler dropped upstream is rejected by the Host before Graph relies on it", async () => {
  const commands = await nativeHandlerCommands();
  for (const required of FROZEN.commands)
    assert.ok(commands.includes(required), `${required} has a native handler`);
  const without = commands.filter((c) => c !== "resolveInteraction");
  const verdict = evaluateGraphNativeRuntime({
    kind: "response",
    value: { independentPlanState: true, nativeContract: buildNativeContract(without) },
  });
  assert.equal(verdict.compatible, false);
  assert.deepEqual(
    !verdict.compatible && verdict.diagnostic.failures.map((f) => [f.class, f.expected]),
    [["missing-command", "resolveInteraction"]],
  );
});

test("Graph's real outbound recipe requests parse with the shared recipe contracts", async () => {
  const sent: Array<[string, unknown]> = [];
  const snapshot = zcodeRecipeSnapshotSchema.parse(recipeSnapshot);
  const tool = createGraphToolPort({
    agentService: {
      async getWorkspaceRuntimeIdentity() {
        return { generation: 1, identity: "runtime", workspaceKey: "k" };
      },
      async startRecipe(params: unknown) {
        sent.push([
          zcodeProtocolMethods.sessionRecipeStart,
          { sessionId: "session", request: (params as { request: unknown }).request },
        ]);
        return snapshot;
      },
      async inspectRecipe(params: { operationId: string }) {
        sent.push([
          zcodeProtocolMethods.sessionRecipeInspect,
          { sessionId: "session", operationId: params.operationId },
        ]);
        return snapshot;
      },
      async cancelRecipe(params: { operationId: string }) {
        sent.push([
          zcodeProtocolMethods.sessionRecipeCancel,
          { sessionId: "session", operationId: params.operationId },
        ]);
        return snapshot;
      },
    },
    sessionService: {} as never,
  });
  const workspace = { workspacePath: "C:/synthetic/r1-tools" };
  const attempt = {
    sessionId: "session",
    runtimeIdentity: "runtime",
    operationId: uuid,
    resolvedArgs: ["--version"],
    recipe: { id: "r", executable: "tool", cwd: ".", timeoutMs: 1000 },
  } as never;
  await tool.start(workspace, attempt);
  await tool.inspect(workspace, attempt);
  await tool.cancel(workspace, attempt);
  assert.equal(sent.length, 3);
  const contracts = zcodeProtocolSessionMethodContracts as Record<string, { params: z.ZodTypeAny }>;
  for (const [method, params] of sent)
    assert.ok(contracts[method]!.params.safeParse(params).success, `${method} request parses`);
  // Strictness Graph depends on: an unexpected request field is rejected rather than silently dropped.
  assert.equal(
    contracts[zcodeProtocolMethods.sessionRecipeStart]!.params.safeParse({
      ...(sent[0]![1] as object),
      extra: 1,
    }).success,
    false,
  );
});

test("Graph's real outbound conversation commands parse with the shared command contract", async () => {
  const f = fixture();
  const subscription = await f.observe();
  await f.port.send(f.run);
  assert.equal(f.subscriptions[0]!.visibility, "background");
  f.emit(
    [
      {
        op: "row.appended",
        row: {
          kind: "turnHeader",
          rowId: 1,
          turnId: "turn",
          sourceCommandId: "input",
          origin: "userInput",
          state: "running",
          startedAt: 1,
          createdAt: 1,
          createdAtSeq: 1,
        },
      },
      {
        op: "state.updated",
        patch: {
          control: {
            ...f.snapshot.control,
            activeWorks: [
              { kind: "primaryTurn", foregroundExecutionId: "execution", startedAt: 1 },
            ],
          },
        },
      },
    ],
    0,
    1,
  );
  // Notification boundary: the frame shapes Graph's orchestration reads yield a running fact with the foreground id.
  assert.equal(f.facts.at(-1)?.state, "running");
  assert.equal(f.facts.at(-1)?.foregroundExecutionId, "execution");
  await f.port.cancel({ ...f.run, foregroundExecutionId: "execution" });
  assert.deepEqual(
    f.commands.map((c) => c.envelope.type),
    ["sendText", "stop"],
  );
  for (const command of f.commands) {
    const parsed = parseCommandEnvelope(command.envelope);
    assert.equal(parsed.ok, true, command.envelope.type);
    assert.ok(commandTypeSchema.safeParse(command.envelope.type).success);
  }
  assert.ok(commandTypeSchema.safeParse("resolveInteraction").success);
  subscription.dispose();
});

test("interaction preferences keep the protectedSessionIds request field Graph sends", () => {
  const params = {
    workspace: { workspacePath: "C:/synthetic/r1", workspaceKey: "k" },
    preferences: { askUserQuestionAutoResolutionEnabled: true },
    protectedSessionIds: ["graph-session"],
  };
  const parsed = zcodeWorkspaceUpdateInteractionPreferencesParamsSchema.safeParse(params);
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
  assert.deepEqual(parsed.data?.protectedSessionIds, ["graph-session"]);
});

test("the real agent-side declaration is accepted by the Host evaluator, and removing any required name is not", async () => {
  const declaration = buildNativeContract(await nativeHandlerCommands());
  const accept = (contract: unknown, plan: unknown = true) =>
    evaluateGraphNativeRuntime({
      kind: "response",
      value: { independentPlanState: plan, nativeContract: contract },
    });
  assert.deepEqual(accept(declaration), { compatible: true });
  assert.equal(accept(declaration, false).compatible, false);
  for (const key of ["methods", "commands", "features"] as const)
    for (const name of declaration[key]) {
      const verdict = accept({ ...declaration, [key]: declaration[key].filter((n) => n !== name) });
      const required = [
        ...FROZEN.sessionMethods,
        ...FROZEN.recipeMethods,
        ...FROZEN.commands,
        ...FROZEN.features,
      ];
      assert.equal(verdict.compatible, !required.includes(name), `${key}:${name}`);
    }
});
