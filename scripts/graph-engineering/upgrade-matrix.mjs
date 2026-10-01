#!/usr/bin/env node
// Z8.2 升级矩阵：用【当前】解包产物（不是安装器）逐个打开旧版本真实写出的 Graph 数据副本，
// 比较前后每个 Graph 文件的字节哈希，并检查每种旧状态要求的结果。
// 不修改 fixture；无法解释的记录会失败关闭并如实报告，而不是改 fixture 让它通过。
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createIsolation, root } from "./isolation.mjs";
import { acceptancePaths } from "./acceptance-paths.mjs";
import { readNativeLedger } from "./z2-native-helpers.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const hit = args.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const exe = path.resolve(option("exe", ""));
const fixtureRoot = path.resolve(option("fixtures", path.join(root, ".tmp/z8-2/profiles")));
const outDir = path.resolve(
  option(
    "out",
    path.join(root, ".tmp/z8-2/upgrade-matrix", new Date().toISOString().replace(/[:.]/g, "-")),
  ),
);
const only = option("only", "");
if (!option("exe")) throw new Error("--exe=<path to the unpacked ZCode Graph.exe> is required");
process.env.Z1_PACKAGED_EXE = exe;

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const TERMINAL = new Set([
  "Completed",
  "Failed",
  "Cancelled",
  "Rejected",
  "NeedsHuman",
  "BudgetExhausted",
]);

async function walk(directory, prefix = "") {
  const found = new Map();
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory())
      for (const [name, hash] of await walk(path.join(directory, entry.name), relative))
        found.set(name, hash);
    else found.set(relative, sha256(await readFile(path.join(directory, entry.name))));
  }
  return found;
}

const isRecord = (name) => /^[0-9a-f]{64}\.json$/.test(name);
const safe = (value) => value.replace(/[^a-z0-9.-]/gi, "_");

function diffPaths(before, after, prefix = "") {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  const isObject = (value) => value !== null && typeof value === "object";
  if (!isObject(before) || !isObject(after) || Array.isArray(before) !== Array.isArray(after))
    return [prefix];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].flatMap((key) =>
    diffPaths(before[key], after[key], prefix ? `${prefix}.${key}` : key),
  );
}

async function runFixture(id, base = fixtureRoot) {
  const kept = path.join(base, id, "kept");
  const sourceGraph = path.join(kept, "profile-home/.zcode/v2/graph-engineering");
  const names = (await readdir(sourceGraph)).filter(isRecord);
  assert.equal(names.length <= 1, true, "a fixture holds at most one workspace record");
  const recordName = names[0];
  const originalRecord = recordName
    ? await readFile(path.join(sourceGraph, recordName))
    : undefined;
  const parsed = originalRecord ? JSON.parse(originalRecord.toString("utf8")) : undefined;
  const workspacePath = parsed?.workspaceKey;
  const before = await walk(sourceGraph);
  const result = { id, recordName, workspacePath, recordVersion: parsed?.version };
  result.statusesBefore = parsed?.runs?.map((run) => run.status) ?? [];
  // 当前产品把旧记录当作 workspaceKey 对应的工作区身份：在同一路径重建合成工作区（旧临时目录已不存在）。
  if (workspacePath) {
    // 旧 harness 留下的整个临时 home 只会被整体移到 .tmp（不删除、不读取其中的会话数据）；
    // 其它任何已存在的路径都拒绝复用。
    if (
      await stat(workspacePath).then(
        () => true,
        () => false,
      )
    ) {
      const oldHome = path.dirname(workspacePath);
      assert.equal(
        path.dirname(oldHome) === tmpdir() &&
          path.basename(oldHome).startsWith("zcode-graph-acceptance-"),
        true,
        `${workspacePath} already exists and is not a leftover acceptance home`,
      );
      await mkdir(path.join(root, ".tmp/z8-2/old-run-homes"), { recursive: true });
      await rename(oldHome, path.join(root, ".tmp/z8-2/old-run-homes", path.basename(oldHome)));
    }
    await cp(path.join(kept, "workspace"), workspacePath, { recursive: true });
  }
  const isolation = await createIsolation({ adoptWorkspace: workspacePath });
  try {
    const graphDirectory = path.dirname(acceptancePaths(isolation).record);
    await mkdir(graphDirectory, { recursive: true });
    await cp(sourceGraph, graphDirectory, { recursive: true });
    assert.deepEqual([...(await walk(graphDirectory))], [...before], "copy is byte-identical");
    const window = await isolation.launch();
    const open = window.getByTestId("graph-engineering-open");
    if (!(await window.getByTestId("graph-engineering-panel").isVisible()) && (await open.count()))
      await open.click();
    await window.getByTestId("graph-engineering-panel").waitFor({ timeout: 30000 });
    if (await window.getByTestId("graph-view-runs").count())
      await window.getByTestId("graph-view-runs").click();
    const runs = window.locator('[data-testid="graph-run"]');
    if (parsed?.runs?.length)
      await runs
        .first()
        .waitFor({ timeout: 30000 })
        .catch(() => undefined);
    result.uiStatuses = await runs.evaluateAll((nodes) => nodes.map((node) => node.dataset.status));
    const bodyText = await window
      .locator("body")
      .innerText({ timeout: 10000 })
      .catch((error) => `(page text unavailable: ${String(error.message).slice(0, 120)})`);
    result.uiText = bodyText.slice(0, 1500);
    const isModel = (request) =>
      Boolean(request.model) || String(request.path).includes("chat/completions");
    result.modelRequests = isolation.fixture.requests.filter(isModel).length;
    // 其余是应用启动时对受控回环端点的配置查询（场景/配置），不是模型或工具活动；路径如实记录。
    result.configRequestPaths = isolation.fixture.requests
      .filter((request) => !isModel(request))
      .map((request) => request.path);
    await isolation.stopApp();
    let ledger = [];
    try {
      ledger = readNativeLedger(isolation);
    } catch (error) {
      result.ledger = `absent (${error.code ?? error.message})`;
    }
    result.nativeInputs = ledger.length;
    const after = await walk(graphDirectory);
    result.files = {
      before: Object.fromEntries(before),
      after: Object.fromEntries(after),
    };
    const changed = [...after]
      .filter(([name, hash]) => before.get(name) !== hash)
      .map(([name]) => name);
    const removed = [...before].filter(([name]) => !after.has(name)).map(([name]) => name);
    result.changed = changed;
    result.removed = removed;
    result.recordUnchanged = recordName
      ? after.get(recordName) === before.get(recordName)
      : undefined;
    const afterRecord = recordName
      ? JSON.parse(await readFile(path.join(graphDirectory, recordName), "utf8"))
      : undefined;
    result.statusesAfter = afterRecord?.runs?.map((run) => run.status) ?? [];
    const snapshotNames = [...after.keys()].filter((name) =>
      name.startsWith("reconcile-snapshots/"),
    );
    result.snapshots = snapshotNames;
    const problems = [];
    const expect = (condition, message) => condition || problems.push(message);
    expect(removed.length === 0, `files removed: ${removed.join(", ")}`);
    expect(result.modelRequests === 0, `model requests: ${result.modelRequests}`);
    expect(result.nativeInputs === 0, `native session inputs created: ${result.nativeInputs}`);
    for (const name of changed)
      expect(
        name === recordName || name.startsWith("reconcile-snapshots/"),
        `unexpected Graph file changed: ${name}`,
      );
    expect(
      ![...before.keys()].some(
        (name) => name !== recordName && after.get(name) !== before.get(name),
      ),
      "artifacts / library changed",
    );
    const interpretable = result.uiStatuses.length === (parsed?.runs?.length ?? 0);
    if (!interpretable) {
      // 当前产品没有显示这条记录的运行：记录无法被当前 schema/完整性检查解释。
      // 要求失败关闭——文件逐字节不变、没有快照、没有任何工作——并把缺口如实报告；绝不改 fixture。
      result.class = id.startsWith("SYNTHETIC-newer") ? "NEWER-VERSION" : "UNINTERPRETABLE";
      expect(result.recordUnchanged, "uninterpretable record was modified");
      expect(snapshotNames.length === 0, "uninterpretable record produced a snapshot");
      expect(changed.length === 0, `files changed: ${changed.join(", ")}`);
      result.gap = result.uiText.replace(/\s+/g, " ").slice(0, 900);
    } else if (!parsed?.runs?.length) {
      result.class = "library-or-empty";
      expect(snapshotNames.length === 0, "no record, so no snapshot");
    } else if (parsed.runs.every((run) => TERMINAL.has(run.status))) {
      result.class = "terminal";
      expect(result.recordUnchanged, "terminal record changed");
      expect(snapshotNames.length === 0, "terminal record produced a snapshot");
    } else {
      result.class = "non-terminal";
      expect(
        result.statusesAfter.every((status) =>
          ["Interrupted", "AwaitingContinuation"].includes(status),
        ),
        `unexpected statuses after: ${result.statusesAfter}`,
      );
      expect(
        snapshotNames.includes(
          `reconcile-snapshots/${recordName.slice(0, -5)}/${sha256(originalRecord)}.json`,
        ),
        "exact original bytes are not in the snapshot store",
      );
      if (snapshotNames.length)
        for (const name of snapshotNames) {
          const bytes = await readFile(path.join(graphDirectory, name));
          expect(
            `reconcile-snapshots/${recordName.slice(0, -5)}/${sha256(bytes)}.json` === name,
            `snapshot ${name} does not match its name`,
          );
        }
      // 不替人回答、不批准、不重放：记录前后的差异只允许是对账本身写入的字段
      //（状态/消息/时间戳，以及关口与路由检查点上的 resumeRequired 标记）；其余任何路径变化都是问题。
      const allowed = [
        /^runs\.\d+\.(status|message|updatedAt)$/,
        /^runs\.\d+\..*\.resumeRequired$/,
        /^parallel\.runs\.\d+\.(phase|message|updatedAt)$/,
      ];
      result.recordDiff = diffPaths(parsed, afterRecord);
      for (const changedPath of result.recordDiff)
        expect(
          allowed.some((pattern) => pattern.test(changedPath)),
          `unexpected record change: ${changedPath}`,
        );
      parsed.runs.forEach((run, index) => {
        const next = afterRecord.runs[index];
        expect(
          (next.approvalAttempts ?? []).every(
            (attempt, at) => attempt.status === run.approvalAttempts?.[at]?.status,
          ),
          `run ${index} approval status changed`,
        );
      });
    }
    if (result.class === "NEWER-VERSION")
      expect(
        /newer, unsupported ZCode Graph version/.test(result.uiText),
        "the readable newer-version message is not shown",
      );
    result.problems = problems;
    result.outcome = problems.length ? "FAIL" : result.class === "UNINTERPRETABLE" ? "GAP" : "PASS";
  } catch (error) {
    result.error = String(error?.stack ?? error).slice(0, 1500);
    result.outcome = "ERROR";
    try {
      const graphDirectory = path.dirname(acceptancePaths(isolation).record);
      result.recordBytesPreserved =
        !recordName ||
        sha256(await readFile(path.join(graphDirectory, recordName))) === sha256(originalRecord);
    } catch {
      /* 保留原因已记录在 error */
    }
  } finally {
    await isolation.stopApp().catch(() => undefined);
    await isolation.close().catch(() => undefined);
    await rm(isolation.home, { recursive: true, force: true }).catch(() => undefined);
    if (workspacePath)
      await rm(workspacePath, { recursive: true, force: true }).catch(() => undefined);
  }
  return result;
}

await mkdir(outDir, { recursive: true });
let base = fixtureRoot;
if (args.includes("--synthetic-newer")) {
  // 合成的“更新版本”副本（明确不是历史 fixture）：以一份真实的 z2.2 记录为底，只提高版本号。
  base = path.join(outDir, "synthetic-profiles");
  const template = path.join(fixtureRoot, "z22-completed-sequential/kept");
  const mutations = {
    "SYNTHETIC-newer-top-level-version-6": (json) => ({ ...json, version: 6 }),
    "SYNTHETIC-newer-definition-version-9": (json) => ({
      ...json,
      definition: { ...json.definition, version: 9 },
    }),
  };
  for (const [name, mutate] of Object.entries(mutations)) {
    const kept = path.join(base, name, "kept");
    await cp(template, kept, { recursive: true });
    const graph = path.join(kept, "profile-home/.zcode/v2/graph-engineering");
    const file = (await readdir(graph)).find(isRecord);
    const json = JSON.parse(await readFile(path.join(graph, file), "utf8"));
    await writeFile(path.join(graph, file), JSON.stringify(mutate(json), null, 2));
  }
}
const ids = (await readdir(base)).filter((id) => !only || id.startsWith(only)).sort();
const results = [];
for (const id of ids) {
  const result = await runFixture(id, base);
  results.push(result);
  console.log(
    `${result.outcome.padEnd(5)} ${id.padEnd(52)} ${result.class ?? "-"} ${result.statusesBefore.join("|")} -> ${result.statusesAfter?.join("|") ?? "?"}${result.problems?.length ? "  PROBLEMS: " + result.problems.join("; ") : ""}${result.error ? "  ERROR: " + result.error.split("\n")[0] : ""}`,
  );
  await writeFile(path.join(outDir, `${safe(id)}.json`), JSON.stringify(result, null, 2));
}
await writeFile(
  path.join(outDir, "matrix.json"),
  JSON.stringify(
    {
      exe: path.relative(root, exe),
      generatedAt: new Date().toISOString(),
      results: results.map((result) => ({ ...result, files: undefined })),
    },
    null,
    2,
  ),
);
console.log(`wrote ${outDir}`);
process.exit(results.every((result) => result.outcome === "PASS") ? 0 : 1);
