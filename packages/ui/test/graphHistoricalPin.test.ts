import assert from "node:assert/strict";
import test from "node:test";
import type { GraphLibraryEntry, GraphPortableTemplate } from "@zcode/services";
import { carryForward, pinStatus } from "../src/graph-engineering/graphHistoricalPin.js";
import type { GraphFormOrigin, GraphTemplateFormDraft } from "../src/store/graphDraftStore.js";

const tool = (id: string) => ({
  id,
  type: "tool" as const,
  name: `Tool ${id}`,
  position: { x: 0, y: 0 },
  recipeId: id,
});
const template = (
  over: Partial<Pick<GraphPortableTemplate, "parameters" | "references">> & {
    tools?: string[];
    regionId?: string;
  } = {},
): GraphPortableTemplate =>
  ({
    format: "zcode-workflow",
    version: 1,
    name: "Target",
    description: "",
    graph: {
      version: 5,
      revision: 0,
      name: "Target",
      nodes: (over.tools ?? ["build", "test"]).map(tool),
      edges: [],
      ...(over.regionId ? { routing: { region: { id: over.regionId } } } : {}),
    },
    parameters: over.parameters ?? [
      { id: "request", label: "Run request", type: "string", required: true },
    ],
    references: over.references ?? [],
    optionalNodes: [],
  }) as unknown as GraphPortableTemplate;
const entry = (versions: Array<[number, string]>): GraphLibraryEntry => ({
  id: "flow",
  name: "Flow",
  archived: false,
  builtin: true,
  versions: versions.map(([version, digest]) => ({
    version,
    digest,
    createdAt: 0,
    template: template(),
  })),
});
const origin = (extra: Partial<GraphFormOrigin> = {}): GraphFormOrigin => ({
  version: 1,
  digest: "old",
  references: [],
  ...extra,
});
const form = (
  parameters: GraphTemplateFormDraft["parameters"],
  bindings: Partial<GraphTemplateFormDraft["bindings"]> = {},
): GraphTemplateFormDraft => ({
  parameters,
  bindings: { references: {}, recipes: {}, sourcePaths: [], ...bindings },
});

test("an offered exact version is offered; a missing one is reported, never replaced", () => {
  const library = [entry([[2, "new"]])];
  assert.deepEqual(pinStatus(library, { id: "flow", version: 2 }, undefined), { kind: "offered" });
  assert.deepEqual(pinStatus(library, { id: "flow", version: 1 }, origin()), {
    kind: "version-missing",
    requested: 1,
    offered: 2,
  });
  assert.deepEqual(pinStatus(library, undefined, undefined), { kind: "offered" });
});

test("the same version number with other content is not the pinned version", () => {
  const library = [entry([[1, "other"]])];
  assert.deepEqual(pinStatus(library, { id: "flow", version: 1 }, origin({ digest: "old" })), {
    kind: "content-changed",
    requested: 1,
  });
  assert.deepEqual(pinStatus(library, { id: "flow", version: 1 }, origin({ digest: "other" })), {
    kind: "offered",
  });
  assert.deepEqual(pinStatus(library, { id: "flow", version: 1 }, undefined), { kind: "offered" });
});

test("a workflow that is gone is reported only when the selection came from a run", () => {
  assert.deepEqual(pinStatus([], { id: "flow", version: 1 }, origin()), {
    kind: "workflow-missing",
  });
  assert.deepEqual(pinStatus([], { id: "flow", version: 1 }, undefined), { kind: "offered" });
});

test("parameters carry by id and declared type; everything else is listed with its reason", () => {
  const target = template({
    parameters: [
      { id: "request", label: "Run request", type: "string", required: true },
      { id: "bonus", label: "Bonus", type: "boolean", required: false },
      { id: "count", label: "Count", type: "number", required: false, default: 3 },
    ],
  });
  const { form: carried, report } = carryForward(
    {
      form: form({ request: "Do it", bonus: "yes", count: 9, gone: "x" }),
      origin: origin(),
    },
    target,
  );
  assert.equal(carried.parameters.request, "Do it");
  assert.equal(carried.parameters.count, 9);
  assert.equal("bonus" in carried.parameters, false, "a string is not a boolean");
  assert.deepEqual(
    report.notCarried.map((item) => [item.id, item.reason]),
    [
      ["bonus", "type"],
      ["gone", "absent"],
    ],
  );
  assert.deepEqual(
    report.carried.map((item) => item.id),
    ["request", "count"],
  );
});

test("a label that looks the same is not a match: only the stable id is", () => {
  const target = template({
    parameters: [{ id: "task", label: "Run request", type: "string", required: true }],
  });
  const { form: carried, report } = carryForward(
    { form: form({ request: "Do it" }), origin: origin() },
    target,
  );
  assert.deepEqual(carried.parameters, {});
  assert.deepEqual(report.notCarried, [{ kind: "parameter", id: "request", reason: "absent" }]);
});

test("required values that were not carried stay missing", () => {
  const target = template();
  const { form: carried } = carryForward({ form: form({}), origin: origin() }, target);
  assert.equal(carried.parameters.request, undefined);
});

test("references carry by role id and accepted kind", () => {
  const target = template({
    references: [
      { id: "instructions", label: "I", kind: "instruction", required: false, nodeIds: [] },
      { id: "notes", label: "N", kind: "skill", required: false, nodeIds: [] },
    ],
  });
  const { form: carried, report } = carryForward(
    {
      form: form(
        {},
        {
          referencePolicy: "native-aware-v1",
          references: { instructions: "docs/A.md", notes: "docs/N.md", other: "x.md" },
        },
      ),
      origin: origin({
        references: [
          { id: "instructions", kind: "instruction" },
          { id: "notes", kind: "document" },
        ],
      }),
    },
    target,
  );
  assert.deepEqual(carried.bindings.references, { instructions: "docs/A.md" });
  assert.equal(carried.bindings.referencePolicy, "native-aware-v1");
  assert.deepEqual(
    report.notCarried.map((item) => [item.id, item.reason]),
    [
      ["notes", "kind"],
      ["other", "absent"],
    ],
  );
});

test("checks carry by tool node id, not by position; a mapping needs both nodes", () => {
  const target = template({ tools: ["test", "compile"] }); // reordered, build renamed
  const { form: carried, report } = carryForward(
    {
      form: form(
        {},
        {
          recipes: { build: "b", test: "t" },
          recipeGroups: { test: ["t", "t2"] },
          buildMappings: { test: "build" },
        },
      ),
      origin: origin(),
    },
    target,
  );
  assert.deepEqual(carried.bindings.recipes, { test: "t" });
  assert.deepEqual(carried.bindings.recipeGroups, { test: ["t", "t2"] });
  assert.equal(carried.bindings.buildMappings, undefined, "the mapped Build node is gone");
  assert.deepEqual(report.notCarried, [{ kind: "check", id: "build", reason: "node" }]);
});

test("source paths carry only for the same repair region id", () => {
  const source = {
    form: form({}, { sourcePaths: ["src"] }),
    origin: origin({ regionId: "repair" }),
  };
  assert.deepEqual(
    carryForward(source, template({ regionId: "repair" })).form.bindings.sourcePaths,
    ["src"],
  );
  const other = carryForward(source, template({ regionId: "fix" }));
  assert.deepEqual(other.form.bindings.sourcePaths, []);
  assert.equal(other.report.notCarried[0]!.kind, "sourcePaths");
  assert.equal(carryForward(source, template()).report.notCarried[0]!.reason, "absent");
});

test("defaults of the target fill what the run never set", () => {
  const target = template({
    parameters: [
      { id: "request", label: "R", type: "string", required: true },
      { id: "count", label: "C", type: "number", required: false, default: 3 },
    ],
  });
  assert.equal(
    carryForward({ form: form({ request: "x" }), origin: origin() }, target).form.parameters.count,
    3,
  );
});
