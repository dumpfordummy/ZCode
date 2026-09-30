// Context picker 浏览器场景的公共辅助函数。断言对象是草稿 store 里的 bindings 负载、Host 调用日志与
// 焦点/ARIA，而不仅是 chip 文案。
import assert from "node:assert/strict";
import path from "node:path";

export const T = (page, id) => page.getByTestId(id);
export const SIZES = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
];
const ALLOWED_OPS = new Set([
  "reference-catalog",
  "validate-reference",
  "searchWorkspaceFiles",
  "selectFile",
  "instantiate",
]);

export async function until(check, what, timeout = 8000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
export const flush = (page) =>
  page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
export const setState = (page, patch) =>
  page.evaluate((value) => window.__harness.set(value), patch);
export const draft = (page, workspace = "A", template = "agent-assisted") =>
  page.evaluate(([w, t]) => window.__harness.draft(w, t) ?? null, [workspace, template]);
export const references = async (page, workspace, template) =>
  (await draft(page, workspace, template))?.bindings.references ?? {};
export const focused = (page) =>
  page.evaluate(
    () => document.activeElement?.getAttribute("data-testid") ?? document.activeElement?.tagName,
  );
export const started = (host, op) =>
  host.calls.filter((call) => call.op === op && call.phase === "start");
export const finished = (host, op) =>
  host.calls.filter((call) => call.op === op && call.phase === "done");
export const instantiations = (host) => host.calls.filter((call) => call.op === "instantiate");

export async function boot(page, host, url, patch) {
  await page.goto(url);
  await page.waitForFunction(() => window.__harness?.ready === true);
  if (patch) await setState(page, patch);
  await T(page, "graph-reference-bindings").waitFor();
  await flush(page);
}
export async function openPicker(page) {
  await T(page, "graph-context-add").focus();
  await page.keyboard.press("Enter");
  await T(page, "graph-context-search").waitFor();
  await until(async () => (await focused(page)) === "graph-context-search", "search field focus");
}
export async function search(page, text) {
  await T(page, "graph-context-search").fill(text);
}
export const optionCount = (page) => page.locator('[data-testid^="graph-context-option-"]').count();
export async function pickByKeyboard(page, index = 0) {
  for (let step = 0; step <= index; step += 1) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
}
/** 通过键盘：打开 → 搜索 → 移动到第 index 项 → Enter。等待 chip 出现。 */
export async function addByKeyboard(page, query, role, index = 0) {
  await openPicker(page);
  await search(page, query);
  await until(async () => (await optionCount(page)) > index, `results for "${query}"`);
  await pickByKeyboard(page, index);
  await T(page, `graph-context-chip-${role}`).waitFor();
  await T(page, "graph-context-popover").waitFor({ state: "hidden" });
}
export const statusOf = (page, role) =>
  T(page, `graph-context-chip-${role}`).getAttribute("data-status");
export function assertClean(host, expectedInstantiations = 0) {
  const forbidden = host.calls.filter((call) => call.op === "FORBIDDEN");
  assert.deepEqual(forbidden, [], "no forbidden service or platform member may be touched");
  const ops = new Set(host.calls.map((call) => call.op));
  for (const op of ops) assert.ok(ALLOWED_OPS.has(op), `unexpected operation ${op}`);
  assert.equal(instantiations(host).length, expectedInstantiations, "instantiate count");
}
export async function shot(page, dir, name, viewport) {
  if (!dir) return;
  await page.setViewportSize(viewport);
  await flush(page);
  await page.screenshot({
    path: path.join(dir, `${name}-${viewport.width}x${viewport.height}.png`),
  });
}
