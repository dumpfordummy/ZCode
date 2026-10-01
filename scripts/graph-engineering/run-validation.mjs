import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveSpawnRuntimeOptions } from "../spawn-command.mjs";

/**
 * Z8.1 验证运行器：顺序执行命令，记录真实命令、工作目录、退出码、耗时与解析出的计数，
 * 保存完整日志。失败的尝试不会被覆盖——每次运行追加到 attempts，并保留各自日志。
 * 它只运行与构建无关的检查；会写 packages/desktop/out/host 的检查（typecheck）必须在构建之前串行完成。
 */
const root = path.resolve(import.meta.dirname, "../..");
const [outputDirectory, suite = "emitting"] = process.argv.slice(2);
if (!outputDirectory)
  throw new Error("usage: run-validation.mjs <output-dir> [emitting|tests|baseline]");

const services = [
  "packages/services/src/graph-engineering/app/*.test.ts",
  "packages/services/src/graph-engineering/adapters/*.test.ts",
  "packages/services/src/zcode-agent/expectedRuntimeClient.test.ts",
  "packages/services/src/zcode-agent/runtimeRetirement.test.ts",
];
const SUITES = {
  // 会写共享输出目录的检查：必须先于构建、且与构建互斥。
  emitting: [
    { id: "typecheck", command: "pnpm", args: ["typecheck"] },
    { id: "lint", command: "pnpm", args: ["lint"] },
    { id: "architecture", command: "pnpm", args: ["architecture:check", "--changed"] },
  ],
  tests: [
    {
      id: "script-tests",
      command: "node",
      args: [
        "--test",
        "scripts/graph-engineering/distribution.test.mjs",
        "scripts/graph-engineering/publish.test.mjs",
        "scripts/graph-engineering/publish-git.test.mjs",
        "scripts/graph-engineering/acceptance-paths.test.mjs",
        "scripts/graph-engineering/z2-provider-fixture.test.mjs",
        "scripts/graph-engineering/release-manifest.test.mjs",
      ],
    },
    {
      id: "graph-service-tests",
      command: "node",
      args: ["--import", "tsx", "--test", ...services],
    },
    {
      id: "services-and-registry-tests",
      command: "node",
      args: [
        "--import",
        "tsx",
        "--test",
        "packages/services/test/*.test.ts",
        "apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/interaction-registry.test.ts",
      ],
    },
    {
      id: "ui-tests",
      command: "node",
      args: ["--import", "tsx", "--test", "packages/ui/test/*.test.ts"],
      env: { TSX_TSCONFIG_PATH: "packages/ui/tsconfig.json" },
    },
  ],
  // 已知基线例外：重新测量，不沿用旧数字；失败是基线例外而非通过。
  baseline: [
    {
      id: "cli-lint",
      command: "pnpm",
      args: ["--dir", "apps/zcode-cli", "lint"],
      baselineException: true,
    },
    { id: "format-check", command: "pnpm", args: ["fmt:check"], baselineException: true },
  ],
};

function run(step) {
  const log = path.join(outputDirectory, `${suite}-${step.id}-${Date.now()}.log`);
  return new Promise((resolve) => {
    const started = Date.now();
    const chunks = [];
    const child = spawn(step.command, step.args, {
      cwd: root,
      env: { ...process.env, ZCODE_ENV: "test", ...step.env },
      windowsHide: true,
      ...resolveSpawnRuntimeOptions(step.command),
    });
    child.stdout.on("data", (d) => chunks.push(d));
    child.stderr.on("data", (d) => chunks.push(d));
    child.on("error", (error) => chunks.push(Buffer.from(String(error))));
    child.on("close", async (code) => {
      const text = Buffer.concat(chunks).toString("utf8");
      await writeFile(log, text);
      const count = (re) => Number(re.exec(text)?.[1]);
      resolve({
        id: step.id,
        command: [step.command, ...step.args].join(" "),
        cwd: ".",
        exitCode: code,
        status: code === 0 ? "PASS" : step.baselineException ? "BASELINE-EXCEPTION" : "FAIL",
        durationMs: Date.now() - started,
        log: path.relative(outputDirectory, log).split(path.sep).join("/"),
        counts: {
          testsPassed: count(/ℹ pass (\d+)/),
          testsFailed: count(/ℹ fail (\d+)/),
          testsSkipped: count(/ℹ skipped (\d+)/),
          lintWarnings: count(/Found (\d+) warnings?/),
          lintErrors: count(/Found \d+ warnings? and (\d+) errors?/),
        },
      });
    });
  });
}

await mkdir(outputDirectory, { recursive: true });
const resultsFile = path.join(outputDirectory, "validation-attempts.json");
let attempts = [];
try {
  attempts = JSON.parse(await readFile(resultsFile, "utf8"));
} catch {
  /* 第一次运行 */
}
const results = [];
for (const step of SUITES[suite]) {
  const result = await run(step);
  results.push(result);
  process.stdout.write(`${result.status} ${result.id} (exit ${result.exitCode})\n`);
}
attempts.push({ suite, at: new Date().toISOString(), results });
await writeFile(resultsFile, `${JSON.stringify(attempts, null, 2)}\n`);
if (results.some((r) => r.status === "FAIL")) process.exitCode = 1;
