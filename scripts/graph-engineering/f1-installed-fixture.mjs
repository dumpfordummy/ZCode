import assert from "node:assert/strict";
import { cp, mkdir, readFile, writeFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { configureDotnetEnvironment, runDotnet } from "./z4-fixture.mjs";
import { TEST_SOURCE, FAIL_SOURCE } from "./u4-native-fixture.mjs";

/** New F1 fixture, never a mutation or SDK substitution in historical evidence. */
export async function prepareF1InstalledFixture(isolation) {
  const seed = process.env.F1_RETAINED_SYNTHETIC_FIXTURE;
  assert.ok(seed, "Explicit retained synthetic fixture required");
  assert.equal(await readFile(path.join(seed, "Tests/ArithmeticTests.cs"), "utf8"), TEST_SOURCE);
  await configureDotnetEnvironment(isolation);
  const ws = isolation.workspace;
  for (const name of [
    "Library",
    "Tests",
    "docs",
    "shared",
    "metadata",
    "B1.sln",
    "NuGet.Config",
    "Directory.Build.props",
  ])
    await cp(path.join(seed, name), path.join(ws, name), {
      recursive: true,
      filter: (source) =>
        !source.split(path.sep).some((part) => part === "bin" || part === "Scale") &&
        (!source.includes(`${path.sep}obj${path.sep}`) || /\.(json|props|targets)$/.test(source)),
    });
  const cache = path.join(isolation.home, "nuget-packages");
  const original = JSON.parse(
    await readFile(path.join(ws, "Tests/obj/project.assets.json"), "utf8"),
  );
  assert.equal(Object.keys(original.packageFolders).length, 1);
  const oldCache = Object.keys(original.packageFolders)[0].replace(/[\\/]+$/, "");
  const packages = [];
  for (const [id, entry] of Object.entries(original.libraries)) {
    if (entry.type !== "package") continue;
    assert.match(entry.path, /^[a-z0-9._-]+\/[a-z0-9._+-]+$/);
    const source = path.join(oldCache, entry.path);
    assert.ok((await stat(path.join(source, ".nupkg.metadata"))).isFile());
    await cp(source, path.join(cache, entry.path), { recursive: true });
    packages.push({ id, path: entry.path, sha512: entry.sha512 });
  }
  const replacements = [
    [oldCache, cache],
    [seed, ws],
  ];
  for (const project of ["Library", "Tests"]) {
    for (const name of await readdir(path.join(ws, project, "obj"))) {
      if (!/\.(json|props|targets)$/.test(name)) continue;
      const file = path.join(ws, project, "obj", name);
      let text = await readFile(file, "utf8");
      for (const [from, to] of replacements) {
        text = text.replaceAll(from.replaceAll("\\", "\\\\"), to.replaceAll("\\", "\\\\"));
        text = text
          .replaceAll(from, to)
          .replaceAll(from.replaceAll("\\", "/"), to.replaceAll("\\", "/"));
      }
      await writeFile(file, text);
    }
  }
  await writeFile(
    path.join(ws, "global.json"),
    JSON.stringify({ sdk: { version: "8.0.426", rollForward: "disable" } }),
  );
  await mkdir(path.join(ws, "Library/Scale"), { recursive: true });
  for (let i = 0; i < 5000; i++)
    await writeFile(
      path.join(ws, "Library/Scale", `Input${String(i).padStart(5, "0")}.cs`),
      `namespace B1.Scale; public class Input${i} { public int Value => ${i}; }\n`,
    );
  Object.assign(isolation.env, {
    NUGET_PACKAGES: cache,
    VSTEST_TELEMETRY_OPTEDIN: "0",
    DOTNET_CLI_UI_LANGUAGE: "en-US",
    ZCODE_GRAPH_DIAGNOSTICS: "1",
  });
  const sdk = await runDotnet(isolation, ["--version"]);
  assert.equal(sdk.exitCode, 0, sdk.stderr);
  assert.equal(sdk.stdout.trim(), "8.0.426");
  const provenance = {
    sdk: "8.0.426",
    framework: "net8.0",
    newFixture: true,
    historicalFixtureUnchanged: true,
    restoreExecuted: false,
    sourceCount: 5013,
    packages,
    testSourceSha256: createHash("sha256").update(TEST_SOURCE).digest("hex"),
  };
  await writeFile(
    path.join(isolation.home, "f1-fixture-provenance.json"),
    JSON.stringify(provenance, null, 2),
  );
  return provenance;
}

/** Explicit continuation of a fully terminal F1 fixture in a fresh private app profile. */
export async function prepareF1Continuation(isolation) {
  const ws = isolation.workspace,
    oldHome = path.dirname(ws);
  assert.equal(path.basename(ws), "workspace");
  assert.match(path.basename(oldHome), /^z1-native-\d+-[a-f0-9]{6}$/);
  const priorBytes = await readFile(path.join(oldHome, "f1-native-summary.json"));
  const prior = JSON.parse(priorBytes);
  assert.equal(prior.models, 0);
  assert.equal(prior.finalRecord.runs.length, 1);
  assert.equal(prior.finalRecord.runs[0].status, "Completed");
  assert.ok(
    prior.finalRecord.runs[0].toolAttempts.every((a) => a.operation.result.processExitObserved),
  );
  assert.equal(prior.cases[0].verification.observationValid, true);
  assert.equal(prior.cases[0].verification.acceptancePassed, true);
  assert.equal(await readFile(path.join(ws, "Tests/ArithmeticTests.cs"), "utf8"), FAIL_SOURCE);
  const provenance = JSON.parse(
    await readFile(path.join(oldHome, "f1-fixture-provenance.json"), "utf8"),
  );
  assert.equal(provenance.sdk, "8.0.426");
  assert.equal(provenance.sourceCount, 5013);
  for (const folder of ["dotnet-home", "msbuild-user", "machine-program-files", "machine-data"])
    await mkdir(path.join(isolation.home, folder), { recursive: true });
  Object.assign(isolation.env, {
    DOTNET_CLI_HOME: path.join(isolation.home, "dotnet-home"),
    NUGET_PACKAGES: path.join(oldHome, "nuget-packages"),
    MSBuildUserExtensionsPath: path.join(isolation.home, "msbuild-user"),
    PROGRAMFILES: path.join(isolation.home, "machine-program-files"),
    "PROGRAMFILES(X86)": path.join(isolation.home, "machine-program-files"),
    PROGRAMDATA: path.join(isolation.home, "machine-data"),
    DOTNET_SKIP_FIRST_TIME_EXPERIENCE: "1",
    DOTNET_CLI_TELEMETRY_OPTOUT: "1",
    DOTNET_NOLOGO: "1",
    DOTNET_GENERATE_ASPNET_CERTIFICATE: "false",
    DOTNET_ADD_GLOBAL_TOOLS_TO_PATH: "false",
    DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE: "true",
    DOTNET_CLI_USE_MSBUILD_SERVER: "0",
    VSTEST_TELEMETRY_OPTEDIN: "0",
    DOTNET_CLI_UI_LANGUAGE: "en-US",
    ZCODE_GRAPH_DIAGNOSTICS: "1",
  });
  const sdk = await runDotnet(isolation, ["--version"]);
  assert.equal(sdk.exitCode, 0, sdk.stderr);
  assert.equal(sdk.stdout.trim(), "8.0.426");
  return {
    ...provenance,
    continuedExistingWorkspace: true,
    previousPassRunId: prior.cases[0].runId,
    previousSummarySha256: createHash("sha256").update(priorBytes).digest("hex"),
    automaticReplay: false,
  };
}
