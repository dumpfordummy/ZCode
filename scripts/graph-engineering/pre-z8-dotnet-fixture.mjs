import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { configureDotnetEnvironment } from "./z4-fixture.mjs";
import {
  ADAPTER_PROJECT,
  ADAPTER_SOURCE,
  BUILD_PATHS,
  FRAMEWORK,
  GOOD_SOURCE,
  SDK_HOST_ASSEMBLIES,
  SDK_VERSION,
  SOURCE_PATHS,
  TEST_CASES,
  TEST_PROJECT,
} from "./pre-z8-dotnet-source.mjs";

const repository = fileURLToPath(new URL("../..", import.meta.url));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const MSBUILD_ARGS = [
  "--disable-build-servers",
  "-p:UseSharedCompilation=false",
  "-p:ImportDirectoryBuildProps=false",
  "-p:ImportDirectoryBuildTargets=false",
  "-p:ImportDirectoryPackagesProps=false",
  "-nodeReuse:false",
];
const HOST_PATHS = SDK_HOST_ASSEMBLIES.map((name) => `bin/Release/${FRAMEWORK}/${name}.dll`);
const SDK_TOOL_PATHS = [
  "dotnet.dll",
  "vstest.console.dll",
  "Microsoft.TestPlatform.Build.dll",
  "Microsoft.VisualStudio.TestPlatform.ObjectModel.dll",
  "testhost.dll",
  "Extensions/Microsoft.VisualStudio.TestPlatform.Extensions.Trx.TestLogger.dll",
];

export async function createVstestFixture({ framework = FRAMEWORK, projectName = "Fixture" } = {}) {
  assert.ok(["net8.0", "net6.0"].includes(framework));
  assert.match(projectName, /^[A-Za-z][A-Za-z0-9-]{0,30}$/);
  const base = path.join(repository, ".tmp");
  await mkdir(base, { recursive: true });
  const home = await mkdtemp(path.join(await realpath(base), "pre-z8-dotnet-"));
  const workspace = path.join(home, "workspace");
  for (const directory of [
    "workspace/adapter",
    "home",
    "appdata",
    "localappdata",
    "temp",
    "logs",
    "nuget-http-cache",
  ])
    await mkdir(path.join(home, directory), { recursive: true });
  await writeFile(
    path.join(home, "fixture-owner.json"),
    JSON.stringify({ kind: "pre-z8-dotnet", version: 1 }),
  );
  const env = Object.fromEntries(
    [
      "SystemRoot",
      "WINDIR",
      "ComSpec",
      "PATHEXT",
      "PATH",
      "NUMBER_OF_PROCESSORS",
      "PROCESSOR_ARCHITECTURE",
    ].flatMap((key) => (process.env[key] ? [[key, process.env[key]]] : [])),
  );
  Object.assign(env, {
    HOME: path.join(home, "home"),
    USERPROFILE: path.join(home, "home"),
    APPDATA: path.join(home, "appdata"),
    LOCALAPPDATA: path.join(home, "localappdata"),
    TEMP: path.join(home, "temp"),
    TMP: path.join(home, "temp"),
    NUGET_HTTP_CACHE_PATH: path.join(home, "nuget-http-cache"),
    NUGET_XMLDOC_MODE: "skip",
    VSTEST_TELEMETRY_OPTEDIN: "0",
    DOTNET_CLI_UI_LANGUAGE: "en-US",
    HTTP_PROXY: "http://127.0.0.1:9",
    HTTPS_PROXY: "http://127.0.0.1:9",
    NO_PROXY: "127.0.0.1,localhost",
  });
  const scoped = (value) =>
    value.replaceAll(FRAMEWORK, framework).replaceAll("Fixture.Tests", `${projectName}.Tests`);
  const fixture = {
    home,
    workspace,
    env,
    framework,
    project: `${projectName}.Tests.csproj`,
    sourcePaths: SOURCE_PATHS.map(scoped),
    buildPaths: BUILD_PATHS.map(scoped),
    hostPaths: HOST_PATHS.map(scoped),
    commands: [],
  };
  await configureDotnetEnvironment(fixture);
  const files = {
    [fixture.project]: scoped(TEST_PROJECT),
    "MathOps.cs": GOOD_SOURCE,
    "Cases.cs": TEST_CASES,
    "adapter/Fixture.TestAdapter.csproj": scoped(ADAPTER_PROJECT),
    "adapter/Adapter.cs": ADAPTER_SOURCE,
    "global.json": `${JSON.stringify({ sdk: { version: SDK_VERSION, rollForward: "disable" } })}\n`,
    "NuGet.Config":
      '<?xml version="1.0" encoding="utf-8"?><configuration><packageSources><clear /></packageSources></configuration>\n',
    "Directory.Build.props": "<Project />\n",
    "Directory.Build.targets": "<Project />\n",
    "Directory.Packages.props": "<Project />\n",
    "AGENTS.md":
      "Synthetic pre-Z8 VSTest fixture. Only MathOps.cs may be changed for a requested implementation mutation. Preserve Cases.cs and adapter assertions. No network, package install, parent workspace access, credential access or publication.\n",
    ".gitignore": "bin/\nobj/\nresults/\nadapter/bin/\nadapter/obj/\n",
  };
  await Promise.all(
    Object.entries(files).map(([name, content]) => writeFile(path.join(workspace, name), content)),
  );
  const version = await runFixtureCommand(fixture, "sdk-version", ["--version"]);
  assert.equal(version.exitCode, 0, version.stderr);
  assert.equal(version.stdout.trim(), SDK_VERSION);
  const info = await runFixtureCommand(fixture, "sdk-info", ["--info"]);
  assert.equal(info.exitCode, 0, info.stderr);
  const sdkPath = info.stdout.match(/^\s*Base Path:\s*(.+)$/m)?.[1].trim();
  assert.ok(sdkPath, "Selected SDK path must be reported by the pinned SDK.");
  fixture.sdkPath = await realpath(sdkPath);
  assert.equal(path.basename(fixture.sdkPath), SDK_VERSION);
  fixture.sdkToolchain = await fingerprintAt(fixture.sdkPath, SDK_TOOL_PATHS);
  return fixture;
}

async function fingerprintAt(directory, names) {
  const files = [];
  for (const name of [...names].sort()) {
    const bytes = await readFile(path.join(directory, name));
    files.push({ path: name, bytes: bytes.length, digest: digest(bytes) });
  }
  return { digest: digest(JSON.stringify(files)), files };
}

export async function fingerprint(fixture, names) {
  return fingerprintAt(fixture.workspace, names);
}

async function assertOwned(fixture) {
  const home = await realpath(fixture.home);
  assert.equal(path.dirname(home), await realpath(path.join(repository, ".tmp")));
  assert.ok(path.basename(home).startsWith("pre-z8-dotnet-"));
  assert.equal(await realpath(fixture.workspace), path.join(home, "workspace"));
  const marker = JSON.parse(await readFile(path.join(home, "fixture-owner.json"), "utf8"));
  assert.equal(marker.kind, "pre-z8-dotnet");
  assert.equal(marker.version, 1);
}

export async function runFixtureCommand(fixture, label, args) {
  await assertOwned(fixture);
  assert.match(label, /^[a-z0-9-]+$/);
  const index = fixture.commands.length + 1;
  const log = path.join(fixture.home, "logs", `${String(index).padStart(2, "0")}-${label}`);
  const command = {
    executable: "dotnet",
    args,
    cwd: fixture.workspace,
    startedAt: Date.now(),
    log,
  };
  fixture.commands.push(command);
  await writeFile(`${log}.json`, JSON.stringify(command, null, 2));
  try {
    const pending = promisify(execFile)("dotnet", args, {
      cwd: fixture.workspace,
      env: fixture.env,
      timeout: 90000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });
    command.pid = pending.child.pid;
    Object.assign(command, await pending, { exitCode: 0 });
  } catch (error) {
    Object.assign(command, {
      exitCode: Number.isInteger(error.code) ? error.code : null,
      signal: error.signal ?? null,
      killed: error.killed === true,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
      failure: error.message,
    });
  }
  command.finishedAt = Date.now();
  await Promise.all([
    writeFile(`${log}.json`, JSON.stringify(command, null, 2)),
    writeFile(`${log}.stdout.log`, command.stdout),
    writeFile(`${log}.stderr.log`, command.stderr),
  ]);
  return command;
}

export async function buildVstestFixture(fixture) {
  const source = await fingerprint(fixture, fixture.sourcePaths);
  const command = await runFixtureCommand(fixture, "build", [
    "build",
    fixture.project,
    "--configuration",
    "Release",
    "--nologo",
    "--no-incremental",
    "-p:RestoreConfigFile=NuGet.Config",
    "-p:NuGetAudit=false",
    ...MSBUILD_ARGS,
  ]);
  assert.equal(command.exitCode, 0, command.stdout + command.stderr);
  assert.deepEqual(await fingerprint(fixture, fixture.sourcePaths), source);
  const outputs = await Promise.all(
    fixture.buildPaths.map(async (name) => {
      const info = await stat(path.join(fixture.workspace, name));
      assert.ok(info.mtimeMs >= command.startedAt, `Expected fresh built output: ${name}`);
      return { path: name, modifiedAt: info.mtimeMs, bytes: info.size };
    }),
  );
  return {
    source,
    build: await fingerprint(fixture, fixture.buildPaths),
    sdkHost: await fingerprint(fixture, fixture.hostPaths),
    sdkToolchain: fixture.sdkToolchain,
    outputs,
    command,
  };
}

// Controlled-fixture observation only, not a product XML parser or a validity decision.
// Original SDK-generated XML is retained for the independent production-adapter tests.
export function observeFixtureTrx(text) {
  const attributes = (value) =>
    Object.fromEntries(
      [...value.matchAll(/([\w:]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]),
    );
  assert.ok(text.includes('xmlns="http://microsoft.com/schemas/VisualStudio/TeamTest/2010"'));
  assert.ok(text.trimEnd().endsWith("</TestRun>"));
  const root = attributes(text.match(/<TestRun\b([^>]*)>/)?.[1] ?? "");
  const counterAttributes = attributes(text.match(/<Counters\b([^>]*)\/>/)?.[1] ?? "");
  assert.ok(
    root.id && counterAttributes.total !== undefined,
    "Complete genuine TRX summary required.",
  );
  return {
    runId: root.id,
    counters: Object.fromEntries(
      Object.entries(counterAttributes).map(([key, value]) => [key, Number(value)]),
    ),
    results: [...text.matchAll(/<UnitTestResult\b([^>]*)>/g)].map((match) => attributes(match[1])),
    codeBases: [...text.matchAll(/<TestMethod\b([^>]*)\/>/g)].map(
      (match) => attributes(match[1]).codeBase,
    ),
  };
}

export async function testVstestFixture(
  fixture,
  build,
  { filter, operationId = randomUUID() } = {},
) {
  assert.match(operationId, /^[a-f0-9-]{36}$/);
  const reportPath = `results/${operationId}/results.trx`;
  const absolute = path.join(fixture.workspace, reportPath);
  assert.equal(
    await lstat(absolute).then(
      () => true,
      (error) => {
        if (error.code === "ENOENT") return false;
        throw error;
      },
    ),
    false,
    "Invocation report already exists.",
  );
  const args = [
    "test",
    fixture.project,
    "--no-build",
    "--no-restore",
    "--configuration",
    "Release",
    "--framework",
    fixture.framework,
    "--logger",
    "trx;LogFileName=results.trx",
    "--results-directory",
    `results/${operationId}`,
    "--test-adapter-path",
    `adapter/bin/Release/${fixture.framework}`,
    "--diag",
    `results/${operationId}/vstest.log`,
    ...(filter ? ["--filter", filter] : []),
    ...MSBUILD_ARGS,
  ];
  await mkdir(path.dirname(absolute), { recursive: true });
  const command = await runFixtureCommand(fixture, "vstest", args);
  const bytes = await readFile(absolute).catch((error) => {
    throw new Error(`Genuine VSTest report missing. ${command.stdout}\n${command.stderr}`, {
      cause: error,
    });
  });
  assert.ok((await stat(absolute)).mtimeMs >= command.startedAt, "Report must be fresh.");
  return {
    operationId,
    reportPath,
    reportDigest: digest(bytes),
    reportBytes: bytes.length,
    scope: {
      project: fixture.project,
      framework: fixture.framework,
      configuration: "Release",
      filter: filter ?? null,
    },
    sourceDigest: build.source.digest,
    buildDigest: build.build.digest,
    vstestVersion: command.stdout.match(/^VSTest version ([^\r\n]+)/m)?.[1],
    command,
    observation: observeFixtureTrx(bytes.toString("utf8")),
  };
}

export async function verifyFixtureAssociation(fixture, build, result) {
  assert.deepEqual(
    await fingerprint(fixture, fixture.sourcePaths),
    build.source,
    "Source changed after Build.",
  );
  assert.deepEqual(
    await fingerprint(fixture, fixture.buildPaths),
    build.build,
    "Build outputs changed after Build.",
  );
  assert.deepEqual(
    await fingerprint(fixture, fixture.hostPaths),
    build.sdkHost,
    "SDK host outputs changed after Build.",
  );
  assert.deepEqual(
    await fingerprintAt(fixture.sdkPath, SDK_TOOL_PATHS),
    build.sdkToolchain,
    "Installed SDK toolchain changed after Build.",
  );
  assert.equal(result.sourceDigest, build.source.digest);
  assert.equal(result.buildDigest, build.build.digest);
  assert.equal(
    result.reportDigest,
    digest(await readFile(path.join(fixture.workspace, result.reportPath))),
  );
}

export async function saveFixtureEvidence(fixture, evidence) {
  await assertOwned(fixture);
  const implementationPaths = [
    "scripts/graph-engineering/pre-z8-dotnet-fixture.mjs",
    "scripts/graph-engineering/pre-z8-dotnet-source.mjs",
    "scripts/graph-engineering/pre-z8-dotnet-fixture.test.mjs",
    "scripts/graph-engineering/pre-z8-dotnet-artifact-probe.mjs",
    "scripts/graph-engineering/z4-fixture.mjs",
    "packages/services/src/graph-engineering/adapters/artifacts.ts",
    "packages/services/src/graph-engineering/dotnet-types.ts",
    "packages/services/src/graph-engineering/domain/trx-xml.ts",
    "packages/services/src/graph-engineering/domain/trx-shape.ts",
    "packages/services/src/graph-engineering/domain/trx-values.ts",
    "packages/services/src/graph-engineering/domain/trx-report.ts",
    "packages/shared/src/feedbackPrivacy.ts",
  ];
  const implementation = await Promise.all(
    implementationPaths.map(async (name) => {
      const bytes = await readFile(path.join(repository, name));
      return { path: name, bytes: bytes.length, digest: digest(bytes) };
    }),
  );
  await writeFile(
    path.join(fixture.home, "evidence.json"),
    JSON.stringify(
      {
        ...evidence,
        implementation,
        commands: fixture.commands,
        fixtureHome: fixture.home,
        sdk: SDK_VERSION,
        sdkPath: fixture.sdkPath,
        sdkToolchain: fixture.sdkToolchain,
        framework: fixture.framework,
        nextAction:
          evidence.status === "passed"
            ? "Integrate genuine TRX through product adapter and native checks; preserve the incomplete state of redacted raw TRX."
            : "Inspect retained failed command and repair fixture; no product acceptance established.",
      },
      null,
      2,
    ),
  );
}
