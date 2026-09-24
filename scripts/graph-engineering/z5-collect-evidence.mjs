import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, realpath, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { root } from "./isolation.mjs";
import { readNativeLedger } from "./z2-native-helpers.mjs";

const destination = path.join(root, "docs/graph-engineering/evidence/z5/native");
const wrappers = [];
async function writeWrapper(file, value) {
  await writeFile(file, JSON.stringify(value, null, 2) + "\n");
  wrappers.push(file);
}
function sanitize(value, home) {
  if (typeof value === "string") {
    for (const [base, label] of [
      [home, "<isolated-profile>"],
      [root, "<checkout>"],
    ]) {
      for (const width of [8, 4, 2, 1])
        value = value.replaceAll(base.replaceAll("\\", "\\".repeat(width)), label);
      value = value.replaceAll(base.replaceAll("\\", "/"), label);
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => sanitize(item, home));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitize(item, home)]),
    );
  return value;
}
async function contained(home, file) {
  const exact = await realpath(file);
  assert.ok(
    exact.startsWith(`${home}${path.sep}`),
    "Evidence must remain in its exact isolated profile.",
  );
  return exact;
}
async function collectLog(directory, name, group) {
  const logPath = path.join(directory, name),
    log = await readFile(logPath, "utf8");
  const start = log.search(/\{\r?\n  "(?:scenario|mode)"/);
  const relative = path.relative(root, logPath).replaceAll("\\", "/");
  if (start === -1)
    return {
      log: relative,
      status: "NO_SUMMARY",
      note: "Retained log must be inspected; no native result is inferred.",
    };
  const summary = JSON.parse(log.slice(start)),
    home = await realpath(summary.home);
  assert.equal(path.dirname(home), path.join(root, ".tmp"));
  assert.match(path.basename(home), /^z1-native-\d+-[a-f0-9]{6}$/);
  if (summary.mode === "chat" && !summary.nativeLedger) {
    await contained(home, path.join(home, "home/.zcode/cli/db/db.sqlite"));
    summary.collectorNativeLedger = readNativeLedger({ home, workspace: summary.workspace });
    summary.collectorNote =
      "Read-only input ledger collected from this exact synthetic profile after the predecessor Chat harness exited.";
  }
  const requests = JSON.parse(
    await readFile(await contained(home, path.join(home, "requests.json")), "utf8"),
  ).filter((request) => request.model);
  summary.collectedModelRequestCounts = { total: requests.length, byStage: {} };
  for (const request of requests) {
    const stage = request.stage ?? "unspecified";
    const kind =
      request.native === true
        ? "nativeExecution"
        : request.native === false
          ? "auxiliary"
          : "unclassified";
    const counts = (summary.collectedModelRequestCounts.byStage[stage] ??= {});
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  if (summary.modelRequests !== undefined) assert.equal(summary.modelRequests, requests.length);
  const target = path.join(destination, group, name.slice(7, -4));
  await mkdir(target, { recursive: true });
  await writeWrapper(path.join(target, "summary.json"), sanitize(summary, home));
  await writeWrapper(path.join(target, "controlled-model-requests.json"), sanitize(requests, home));
  const files = ["summary.json", "controlled-model-requests.json"];
  for (const screenshot of summary.screenshots ?? []) {
    const exact = await contained(home, screenshot);
    if (
      !["complete", "presentation"].includes(summary.scenario) &&
      !/result|reopened|failure|route|stopped|rejected|boundary|region|invalid|question/.test(
        path.basename(exact),
      )
    )
      continue;
    await copyFile(exact, path.join(target, path.basename(exact)));
    files.push(path.basename(exact));
  }
  // 重跑的节点 ID 会改变截图名；只清理本收集器目标目录里不再列出的旧 PNG，失败原图另存于其日志目录。
  const exactDestination = await realpath(destination);
  for (const name of await readdir(target)) {
    if (!name.endsWith(".png") || files.includes(name)) continue;
    const exact = await contained(exactDestination, path.join(target, name));
    assert.equal(path.dirname(exact), await realpath(target));
    await unlink(exact);
  }
  for (const proof of summary.iterationEvidence ?? []) {
    for (const key of ["report", "verification"]) {
      if (!proof[key]) continue;
      const file = `iteration-${proof.iteration.index}-${key}.json.txt`;
      await writeFile(path.join(target, file), proof[key].content);
      files.push(file);
    }
  }
  if (
    group === "current" &&
    ["complete", "exhausted", "no-progress"].includes(summary.scenario) &&
    summary.status === "PASS"
  ) {
    for (const relativeFile of [
      "z5-source-before.cs",
      "workspace/MathOps.cs",
      "workspace/Runner.cs",
      "workspace/Z4Fixture.csproj",
      "workspace/NuGet.Config",
    ]) {
      const exact = await contained(home, path.join(home, relativeFile));
      const file = `${path.basename(relativeFile)}.txt`;
      await copyFile(exact, path.join(target, file));
      files.push(file);
    }
  }
  const run = summary.finalRecord?.runs?.at(-1);
  return {
    scenario: summary.scenario,
    status: summary.status,
    log: relative,
    directory: path.relative(destination, target).replaceAll("\\", "/"),
    nativeInputs: summary.nativeLedger?.length ?? summary.collectorNativeLedger?.length,
    modelRequests: requests.length,
    nativeProcesses:
      run?.toolAttempts?.filter((item) => item.operation?.processStarted).length ??
      (summary.finalRecord?.runs?.length === 0 ? 0 : undefined),
    admissions: run?.routing?.admissions,
    iterations: run?.routing?.iterations?.length,
    finalStatus: run?.status,
    stopReason: sanitize(run?.routing?.stopReason, home),
    files,
    error: sanitize(summary.error, home),
  };
}
const entries = [];
for (const [directory, group] of [
  [path.join(root, ".tmp/z5-native-checks"), "current"],
  [path.join(root, ".tmp/z5-baseline"), "baseline"],
  [path.join(root, ".tmp/z5-regressions"), "final-regressions"],
]) {
  const names = await readdir(directory).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  for (const name of names
    .filter((value) => /^native-[a-z0-9-]+\.log$/.test(value) && value !== "native-tests.log")
    .sort())
    entries.push(await collectLog(directory, name, group));
}
const manualLog = await readFile(
  path.join(root, ".tmp/z5-native-checks/manual-setup.log"),
  "utf8",
).catch((error) => {
  if (error.code === "ENOENT") return undefined;
  throw error;
});
if (manualLog) {
  const home = await realpath(manualLog.match(/^Isolated profile: (.+)\r?$/m)[1].trim());
  assert.equal(path.dirname(home), path.join(root, ".tmp"));
  assert.match(path.basename(home), /^z1-manual-\d+-[a-f0-9]{6}$/);
  for (const kind of ["setup", "reopen"]) {
    const summary = JSON.parse(await readFile(path.join(home, `z4-manual-${kind}.json`), "utf8"));
    const target = path.join(destination, `manual-${kind}`);
    await mkdir(target, { recursive: true });
    await writeWrapper(path.join(target, "summary.json"), sanitize(summary, home));
    const exact = await contained(home, summary.screenshot);
    await copyFile(exact, path.join(target, path.basename(exact)));
    entries.push({
      scenario: `manual-${kind}`,
      status: summary.status,
      nativeInputs: 0,
      modelRequests: 0,
      nativeProcesses: 0,
      userOperatedChecks: "NOT RUN",
      directory: `manual-${kind}`,
    });
  }
}
await mkdir(destination, { recursive: true });
await writeWrapper(path.join(destination, "index.json"), entries);
// 只格式化生成的 JSON 外层；原始报告 .json.txt 字节保留用于独立摘要核验。
await promisify(execFile)(
  process.execPath,
  [path.join(root, "node_modules/oxfmt/bin/oxfmt"), ...wrappers],
  { cwd: root, windowsHide: true },
);
console.log(JSON.stringify(entries, null, 2));
