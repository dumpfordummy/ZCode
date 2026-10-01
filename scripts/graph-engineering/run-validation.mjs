import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { resolveSpawnRuntimeOptions } from "../spawn-command.mjs";

/**
 * Z8.1 验证运行器：顺序执行命令，记录真实命令、工作目录、退出码、耗时与解析出的计数，
 * 保存完整日志。失败的尝试不会被覆盖——每次运行追加到 attempts，并保留各自日志。
 * 它只运行与构建无关的检查；会写 packages/desktop/out/host 的检查（typecheck）必须在构建之前串行完成。
 */
const root = path.resolve(import.meta.dirname, "../..");
const [outputDirectory, suite = "emitting"] = process.argv.slice(2);
if (!outputDirectory)
  throw new Error("usage: run-validation.mjs <output-dir> [emitting|tests|baseline|assemble]");

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
        "scripts/graph-engineering/package-evidence.test.mjs",
        "scripts/graph-engineering/packaged-suite.test.mjs",
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
    { id: "format-scoped", scoped: true },
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

const ACCEPTED_BASE = "51f6ed67f63ff3500abca1bd86023f40bb29543d";
// 审计记录按原样保留；z8/evidence 下是工具生成的原始证据（清单、报告、摘要），也不为格式化而改写。
const FORMAT_EXCLUDED = new Set(["docs/graph-engineering/z8/Z8_DELTA_AUDIT.md"]);
// 旧版本真实写出的 Graph 数据按字节保存；格式化会改变它们，使 PROVENANCE 哈希失效。
const FORMAT_EXCLUDED_PREFIXES = [
  "docs/graph-engineering/z8/evidence/",
  "docs/graph-engineering/z8/fixtures/historical/",
];

/**
 * oxfmt 在 Windows 检出里偏好 CRLF，几乎所有文件都会被 fmt:check 标记，这个信号没有信息量。
 * 这里按内容检查本里程碑改动的文件：把去掉 CR 的副本交给 oxfmt，格式化结果与原文不同即不符合。
 */
async function scopedFormat(step) {
  const exec = promisify(execFile);
  const started = Date.now();
  const git = async (...args) =>
    (await exec("git", args, { cwd: root, maxBuffer: 64_000_000 })).stdout;
  const names = new Set([
    ...(await git("diff", "--name-only", ACCEPTED_BASE)).split("\n"),
    ...(await git("ls-files", "--others", "--exclude-standard")).split("\n"),
  ]);
  const files = [...names].filter(
    (f) =>
      f &&
      /\.(ts|tsx|mjs|js|json|md)$/.test(f) &&
      !f.endsWith(".d.ts") &&
      !FORMAT_EXCLUDED.has(f) &&
      !FORMAT_EXCLUDED_PREFIXES.some((prefix) => f.startsWith(prefix)),
  );
  const scratch = await mkdtemp(path.join(tmpdir(), "z81-format-"));
  await writeFile(
    path.join(scratch, ".oxfmtrc.json"),
    await readFile(path.join(root, ".oxfmtrc.json")),
  );
  const original = new Map();
  for (const file of files) {
    let text;
    try {
      text = (await readFile(path.join(root, file), "utf8")).replace(/\r\n/g, "\n");
    } catch {
      continue; // 已删除的文件
    }
    original.set(file, text);
    await mkdir(path.dirname(path.join(scratch, file)), { recursive: true });
    await writeFile(path.join(scratch, file), text);
  }
  const oxfmt = path.join(root, "node_modules/.bin/oxfmt.cmd");
  await new Promise((resolve) =>
    spawn(oxfmt, ["--write", ...original.keys()], {
      cwd: scratch,
      shell: true,
      windowsHide: true,
    }).on("close", resolve),
  );
  const nonconforming = [];
  for (const [file, text] of original) {
    const formatted = (await readFile(path.join(scratch, file), "utf8")).replace(/\r\n/g, "\n");
    if (formatted !== text) {
      nonconforming.push(file);
      // 显式开启时把格式化结果写回（仅限本里程碑改动的文件，LF）；默认只检查。
      if (process.env.Z8_FORMAT_FIX === "1") await writeFile(path.join(root, file), formatted);
    }
  }
  const log = path.join(outputDirectory, `${suite}-${step.id}-${Date.now()}.log`);
  await writeFile(
    log,
    JSON.stringify(
      {
        checked: original.size,
        nonconforming,
        excluded: [...FORMAT_EXCLUDED, ...FORMAT_EXCLUDED_PREFIXES],
      },
      null,
      2,
    ),
  );
  return {
    id: step.id,
    command:
      "oxfmt --write on LF copies of files changed since the accepted baseline; compare ignoring CR",
    cwd: ".",
    exitCode: nonconforming.length ? 1 : 0,
    status: nonconforming.length ? "FAIL" : "PASS",
    durationMs: Date.now() - started,
    log: path.relative(outputDirectory, log).split(path.sep).join("/"),
    counts: { filesChecked: original.size, nonconforming: nonconforming.length },
  };
}

function run(step) {
  if (step.scoped) return scopedFormat(step);
  const log = path.join(outputDirectory, `${suite}-${step.id}-${Date.now()}.log`);
  return new Promise((resolve) => {
    const started = Date.now();
    const chunks = [];
    const child = spawn(step.command, step.args, {
      cwd: root,
      // turbo 等本地二进制在 node_modules/.bin（CI 里同样这样加）。
      env: {
        ...process.env,
        PATH: `${path.join(root, "node_modules/.bin")}${path.delimiter}${process.env.PATH ?? ""}`,
        ZCODE_ENV: "test",
        ...step.env,
      },
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
      const sum = (re) => {
        const matches = [...text.matchAll(re)];
        return matches.length ? matches.reduce((total, m) => total + Number(m[1]), 0) : Number.NaN;
      };
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
          // 多个包各打印一行 "Found N warnings and M errors"：求和，而不是只取第一行。
          lintWarnings: sum(/Found (\d+) warnings? and \d+ errors?/g),
          lintErrors: sum(/Found \d+ warnings? and (\d+) errors?/g),
          formatFlagged: count(/Format issues found in above (\d+) files/),
        },
      });
    });
  });
}

// 清单要引用的验证摘要：每个检查取最近一次结果，并如实保留失败的尝试数量与明确的未运行项。
const NOT_RUN = [
  "Installing the NSIS installer anywhere (install, upgrade, uninstall, rollback)",
  "Production-environment network-egress measurement of the packaged app (Z8.3)",
  "Native Feedback uploader review (Z8.3)",
  "Code signing and signing reputation",
  "Packaged acceptance of Z3-Z7 and UX-M1-M4 behavior (development-mode evidence only)",
  "Live-provider, company-project and mobile/remote/non-Windows runs",
  "Fork/Join (disabled in the package; Z7-A12 remains FAIL)",
];
async function assemble() {
  const exec = promisify(execFile);
  const git = async (...args) => (await exec("git", args, { cwd: root })).stdout.trim();
  const attempts = JSON.parse(
    await readFile(path.join(outputDirectory, "validation-attempts.json"), "utf8"),
  );
  const latest = new Map();
  for (const attempt of attempts)
    for (const r of attempt.results)
      latest.set(r.id, { ...r, suite: attempt.suite, at: attempt.at });
  const results = [...latest.values()];
  const failedAttempts = attempts
    .flatMap((a) => a.results)
    .filter((r) => r.status === "FAIL").length;
  const blocking = results.filter((r) => r.status !== "BASELINE-EXCEPTION");
  const document = {
    status: blocking.every((r) => r.status === "PASS") ? "PASS" : "FAIL",
    sourceCommit: await git("rev-parse", "HEAD"),
    sourceDirty: (await git("status", "--porcelain=v1", "--untracked-files=all")).length > 0,
    results: results.map(
      ({ id, suite, command, cwd, exitCode, status, durationMs, counts, at }) => ({
        id,
        suite,
        command,
        cwd,
        exitCode,
        status,
        durationMs,
        counts,
        at,
      }),
    ),
    retainedFailedAttempts: failedAttempts,
    exceptions: [
      ...results
        .filter((r) => r.status === "BASELINE-EXCEPTION")
        .map((r) => ({
          id: r.id,
          kind: "baseline",
          counts: r.counts,
          note: "Pre-existing failure re-measured on this checkout; not hidden and not suppressed.",
        })),
      ...NOT_RUN.map((what) => ({ kind: "not-run", what })),
    ],
  };
  await writeFile(
    path.join(outputDirectory, "manifest-validation.json"),
    `${JSON.stringify(document, null, 2)}
`,
  );
  process.stdout.write(`${document.status} assembled ${results.length} checks
`);
}
if (suite === "assemble") {
  await assemble();
  process.exit(0);
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
