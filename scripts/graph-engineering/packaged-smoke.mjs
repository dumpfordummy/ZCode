import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { packagedCases } from "./packaged-cases.mjs";
import { resolveGraphDistributionVersion } from "../../packages/desktop/scripts/desktop-product-identity.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const version = resolveGraphDistributionVersion(
  { ZCODE_GRAPH_DISTRIBUTION: "1", ZCODE_GRAPH_VERSION: process.argv[2] },
  "",
);
const output = path.join(root, "packages/desktop/dist-graph");
const detached = await mkdtemp(path.join(tmpdir(), "zcode-graph-package-"));
await cp(path.join(output, "win-unpacked"), detached, { recursive: true });
const results = [];
for (const scenario of packagedCases) {
  const evidence = path.join(output, "smoke-evidence", scenario.name);
  await mkdir(evidence, { recursive: true });
  const chunks = [];
  const { result, exitCode } = await new Promise((resolve, reject) => {
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
    child.on("error", reject);
    child.on("close", (code) => {
      try {
        resolve({ result: JSON.parse(stdout), exitCode: code });
      } catch (error) {
        reject(
          new Error(`No valid packaged summary (exit ${code}); detached app: ${detached}`, {
            cause: error,
          }),
        );
      }
    });
  }).finally(() => writeFile(path.join(evidence, "harness.log"), chunks.join("")));
  results.push({ name: scenario.name, exitCode, ...result });
  for (const file of result.screenshots) await cp(file, path.join(evidence, path.basename(file)));
  await writeFile(path.join(evidence, "summary.json"), JSON.stringify(result, null, 2));
  await writeFile(
    path.join(output, "packaged-smoke.json"),
    JSON.stringify({ version, detached, results }, null, 2),
  );
  if (exitCode !== 0 || result.status !== "PASS") {
    // 失败也先保存原始合成日志和截图，避免 CI 清理临时目录后无法定位真实失败阶段。
    await cp(path.join(result.home, "native.log"), path.join(evidence, "native.log"));
    throw new Error(`Packaged smoke exited ${exitCode}; evidence: ${evidence}`);
  }
  if (scenario.name === "ordinary-chat" && result.packagedIdentity?.version !== version)
    throw new Error(`Packaged app version does not match ${version}; evidence: ${evidence}`);
}
process.stdout.write(`Packaged acceptance PASS; evidence: ${output}\n`);
