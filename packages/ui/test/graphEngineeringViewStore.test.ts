import assert from "node:assert/strict";
import test from "node:test";
import { useGraphEngineeringViewStore } from "../src/store/graphEngineeringViewStore.js";

const KEY = "workspace-a";
const store = () => useGraphEngineeringViewStore.getState();
const focus = () => store().selections[KEY]?.focus;
const reset = () => useGraphEngineeringViewStore.setState({ selections: {} });

test("a focus request belongs to the navigation that set it and cannot linger", () => {
  reset();
  store().select(KEY, { mode: "runs", pane: "new", focus: "draft" });
  assert.equal(focus(), "draft");
  // 任何没有再次设置 focus 的导航都会清除它，之后的刷新或 Host 事件不会再移动焦点。
  store().select(KEY, { mode: "design" });
  assert.equal(focus(), undefined);
  store().select(KEY, { mode: "setup", checkId: "test-unit", returnToWorkflow: true });
  assert.equal(focus(), undefined);
  assert.equal(store().selections[KEY]?.checkId, "test-unit", "other navigation fields are kept");
});

test("selecting a run clears a pending request, and the run request is set by a second select", () => {
  reset();
  store().select(KEY, { mode: "runs", pane: "new", focus: { checkId: "b1" } });
  assert.deepEqual(focus(), { checkId: "b1" });
  store().selectRun(KEY, "run-1");
  assert.equal(focus(), undefined);
  store().select(KEY, { focus: "run" });
  assert.equal(focus(), "run");
  assert.equal(store().selections[KEY]?.runId, "run-1", "the run stays selected");
});

test("consuming clears only the request", () => {
  reset();
  store().selectRun(KEY, "run-1");
  store().select(KEY, { focus: "run" });
  store().select(KEY, { focus: undefined });
  const selection = store().selections[KEY];
  assert.equal(selection?.focus, undefined);
  assert.equal(selection?.runId, "run-1");
  assert.equal(selection?.mode, "runs");
});

test("focus requests are per workspace", () => {
  reset();
  store().select("workspace-a", { focus: "draft" });
  store().select("workspace-b", { mode: "design" });
  assert.equal(store().selections["workspace-a"]?.focus, "draft");
  assert.equal(store().selections["workspace-b"]?.focus, undefined);
});

test("UX-M2.1: every explicit run navigation increments reveal; other navigation keeps it", () => {
  reset();
  store().selectRun(KEY, "run-1");
  const first = store().selections[KEY]?.reveal ?? 0;
  assert.ok(first > 0);
  // 同一个已选中的运行再次被显式打开（例如翻页后按 Go to run）也必须能再次翻到它所在的页。
  store().selectRun(KEY, "run-1");
  assert.equal(store().selections[KEY]?.reveal, first + 1);
  store().select(KEY, { focus: "run" });
  store().select(KEY, { mode: "design" });
  store().select(KEY, { mode: "runs" });
  assert.equal(store().selections[KEY]?.reveal, first + 1, "select() never reveals");
  assert.equal(
    useGraphEngineeringViewStore.getState().selections["workspace-b"]?.reveal,
    undefined,
    "another workspace is untouched",
  );
});
