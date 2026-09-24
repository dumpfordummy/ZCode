import assert from "node:assert/strict";
import test from "node:test";
import { conversationCommandClient } from "./conversationCommandClient.js";

test("native permission response uses only the existing client without model/provider admission", async () => {
  const calls: string[] = [],
    client = { identity: "existing" };
  const ports = {
    async expected(identity: string) {
      calls.push(`exact:${identity}`);
      return client;
    },
    async existing() {
      calls.push("existing");
      return client;
    },
    async modelEnabled() {
      calls.push("model");
      throw new Error("No provider available");
    },
  };
  assert.equal(
    await conversationCommandClient({ type: "resolveInteraction", sessionId: "owned" }, ports),
    client,
  );
  assert.deepEqual(calls, ["existing"]);
  for (const type of ["sendText", "createSession", "retryTurn", "resumeGoal", "switchModelConfig"])
    await assert.rejects(
      conversationCommandClient({ type, sessionId: "owned" }, ports),
      /provider/,
    );
  await assert.rejects(
    conversationCommandClient({ type: "resolveInteraction" }, ports),
    /provider/,
  );
  await assert.rejects(
    conversationCommandClient({ type: "resolveInteraction", sessionId: null }, ports),
    /provider/,
  );
  calls.length = 0;
  await conversationCommandClient(
    { type: "resolveInteraction", sessionId: "owned", expectedRuntimeIdentity: "original" },
    ports,
  );
  assert.deepEqual(calls, ["exact:original"]);
});

test("missing existing permission runtime never falls back to model startup", async () => {
  let startups = 0;
  await assert.rejects(
    conversationCommandClient(
      { type: "resolveInteraction", sessionId: "owned" },
      {
        async expected() {
          throw new Error("unused");
        },
        async existing() {
          throw new Error("Original runtime unavailable");
        },
        async modelEnabled() {
          startups++;
          return {};
        },
      },
    ),
    /unavailable/,
  );
  assert.equal(startups, 0);
});
