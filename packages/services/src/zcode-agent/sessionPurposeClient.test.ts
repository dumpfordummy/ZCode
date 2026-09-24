import assert from "node:assert/strict";
import test from "node:test";
import { sessionPurposeClient } from "./sessionPurposeClient.js";

test("explicit recipe purpose uses the existing native control client without model readiness", async () => {
  const calls: string[] = [];
  const client = {};
  const ports = {
    async native() {
      calls.push("native");
      return client;
    },
    async model() {
      calls.push("model");
      throw new Error("Provider not ready");
    },
  };
  assert.equal(await sessionPurposeClient({ purpose: "native-recipe" }, ports), client);
  assert.deepEqual(calls, ["native"]);
  await assert.rejects(sessionPurposeClient({}, ports), /Provider not ready/);
  await assert.rejects(
    sessionPurposeClient({ purpose: "native-recipe", model: {} }, ports),
    /model/,
  );
  assert.deepEqual(calls, ["native", "model"]);
});
