import { execFile, spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rename, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { packagedCases } from "./packaged-cases.mjs";
import { parseCaseFilter, summarizeSuite } from "./packaged-suite.mjs";
import { resolveGraphDistributionVersion } from "../../packages/desktop/scripts/desktop-product-identity.mjs";
import { resolveDistDirName, sha256File } from "./release-manifest.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const version = resolveGraphDistributionVersion(
  { ZCODE_GRAPH_DISTRIBUTION: "1", ZCODE_GRAPH_VERSION: process.argv[2] },
  "",
);
// 与构建器相同的并排输出目录规则；默认仍是 dist-graph。
const output = path.join(
  root,
  "packages/desktop",
  resolveDistDirName(process.env.ZCODE_GRAPH_DIST_DIR),
);

// 默认行为：运行全部用例，首个失败即停止。两个显式开关：
// - ZCODE_GRAPH_SMOKE_KEEP_GOING=1 继续运行其余用例（最终仍按任何失败返回非零）；
// - ZCODE_GRAPH_SMOKE_CASES=a,b 只运行子集。子集写入独立文件并标注 subset，永远不满足完整发布门。
const allNames = packagedCases.map((c) => c.name);
const { selectedNames, filtered } = parseCaseFilter(process.env.ZCODE_GRAPH_SMOKE_CASES, allNames);
const keepGoing = process.env.ZCODE_GRAPH_SMOKE_KEEP_GOING === "1";
const resultFile = filtered ? "packaged-smoke.subset.json" : "packaged-smoke.json";
const evidenceName = filtered ? "smoke-evidence-subset" : "smoke-evidence";

// 重新运行不得覆盖先前证据（包括失败的）：把已有的同类文件移入带时间戳的历史目录。
const previous = [resultFile, evidenceName];
const existing = [];
for (const name of previous)
  if (await stat(path.join(output, name)).catch(() => null)) existing.push(name);
if (existing.length) {
  const history = path.join(
    output,
    "packaged-smoke-history",
    new Date().toISOString().replace(/[:.]/g, "-"),
  );
  await mkdir(history, { recursive: true });
  for (const name of existing) await rename(path.join(output, name), path.join(history, name));
}

const run = promisify(execFile);
const git = async (...args) => (await run("git", args, { cwd: root })).stdout.trim();
// 测试脚本（harness）的来源提交，与二进制的构建来源分开记录。
const harness = {
  commit: await git("rev-parse", "HEAD"),
  dirty: (await git("status", "--porcelain=v1", "--untracked-files=all")).length > 0,
};

// 被测对象必须就是清单里的那个二进制：运行前核对关键组件哈希，并核对分离副本。
const COMPONENTS = ["ZCode Graph.exe", "resources/app.asar", "resources/graph-build-identity.json"];
const source = path.join(output, "win-unpacked");
const packageHashes = {};
for (const name of COMPONENTS)
  packageHashes[name] = await sha256File(path.join(source, ...name.split("/")));
const manifest = await readFile(path.join(output, "RELEASE_MANIFEST.json"), "utf8")
  .then(JSON.parse)
  .catch(() => undefined);
if (manifest) {
  for (const name of COMPONENTS)
    if (manifest.artifact?.components?.[name]?.sha256 !== packageHashes[name])
      throw new Error(`Package component differs from its release manifest: ${name}`);
}
const detached = await mkdtemp(path.join(tmpdir(), "zcode-graph-package-"));
await cp(source, detached, { recursive: true });
for (const name of COMPONENTS)
  if ((await sha256File(path.join(detached, ...name.split("/")))) !== packageHashes[name])
    throw new Error(`Detached copy differs from the package: ${name}`);

const results = [];
let aborted = false;
// 每个用例之后都写出当前结果（partial），进程中途崩溃也不会丢失已有证据。
const writeResult = (partial) => {
  const summary = summarizeSuite({ allCaseNames: allNames, selectedNames, results });
  return writeFile(
    path.join(output, resultFile),
    JSON.stringify(
      {
        version,
        scope: summary.scope,
        partial,
        requestedCases: filtered ? selectedNames : "all",
        keepGoing,
        aborted,
        detached,
        packageHashes,
        matchesReleaseManifest: Boolean(manifest),
        harness,
        summary,
        results,
      },
      null,
      2,
    ),
  ).then(() => summary);
};
for (const scenario of packagedCases.filter((c) => selectedNames.includes(c.name))) {
  const evidence = path.join(output, evidenceName, scenario.name);
  await mkdir(evidence, { recursive: true });
  const chunks = [];
  const { result, exitCode } = await new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [path.join(import.meta.dirname, scenario.script), ...scenario.args],
      {
        cwd: detached,
        env: { ...process.env, Z1_PACKAGED_EXE: path.join(detached, "ZCode Graph.exe") },
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    child.stdout.on("data", (data) => {
      chunks.push(data.toString());
      stdout += data;
      process.stdout.write(data);
    });
    child.stderr.on("data", (data) => {
      chunks.push(data.toString());
      process.stderr.write(data);
    });
    child.on("error", (error) =>
      resolve({
        result: {
          status: "FAIL",
          error: `Could not start case: ${error.message}`,
          screenshots: [],
        },
        exitCode: null,
      }),
    );
    child.on("close", (code) => {
      try {
        resolve({ result: JSON.parse(stdout), exitCode: code });
      } catch {
        // 没有有效摘要本身就是失败，要如实记录并（在 keep-going 下）继续其余用例。
        resolve({
          result: {
            status: "FAIL",
            error: `No valid packaged summary (exit ${code}).`,
            screenshots: [],
          },
          exitCode: code,
        });
      }
    });
  });
  await writeFile(path.join(evidence, "harness.log"), chunks.join(""));
  // 版本核对适用于每一个报告了打包身份的用例；ordinary-chat 必须报告。
  const identity = result.packagedIdentity;
  if (
    result.status === "PASS" &&
    ((identity && identity.version !== version) ||
      (scenario.name === "ordinary-chat" && !identity) ||
      (identity && identity.isPackaged !== true))
  ) {
    result.status = "FAIL";
    result.error = `Packaged identity does not match ${version} / isPackaged: ${JSON.stringify(identity)}`;
  }
  results.push({ name: scenario.name, exitCode, ...result });
  for (const file of result.screenshots ?? [])
    await cp(file, path.join(evidence, path.basename(file)));
  await writeFile(path.join(evidence, "summary.json"), JSON.stringify(result, null, 2));
  await writeResult(true);
  if (exitCode !== 0 || result.status !== "PASS") {
    // 失败也先保存原始合成日志和截图，避免 CI 清理临时目录后无法定位真实失败阶段。
    if (result.home)
      await cp(path.join(result.home, "native.log"), path.join(evidence, "native.log")).catch(
        () => {},
      );
    if (!keepGoing) {
      aborted = true;
      break;
    }
  }
}
const summary = await writeResult(false);
const label =
  summary.scope === "full"
    ? summary.status
    : `${summary.status} (SUBSET of ${selectedNames.length}/${allNames.length}; not the full release gate)`;
process.stdout.write(
  `Packaged acceptance ${label}; passed ${summary.passed.length}, failed ${summary.failed.length}, not run ${summary.notRun.length}; evidence: ${output}\n`,
);
process.exitCode = summary.exitCode;
