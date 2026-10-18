import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
assert.equal(process.versions.node, "24.14.0", "Use pinned Node 24.14.0");
assert.equal(args.length, 2, "Usage: node eng-p1-native-tests.mjs --pnpm-cli <pnpm.cjs>");
assert.equal(args[0], "--pnpm-cli");
const cli = await realpath(resolve(args[1]));
const metadata = JSON.parse(await readFile(resolve(dirname(cli), "../package.json"), "utf8"));
assert.equal(metadata.name, "pnpm");
assert.equal(metadata.version, "10.33.2", "Use existing pinned pnpm 10.33.2");

async function run(label, argv) {
  console.log(`[eng-p1-native] ${label}`);
  const started = performance.now();
  const code = await new Promise((accept, reject) => {
    const child = spawn(process.execPath, argv, {
      cwd: root,
      stdio: "inherit",
      windowsHide: true,
      // The package manager's scripts must resolve the same pinned Node.
      env: {
        ...process.env,
        PATH: `${dirname(process.execPath)}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}`,
      },
    });
    child.once("error", reject);
    child.once("exit", (exitCode, signal) => accept(signal ? 1 : (exitCode ?? 1)));
  });
  console.log(
    JSON.stringify({ phase: label, elapsedMs: performance.now() - started, exitCode: code }),
  );
  if (code !== 0) throw Error(`${label} failed (exit ${code}); subsequent phases were not run.`);
}

// 复用包自身的构建和依赖顺序，避免干净检出缺少 dist 导出时误报原生测试结果。
await run("compiled-owner-prerequisites", [
  cli,
  "-r",
  "--workspace-concurrency=1",
  "--filter",
  "@zcode/adapters...",
  "--filter",
  "@zcode/core...",
  "run",
  "build",
]);
await run("native-owner-tests", [
  "--import",
  "tsx",
  "--test",
  "--test-concurrency=1",
  "--test-reporter=tap",
  "apps/zcode-cli/packages/bootstrap/src/app/native-recipe.test.ts",
  "apps/zcode-cli/packages/bootstrap/src/app/native-process-limit.test.ts",
]);
