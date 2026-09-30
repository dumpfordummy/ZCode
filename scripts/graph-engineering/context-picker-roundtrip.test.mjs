// UI 语境选择器 → Host 领域校验的往返测试。
//
// 这里 **没有替身**：chip 操作是真实的 UI 模型（packages/ui），instantiate 是真实的 Host 领域函数
// （packages/services）。它证明的是「chip 上看到的就是保存/实例化时冻结的 bindings」，而不是 chip 文案。
// 运行：node --import tsx --test scripts/graph-engineering/context-picker-roundtrip.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import {
  graphContextRemove,
  graphContextSelect,
  graphContextSetRaw,
  graphContextView,
} from "../../packages/ui/src/graph-engineering/graphContextChips.ts";
import { instantiateTemplate } from "../../packages/services/src/graph-engineering/domain/workflow.ts";
import { builtinTemplates } from "../../packages/services/src/graph-engineering/domain/workflow-samples.ts";

const version = (id) => ({
  version: 1,
  digest: "a".repeat(64),
  createdAt: 0,
  template: structuredClone(builtinTemplates.find((item) => item.id === id).template),
});
// 只填模板声明为必填的参数与工具配方，让每个内置模板都能实例化。
function validInput(selected) {
  const { template } = selected;
  const parameters = Object.fromEntries(
    template.parameters
      .filter((item) => item.required)
      .map((item) => [item.id, item.type === "boolean" ? true : item.type === "number" ? 1 : "x"]),
  );
  const recipes = Object.fromEntries(
    template.graph.nodes.filter((node) => node.type === "tool").map((node) => [node.id, node.id]),
  );
  return {
    parameters,
    bindings: {
      references: {},
      recipes,
      sourcePaths: template.graph.routing?.region ? ["src"] : [],
    },
  };
}
const instantiate = (id, bindings) => {
  const selected = version(id);
  const input = validInput(selected);
  return instantiateTemplate(id, selected, input.parameters, {
    ...input.bindings,
    ...bindings,
    recipes: input.bindings.recipes,
    sourcePaths: input.bindings.sourcePaths,
  });
};
const base = (id) => validInput(version(id)).bindings;

test("a guided selection is frozen exactly, with its receiving nodes, and the chip view reads it back", () => {
  const roles = version("generic").template.references;
  let bindings = graphContextSelect(base("generic"), "instructions", "docs/Context.md");
  bindings = graphContextSelect(bindings, "skill", "glm:workspace:fixture");
  const graph = instantiate("generic", bindings);
  assert.deepEqual(graph.template.bindings.references, {
    instructions: "docs/Context.md",
    skill: "glm:workspace:fixture",
  });
  assert.equal(graph.template.bindings.referencePolicy, "native-aware-v1");
  assert.deepEqual(
    graph.template.references.map(({ id, kind, nodeIds }) => [id, kind, nodeIds]),
    [
      ["instructions", "instruction", ["analyze", "implement"]],
      ["skill", "skill", ["implement"]],
    ],
  );
  // 往返：从冻结的 bindings 重新推导 chip，与选择时一致。
  const frozen = graphContextView({ roles, bindings: graph.template.bindings });
  assert.deepEqual(
    Object.fromEntries(frozen.chips.map((chip) => [chip.roleId, chip.value])),
    graph.template.bindings.references,
  );
});

test("replacing a reference freezes the replacement and nothing else changes", () => {
  const first = graphContextSelect(base("generic"), "instructions", "docs/a.md");
  const second = graphContextSelect(first, "instructions", "docs/b.md");
  const a = instantiate("generic", first);
  const b = instantiate("generic", second);
  assert.equal(b.template.bindings.references.instructions, "docs/b.md");
  assert.equal(Object.keys(b.template.bindings.references).length, 1);
  assert.deepEqual(
    { ...b.template.bindings, references: null },
    { ...a.template.bindings, references: null },
  );
});

test("removing an optional reference equals never selecting it (same frozen template)", () => {
  const removed = instantiate(
    "generic",
    graphContextRemove(
      graphContextSelect(base("generic"), "instructions", "docs/a.md"),
      "instructions",
    ),
  );
  const never = instantiate("generic", base("generic"));
  assert.deepEqual(removed.template.references, []);
  assert.deepEqual(removed.template.bindings.references, never.template.bindings.references);
  // 只有策略标记不同：移除不撤销已标记的 native-aware 策略（也不新增，见 UI 单测）。
  assert.equal(removed.template.bindings.referencePolicy, "native-aware-v1");
});

test("clearing the Advanced raw field equals never selecting it", () => {
  const typed = graphContextSetRaw(base("generic"), "instructions", "Context.md");
  assert.equal(
    instantiate("generic", typed).template.bindings.references.instructions,
    "Context.md",
  );
  const cleared = graphContextSetRaw(typed, "instructions", "");
  assert.equal(
    JSON.stringify(instantiate("generic", cleared).template),
    JSON.stringify(instantiate("generic", base("generic")).template),
  );
});

test("removing a required reference makes the Host reject it; it is never optional", () => {
  const roles = version("slot").template.references;
  const required = roles.find((role) => role.id === "gameDoc");
  assert.equal(required.required, true);
  const selected = graphContextSelect(base("slot"), "gameDoc", "docs/GameDoc.md");
  assert.equal(
    instantiate("slot", selected).template.bindings.references.gameDoc,
    "docs/GameDoc.md",
  );
  const removed = graphContextRemove(selected, "gameDoc");
  assert.throws(
    () => instantiate("slot", removed),
    /Required document reference gameDoc is missing/,
  );
  // UI 侧同样把它列为缺失，而不是把它当作可选。
  const view = graphContextView({ roles, bindings: removed });
  assert.deepEqual(
    view.missing.map((role) => role.id),
    ["gameDoc"],
  );
});

test("a binding for an undeclared role is rejected by the Host; the UI shows it as an orphan", () => {
  const roles = version("generic").template.references;
  const bindings = { ...base("generic"), references: { retired: "old.md" } };
  assert.throws(() => instantiate("generic", bindings), /Undeclared reference binding/);
  const orphan = graphContextView({ roles, bindings }).chips[0];
  assert.deepEqual(orphan.status, { kind: "orphan" });
  // 移除孤儿后不再阻塞实例化
  assert.doesNotThrow(() => instantiate("generic", graphContextRemove(bindings, "retired")));
});
