import assert from "node:assert/strict";
import test from "node:test";
import type { GraphRecipeSnapshot } from "@zcode/services";
import {
  readGraphRecipeSnapshot,
  type GraphRecipeReadScope,
  type GraphRecipeReadState,
} from "../src/graph-engineering/graphRecipeRead.js";

const snapshot: GraphRecipeSnapshot = {
  recipes: [],
  digest: "fixture",
  sourcePath: ".zcode/config.json",
};
function deferred() {
  let resolve!: (snapshot: GraphRecipeSnapshot) => void;
  const promise = new Promise<GraphRecipeSnapshot>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("a response from workspace A cannot populate workspace B or return to a stale caller", async () => {
  const a: GraphRecipeReadScope = { sequence: 0, snapshot: null };
  const b: GraphRecipeReadScope = { sequence: 0, snapshot: null };
  let current = a;
  const events: GraphRecipeReadState[] = [];
  const delayed = deferred();
  const first = readGraphRecipeSnapshot({
    scope: a,
    isCurrent: () => current === a,
    read: () => delayed.promise,
    publish: (state) => events.push(state),
  });
  current = b;
  delayed.resolve(snapshot);
  assert.equal(await first, undefined);
  assert.deepEqual(
    events.map((state) => state.status),
    ["loading"],
  );
  assert.equal(b.snapshot, null);
});

test("newer reads win and a failed refresh remains error with its last successful snapshot", async () => {
  const scope: GraphRecipeReadScope = { sequence: 0, snapshot: null };
  const events: GraphRecipeReadState[] = [];
  const stale = deferred();
  const options = {
    scope,
    isCurrent: () => true,
    publish: (state: GraphRecipeReadState) => events.push(state),
  };
  const oldRead = readGraphRecipeSnapshot({ ...options, read: () => stale.promise });
  assert.equal(await readGraphRecipeSnapshot({ ...options, read: async () => snapshot }), snapshot);
  stale.resolve({ ...snapshot, digest: "old" });
  assert.equal(await oldRead, undefined);
  await readGraphRecipeSnapshot({
    ...options,
    read: async () => {
      throw Error("Cannot read project checks");
    },
  });
  assert.deepEqual(events.at(-1), {
    status: "error",
    snapshot,
    error: "Cannot read project checks",
  });
  assert.equal(scope.snapshot, snapshot);
});
