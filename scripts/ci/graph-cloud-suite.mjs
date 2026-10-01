#!/usr/bin/env node
// CLOUD-BOOTSTRAP-1: 运行 graph-cloud-suite.json 选定的 Linux 测试，并记录真实计数。
// 选择、排除与环境原因全部写在 manifest 里；任何未归类或过期的条目都会让本脚本失败，
// 不允许静默跳过测试，也不放宽任何断言。
import { spawn, execFile } from "node:child_process";
import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;

/** 解析 TAP 汇总行（# tests / # pass / # fail ...）。缺少 tests 行视为解析失败。 */
export function parseTapSummary(tap) {
  const counts = {};
  for (const key of ["tests", "pass", "fail", "cancelled", "skipped", "todo"]) {
    const match = new RegExp(`^# ${key} (\\d+)\\s*$`, "m").exec(tap);
    counts[key] = match ? Number(match[1]) : null;
  }
  if (counts.tests === null) throw new Error("TAP summary has no '# tests' line");
  for (const key of Object.keys(counts)) counts[key] ??= 0;
  return counts;
}

/** 判定一个分组的结果；返回失败原因列表，空数组表示通过。 */
export function evaluateGroup(group, exitCode, counts) {
  const problems = [];
  if (exitCode !== 0) problems.push(`runner exit ${exitCode}`);
  if (counts.tests === 0) problems.push("no tests ran");
  if (counts.fail > 0) problems.push(`${counts.fail} failed`);
  if (counts.cancelled > 0) problems.push(`${counts.cancelled} cancelled`);
  if (counts.skipped !== group.expectedSkipped) {
    problems.push(`skipped ${counts.skipped}, expected ${group.expectedSkipped}`);
  }
  if (counts.todo > 0) problems.push(`${counts.todo} todo`);
  if (counts.pass + counts.skipped + counts.todo !== counts.tests) {
    problems.push(`counts inconsistent: pass+skipped+todo != tests`);
  }
  return problems;
}

/** 校验清单与实际文件：每个 tracked 测试文件必须被选择、排除或 notSelected 覆盖。 */
export function classifyInventory(manifest, trackedFiles, dirListing) {
  const problems = [];
  const selected = new Map();
  for (const group of manifest.groups) {
    const excluded = new Set(group.exclude.map((item) => item.file));
    const files = [];
    for (const { dir, suffix } of group.dirs) {
      const entries = (dirListing[dir] ?? []).filter((name) => name.endsWith(suffix));
      if (entries.length === 0) problems.push(`${group.id}: ${dir}/*${suffix} matches no files`);
      for (const name of entries) {
        const file = `${dir}/${name}`;
        if (!excluded.has(file)) files.push(file);
      }
    }
    for (const item of group.exclude) {
      if (!trackedFiles.includes(item.file))
        problems.push(`${group.id}: stale exclusion ${item.file}`);
      if (!item.reason?.trim()) problems.push(`${group.id}: exclusion without reason ${item.file}`);
    }
    for (const file of files) selected.set(file, group.id);
    group.files = files.sort();
  }
  const excludedAll = new Set(manifest.groups.flatMap((group) => group.exclude.map((i) => i.file)));
  for (const file of trackedFiles.filter((name) => TEST_FILE.test(name))) {
    if (selected.has(file) || excludedAll.has(file)) continue;
    if (manifest.notSelected.some((item) => file.startsWith(item.prefix))) continue;
    problems.push(`unclassified test file: ${file}`);
  }
  return problems;
}

async function loadInventory(manifest) {
  const { stdout } = await execFileAsync("git", ["ls-files", "-z"], {
    cwd: repoRoot,
    maxBuffer: 64 * 1024 * 1024,
  });
  const tracked = stdout.split("\0").filter(Boolean);
  const dirListing = {};
  for (const group of manifest.groups) {
    for (const { dir } of group.dirs) {
      dirListing[dir] = await readdir(path.join(repoRoot, dir)).catch(() => []);
    }
  }
  return { tracked, dirListing };
}

function runGroup(group, tapFile) {
  const args = [
    "--import",
    "tsx",
    "--test",
    "--test-reporter=spec",
    "--test-reporter-destination=stdout",
    "--test-reporter=tap",
    `--test-reporter-destination=${tapFile}`,
    ...group.files,
  ];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      env: { ...process.env, ...group.env },
      stdio: "inherit",
    });
    child.on("error", () => resolve(127));
    child.on("close", (code, signal) => resolve(code ?? (signal ? 128 : 1)));
  });
}

async function main() {
  const manifest = JSON.parse(await readFile(path.join(here, "graph-cloud-suite.json"), "utf8"));
  const { tracked, dirListing } = await loadInventory(manifest);
  const inventoryProblems = classifyInventory(manifest, tracked, dirListing);
  const outDir = process.env.RUNNER_TEMP ?? os.tmpdir();
  const resultsDir = path.join(outDir, "graph-cloud-results");
  await mkdir(resultsDir, { recursive: true });

  const results = [];
  for (const group of manifest.groups) {
    console.log(`\n=== group ${group.id}: ${group.files.length} files ===`);
    const tapFile = path.join(resultsDir, `${group.id}.tap`);
    const exitCode = await runGroup(group, tapFile);
    let counts = { tests: 0, pass: 0, fail: 0, cancelled: 0, skipped: 0, todo: 0 };
    let problems = [];
    try {
      counts = parseTapSummary(await readFile(tapFile, "utf8"));
      problems = evaluateGroup(group, exitCode, counts);
    } catch (error) {
      problems = [`no usable TAP summary: ${error.message}`, `runner exit ${exitCode}`];
    }
    results.push({ id: group.id, files: group.files.length, exitCode, counts, problems });
  }

  const ok = inventoryProblems.length === 0 && results.every((r) => r.problems.length === 0);
  const total = results.reduce(
    (sum, r) => Object.fromEntries(Object.keys(sum).map((k) => [k, sum[k] + r.counts[k]])),
    { tests: 0, pass: 0, fail: 0, cancelled: 0, skipped: 0, todo: 0 },
  );
  const record = { ok, inventoryProblems, total, results };
  await writeFile(path.join(resultsDir, "results.json"), `${JSON.stringify(record, null, 2)}\n`);

  const lines = [
    "### Graph cloud test suite",
    "",
    "| group | files | tests | pass | fail | skipped | exit |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const r of results) {
    const c = r.counts;
    lines.push(
      `| ${r.id} | ${r.files} | ${c.tests} | ${c.pass} | ${c.fail} | ${c.skipped} | ${r.exitCode} |`,
    );
  }
  lines.push(
    `| **total** | | ${total.tests} | ${total.pass} | ${total.fail} | ${total.skipped} | |`,
  );
  const exclusions = manifest.groups.flatMap((g) =>
    g.exclude.map((e) => `- \`${e.file}\`: ${e.reason}`),
  );
  if (exclusions.length) lines.push("", "Environment exclusions:", ...exclusions);
  for (const p of inventoryProblems) lines.push("", `INVENTORY: ${p}`);
  for (const r of results) for (const p of r.problems) lines.push("", `FAILED ${r.id}: ${p}`);
  const summary = `${lines.join("\n")}\n`;
  console.log(`\n${summary}`);

  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  if (process.env.GITHUB_OUTPUT) {
    const out = [`ok=${ok}`, ...Object.entries(total).map(([k, v]) => `${k}=${v}`)];
    await appendFile(process.env.GITHUB_OUTPUT, `${out.join("\n")}\n`);
  }
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
