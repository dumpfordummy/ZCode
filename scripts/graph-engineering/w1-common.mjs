// Z8.3-W1 shared helpers: safe launch of the detached packaged app and evidence writing.
// Only synthetic profiles created by createIsolation() are used; the operator's profiles are never read.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createIsolation } from "./isolation.mjs";
import { startFixture } from "./provider-fixture.mjs";
import { ensureShellFolders } from "./ux-m2-native-common.mjs";

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** The detached copy under test; the harness refuses to run against anything that is not the packaged exe. */
export function packagedExe() {
  const exe = process.env.Z1_PACKAGED_EXE;
  assert.ok(exe, "Z1_PACKAGED_EXE must point at the detached packaged ZCode Graph.exe");
  return exe;
}

/**
 * Launch the packaged app on a fresh synthetic profile. `provider` configures the loopback model fixture; otherwise the
 * profile has no model provider. The fixture also records HTTPS-proxy CONNECT targets (answered 502, never tunnelled).
 */
export async function createW1Isolation({ provider } = {}) {
  packagedExe();
  const isolation = await createIsolation({
    noProvider: !provider,
    fixtureFactory: (workspace) => startFixture(workspace, { recordConnect: true }),
  });
  await ensureShellFolders(isolation);
  return isolation;
}

/** Everything the loopback recorder observed, reduced to method + path shape (no bodies). */
export function recorderSnapshot(isolation) {
  return isolation.fixture.requests.map((request) => ({
    method: request.method ?? "HTTP",
    path: request.path,
    model: request.model ? true : undefined,
    userAgent: request.userAgent,
    at: request.at,
    client: request.client,
  }));
}

export async function listTree(root) {
  const out = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else out.push({ file: path.relative(root, full), bytes: (await stat(full)).size });
    }
  }
  await walk(root);
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

/** Replace the synthetic profile root and workspace with a fixed token before a value is shown as evidence. */
export function sanitize(value, isolation) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const roots = [isolation.workspace, isolation.home, process.env.Z1_PACKAGED_EXE && path.dirname(process.env.Z1_PACKAGED_EXE)]
    .filter(Boolean)
    .flatMap((root) => [root, root.replaceAll("\\", "/"), root.replaceAll("\\", "\\\\")]);
  let out = text;
  for (const root of roots) out = out.split(root).join("<sandbox>");
  return out.replace(/[A-Za-z]:(?:\\\\|\\|\/)Users(?:\\\\|\\|\/)[^\s"')\\]+/g, "<user-path>");
}

export async function finish(isolation, summary, window, error) {
  summary.status = error ? "FAIL" : "PASS";
  if (error) {
    summary.error = error instanceof Error ? error.stack : String(error);
    summary.body = await window?.locator("body").innerText().catch(() => "Unavailable");
    if (window)
      await window.screenshot({ path: path.join(isolation.home, "w1-failure.png") }).catch(() => {});
    process.exitCode = 1;
  }
  summary.home = isolation.home;
  summary.network = recorderSnapshot(isolation);
  await writeFile(path.join(isolation.home, "w1-summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  await isolation.close();
}
