import assert from "node:assert/strict";
import test from "node:test";
import { expectedRuntimeClient } from "./expectedRuntimeClient.js";

test("expected runtime returns only the same live existing client", async () => {
  const client = { isDisposed: false };
  assert.equal(
    await expectedRuntimeClient(
      "original",
      () => client,
      async () => "original",
    ),
    client,
  );
  await assert.rejects(
    expectedRuntimeClient(
      "original",
      () => undefined,
      async () => "original",
    ),
    /unavailable/,
  );
  await assert.rejects(
    expectedRuntimeClient(
      "original",
      () => client,
      async () => "replacement",
    ),
    /changed/,
  );
});

test("a client replacement during identity read never returns the replacement", async () => {
  let client = { isDisposed: false };
  await assert.rejects(
    expectedRuntimeClient(
      "original",
      () => client,
      async () => {
        client = { isDisposed: false };
        return "original";
      },
    ),
    /changed/,
  );
  client.isDisposed = true;
  await assert.rejects(
    expectedRuntimeClient(
      "original",
      () => client,
      async () => "original",
    ),
    /unavailable/,
  );
});
