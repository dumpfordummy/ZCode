import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { BAD_SOURCE, GOOD_SOURCE, PROJECT, REQUIRED_TESTS, RUNNER } from "./z4-csharp-source.mjs";

export const SOURCE_PATHS = [
  "Z4Fixture.csproj",
  "MathOps.cs",
  "Runner.cs",
  "global.json",
  "NuGet.Config",
  "Directory.Build.props",
  "Directory.Build.targets",
  "Directory.Packages.props",
];
export const BUILD_PATHS = [
  "bin/Release/net8.0/Z4Fixture.dll",
  "bin/Release/net8.0/Z4Fixture.deps.json",
  "bin/Release/net8.0/Z4Fixture.runtimeconfig.json",
];
export const BUILD_ARGS = [
  "build",
  "Z4Fixture.csproj",
  "--configuration",
  "Release",
  "--nologo",
  "--no-incremental",
  "--disable-build-servers",
  "-p:RestoreConfigFile=NuGet.Config",
  "-p:NuGetAudit=false",
  "-p:UseSharedCompilation=false",
  "-p:ImportDirectoryBuildProps=false",
  "-p:ImportDirectoryBuildTargets=false",
  "-p:ImportDirectoryPackagesProps=false",
  "-nodeReuse:false",
];
export const TEST_ARGS = [
  BUILD_PATHS[0],
  "--operation-id",
  "{operationId}",
  "--source-digest",
  "{sourceDigest}",
  "--build-digest",
  "{buildDigest}",
  "--report",
  "{reportPath}",
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function configureDotnetEnvironment(isolation) {
  const home = await realpath(isolation.home);
  assert.equal(path.dirname(await realpath(isolation.workspace)), home);
  assert.equal(path.basename(isolation.workspace), "workspace");
  for (const directory of [
    "dotnet-home",
    "nuget-packages",
    "msbuild-user",
    "machine-program-files",
    "machine-data",
    "workspace/results",
  ])
    await mkdir(path.join(home, directory), { recursive: true });
  Object.assign(isolation.env, {
    DOTNET_CLI_HOME: path.join(home, "dotnet-home"),
    NUGET_PACKAGES: path.join(home, "nuget-packages"),
    MSBuildUserExtensionsPath: path.join(home, "msbuild-user"),
    // NuGet 在 Windows 上从这些环境变量拼接机器配置路径；最小环境缺失时会抛 path1 异常，使用私有空目录而非读取安装配置。
    PROGRAMFILES: path.join(home, "machine-program-files"),
    "PROGRAMFILES(X86)": path.join(home, "machine-program-files"),
    PROGRAMDATA: path.join(home, "machine-data"),
    DOTNET_SKIP_FIRST_TIME_EXPERIENCE: "1",
    DOTNET_CLI_TELEMETRY_OPTOUT: "1",
    DOTNET_NOLOGO: "1",
    DOTNET_GENERATE_ASPNET_CERTIFICATE: "false",
    DOTNET_ADD_GLOBAL_TOOLS_TO_PATH: "false",
    DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE: "true",
    DOTNET_CLI_USE_MSBUILD_SERVER: "0",
  });
}

export async function prepareCSharpFixture(isolation, { buggy = false } = {}) {
  await configureDotnetEnvironment(isolation);
  const files = {
    "Z4Fixture.csproj": PROJECT,
    "MathOps.cs": buggy ? BAD_SOURCE : GOOD_SOURCE,
    "Runner.cs": RUNNER,
    "global.json": JSON.stringify({ sdk: { version: "8.0.425", rollForward: "disable" } }) + "\n",
    "NuGet.Config":
      '<?xml version="1.0" encoding="utf-8"?><configuration><packageSources><clear /></packageSources></configuration>\n',
    "Directory.Build.props": "<Project />\n",
    "Directory.Build.targets": "<Project />\n",
    "Directory.Packages.props": "<Project />\n",
    ".gitignore": "bin/\nobj/\nresults/\n",
    "AGENTS.md":
      "Synthetic Z4 C# workspace. Read or edit only MathOps.cs when requested. Preserve Runner.cs and its three assertions. Build and run only configured fixture recipes. Do not inspect parent directories, install packages, or commit.\n",
  };
  await Promise.all(
    Object.entries(files).map(([name, content]) =>
      writeFile(path.join(isolation.workspace, name), content),
    ),
  );
  return {
    runnerDigest: sha256(Buffer.from(RUNNER)),
    source: await fingerprint(isolation, SOURCE_PATHS),
  };
}

export async function fingerprint(isolation, names) {
  const files = [];
  for (const name of [...names].sort()) {
    const bytes = await readFile(path.join(isolation.workspace, name));
    files.push({ path: name, length: bytes.length, digest: sha256(bytes) });
  }
  return { digest: sha256(JSON.stringify(files)), files };
}

export async function runDotnet(isolation, args, { signal, onSpawn } = {}) {
  const startedAt = Date.now();
  try {
    const pending = promisify(execFile)("dotnet", args, {
      cwd: isolation.workspace,
      env: isolation.env,
      timeout: 90000,
      maxBuffer: 2 * 1024 * 1024,
      signal,
      windowsHide: true,
    });
    onSpawn?.(pending.child);
    const output = await pending;
    return { args, startedAt, finishedAt: Date.now(), exitCode: 0, ...output };
  } catch (error) {
    if (!Number.isInteger(error.code)) throw error;
    return {
      args,
      startedAt,
      finishedAt: Date.now(),
      exitCode: error.code,
      stdout: error.stdout,
      stderr: error.stderr,
    };
  }
}

export async function buildFixture(isolation) {
  const source = await fingerprint(isolation, SOURCE_PATHS);
  const command = await runDotnet(isolation, BUILD_ARGS);
  assert.equal(command.exitCode, 0, command.stdout + command.stderr);
  assert.deepEqual(await fingerprint(isolation, SOURCE_PATHS), source);
  const build = await fingerprint(isolation, BUILD_PATHS);
  const outputs = await Promise.all(
    BUILD_PATHS.map(async (file) => {
      const info = await stat(path.join(isolation.workspace, file));
      assert.ok(
        info.mtimeMs >= command.startedAt,
        `The genuine build must freshly produce ${file}.`,
      );
      return { path: file, modifiedAt: info.mtimeMs, bytes: info.size };
    }),
  );
  return { source, build, command, outputs };
}

export async function testFixture(isolation, proof, options = {}) {
  const operationId = options.operationId ?? randomUUID();
  const reportPath = options.reportPath ?? `results/${operationId}.json`;
  const values = {
    operationId,
    reportPath,
    sourceDigest: proof.source.digest,
    buildDigest: proof.build.digest,
  };
  const args = TEST_ARGS.map((argument) =>
    argument.replace(/^\{(\w+)\}$/, (_, key) => values[key]),
  ).concat(options.extraArgs ?? []);
  const command = await runDotnet(isolation, args, {
    signal: options.signal,
    onSpawn: options.onSpawn,
  });
  let report;
  try {
    report = JSON.parse(await readFile(path.join(isolation.workspace, reportPath), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return { operationId, reportPath, command, report };
}

export async function verifyFixtureResult(isolation, proof, execution) {
  assert.deepEqual(
    await fingerprint(isolation, SOURCE_PATHS),
    proof.source,
    "Source changed after Build.",
  );
  assert.deepEqual(
    await fingerprint(isolation, BUILD_PATHS),
    proof.build,
    "Build outputs changed.",
  );
  assert.equal(execution.command.exitCode, 0, "Actual test process failed.");
  assert.ok(execution.report, "Actual process did not create its expected report.");
  assert.equal(execution.report.format, "zcode-test-v1");
  assert.equal(execution.report.operationId, execution.operationId, "Stale report operation.");
  assert.equal(execution.report.sourceDigest, proof.source.digest);
  assert.equal(execution.report.buildDigest, proof.build.digest);
  assert.deepEqual(
    execution.report.tests.map((item) => item.name).sort(),
    [...REQUIRED_TESTS].sort(),
  );
  assert.ok(execution.report.tests.every((item) => item.status === "passed"));
}
