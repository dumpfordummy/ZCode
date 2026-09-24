import assert from "node:assert/strict";
import { copyFile, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { root } from "./isolation.mjs";

const cases = [
  "complete",
  "restart-entry",
  "restart-pending",
  "boundary-planned",
  "boundary-accepted",
  "decision-failure",
  "reject",
  "cancel",
  "stale-source",
  "stale-graph",
  "incomplete-binary",
  "incomplete-oversized",
  "complete-initial-harness-failed",
];
const destination = path.join(root, "docs/graph-engineering/evidence/z3/native");
const entries = [];
for (const name of cases) {
  const logPath = path.join(root, `.tmp/z3-final/native-${name}.log`);
  const log = await readFile(logPath, "utf8");
  const summary = JSON.parse(log.slice(log.indexOf("\n{")));
  const home = await realpath(summary.home);
  assert.equal(path.dirname(home), path.join(root, ".tmp"));
  assert.match(path.basename(home), /^z1-native-\d+-[a-f0-9]{6}$/);
  const target = path.join(destination, name);
  await mkdir(target, { recursive: true });
  await writeFile(path.join(target, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  const files = [];
  for (const screenshot of summary.screenshots ?? []) {
    const resolved = await realpath(screenshot);
    assert.equal(path.dirname(resolved), home);
    const basename = path.basename(resolved);
    if (
      name !== "complete" &&
      !/canvas-detail|restarted|stopped|refusal|incomplete|persistence-failure|failure/.test(
        basename,
      )
    )
      continue;
    await copyFile(resolved, path.join(target, basename));
    files.push(basename);
  }
  if (summary.testOutput) {
    await writeFile(path.join(target, "independent-test.txt"), summary.testOutput);
    for (const source of ["fixture-before.mjs", "fixture-after.mjs", "fixture.diff"]) {
      const basename = source.endsWith(".mjs") ? `${source}.txt` : source;
      await copyFile(path.join(home, source), path.join(target, basename));
      files.push(basename);
    }
  }
  entries.push({
    scenario: name,
    status: summary.status,
    log: path.relative(root, logPath).replaceAll("\\", "/"),
    profile: home,
    nativeInputs: summary.nativeLedger?.length,
    copiedScreenshotsAndFixtures: files,
    error: summary.error,
  });
}
await writeFile(path.join(destination, "index.json"), JSON.stringify(entries, null, 2) + "\n");
console.log(JSON.stringify(entries, null, 2));
