// Z8.3-R1: Graph native-runtime capability evaluation and the admission gate adapter.
// The evaluator and requirement set are the real production modules. The "runtime" used here is a
// synthetic response built from the requirement set plus extras; the pairing with the real agent-side
// builder is proven in packages/services/test/graphUpstreamContract.test.ts.
import assert from "node:assert/strict";
import test from "node:test";
import { ZCODE_NATIVE_CONTRACT_KEY } from "@zcode/shared";
import {
  evaluateGraphNativeRuntime,
  GRAPH_NATIVE_REQUIREMENTS,
  GraphRuntimeIncompatibleError,
  type GraphRuntimeFailure,
  type GraphRuntimeProbe,
} from "../domain/native-runtime-contract.js";
import { createGraphRuntimeGate } from "./runtime-gate.js";

const R = GRAPH_NATIVE_REQUIREMENTS;
const allMethods = [...R.sessionMethods, ...R.recipeMethods];
function response(
  patch: {
    protocol?: Partial<typeof R.protocol>;
    methods?: string[];
    commands?: string[];
    features?: string[];
    plan?: unknown;
    contract?: unknown;
    extra?: Record<string, unknown>;
  } = {},
): GraphRuntimeProbe {
  const contract =
    "contract" in patch
      ? patch.contract
      : {
          protocol: { ...R.protocol, ...patch.protocol },
          methods: patch.methods ?? [...allMethods],
          commands: patch.commands ?? [...R.commands],
          features: patch.features ?? [...R.features],
        };
  return {
    kind: "response",
    value: {
      independentPlanState: "plan" in patch ? patch.plan : true,
      [ZCODE_NATIVE_CONTRACT_KEY]: contract,
      ...patch.extra,
    },
  };
}
const failures = (probe: GraphRuntimeProbe): GraphRuntimeFailure[] => {
  const verdict = evaluateGraphNativeRuntime(probe);
  return verdict.compatible ? [] : verdict.diagnostic.failures;
};
const classes = (probe: GraphRuntimeProbe) => failures(probe).map((f) => f.class);

test("a runtime that provides every required name is accepted, including unknown extra capabilities", () => {
  assert.deepEqual(evaluateGraphNativeRuntime(response()), { compatible: true });
  assert.deepEqual(
    evaluateGraphNativeRuntime(
      response({
        methods: [...allMethods, "future/method"],
        commands: [...R.commands, "futureCommand"],
        features: [...R.features, "future.feature"],
        extra: { unknownTopLevel: 1 },
      }),
    ),
    { compatible: true },
  );
  const probe = response();
  const contract = (probe as { value: Record<string, Record<string, unknown>> }).value[
    ZCODE_NATIVE_CONTRACT_KEY
  ]!;
  contract.futureKey = { anything: true };
  assert.deepEqual(evaluateGraphNativeRuntime(probe), { compatible: true });
});

test("old runtimes fail closed: no method, no metadata, or an empty answer", () => {
  assert.deepEqual(classes({ kind: "unsupported" }), ["capabilities-unavailable"]);
  // Chat-era runtime: answers runtime/capabilities but predates the contract key.
  assert.deepEqual(classes({ kind: "response", value: { independentPlanState: true } }), [
    "capabilities-unavailable",
  ]);
  assert.deepEqual(classes({ kind: "response", value: {} }), [
    "capabilities-unavailable",
    "plan-state",
  ]);
  assert.deepEqual(classes({ kind: "failed" }), ["probe-failed"]);
});

test("protocol identity, protocol version and wire version are exact", () => {
  assert.deepEqual(classes(response({ protocol: { name: "Other Protocol" } })), [
    "protocol-identity",
  ]);
  assert.deepEqual(classes(response({ protocol: { version: R.protocol.version - 1 } })), [
    "protocol-version",
  ]);
  assert.deepEqual(
    classes(response({ protocol: { v4WireVersion: R.protocol.v4WireVersion + 1 } })),
    ["wire-version"],
  );
  const old = failures(response({ protocol: { v4WireVersion: R.protocol.v4WireVersion - 1 } }))[0]!;
  assert.equal(old.expected, String(R.protocol.v4WireVersion));
  assert.equal(old.observed, String(R.protocol.v4WireVersion - 1));
});

test("every required session method, recipe method, command and feature is individually required", () => {
  for (const name of R.sessionMethods)
    assert.deepEqual(
      failures(response({ methods: allMethods.filter((m) => m !== name) })),
      [{ class: "missing-method", expected: name, observed: "absent" }],
      name,
    );
  for (const name of R.recipeMethods)
    assert.deepEqual(
      failures(response({ methods: allMethods.filter((m) => m !== name) })),
      [{ class: "missing-method", expected: name, observed: "absent" }],
      name,
    );
  for (const name of R.commands)
    assert.deepEqual(
      failures(response({ commands: R.commands.filter((c) => c !== name) })),
      [{ class: "missing-command", expected: name, observed: "absent" }],
      name,
    );
  for (const name of R.features)
    assert.deepEqual(
      failures(response({ features: [] })),
      [{ class: "missing-feature", expected: name, observed: "absent" }],
      name,
    );
});

test("independent plan state must be exactly true, with or without the contract", () => {
  for (const plan of [undefined, false, "yes"])
    assert.deepEqual(classes(response({ plan })), ["plan-state"], String(plan));
  assert.equal(failures(response({ plan: "yes" }))[0]!.observed, "<invalid>");
});

test("malformed capability responses fail closed", () => {
  for (const contract of [
    "nope",
    null,
    [],
    {},
    { protocol: R.protocol },
    { protocol: { ...R.protocol, version: "1" }, methods: [], commands: [], features: [] },
    { protocol: R.protocol, methods: "all", commands: [], features: [] },
    { protocol: R.protocol, methods: [1], commands: [], features: [] },
    { protocol: R.protocol, methods: Array(257).fill("m"), commands: [], features: [] },
  ])
    assert.deepEqual(classes(response({ contract })), ["capabilities-malformed"], String(contract));
  for (const value of [null, "text", 7])
    assert.deepEqual(
      classes({ kind: "response", value }),
      ["capabilities-malformed"],
      String(value),
    );
});

test("diagnostics are bounded safe metadata and never echo runtime-provided content", () => {
  const canary = "C:\\Users\\private\\token=SYNTHETIC_CANARY";
  const probe = response({
    protocol: { name: canary as never, version: 99, v4WireVersion: 1.5 },
    methods: [canary],
    commands: [canary],
    features: [canary],
    plan: canary,
  });
  const verdict = evaluateGraphNativeRuntime(probe);
  assert.equal(verdict.compatible, false);
  if (verdict.compatible) return;
  const error = new GraphRuntimeIncompatibleError(verdict.diagnostic);
  const text = `${error.message}\n${JSON.stringify(error.diagnostic)}`;
  assert.ok(!text.includes("SYNTHETIC_CANARY") && !text.includes("Users"));
  assert.ok(error.diagnostic.failures.length <= 8);
  assert.ok(error.message.length <= 600);
  assert.equal(error.name, "GraphRuntimeIncompatible");
  assert.ok(
    error.diagnostic.failures.every(
      (f) => f.observed.length <= 48 && f.expected.length <= 128 && /^[^\\]*$/.test(f.observed),
    ),
  );
  const identity = error.diagnostic.failures.find((f) => f.class === "protocol-identity")!;
  assert.deepEqual([identity.expected, identity.observed], [R.protocol.name, "<invalid>"]);
  assert.equal(
    error.diagnostic.failures.find((f) => f.class === "wire-version")!.observed,
    "<invalid>",
  );
  // A plain, safe observed name is reported verbatim so the operator can see what was found.
  assert.equal(
    failures(response({ protocol: { name: "Old Agent Protocol" } }))[0]!.observed,
    "Old Agent Protocol",
  );
  // Everything missing: capped, with the overflow counted rather than listed.
  const nothing = evaluateGraphNativeRuntime(response({ methods: [], commands: [], features: [] }));
  assert.equal(nothing.compatible, false);
  if (!nothing.compatible) {
    assert.equal(nothing.diagnostic.failures.length, 8);
    assert.equal(
      nothing.diagnostic.omitted,
      allMethods.length + R.commands.length + R.features.length - 8,
    );
    assert.match(new GraphRuntimeIncompatibleError(nothing.diagnostic).message, /\+\d+ more/);
  }
});

function gate(
  read: () => Promise<unknown>,
  init: { available: boolean; reason?: string } = { available: true },
) {
  const calls: string[] = [];
  const initializations: unknown[] = [];
  const instance = createGraphRuntimeGate({
    sessionService: {
      async initializeWorkspace(params: unknown) {
        initializations.push(params);
        calls.push("initialize");
        return { workspaceKey: "k", ...init } as never;
      },
    },
    agentService: {
      async readRuntimeCapabilities() {
        calls.push("capabilities");
        return (await read()) as never;
      },
    },
  });
  return { instance, calls, initializations };
}
const target = { workspacePath: "C:/synthetic/r1" };
const supported = (probe: GraphRuntimeProbe) =>
  probe.kind === "response" ? { supported: true, capabilities: probe.value } : { supported: false };

test("the gate initializes like the matching create() and accepts a compatible runtime", async () => {
  const g = gate(async () => supported(response()));
  await g.instance.require(target, "model");
  await g.instance.require(target, "tool");
  assert.deepEqual(g.initializations, [target, { ...target, purpose: "native-recipe" }]);
  assert.deepEqual(g.calls, ["initialize", "capabilities", "initialize", "capabilities"]);
});

test("the gate rejects an old or mismatched runtime with the typed error", async () => {
  for (const reply of [
    { supported: false },
    supported(response({ protocol: { name: "Other Protocol" } })),
    supported(response({ methods: [] })),
    supported({ kind: "response", value: { independentPlanState: true } }),
  ])
    await assert.rejects(
      gate(async () => reply).instance.require(target, "model"),
      (error: unknown) =>
        error instanceof GraphRuntimeIncompatibleError &&
        error.name === "GraphRuntimeIncompatible" &&
        /not compatible/.test(error.message),
    );
});

test("a failing probe is an incompatibility without the transport error text; init failures are not probed", async () => {
  await assert.rejects(
    gate(async () => {
      throw new Error("ECONNRESET at C:\\Users\\private\\agent.sock SYNTHETIC_CANARY");
    }).instance.require(target, "model"),
    (error: unknown) =>
      error instanceof GraphRuntimeIncompatibleError &&
      error.diagnostic.failures[0]!.class === "probe-failed" &&
      !`${error.message}${JSON.stringify(error.diagnostic)}`.includes("SYNTHETIC_CANARY"),
  );
  const unavailable = gate(async () => supported(response()), {
    available: false,
    reason: "Provider is not ready.",
  });
  await assert.rejects(unavailable.instance.require(target, "model"), /Provider is not ready/);
  assert.deepEqual(unavailable.calls, ["initialize"]);
});
