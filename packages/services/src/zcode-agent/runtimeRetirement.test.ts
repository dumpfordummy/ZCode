import assert from "node:assert/strict";
import test from "node:test";
import { RuntimeRetirementLedger, runtimeIdentityWithInstance } from "./runtimeRetirement.js";

test("retirement receipt requires fulfilled original cleanup and never means merely unavailable", async () => {
  const ledger = new RuntimeRetirementLedger(() => 123);
  const identity = { workspaceKey: "fixture", identity: "instance-a" };
  const cleanup = Promise.withResolvers<void>();
  const pending = ledger.afterCleanup(identity, cleanup.promise);
  assert.equal(ledger.get("fixture", "instance-a"), null);
  cleanup.reject(new Error("owned child still executing"));
  await assert.rejects(pending, /still executing/);
  assert.equal(ledger.get("fixture", "instance-a"), null);
  await ledger.afterCleanup(identity, Promise.resolve());
  const proof = ledger.get("fixture", "instance-a");
  assert.deepEqual(proof, {
    workspaceKey: "fixture",
    runtimeIdentity: "instance-a",
    retiredAt: 123,
  });
  assert.equal(ledger.get("other-workspace", "instance-a"), null);
  assert.equal(ledger.get("fixture", "instance-b"), null);
  proof!.retiredAt = 456;
  assert.equal(ledger.get("fixture", "instance-a")?.retiredAt, 123);
  assert.equal(new RuntimeRetirementLedger().get("fixture", "instance-a"), null);
});

test("retirement evidence is bounded and eviction fails closed", async () => {
  const ledger = new RuntimeRetirementLedger(() => 1);
  for (let i = 0; i < 257; i++) {
    await ledger.afterCleanup(
      { workspaceKey: "fixture", identity: `instance-${i}` },
      Promise.resolve(),
    );
  }
  assert.equal(ledger.get("fixture", "instance-0"), null);
  assert.equal(ledger.get("fixture", "instance-256")?.runtimeIdentity, "instance-256");
});

test("opaque runtime binding changes even when Host-local generation and OS PID are recycled", () => {
  const common = { workspaceKey: "fixture", generation: 1, processId: 123 };
  const first = runtimeIdentityWithInstance({ ...common, runtimeInstanceId: "random-a" });
  const second = runtimeIdentityWithInstance({ ...common, runtimeInstanceId: "random-b" });
  assert.notEqual(first, second);
  assert.notEqual(first, "fixture:1:123");
  assert.notEqual(
    first,
    runtimeIdentityWithInstance({ ...common, runtimeInstanceId: "random-a", lane: "plugin" }),
  );
});
