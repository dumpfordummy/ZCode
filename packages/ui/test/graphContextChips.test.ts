import assert from "node:assert/strict";
import test from "node:test";
import type { GraphReferenceCatalog, GraphTemplateBindings } from "@zcode/services";
import {
  GRAPH_CONTEXT_OPTION_LIMIT,
  graphContextOptions,
  graphContextRemove,
  graphContextSelect,
  graphContextSetRaw,
  graphContextView,
  type GraphContextRole,
} from "../src/graph-engineering/graphContextChips.js";

const digest = "a".repeat(64);
const roles: GraphContextRole[] = [
  {
    id: "instructions",
    label: "Additional project instructions",
    kind: "instruction",
    nodeIds: ["analyze", "implement"],
  },
  { id: "skill", label: "Existing native skill", kind: "skill", nodeIds: ["implement"] },
  {
    id: "gameDoc",
    label: "Authoritative GameDoc",
    kind: "document",
    required: true,
    nodeIds: ["analyze"],
  },
];
const catalog: GraphReferenceCatalog = {
  kind: "reference-catalog",
  status: "available",
  unknowns: [],
  instructions: [
    { scope: "workspace", path: "AGENTS.md", digest, bytes: 10, truncated: false },
    { scope: "user", path: "C:/Users/dev/.zcode/AGENTS.md", digest, bytes: 10, truncated: false },
  ],
  skills: [
    {
      id: "glm:workspace:fixture",
      name: "Fixture guidance",
      path: "SKILL.md",
      scope: "workspace",
      enabled: true,
      digest,
    },
    {
      id: "glm:user:off",
      name: "Disabled skill",
      path: "SKILL.md",
      scope: "user",
      enabled: false,
      digest,
    },
    { id: "glm:user:nodigest", name: "No digest", path: "SKILL.md", scope: "user", enabled: true },
  ],
};
const empty: GraphTemplateBindings = { references: {}, recipes: {}, sourcePaths: [] };
// 不属于 references 的字段：任何 chip 操作都必须原样保留。
const withOthers: GraphTemplateBindings = {
  references: { instructions: "docs/a.md", gameDoc: "docs/Game.md" },
  recipes: { build: "b", test: "t" },
  recipeGroups: { test: ["t"] },
  buildMappings: { test: "build" },
  sourcePaths: ["src"],
  referencePolicy: "native-aware-v1",
};

test("one chip per selected role in declaration order; a role never yields two chips", () => {
  const view = graphContextView({ roles, bindings: withOthers });
  assert.deepEqual(
    view.chips.map((chip) => [chip.roleId, chip.value]),
    [
      ["instructions", "docs/a.md"],
      ["gameDoc", "docs/Game.md"],
    ],
  );
  assert.equal(view.slots, 3);
  assert.equal(view.selected, 2);
  assert.deepEqual(view.missing, []);
  assert.equal(new Set(view.chips.map((chip) => chip.roleId)).size, view.chips.length);
});

test("chip carries the declared role, kind, required flag and receiving nodes unchanged", () => {
  const chip = graphContextView({ roles, bindings: withOthers }).chips.find(
    (item) => item.roleId === "gameDoc",
  )!;
  assert.equal(chip.roleLabel, "Authoritative GameDoc");
  assert.equal(chip.kind, "document");
  assert.equal(chip.required, true);
  assert.deepEqual(chip.nodeIds, ["analyze"]);
  assert.equal(chip.title, "Game.md");
  assert.equal(chip.detail, "docs/Game.md");
});

test("a required role with no value is reported missing; whitespace counts as no value", () => {
  assert.deepEqual(
    graphContextView({ roles, bindings: empty }).missing.map((role) => role.id),
    ["gameDoc"],
  );
  assert.deepEqual(
    graphContextView({ roles, bindings: { references: { gameDoc: "   " } } }).missing.map(
      (role) => role.id,
    ),
    ["gameDoc"],
  );
});

test("removing a required reference makes it missing again and never optional", () => {
  const removed = graphContextRemove(withOthers, "gameDoc");
  const view = graphContextView({ roles, bindings: removed });
  assert.deepEqual(
    view.missing.map((role) => role.id),
    ["gameDoc"],
  );
  assert.equal(view.missing[0]!.required, true);
  assert.equal("gameDoc" in removed.references, false);
});

test("remove deletes only that role's key and preserves every other field and the policy", () => {
  const removed = graphContextRemove(withOthers, "instructions");
  assert.deepEqual(removed.references, { gameDoc: "docs/Game.md" });
  assert.equal(removed.referencePolicy, "native-aware-v1");
  assert.deepEqual(removed.recipes, withOthers.recipes);
  assert.deepEqual(removed.recipeGroups, withOthers.recipeGroups);
  assert.deepEqual(removed.buildMappings, withOthers.buildMappings);
  assert.deepEqual(removed.sourcePaths, withOthers.sourcePaths);
  // 输入不被修改
  assert.deepEqual(withOthers.references, { instructions: "docs/a.md", gameDoc: "docs/Game.md" });
});

test("remove never adds a policy that was not there and is a no-op for an unset role", () => {
  const legacy: GraphTemplateBindings = { ...empty, references: { instructions: "x.md" } };
  const removed = graphContextRemove(legacy, "instructions");
  assert.equal("referencePolicy" in removed, false);
  assert.equal(graphContextRemove(empty, "instructions"), empty);
});

test("a guided select sets the policy and only that role; replacing overwrites just that role", () => {
  const added = graphContextSelect(empty, "instructions", "docs/a.md");
  assert.equal(added.referencePolicy, "native-aware-v1");
  assert.deepEqual(added.references, { instructions: "docs/a.md" });
  const replaced = graphContextSelect(withOthers, "instructions", "docs/b.md");
  assert.deepEqual(replaced.references, { instructions: "docs/b.md", gameDoc: "docs/Game.md" });
  assert.equal(Object.keys(replaced.references).length, 2);
  assert.deepEqual(replaced.recipes, withOthers.recipes);
  assert.deepEqual(replaced.sourcePaths, withOthers.sourcePaths);
});

test("selecting the value already bound returns the same object (no write)", () => {
  assert.equal(graphContextSelect(withOthers, "instructions", "docs/a.md"), withOthers);
});

test("advanced raw edits keep the policy untouched; empty text unsets the key", () => {
  const typed = graphContextSetRaw(empty, "instructions", "Context.md");
  assert.equal("referencePolicy" in typed, false);
  assert.deepEqual(typed.references, { instructions: "Context.md" });
  const cleared = graphContextSetRaw(typed, "instructions", "  ");
  assert.deepEqual(cleared.references, {});
  assert.deepEqual(cleared, empty);
  // 保留策略
  assert.equal(
    graphContextSetRaw(withOthers, "instructions", "raw.md").referencePolicy,
    "native-aware-v1",
  );
});

test("payload round-trip: chip values are exactly the bindings the operations produced", () => {
  let bindings = empty;
  bindings = graphContextSelect(bindings, "gameDoc", "docs/Game.md");
  bindings = graphContextSelect(bindings, "skill", "glm:workspace:fixture");
  bindings = graphContextSelect(bindings, "instructions", "AGENTS.md");
  bindings = graphContextRemove(bindings, "instructions");
  const view = graphContextView({ roles, bindings, catalog });
  assert.deepEqual(
    Object.fromEntries(view.chips.map((chip) => [chip.roleId, chip.value])),
    bindings.references,
  );
});

test("delivery status comes only from a Host validation of the exact value", () => {
  const record = {
    path: "docs/a.md",
    validation: {
      delivery: "explicit-read" as const,
      issues: ["Native delivery is Unknown"],
      digest,
      bytes: 3,
    },
  };
  const same = graphContextView({
    roles,
    bindings: withOthers,
    validations: { instructions: record },
  });
  assert.deepEqual(same.chips[0]!.status, {
    kind: "delivery",
    delivery: "explicit-read",
    issues: ["Native delivery is Unknown"],
  });
  // 取值改变后旧记录不再适用：不假装已验证
  const changed = graphContextView({
    roles,
    bindings: graphContextSelect(withOthers, "instructions", "docs/b.md"),
    validations: { instructions: record },
  });
  assert.deepEqual(changed.chips[0]!.status, { kind: "not-checked" });
  // 没有记录：未检查，绝不是 native-instructions
  assert.deepEqual(graphContextView({ roles, bindings: withOthers }).chips[0]!.status, {
    kind: "not-checked",
  });
});

test("skill chips reflect catalogue identity and enablement; unknown stays unknown", () => {
  const state = (id: string, cat?: GraphReferenceCatalog) =>
    graphContextView({ roles, bindings: { references: { skill: id } }, catalog: cat }).chips[0]!;
  assert.deepEqual(state("glm:workspace:fixture", catalog).status, {
    kind: "skill",
    state: "available",
  });
  assert.equal(state("glm:workspace:fixture", catalog).title, "Fixture guidance");
  assert.equal(state("glm:workspace:fixture", catalog).detail, "glm:workspace:fixture · workspace");
  assert.deepEqual(state("glm:user:off", catalog).status, { kind: "skill", state: "unavailable" });
  assert.deepEqual(state("glm:user:nodigest", catalog).status, {
    kind: "skill",
    state: "unavailable",
  });
  assert.deepEqual(state("glm:user:gone", catalog).status, { kind: "skill", state: "unknown" });
  assert.equal(state("glm:user:gone", catalog).title, "glm:user:gone");
  assert.deepEqual(state("glm:workspace:fixture").status, {
    kind: "skill",
    state: "catalog-missing",
  });
  // 目录 status=unknown：没有目录，不是「目录里没有」
  assert.deepEqual(state("x", { ...catalog, status: "unknown", skills: [] }).status, {
    kind: "skill",
    state: "catalog-missing",
  });
});

test("a binding for an undeclared role is shown as an orphan, never dropped", () => {
  const view = graphContextView({
    roles,
    bindings: { references: { gameDoc: "g.md", retired: "old.md" } },
  });
  const orphan = view.chips.find((chip) => chip.roleId === "retired")!;
  assert.deepEqual(orphan.status, { kind: "orphan" });
  assert.equal(orphan.value, "old.md");
  assert.equal(view.selected, 1, "an orphan is not a selected declared slot");
  assert.deepEqual(
    graphContextRemove({ ...empty, references: { retired: "old.md" } }, "retired").references,
    {},
  );
});

test("nothing is ever labelled as inherited or delivered without a Host validation", () => {
  const view = graphContextView({
    roles,
    bindings: { references: { instructions: "AGENTS.md" } },
    catalog,
  });
  // AGENTS.md 出现在目录的原生指令里，但用户选中它并不等于已验证/已交付。
  assert.deepEqual(view.chips[0]!.status, { kind: "not-checked" });
});

test("options by kind: documents use files only; instructions list native entries then files; skills use the catalogue", () => {
  const files = [
    { name: "Game.md", relativePath: "docs/Game.md" },
    { name: "AGENTS.md", relativePath: "AGENTS.md" },
  ];
  const doc = graphContextOptions({ role: { kind: "document" }, query: "", files, catalog });
  assert.deepEqual(
    doc.map((o) => o.group),
    ["file", "file"],
  );
  // `files` are results the file service already filtered by the query; the model only filters
  // the catalogue entries itself.
  const ins = graphContextOptions({
    role: { kind: "instruction" },
    query: "agents",
    files: files.filter((file) => /agents/i.test(file.name)),
    catalog,
  });
  assert.deepEqual(
    ins.map((o) => [o.group, o.value]),
    [
      ["instruction", "AGENTS.md"],
      ["instruction", "C:/Users/dev/.zcode/AGENTS.md"],
    ],
  );
  const insNoDup = graphContextOptions({
    role: { kind: "instruction" },
    query: "",
    files,
    catalog,
  });
  assert.equal(
    insNoDup.filter((o) => o.value === "AGENTS.md").length,
    1,
    "a file equal to an instruction is not repeated",
  );
  const skills = graphContextOptions({ role: { kind: "skill" }, query: "", files, catalog });
  assert.deepEqual(
    skills.map((o) => [o.value, o.disabled ?? null]),
    [
      ["glm:workspace:fixture", null],
      ["glm:user:off", "skill-unavailable"],
      ["glm:user:nodigest", "skill-unavailable"],
    ],
  );
  assert.deepEqual(
    graphContextOptions({ role: { kind: "skill" }, query: "fixture", files: [], catalog }).map(
      (o) => o.value,
    ),
    ["glm:workspace:fixture"],
  );
});

test("options without a catalogue are empty for skills and still list files for documents", () => {
  assert.deepEqual(graphContextOptions({ role: { kind: "skill" }, query: "", files: [] }), []);
  assert.equal(
    graphContextOptions({
      role: { kind: "document" },
      query: "",
      files: [{ name: "a.md", relativePath: "a.md" }],
    }).length,
    1,
  );
});

test("rendered options are bounded", () => {
  const files = Array.from({ length: GRAPH_CONTEXT_OPTION_LIMIT + 20 }, (_, i) => ({
    name: `f${i}.md`,
    relativePath: `f${i}.md`,
  }));
  assert.equal(
    graphContextOptions({ role: { kind: "document" }, query: "", files }).length,
    GRAPH_CONTEXT_OPTION_LIMIT,
  );
});
