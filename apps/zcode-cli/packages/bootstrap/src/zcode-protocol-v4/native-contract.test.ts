// Z8.3-R1 producer side: what the agent declares in runtime/capabilities.nativeContract must be true.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { zcodeNativeContractFeatures, zcodeNativeContractSchema } from "@zcode/shared";
import { V4_WIRE_PROTOCOL_VERSION } from "@zcode/shared/zcode-protocol-v4";
import { V4InteractionRegistry } from "./interaction-registry.js";
import {
  buildNativeContract,
  NATIVE_CONTRACT_FEATURES,
  NATIVE_CONTRACT_METHODS,
} from "./native-contract.js";

test("the declaration parses with the shared schema and reports the real protocol identity", () => {
  const contract = zcodeNativeContractSchema.parse(buildNativeContract(["sendText", "stop"]));
  assert.equal(contract.protocol.name, "ZCode Protocol");
  assert.equal(contract.protocol.v4WireVersion, V4_WIRE_PROTOCOL_VERSION);
  assert.deepEqual(contract.commands, ["sendText", "stop"]);
  assert.deepEqual(contract.methods, [...NATIVE_CONTRACT_METHODS]);
  assert.deepEqual(contract.features, [...NATIVE_CONTRACT_FEATURES]);
});

test("every advertised method has a dispatch case in the protocol server", async () => {
  // The server cannot be constructed under the portable runner (its handler modules need built
  // workspace packages), so the dispatch table is cross-checked as source text.
  const source = (await readFile(new URL("../zcode-protocol/server.ts", import.meta.url), "utf8")).replace(
    /\s+/g,
    " ",
  );
  const owner = (name: string) =>
    name.startsWith("v4/") ? "V4_METHODS" : "zcodeProtocolMethods";
  const key = async (name: string) => {
    const shared = await import("@zcode/shared");
    const v4 = await import("@zcode/shared/zcode-protocol-v4");
    const table = (name.startsWith("v4/") ? v4.V4_METHODS : shared.zcodeProtocolMethods) as Record<
      string,
      string
    >;
    const found = Object.entries(table).find(([, value]) => value === name);
    assert.ok(found, `${name} is a known protocol method`);
    return found[0];
  };
  for (const name of NATIVE_CONTRACT_METHODS)
    assert.ok(
      source.includes(`case ${owner(name)}.${await key(name)}:`),
      `server.ts dispatches ${name}`,
    );
});

test("the server reports the declaration next to the existing plan capability", async () => {
  const source = (await readFile(new URL("../zcode-protocol/server.ts", import.meta.url), "utf8")).replace(
    /\s+/g,
    " ",
  );
  assert.match(
    source,
    /case zcodeProtocolMethods\.runtimeCapabilities: return \{ independentPlanState: true, \[ZCODE_NATIVE_CONTRACT_KEY\]: buildNativeContract\(Object\.keys\(NATIVE_HANDLERS\)\), \};/,
  );
});

test("interaction.protectedSessions is real: protected Graph questions (and their children) are never auto-answered", async (t) => {
  assert.deepEqual([...NATIVE_CONTRACT_FEATURES], [zcodeNativeContractFeatures.interactionProtectedSessions]);
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1 });
  const registry = new V4InteractionRegistry({ hiddenGraceMs: 5, autoResolutionMs: 20 });
  await registry.setAskUserQuestionAutoResolutionEnabled(true, ["graph"]);
  const answered: string[] = [];
  const ask = (id: string, sessionId: string, ancestors?: string[]) =>
    registry.register(id, () => answered.push(id), {
      sessionId,
      ...(ancestors ? { ancestorSessionIds: ancestors } : {}),
      kind: "askUserQuestion",
    });
  ask("graph-question", "graph");
  ask("graph-child-question", "child", ["parent", "graph"]);
  ask("ordinary-question", "chat");
  t.mock.timers.tick(100);
  assert.deepEqual(answered, ["ordinary-question"]);
  // Native responses stay possible while the session is protected.
  assert.equal(registry.resolve("graph-question", { freeText: "human" }), true);
  assert.deepEqual(answered, ["ordinary-question", "graph-question"]);
});
