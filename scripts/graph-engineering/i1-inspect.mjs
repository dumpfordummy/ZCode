// Z8.4-I1: open the INSTALLED app on the guest's existing profile and report what Graph shows and stores, without
// rewriting the profile (Z1_PRESERVE_PROFILE=1). Guest-only: isolation.mjs refuses Z1_INSTALLED_PROFILE elsewhere.
//   node i1-inspect.mjs --workspace=<synthetic workspace> [--expect-runs=N] [--out=<file>]
// Reports the run rows the UI renders (id, status), the record file's runs, and byte hashes of the profile's Graph files
// and settings before and after the app opened them.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createIsolation } from "./isolation.mjs";
import { acceptancePaths } from "./acceptance-paths.mjs";
import { showGraph } from "./z3-native-helpers.mjs";

const arg = (name) =>
  process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
const workspace = arg("workspace");
assert.ok(workspace, "--workspace is required");
const expectRuns = Number(arg("expect-runs") ?? 1);
process.env.Z1_PRESERVE_PROFILE = "1";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function hashTree(root, prefix = "") {
  const out = {};
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    const rel = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) Object.assign(out, await hashTree(path.join(root, entry.name), rel));
    else out[rel] = sha(await readFile(path.join(root, entry.name)).catch(() => Buffer.alloc(0)));
  }
  return out;
}

const isolation = await createIsolation({ adoptWorkspace: workspace, noProvider: true });
const dataRoot = path.join(isolation.graphProfile.env.ZCODE_DATA_BASE_DIR, ".zcode", "v2");
/** Library entries and settings key names only (values of the synthetic marker, nothing else). */
async function profileFacts() {
  const library = await readFile(
    path.join(dataRoot, "graph-engineering", "workflow-library.json"),
    "utf8",
  )
    .then((text) => JSON.parse(text))
    .catch(() => undefined);
  const settings = await readFile(path.join(dataRoot, "setting.json"), "utf8")
    .then((text) => JSON.parse(text))
    .catch(() => undefined);
  return {
    libraryEntries: library?.entries?.map((entry) => ({
      id: entry.id,
      name: entry.name,
      versions: entry.versions?.length,
      archived: entry.archived,
    })),
    settingKeys: settings ? Object.keys(settings).sort() : undefined,
    settingsMarker: settings?.i1SyntheticMarker,
    settingsLocale: settings?.localePreference,
  };
}
const graphDir = path.join(dataRoot, "graph-engineering");
const summary = {
  label: arg("label") ?? "inspect",
  workspaceKey: path.basename(acceptancePaths(isolation).record),
};
let window;
let failure;
try {
  summary.hashesBefore = {
    graph: await hashTree(graphDir),
    settingJson: await readFile(path.join(dataRoot, "setting.json"))
      .then(sha)
      .catch(() => null),
  };
  window = await isolation.launch();
  summary.identity = await isolation.app.evaluate(({ app }) => ({
    name: app.getName(),
    isPackaged: app.isPackaged,
    version: app.getVersion(),
    exePath: app.getPath("exe"),
    userData: app.getPath("userData"),
  }));
  await showGraph(window);
  const rows = window.locator('[data-testid="graph-run"]');
  if (expectRuns > 0)
    await rows
      .nth(expectRuns - 1)
      .waitFor({ timeout: 45000 })
      .catch(() => undefined);
  summary.uiRuns = await rows.evaluateAll((items) =>
    items.map((item) => ({
      id: item.getAttribute("data-run-id"),
      status: item.getAttribute("data-status"),
    })),
  );
  const record = JSON.parse(await readFile(acceptancePaths(isolation).record, "utf8"));
  summary.recordRuns = record.runs.map((run) => ({
    id: run.id,
    status: run.status,
    name: run.definition?.name,
  }));
  summary.recordSha256 = sha(await readFile(acceptancePaths(isolation).record));
  Object.assign(summary, await profileFacts());
  summary.screenshot = path.join(isolation.home, "i1-inspect.png");
  await window.screenshot({ path: summary.screenshot });
} catch (error) {
  failure = error;
  summary.error = error instanceof Error ? error.stack : String(error);
}
await isolation.stopApp();
summary.hashesAfter = {
  graph: await hashTree(graphDir),
  settingJson: await readFile(path.join(dataRoot, "setting.json"))
    .then(sha)
    .catch(() => null),
};
summary.graphFilesChangedByOpen = Object.keys({
  ...summary.hashesBefore.graph,
  ...summary.hashesAfter.graph,
}).filter((file) => summary.hashesBefore.graph[file] !== summary.hashesAfter.graph[file]);
summary.status = failure ? "FAIL" : "PASS";
await isolation.fixture.close();
const text = JSON.stringify(summary, null, 2);
if (arg("out")) await writeFile(arg("out"), text);
console.log(text);
if (failure) process.exitCode = 1;
