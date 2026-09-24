import assert from "node:assert/strict";
import test from "node:test";
import { V4InteractionRegistry } from "./interaction-registry.js";

test("protected graph questions wait while ordinary sessions still resolve automatically", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1 });
  const registry = new V4InteractionRegistry({ hiddenGraceMs: 5, autoResolutionMs: 20 });
  const answered: string[] = [];
  registry.register("pending", () => answered.push("pending"), {
    sessionId: "graph",
    kind: "askUserQuestion",
  });
  assert.equal(await registry.setAskUserQuestionAutoResolutionEnabled(true, ["graph"]), 1);
  registry.register("new", () => answered.push("new"), {
    sessionId: "graph",
    kind: "askUserQuestion",
  });
  registry.register("ordinary", () => answered.push("ordinary"), {
    sessionId: "chat",
    kind: "askUserQuestion",
  });
  t.mock.timers.tick(100);
  assert.deepEqual(answered, ["ordinary"]);
  assert.equal(registry.has("pending"), true);
  assert.equal(registry.has("new"), true);
  assert.equal(registry.resolve("pending", { freeText: "explicit human response" }), true);
  assert.equal(registry.has("new"), true);
});

test("removing protection enables future questions without restarting existing graph questions", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1 });
  const registry = new V4InteractionRegistry({ hiddenGraceMs: 5, autoResolutionMs: 20 });
  await registry.setAskUserQuestionAutoResolutionEnabled(true, ["graph"]);
  const answered: string[] = [];
  registry.register("old", () => answered.push("old"), {
    sessionId: "graph",
    kind: "askUserQuestion",
  });
  await registry.setAskUserQuestionAutoResolutionEnabled(true); // Old Host omits the field.
  t.mock.timers.tick(100);
  assert.equal(answered.length, 0);
  await registry.setAskUserQuestionAutoResolutionEnabled(true, []);
  registry.resolve("old", {});
  registry.register("future", () => answered.push("future"), {
    sessionId: "graph",
    kind: "askUserQuestion",
  });
  t.mock.timers.tick(100);
  assert.deepEqual(answered, ["old", "future"]);
});

test("expired restored countdown cannot race protected-session preference update", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 100 });
  const registry = new V4InteractionRegistry();
  let answered = false;
  registry.register(
    "restored",
    () => {
      answered = true;
    },
    {
      sessionId: "graph",
      kind: "askUserQuestion",
      initialAutoResolution: {
        state: "visibleCountdown",
        startedAt: 1,
        visibleAt: 2,
        deadlineAt: 3,
      },
    },
  );
  await registry.setAskUserQuestionAutoResolutionEnabled(true, ["graph"]);
  await Promise.resolve();
  assert.equal(answered, false);
  assert.equal(registry.has("restored"), true);
});

test("native child questions inherit protected graph ancestry", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1 });
  const registry = new V4InteractionRegistry({ hiddenGraceMs: 5, autoResolutionMs: 20 });
  await registry.setAskUserQuestionAutoResolutionEnabled(true, ["graph"]);
  let answered = false;
  registry.register(
    "child",
    () => {
      answered = true;
    },
    {
      sessionId: "child-session",
      ancestorSessionIds: ["parent-session", "graph"],
      kind: "askUserQuestion",
    },
  );
  t.mock.timers.tick(100);
  assert.equal(answered, false);
  assert.equal(registry.has("child"), true);
});
