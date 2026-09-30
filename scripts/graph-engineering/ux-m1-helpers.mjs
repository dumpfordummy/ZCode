// Shared helpers for the UX-M1 browser scenarios. Assertions target the draft store, the Host call
// log, focus and ARIA, not only visible text.
import assert from "node:assert/strict";
import path from "node:path";

export const T = (page, id) => page.getByTestId(id);
export const SIZES = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
];
const ALLOWED_OPS = new Set([
  "graph.getWorkspace",
  "graph.saveDefinition",
  "graph.validateDefinition",
  "graph.recipes.read",
  "graph.recipes.save",
  "graph.run",
  "wf.list",
  "wf.instantiate",
  "wf.prepare",
  "reference-catalog",
  "validate-reference",
  "searchWorkspaceFiles",
  "selectFile",
  "openConversation",
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
export const drafts = (page) => page.evaluate(() => window.__harness.drafts());
export const navigation = (page) => page.evaluate(() => window.__harness.navigation());
export const focused = (page) =>
  page.evaluate(
    () => document.activeElement?.getAttribute("data-testid") ?? document.activeElement?.tagName,
  );

/** Calls that reached the fixture Host, by operation. */
export const started = (host, name) =>
  host.calls.filter((call) => call.op === name && call.phase === "start");
export const finished = (host, name) =>
  host.calls.filter((call) => call.op === name && call.phase === "done");
/** Operations that would instantiate, save, prepare or admit work (the guarded set). */
export const ADMISSION_OPS = ["wf.instantiate", "graph.saveDefinition", "wf.prepare", "graph.run"];
export const admissionCalls = (host) =>
  host.calls.filter((call) => call.phase === "start" && ADMISSION_OPS.includes(call.op));

export async function boot(page, host, url, patch) {
  await page.goto(url);
  await page.waitForFunction(() => window.__harness?.ready === true);
  if (patch) await setState(page, patch);
  await T(page, "graph-new-run-pane").waitFor();
  await T(page, "graph-template-parameter-request").waitFor();
  await flush(page);
}

/** Every scenario ends here: nothing forbidden was touched, only known operations were used. */
export function assertClean(host) {
  assert.deepEqual(
    host.calls.filter((call) => call.op === "FORBIDDEN"),
    [],
    "no forbidden service or platform member may be touched",
  );
  for (const call of host.calls)
    assert.ok(
      ALLOWED_OPS.has(call.op) || call.op === "FORBIDDEN",
      `unexpected operation ${call.op}`,
    );
}

export async function shot(page, dir, name, viewport) {
  if (!dir) return;
  await page.setViewportSize(viewport);
  await flush(page);
  await page.screenshot({
    path: path.join(dir, `${name}-${viewport.width}x${viewport.height}.png`),
  });
}
