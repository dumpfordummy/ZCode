import assert from "node:assert/strict";
import test from "node:test";
import type { GraphDefinition, GraphLibraryEntry, GraphLibraryView } from "@zcode/services";
import {
  defaultSaveTarget,
  mutationResult,
  originIsBuiltin,
  parseTargetValue,
  renameDisclosure,
  saveDefaults,
  targetValue,
  versionTargets,
} from "../src/graph-engineering/graphLibrarySave.js";

const entry = (
  id: string,
  name: string,
  opts: { builtin?: boolean; archived?: boolean; versions?: number[] } = {},
): GraphLibraryEntry => ({
  id,
  name,
  archived: opts.archived ?? false,
  builtin: opts.builtin ?? false,
  versions: (opts.versions ?? [1]).map((version) => ({
    version,
    digest: `${id}-${version}`,
    createdAt: version,
    template: {
      format: "zcode-workflow",
      version: 1,
      name,
      description: `${name} description v${version}`,
      graph: { version: 5, revision: 0, name, nodes: [], edges: [] },
      parameters: [],
      references: [],
      optionalNodes: [],
    } as never,
  })),
});
const design = (originId?: string): GraphDefinition =>
  ({
    version: 5,
    revision: 1,
    name: "My design",
    nodes: [],
    edges: [],
    ...(originId ? { template: { id: originId, name: "x", version: 1, digest: "d" } } : {}),
  }) as unknown as GraphDefinition;
const view = (entries: GraphLibraryEntry[]): GraphLibraryView => ({ revision: 1, entries });

const library = [
  entry("builtin", "Built-in", { builtin: true, versions: [2] }),
  entry("mine", "Mine", { versions: [1, 2] }),
  entry("old", "Old", { archived: true }),
];

test("only your own, non-archived workflows can receive a version", () => {
  assert.deepEqual(
    versionTargets(library).map((item) => item.id),
    ["mine"],
  );
});

test("the default target is the design's origin when it can take a version, never another selection", () => {
  assert.deepEqual(defaultSaveTarget(library, design("mine")), {
    kind: "version",
    entryId: "mine",
  });
  assert.deepEqual(
    defaultSaveTarget(library, design("builtin")),
    { kind: "new" },
    "built-ins cannot",
  );
  assert.deepEqual(defaultSaveTarget(library, design("old")), { kind: "new" }, "archived cannot");
  assert.deepEqual(
    defaultSaveTarget(library, design("gone")),
    { kind: "new" },
    "no longer offered",
  );
  assert.deepEqual(defaultSaveTarget(library, design()), { kind: "new" }, "no provenance");
  assert.equal(originIsBuiltin(library, design("builtin")), true);
  assert.equal(originIsBuiltin(library, design("mine")), false);
  assert.equal(originIsBuiltin(library, design()), false);
});

test("target values round-trip", () => {
  for (const target of [{ kind: "new" }, { kind: "version", entryId: "a:b" }] as const)
    assert.deepEqual(parseTargetValue(targetValue(target)), target);
});

test("an untouched form keeps the target's name and description", () => {
  assert.deepEqual(saveDefaults({ kind: "version", entryId: "mine" }, library, design("mine")), {
    name: "Mine",
    description: "Mine description v2",
  });
  assert.deepEqual(saveDefaults({ kind: "new" }, library, design("mine")), {
    name: "My design",
    description: "",
  });
});

test("a rename is disclosed only when a version would change the workflow's name", () => {
  assert.equal(renameDisclosure({ kind: "version", entryId: "mine" }, library, "Mine"), undefined);
  assert.deepEqual(renameDisclosure({ kind: "version", entryId: "mine" }, library, "Renamed"), {
    from: "Mine",
    to: "Renamed",
  });
  assert.equal(renameDisclosure({ kind: "new" }, library, "Anything"), undefined);
});

test("the result is read from the returned list, never guessed", () => {
  const before = view([entry("a", "A", { versions: [1, 2] })]);
  assert.deepEqual(
    mutationResult(before, view([entry("a", "A", { versions: [1, 2, 3] })])),
    { entryId: "a", version: 3, name: "A" },
    "a new version",
  );
  assert.deepEqual(
    mutationResult(before, view([...before.entries, entry("b", "B")])),
    { entryId: "b", version: 1, name: "B" },
    "a new workflow",
  );
  assert.deepEqual(
    mutationResult(before, view([entry("a", "Renamed", { versions: [1, 2, 4] })])),
    { entryId: "a", version: 4, name: "Renamed" },
    "the number comes from the list (4), not from last + 1",
  );
  assert.equal(mutationResult(before, before), undefined, "archive changes no version");
  assert.equal(
    mutationResult(before, view([entry("a", "A", { versions: [1, 2, 3] }), entry("b", "B")])),
    undefined,
    "two changes at once are not guessed",
  );
});
