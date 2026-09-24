import assert from "node:assert/strict";
import test from "node:test";
import {
  captureGraphSubmission,
  prepareGraphRunConfirmation,
} from "../src/graph-engineering/graphSubmission.js";
import type { GraphRunProvenance, GraphSequentialDefinition } from "@zcode/services";

const definition: GraphSequentialDefinition = {
  version: 5,
  revision: 4,
  name: "Pinned workflow",
  nodes: [],
  edges: [],
  template: {
    id: "fixture",
    name: "Fixture",
    version: 1,
    digest: "template-digest",
    parameters: { request: "edge cases" },
    bindings: { references: {}, recipes: {}, sourcePaths: [] },
    references: [],
    excluded: [],
  },
};
const settings = {
  modelSelection: { providerId: "fixture", modelId: "controlled" },
  mode: "build" as const,
  planEnabled: false,
};
const provenance: GraphRunProvenance = {
  digest: "captured-config",
  template: definition.template!,
  models: [],
  auxiliary: [],
  references: [],
  recipes: [],
  permissions: [],
  unknowns: ["External behavior"],
  environment: {
    version: 1,
    status: "available",
    configDigest: "0".repeat(64),
    instructions: [],
    skills: [],
    plugins: [],
    hooks: [],
    mcp: [],
    unknowns: [],
  },
};
test("workflow confirmation prepares the saved revision once and dispatches its exact digest", async () => {
  const calls: string[] = [];
  const snapshot = (await prepareGraphRunConfirmation({
    definition,
    settings,
    save: async (draft) => {
      calls.push("save");
      return { ...draft, revision: 5 };
    },
    prepare: async (saved, frozenSettings) => {
      calls.push("prepare");
      assert.equal(saved.revision, 5);
      assert.deepEqual(frozenSettings, settings);
      return provenance;
    },
  }))!;
  assert.deepEqual(calls, ["save", "prepare"]);
  const request = await captureGraphSubmission({
    retained: null,
    definition: snapshot.definition,
    confirmed: true,
    intent: {
      target: { workspacePath: "C:/synthetic" },
      requestId: "first",
      ...settings,
      preflight: { digest: snapshot.provenance!.digest, acknowledgedUnknowns: true },
    },
    save: async () => {
      throw Error("Confirmation must not save twice");
    },
  });
  assert.equal(request.revision, 5);
  assert.deepEqual(request.preflight, { digest: "captured-config", acknowledgedUnknowns: true });
  await assert.rejects(
    captureGraphSubmission({
      retained: request,
      retainedDefinition: snapshot.definition,
      definition: snapshot.definition,
      intent: { ...request, preflight: { digest: "changed", acknowledgedUnknowns: true } },
      save: async () => {
        throw Error("No save");
      },
    }),
    /confirmation/,
  );
});
test("uncertain workflow ACK reopens only its retained preflight; refresh cannot silently resolve a new one", async () => {
  const retained = {
    target: { workspacePath: "C:/synthetic" },
    requestId: "original",
    revision: 4,
    ...settings,
    preflight: { digest: provenance.digest, acknowledgedUnknowns: true },
  };
  const options = {
    definition,
    settings,
    retained,
    retainedDefinition: definition,
    retainedProvenance: provenance,
    save: async () => {
      throw Error("No new save");
    },
    prepare: async () => {
      throw Error("No new preparation");
    },
  };
  const reopened = (await prepareGraphRunConfirmation(options))!;
  assert.equal(reopened.provenance?.digest, provenance.digest);
  await assert.rejects(
    prepareGraphRunConfirmation({ ...options, retainedProvenance: null }),
    /preflight is unavailable/,
  );
});
test("missing or failed native workflow preparation cannot produce a runnable confirmation", async () => {
  const options = { definition, settings, save: async () => definition };
  await assert.rejects(prepareGraphRunConfirmation(options), /preflight is unavailable/);
  await assert.rejects(
    prepareGraphRunConfirmation({
      ...options,
      prepare: async () => {
        throw Error("Required source missing");
      },
    }),
    /Required source missing/,
  );
});
