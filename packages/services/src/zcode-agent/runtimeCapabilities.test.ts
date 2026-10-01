import assert from "node:assert/strict";
import test from "node:test";
import { zcodeProtocolMethods } from "@zcode/shared";
import { readRuntimeCapabilities } from "./runtimeCapabilities.js";

function client(replies: Array<() => unknown>) {
  const requests: string[] = [];
  return {
    requests,
    request: async (method: string) => {
      requests.push(method);
      return replies.shift()!();
    },
  };
}
const methodNotFound = () => Object.assign(new Error("Method not found"), { code: -32601 });

test("reads the raw runtime/capabilities result once per client", async () => {
  const c = client([() => ({ independentPlanState: true, extra: 1 })]);
  const expected = { supported: true, capabilities: { independentPlanState: true, extra: 1 } };
  assert.deepEqual(await readRuntimeCapabilities(c as never), expected);
  assert.deepEqual(await readRuntimeCapabilities(c as never), expected);
  assert.deepEqual(c.requests, [zcodeProtocolMethods.runtimeCapabilities]);
});

test("method-not-found means an old runtime and is reported, not thrown", async () => {
  const c = client([() => Promise.reject(methodNotFound())]);
  assert.deepEqual(await readRuntimeCapabilities(c as never), { supported: false });
});

test("transport failures are thrown and never cached; a replacement client is probed again", async () => {
  const c = client([() => Promise.reject(new Error("timeout")), () => ({})]);
  await assert.rejects(readRuntimeCapabilities(c as never), /timeout/);
  assert.deepEqual(await readRuntimeCapabilities(c as never), {
    supported: true,
    capabilities: {},
  });
  const replacement = client([() => ({ independentPlanState: true })]);
  assert.deepEqual(await readRuntimeCapabilities(replacement as never), {
    supported: true,
    capabilities: { independentPlanState: true },
  });
  assert.equal(replacement.requests.length, 1);
});
