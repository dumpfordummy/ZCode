import assert from "node:assert/strict";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { configureDotnetEnvironment, runDotnet } from "./z4-fixture.mjs";
import { TEST_SOURCE } from "./b1-dotnet-fixture.mjs";

/** Reuse only an already restored disposable B1 fixture. No restore or feed operation exists. */
export async function prepareU3Fixture(isolation) {
  const seed = process.env.U3_RESTORED_FIXTURE;
  assert.ok(seed, "U3_RESTORED_FIXTURE must name a retained synthetic B1 workspace");
  assert.equal(await readFile(path.join(seed, "Tests/ArithmeticTests.cs"), "utf8"), TEST_SOURCE);
  for (const project of ["Library/B1.Library.csproj", "Tests/B1.Tests.csproj"])
    assert.match(await readFile(path.join(seed, project), "utf8"), /Microsoft.NET.Sdk/);
  await configureDotnetEnvironment(isolation);
  for (const name of ["Library", "Tests", "docs", "B1.sln", "global.json", "NuGet.Config"])
    await cp(path.join(seed, name), path.join(isolation.workspace, name), { recursive: true });
  const assets = JSON.parse(
    await readFile(path.join(seed, "Tests/obj/project.assets.json"), "utf8"),
  );
  assert.equal(Object.keys(assets.packageFolders).length, 1);
  isolation.env.NUGET_PACKAGES = Object.keys(assets.packageFolders)[0];
  isolation.env.VSTEST_TELEMETRY_OPTEDIN = "0";
  isolation.env.DOTNET_CLI_UI_LANGUAGE = "en-US";
  const folder = path.join(isolation.workspace, "Library", "Scale");
  await mkdir(folder, { recursive: true });
  for (let index = 0; index < 5000; index++)
    await writeFile(
      path.join(folder, `Input${String(index).padStart(5, "0")}.cs`),
      `namespace B1.Scale; public class Input${index} { public int Value => ${index}; }\n`,
    );
  const sdk = await runDotnet(isolation, ["--version"]);
  assert.equal(sdk.exitCode, 0, sdk.stderr);
  assert.equal(sdk.stdout.trim(), "8.0.425");
  return {
    sdk: sdk.stdout.trim(),
    restoredAssets: "retained synthetic public-package fixture",
    restoreExecuted: false,
    addedSourceFiles: 5000,
  };
}
