// Z8.3-R1: the runtime compatibility gate runs at Run admission, before any record, session or input.
import assert from "node:assert/strict";
import test from "node:test";
import { GraphRuntimeIncompatibleError } from "../domain/native-runtime-contract.js";
import type { GraphRuntimeGate } from "./runtime-ports.js";
import { GraphEngineeringService } from "./service.js";
import {
  selection,
  sequenceDefinition,
  sequentialServiceFixture,
  target,
} from "./sequential.fixture.js";

const incompatible = () =>
  new GraphRuntimeIncompatibleError({
    failures: [{ class: "missing-method", expected: "session/recipe/inspect", observed: "absent" }],
    omitted: 0,
  });

async function setup(initialCompatible: boolean) {
  const f = sequentialServiceFixture();
  await f.prepare(sequenceDefinition());
  const order: string[] = [];
  let compatible = initialCompatible;
  const native = { ...f.native };
  for (const name of ["available", "validateSelection", "create", "send", "observe"] as const) {
    const original = native[name].bind(f.native) as (...args: unknown[]) => unknown;
    (native as Record<string, unknown>)[name] = async (...args: unknown[]) => {
      order.push(name);
      return original(...args);
    };
  }
  const runtime: GraphRuntimeGate = {
    async require(workspace, purpose) {
      order.push(`require:${purpose}`);
      assert.deepEqual(workspace, target);
      if (!compatible) throw incompatible();
    },
  };
  let id = 5_000;
  let clock = 5_000;
  const service = new GraphEngineeringService({
    repository: f.repository,
    native,
    runtime,
    id: () => `r1-${++id}`,
    now: () => ++clock,
  });
  const run = (requestId = "request") =>
    service.run({
      target,
      requestId,
      revision: 1,
      modelSelection: selection,
      mode: "build",
      planEnabled: false,
    });
  return { f, service, order, run, set: (value: boolean) => (compatible = value) };
}

test("an incompatible runtime rejects admission before any record, native session or input exists", async () => {
  const s = await setup(false);
  const before = JSON.stringify(s.f.saved());
  await assert.rejects(
    s.run(),
    (error: unknown) =>
      error instanceof GraphRuntimeIncompatibleError && /not compatible/.test(error.message),
  );
  // availability is checked first, the gate second; nothing after it ran.
  assert.deepEqual(s.order, ["available", "require:model"]);
  assert.equal(s.f.creates.length + s.f.sends.length + s.f.cancellations.length, 0);
  assert.equal(JSON.stringify(s.f.saved()), before, "no run record or other state was written");
  assert.equal((await s.service.getWorkspace(target)).runs.length, 0);
});

test("after the runtime is fixed the same request starts normally; nothing was replayed or substituted", async () => {
  const s = await setup(false);
  await assert.rejects(s.run("same-request"), GraphRuntimeIncompatibleError);
  s.set(true);
  const run = await s.run("same-request");
  assert.equal(run.version, 2);
  assert.equal(s.f.creates.length, 1);
  assert.equal(s.f.sends.length, 1);
  assert.deepEqual(s.order.slice(0, 2), ["available", "require:model"]);
  assert.ok(s.order.indexOf("require:model") < s.order.indexOf("validateSelection"));
});

test("a compatible runtime leaves the ordinary flow unchanged, and a duplicate request is not re-probed", async () => {
  const s = await setup(true);
  const first = await s.run("dup");
  assert.equal(s.f.sends.length, 1);
  const probes = s.order.filter((entry) => entry.startsWith("require:")).length;
  assert.equal(probes, 1);
  const again = await s.run("dup");
  assert.equal(again.id, first.id);
  assert.equal(s.order.filter((entry) => entry.startsWith("require:")).length, probes);
});

test("availability stays a settings/model-registry answer and never contacts the agent", async () => {
  const s = await setup(false);
  const view = await s.service.getWorkspace(target);
  assert.deepEqual(view.availability, { available: true });
  assert.ok(!s.order.some((entry) => entry.startsWith("require:")));
});
