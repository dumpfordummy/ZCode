import assert from "node:assert/strict";
import test from "node:test";
import type { GraphDefinition, GraphLibraryEntry, GraphPortableTemplate } from "@zcode/services";
import {
  designPin,
  libraryGates,
  libraryKind,
  resolveLibrarySelection,
  versionRows,
} from "../src/graph-engineering/graphLibraryView.js";

const template = (version = 1): GraphPortableTemplate => ({
  format: "zcode-workflow",
  version: 1,
  name: `Fixture v${version}`,
  description: "Fixture",
  graph: { version: 5, revision: 0, name: "Fixture", nodes: [], edges: [] },
  parameters: [],
  references: [],
  optionalNodes: [],
});
const entry = (
  id: string,
  builtin: boolean,
  versions: Array<[number, number]>,
  archived = false,
): GraphLibraryEntry => ({
  id,
  name: id,
  archived,
  builtin,
  versions: versions.map(([version, createdAt]) => ({
    version,
    digest: `${id}-d${version}`,
    createdAt,
    template: template(version),
  })),
});
const designOf = (id: string, version: number, digest: string): GraphDefinition =>
  ({
    version: 5,
    revision: 3,
    name: "Design",
    nodes: [],
    edges: [],
    template: { id, name: id, version, digest },
  }) as unknown as GraphDefinition;

test("built-ins are labelled and never show the stored 0 as a date; user versions keep real times", () => {
  assert.equal(libraryKind(entry("b", true, [])), "builtin");
  assert.equal(libraryKind(entry("u", false, [])), "yours");
  const builtin = versionRows(entry("b", true, [[2, 0]]));
  assert.equal(builtin[0]!.createdAt, undefined);
  const mine = versionRows(
    entry("u", false, [
      [1, Date.UTC(2026, 8, 30)],
      [2, 0],
      [3, Number.NaN],
    ]),
  );
  assert.equal(mine.find((row) => row.version === 1)!.createdAt, Date.UTC(2026, 8, 30));
  assert.equal(mine.find((row) => row.version === 2)!.createdAt, undefined, "0 is not a time");
  assert.equal(mine.find((row) => row.version === 3)!.createdAt, undefined, "NaN is not a time");
});

test("versions are listed newest first, exactly as the Host returned them", () => {
  assert.deepEqual(
    versionRows(
      entry("u", false, [
        [1, 1],
        [3, 3],
        [2, 2],
      ]),
    ).map((row) => row.version),
    [3, 2, 1],
  );
  assert.deepEqual(
    versionRows(entry("b", true, [[2, 0]])).map((row) => row.version),
    [2],
    "a built-in lists only what is offered: no invented version 1",
  );
});

test("Latest is shown only when it means something: more than one offered version", () => {
  assert.deepEqual(
    versionRows(entry("b", true, [[2, 0]])).map((row) => row.latest),
    [false],
  );
  assert.deepEqual(
    versionRows(
      entry("u", false, [
        [1, 1],
        [2, 2],
        [3, 3],
      ]),
    ).map((row) => [row.version, row.latest]),
    [
      [3, true],
      [2, false],
      [1, false],
    ],
  );
  assert.deepEqual(
    versionRows(
      entry(
        "u",
        false,
        [
          [1, 1],
          [2, 2],
        ],
        true,
      ),
    ).map((row) => row.latest),
    [false, false],
    "an archived workflow has no latest to use",
  );
});

test("Used by current design needs the same workflow, version and digest", () => {
  const source = entry("u", false, [
    [1, 1],
    [2, 2],
  ]);
  const pin = designPin(designOf("u", 1, "u-d1"));
  assert.deepEqual(
    versionRows(source, pin).map((row) => [row.version, row.usedByDesign]),
    [
      [2, false],
      [1, true],
    ],
  );
  assert.ok(
    versionRows(source, designPin(designOf("u", 1, "other-digest"))).every(
      (row) => !row.usedByDesign,
    ),
    "same number, different content is not the pinned version",
  );
  assert.ok(
    versionRows(source, designPin(designOf("x", 1, "u-d1"))).every((row) => !row.usedByDesign),
  );
  assert.ok(
    versionRows(source).every((row) => !row.usedByDesign),
    "no provenance, no claim",
  );
});

test("a design without a workflow instance has no origin", () => {
  assert.equal(
    designPin({ revision: 1, name: "Old", taskName: "t", instructions: "" } as never),
    undefined,
  );
  assert.equal(
    designPin({ version: 5, revision: 1, name: "n", nodes: [], edges: [] } as never),
    undefined,
  );
  assert.deepEqual(designPin(designOf("u", 2, "d")), {
    id: "u",
    name: "u",
    version: 2,
    digest: "d",
  });
});

test("selection resolution is unchanged by M3.1 and reports a missing requested version", () => {
  const entries = [
    entry("agent-assisted", true, [[2, 0]]),
    entry("u", false, [
      [1, 1],
      [2, 2],
    ]),
  ];
  const fresh = resolveLibrarySelection(entries);
  assert.equal(fresh.entry?.id, "agent-assisted");
  assert.equal(fresh.version?.version, 2);
  assert.equal(fresh.requestedVersionMissing, undefined);
  const exact = resolveLibrarySelection(entries, { id: "u", version: 1 });
  assert.equal(exact.version?.version, 1, "every user version stays individually selectable");
  const missing = resolveLibrarySelection(entries, { id: "agent-assisted", version: 1 });
  assert.equal(missing.version?.version, 2, "today's fallback, made visible to M3.3 only");
  assert.equal(missing.requestedVersionMissing, 1);
});

test("gates: an occupied workspace blocks mutations and export to disk with a reason", () => {
  const open = libraryGates({ exportOccupiedReason: "export" });
  assert.equal(open.mutation, undefined);
  assert.equal(open.exportToDisk, undefined);
  const occupied = libraryGates({ occupiedReason: "run", exportOccupiedReason: "export" });
  assert.equal(occupied.mutation, "run");
  assert.equal(occupied.exportToDisk, "export");
  const readOnly = libraryGates({ hostReadOnlyReason: "ro", exportOccupiedReason: "export" });
  assert.equal(readOnly.mutation, "ro");
  assert.equal(readOnly.exportToDisk, "ro");
});
