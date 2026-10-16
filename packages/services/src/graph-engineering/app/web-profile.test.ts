import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { WEB_PROFILE_POLICY } from "@zcode/shared";
import type { GraphInspection } from "../inspection-types.js";
import type { GraphState } from "./state.js";
import { currentWebInspections, prepareOwnedWebProfile } from "./web-profile.js";
const target = { workspacePath: "C:/synthetic" };
function fixture() {
  let now = 1000,
    fresh: "current" | "runtime-changed" | "source-changed" = "current",
    calls = 0,
    prepares = 0;
  const ids: [string, string] = [randomUUID(), randomUUID()];
  const rows = ids.map((id) => ({
    id,
    status: "succeeded",
    reserved: false,
    request: {
      inspection: {
        webProfile: {
          policy: WEB_PROFILE_POLICY,
          webProject: "Web/Web.csproj",
          testProject: "Tests/Tests.csproj",
        },
        expiresAt: 2000,
      },
    },
  })) as unknown as GraphInspection[];
  const runs: Array<{ status: string }> = [];
  const state = {
    options: {
      now: () => now,
      inspection: {
        fresh: async () => {
          calls++;
          return fresh;
        },
      },
      webProfile: {
        prepare: async () => {
          prepares++;
          return { kind: "web-profile-proposal" };
        },
      },
    },
    inspections: {
      history: async () => rows,
      assertIdle: async () => {
        if (rows.some((row) => row.reserved)) throw Error("Reserved inspection owns workspace");
      },
    },
    load: async () => ({ runs }),
  } as unknown as GraphState;
  return {
    state,
    rows,
    ids,
    runs,
    setNow: (value: number) => {
      now = value;
    },
    setFresh: (value: typeof fresh) => {
      fresh = value;
    },
    calls: () => calls,
    prepares: () => prepares,
  };
}
test("Web preparation requires two distinct current successful owned observations and never runs a command", async () => {
  const f = fixture();
  await currentWebInspections(f.state, target, f.ids);
  assert.equal(f.calls(), 2);
  assert.equal(f.prepares(), 0);
  await prepareOwnedWebProfile(f.state, target, f.ids);
  assert.equal(f.prepares(), 1);
  await assert.rejects(currentWebInspections(f.state, target, [f.ids[0], f.ids[0]]), /distinct/);
  for (const status of [
    "denied",
    "cancelled",
    "failed",
    "unavailable",
    "executor-lost",
    "invalid-output",
  ] as const) {
    f.rows[0]!.status = status;
    await assert.rejects(currentWebInspections(f.state, target, f.ids), /unavailable/);
  }
});
test("inspection expiry, source/runtime changes and active workspace ownership block preparation", async () => {
  const f = fixture();
  f.setNow(2000);
  await assert.rejects(prepareOwnedWebProfile(f.state, target, f.ids), /expired/);
  assert.equal(f.prepares(), 0);
  // A separate unexpired private preparation can request fresh identity checks of completed observations;
  // the Save adapter independently enforces its receipt expiry and full byte commitment.
  await currentWebInspections(f.state, target, f.ids, true);
  assert.equal(f.calls(), 2);
  for (const state of ["source-changed", "runtime-changed"] as const) {
    f.setFresh(state);
    await assert.rejects(currentWebInspections(f.state, target, f.ids, true), /identity changed/);
  }
  f.setNow(1000);
  f.setFresh("current");
  f.rows[0]!.reserved = true;
  await assert.rejects(prepareOwnedWebProfile(f.state, target, f.ids), /owns workspace/);
  f.rows[0]!.reserved = false;
  f.runs.push({ status: "Running" });
  await assert.rejects(prepareOwnedWebProfile(f.state, target, f.ids), /Active or unresolved/);
  assert.equal(f.prepares(), 0);
});
