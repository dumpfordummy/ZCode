import assert from "node:assert/strict";
import { copyFile, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { root } from "./isolation.mjs";

const logDirectory = path.join(root, ".tmp/z4-native-checks");
const destination = path.join(root, "docs/graph-engineering/evidence/z4/native");
const entries = [];
function sanitizeProfile(value, home) {
  if (typeof value === "string") {
    let result = value;
    for (const [base, label] of [
      [home, "<isolated-profile>"],
      [root, "<checkout>"],
    ]) {
      for (const length of [8, 4, 2, 1])
        result = result.replaceAll(base.replaceAll("\\", "\\".repeat(length)), label);
      result = result.replaceAll(base.replaceAll("\\", "/"), label);
    }
    return result;
  }
  if (Array.isArray(value)) return value.map((child) => sanitizeProfile(child, home));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, sanitizeProfile(child, home)]),
    );
  return value;
}
for (const name of (await readdir(logDirectory))
  .filter((name) => /^native-[a-z0-9-]+\.log$/.test(name))
  .sort()) {
  const logPath = path.join(logDirectory, name);
  const log = await readFile(logPath, "utf8");
  const start = log.search(/\{\r?\n  "scenario"/);
  if (start === -1) {
    entries.push({
      log: path.relative(root, logPath).replaceAll("\\", "/"),
      status: "NO_SUMMARY",
      note: "Read the retained log; no native result is inferred.",
    });
    continue;
  }
  const summary = JSON.parse(log.slice(start));
  const home = await realpath(summary.home);
  assert.equal(path.dirname(home), path.join(root, ".tmp"));
  assert.match(path.basename(home), /^z1-native-\d+-[a-f0-9]{6}$/);
  const target = path.join(destination, name.slice(7, -4));
  await mkdir(target, { recursive: true });
  const sanitize = (value) => sanitizeProfile(value, home);
  await writeFile(
    path.join(target, "summary.json"),
    JSON.stringify(sanitize(summary), null, 2) + "\n",
  );
  const copied = [];
  for (const screenshot of summary.screenshots ?? []) {
    const exact = await realpath(screenshot);
    assert.equal(path.dirname(exact), home);
    const basename = path.basename(exact);
    if (summary.scenario !== "complete" && !/result|reopened|failure|permission/.test(basename))
      continue;
    await copyFile(exact, path.join(target, basename));
    copied.push(basename);
  }
  if (["complete", "model-pass"].includes(summary.scenario) && summary.status === "PASS") {
    await copyFile(
      path.join(home, "z4-source-before.cs"),
      path.join(target, "MathOps-before.cs.txt"),
    );
    copied.push("MathOps-before.cs.txt");
    for (const file of [
      "Z4Fixture.csproj",
      "MathOps.cs",
      "Runner.cs",
      "NuGet.Config",
      "results/test-report.json",
    ]) {
      const exact = await realpath(path.join(home, "workspace", file));
      assert.ok(exact.startsWith(`${home}${path.sep}workspace${path.sep}`));
      const output = `${path.basename(file)}.txt`;
      await copyFile(exact, path.join(target, output));
      copied.push(output);
    }
  }
  const run = summary.finalRecord?.runs?.at(-1);
  const processIds = new Set(
    run?.toolAttempts
      ?.filter((item) => item.operation?.processStarted)
      .map((item) => item.operationId),
  );
  if (summary.processReadiness?.state === "actual-process-started")
    processIds.add(summary.processReadiness.operationId);
  entries.push({
    scenario: summary.scenario,
    status: summary.status,
    log: path.relative(root, logPath).replaceAll("\\", "/"),
    nativeInputs: summary.nativeLedger?.length,
    nativeProcesses: processIds.size,
    modelRequests: summary.modelRequests,
    verification: sanitize(
      run?.toolAttempts?.find((item) => item.recipe?.verifier.kind === "test")?.verification,
    ),
    files: copied,
    error: sanitize(summary.error),
  });
}
const manualLog = await readFile(path.join(logDirectory, "manual-setup.log"), "utf8");
const manualHome = await realpath(manualLog.match(/^Isolated profile: (.+)\r?$/m)[1].trim());
assert.equal(path.dirname(manualHome), path.join(root, ".tmp"));
assert.match(path.basename(manualHome), /^z1-manual-\d+-[a-f0-9]{6}$/);
for (const kind of ["setup", "reopen"]) {
  const summary = JSON.parse(
    await readFile(path.join(manualHome, `z4-manual-${kind}.json`), "utf8"),
  );
  const target = path.join(destination, `manual-${kind}`);
  await mkdir(target, { recursive: true });
  await writeFile(
    path.join(target, "summary.json"),
    JSON.stringify(sanitizeProfile(summary, manualHome), null, 2) + "\n",
  );
  const screenshot = await realpath(summary.screenshot);
  assert.equal(path.dirname(screenshot), manualHome);
  await copyFile(screenshot, path.join(target, path.basename(screenshot)));
  entries.push({
    scenario: `manual-${kind}`,
    status: summary.status,
    nativeInputs: summary.nativeInputs,
    nativeProcesses: 0,
    modelRequests: summary.modelRequests,
    userOperatedChecks: summary.userOperatedChecks,
    files: [path.basename(screenshot)],
  });
}
await mkdir(destination, { recursive: true });
await writeFile(path.join(destination, "index.json"), JSON.stringify(entries, null, 2) + "\n");
console.log(JSON.stringify(entries, null, 2));
