import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { configureDotnetEnvironment, fingerprint } from "./z4-fixture.mjs";
import {
  ADAPTER_PROJECT,
  ADAPTER_SOURCE,
  BUILD_PATHS,
  FRAMEWORK,
  GOOD_SOURCE,
  SDK_VERSION,
  SOURCE_PATHS,
  TEST_CASES,
  TEST_PROJECT,
} from "./pre-z8-dotnet-source.mjs";

const repository = fileURLToPath(new URL("../..", import.meta.url));
const ownerName = "pre-z8-u2-owner.json";
const defaultInstructions =
  "Synthetic Z1 workspace. Modify only fixture.mjs and run node --test fixture.test.mjs. Do not inspect parent directories or external files.\n";
export const u2Sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const exists = async (file) =>
  lstat(file).then(
    () => true,
    (error) => {
      if (error.code === "ENOENT") return false;
      throw error;
    },
  );

export async function assertU2Profile(isolation, requireOwner = true) {
  const parent = await realpath(path.join(repository, ".tmp"));
  const home = await realpath(isolation.home);
  assert.equal(path.dirname(home), parent, "Refusing a non-owned native profile.");
  assert.match(path.basename(home), /^z1-native-\d+-[a-f0-9]{6}$/);
  assert.equal((await lstat(isolation.home)).isSymbolicLink(), false);
  assert.equal((await lstat(isolation.workspace)).isSymbolicLink(), false);
  assert.equal(
    await realpath(isolation.workspace),
    path.join(home, "workspace"),
    "Refusing an escaping workspace.",
  );
  if (requireOwner) {
    const marker = JSON.parse(await readFile(path.join(home, ownerName), "utf8"));
    assert.equal(marker.kind, "pre-z8-u2-native");
    assert.equal(marker.version, 1);
    assert.equal(marker.workspace, isolation.workspace);
  }
  return home;
}

export async function u2OwnedFile(isolation, relative) {
  await assertU2Profile(isolation);
  assert.ok(!path.isAbsolute(relative) && !relative.split(/[\\/]/).includes(".."));
  const parts = relative.split(/[\\/]/);
  let current = isolation.workspace;
  for (const part of parts) {
    current = path.join(current, part);
    const info = await lstat(current);
    assert.equal(info.isSymbolicLink(), false, "Refusing a linked fixture path.");
  }
  const file = await realpath(current);
  assert.ok(file.startsWith(`${await realpath(isolation.workspace)}${path.sep}`));
  const info = await lstat(file);
  assert.ok(info.isFile() && info.nlink === 1, "Expected one owned plain fixture file.");
  return file;
}

export async function prepareU2Fixture(isolation) {
  const home = await assertU2Profile(isolation, false);
  assert.equal(await exists(path.join(home, ownerName)), false, "Refusing a reused U2 fixture.");
  const files = {
    "Fixture.Tests.csproj": TEST_PROJECT,
    "MathOps.cs": GOOD_SOURCE,
    "Cases.cs": TEST_CASES,
    "adapter/Fixture.TestAdapter.csproj": ADAPTER_PROJECT,
    "adapter/Adapter.cs": ADAPTER_SOURCE,
    "global.json": `${JSON.stringify({ sdk: { version: SDK_VERSION, rollForward: "disable" } })}\n`,
    "NuGet.Config":
      '<?xml version="1.0" encoding="utf-8"?><configuration><packageSources><clear /></packageSources></configuration>\n',
    "Directory.Build.props": "<Project />\n",
    "Directory.Build.targets": "<Project />\n",
    "Directory.Packages.props": "<Project />\n",
    ".gitignore": "bin/\nobj/\nresults/\nadapter/bin/\nadapter/obj/\n",
  };
  for (const file of Object.keys(files))
    assert.equal(
      await exists(path.join(isolation.workspace, file)),
      false,
      `Refusing existing fixture input: ${file}`,
    );
  assert.equal(
    await exists(path.join(isolation.workspace, "adapter")),
    false,
    "Refusing existing adapter directory.",
  );
  const instructions = path.join(isolation.workspace, "AGENTS.md");
  const hasInstructions = await exists(instructions);
  if (hasInstructions) {
    assert.equal((await lstat(instructions)).isSymbolicLink(), false);
    assert.equal(
      await readFile(instructions, "utf8"),
      defaultInstructions,
      "Refusing modified fixture instructions.",
    );
  }
  await writeFile(
    path.join(home, ownerName),
    JSON.stringify({
      kind: "pre-z8-u2-native",
      version: 1,
      workspace: isolation.workspace,
    }),
    { flag: "wx" },
  );
  await mkdir(path.join(isolation.workspace, "adapter"));
  for (const [file, content] of Object.entries(files))
    await writeFile(path.join(isolation.workspace, file), content, { flag: "wx" });
  await writeFile(
    instructions,
    "Synthetic pre-Z8 U2 VSTest workspace. Execute only explicitly reviewed native project-check commands. Preserve Cases.cs and adapter/Adapter.cs. No external network, packages, credentials, parent project access or publication. MathOps.cs mutations belong only to the observed isolated negative scenarios.\n",
    { flag: hasInstructions ? "w" : "wx" },
  );
  await configureDotnetEnvironment(isolation);
  await mkdir(path.join(home, "nuget-http-cache"));
  Object.assign(isolation.env, {
    NUGET_HTTP_CACHE_PATH: path.join(home, "nuget-http-cache"),
    NUGET_XMLDOC_MODE: "skip",
    VSTEST_TELEMETRY_OPTEDIN: "0",
    DOTNET_CLI_UI_LANGUAGE: "en-US",
  });
  return {
    project: "Fixture.Tests.csproj",
    framework: FRAMEWORK,
    sourcePaths: SOURCE_PATHS,
    buildPaths: BUILD_PATHS,
    source: await fingerprint(isolation, SOURCE_PATHS),
    commands: [],
    prerequisite: "NOT RUN",
  };
}

export async function prepareU2OfflineAssets(isolation, fixture) {
  await assertU2Profile(isolation);
  const receipt = path.join(isolation.home, "pre-z8-u2-prerequisite.json");
  assert.equal(await exists(receipt), false, "Refusing to repeat a fixture prerequisite.");
  fixture.prerequisite = "RUNNING";
  const run = async (label, args) => {
    const entry = {
      label,
      executable: "dotnet",
      args,
      cwd: isolation.workspace,
      startedAt: Date.now(),
    };
    fixture.commands.push(entry);
    await writeFile(receipt, JSON.stringify(fixture, null, 2));
    try {
      const pending = promisify(execFile)("dotnet", args, {
        cwd: isolation.workspace,
        env: isolation.env,
        windowsHide: true,
        timeout: 90000,
        maxBuffer: 2 * 1024 * 1024,
      });
      entry.pid = pending.child.pid;
      Object.assign(entry, await pending, { exitCode: 0 });
    } catch (error) {
      Object.assign(entry, {
        exitCode: Number.isInteger(error.code) ? error.code : null,
        signal: error.signal ?? null,
        stdout: error.stdout ?? "",
        stderr: error.stderr ?? "",
        error: error.message,
      });
    }
    entry.completedAt = Date.now();
    await writeFile(receipt, JSON.stringify(fixture, null, 2));
    assert.equal(entry.exitCode, 0, `${label}: ${entry.stdout}\n${entry.stderr}`);
    return entry;
  };
  try {
    const version = await run("sdk-version", ["--version"]);
    assert.equal(version.stdout.trim(), SDK_VERSION);
    const info = await run("sdk-info", ["--info"]);
    const selected = info.stdout.match(/^\s*Base Path:\s*(.+)$/m)?.[1].trim();
    assert.ok(selected, "Pinned SDK must report its actual base path.");
    fixture.sdkPath = await realpath(selected);
    assert.equal(path.basename(fixture.sdkPath), SDK_VERSION);
    fixture.sdkTools = await Promise.all(
      [
        "dotnet.dll",
        "vstest.console.dll",
        "Microsoft.TestPlatform.Build.dll",
        "Microsoft.VisualStudio.TestPlatform.ObjectModel.dll",
        "testhost.dll",
        "Extensions/Microsoft.VisualStudio.TestPlatform.Extensions.Trx.TestLogger.dll",
      ].map(async (name) => ({
        file: name,
        sha256: u2Sha256(await readFile(path.join(fixture.sdkPath, name))),
      })),
    );
    await run("offline-assets", [
      "restore",
      fixture.project,
      "--configfile",
      "NuGet.Config",
      "--disable-parallel",
      "-p:NuGetAudit=false",
      "-p:ImportDirectoryBuildProps=false",
      "-p:ImportDirectoryBuildTargets=false",
      "-p:ImportDirectoryPackagesProps=false",
      "-nodeReuse:false",
    ]);
    assert.deepEqual(await fingerprint(isolation, SOURCE_PATHS), fixture.source);
    assert.deepEqual(
      await readdir(isolation.env.NUGET_PACKAGES),
      [],
      "Offline fixture must install no packages.",
    );
    fixture.assets = await Promise.all(
      ["obj/project.assets.json", "adapter/obj/project.assets.json"].map(async (file) => ({
        file,
        sha256: u2Sha256(await readFile(await u2OwnedFile(isolation, file))),
      })),
    );
    fixture.prerequisite = "PASS: genuine offline SDK assets; no package installs";
  } catch (error) {
    fixture.prerequisite = "FAIL";
    fixture.error = error instanceof Error ? error.stack : String(error);
    throw error;
  } finally {
    await writeFile(receipt, JSON.stringify(fixture, null, 2));
  }
  return fixture;
}
