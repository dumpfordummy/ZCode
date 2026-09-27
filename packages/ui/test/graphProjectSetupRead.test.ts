import assert from "node:assert/strict";
import test from "node:test";
import {
  readGraphProjectSetup,
  invalidateGraphProjectSetupReads,
  type GraphProjectSetupReadScope,
} from "../src/graph-engineering/graphProjectSetupRead.js";

function deferred() {
  let resolve!: (value: string) => void;
  const promise = new Promise<string>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
test("setup read lanes are independent and stale target or edited input publishes and returns nothing", async () => {
  const scope: GraphProjectSetupReadScope = { sequences: {} };
  let key = "initial";
  const events: unknown[] = [];
  const delayed = deferred();
  const pending = readGraphProjectSetup({
    scope,
    lane: "validate",
    key,
    isCurrent: () => key === "initial",
    read: () => delayed.promise,
    publish: (value) => events.push(value),
  });
  assert.equal(
    await readGraphProjectSetup({
      scope,
      lane: "scan",
      key: "scan-1",
      isCurrent: () => true,
      read: async () => "complete",
      publish: (value) => events.push(value),
    }),
    "complete",
  );
  key = "edited";
  delayed.resolve("stale validation");
  assert.equal(await pending, undefined);
  assert.equal(
    events.some(
      (event) =>
        typeof event === "object" &&
        event !== null &&
        "result" in event &&
        event.result === "stale validation",
    ),
    false,
  );
});

test("cleanup invalidates pending reads even when the same scope is reactivated by effect replay", async () => {
  const scope: GraphProjectSetupReadScope = { sequences: {} };
  const delayed = deferred();
  const events: unknown[] = [];
  const pending = readGraphProjectSetup({
    scope,
    lane: "validate",
    key: "same",
    isCurrent: () => true,
    read: () => delayed.promise,
    publish: (value) => events.push(value),
  });
  invalidateGraphProjectSetupReads(scope);
  delayed.resolve("obsolete lifetime");
  assert.equal(await pending, undefined);
  assert.deepEqual(events, [{ status: "loading", key: "same" }]);
  assert.equal(
    await readGraphProjectSetup({
      scope,
      lane: "validate",
      key: "same",
      isCurrent: () => true,
      read: async () => "new lifetime",
      publish: (value) => events.push(value),
    }),
    "new lifetime",
  );
});
test("a cancelled/replaced read cannot overwrite the newest result and errors stay distinct", async () => {
  const scope: GraphProjectSetupReadScope = { sequences: {} };
  const events: unknown[] = [];
  const delayed = deferred();
  const options = {
    scope,
    lane: "scan",
    key: "same",
    isCurrent: () => true,
    publish: (value: unknown) => events.push(value),
  };
  const old = readGraphProjectSetup({ ...options, read: () => delayed.promise });
  await readGraphProjectSetup({ ...options, read: async () => "cancelled" });
  delayed.resolve("complete");
  assert.equal(await old, undefined);
  await readGraphProjectSetup({
    ...options,
    read: async () => {
      throw Error("Cannot scan");
    },
  });
  assert.deepEqual(events.at(-1), { status: "error", key: "same", error: "Cannot scan" });
});
