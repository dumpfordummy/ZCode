import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { BUILD_ARGS, configureDotnetEnvironment, fingerprint, runDotnet } from "./z4-fixture.mjs";
import {
  GAME_DOC,
  REQUIRED_SLOT_TESTS,
  SEED_SLOT_SOURCE,
  SLOT_PROJECT,
  SLOT_RUNNER,
} from "./z6-slot-source.mjs";

export const SLOT_SOURCE_PATHS = [
  "Z6Slot.csproj",
  "SlotRules.cs",
  "Runner.cs",
  "GameDoc.md",
  "global.json",
  "NuGet.Config",
  "Directory.Build.props",
  "Directory.Build.targets",
  "Directory.Packages.props",
];
export const SLOT_BUILD_PATHS = [
  "bin/Release/net8.0/Z6Slot.dll",
  "bin/Release/net8.0/Z6Slot.deps.json",
  "bin/Release/net8.0/Z6Slot.runtimeconfig.json",
];
export const SLOT_BUILD_ARGS = BUILD_ARGS.map((argument) =>
  argument === "Z4Fixture.csproj" ? "Z6Slot.csproj" : argument,
);
export const SLOT_TEST_ARGS = [
  SLOT_BUILD_PATHS[0],
  "--operation-id",
  "{operationId}",
  "--source-digest",
  "{sourceDigest}",
  "--build-digest",
  "{buildDigest}",
  "--report",
  "{reportPath}",
];

export async function prepareSlotFixture(isolation) {
  await configureDotnetEnvironment(isolation);
  const files = {
    "Z6Slot.csproj": SLOT_PROJECT,
    "SlotRules.cs": SEED_SLOT_SOURCE,
    "Runner.cs": SLOT_RUNNER,
    "GameDoc.md": GAME_DOC,
    "global.json": JSON.stringify({ sdk: { version: "8.0.425", rollForward: "disable" } }) + "\n",
    "NuGet.Config":
      '<?xml version="1.0" encoding="utf-8"?><configuration><packageSources><clear /></packageSources></configuration>\n',
    "Directory.Build.props": "<Project />\n",
    "Directory.Build.targets": "<Project />\n",
    "Directory.Packages.props": "<Project />\n",
    ".gitignore": "bin/\nobj/\nresults/\n",
    "AGENTS.md":
      "Synthetic Z6 workspace. GameDoc.md is the sole fixture rules authority. Use actual Read/Edit only on SlotRules.cs for the selected task; preserve Runner.cs, GameDoc.md and configuration. Build/Test uses explicitly configured recipes. Do not inspect parent directories, install packages, use external services or commit. Bonus and Respin are excluded. RTP has no target and is not applicable.\n",
  };
  await Promise.all(
    Object.entries(files).map(([name, content]) =>
      writeFile(path.join(isolation.workspace, name), content),
    ),
  );
  return {
    source: await fingerprint(isolation, SLOT_SOURCE_PATHS),
    authority: await fingerprint(isolation, ["GameDoc.md", "Runner.cs"]),
  };
}
export async function assertSlotAuthorityUnchanged(isolation) {
  assert.equal(await readFile(path.join(isolation.workspace, "GameDoc.md"), "utf8"), GAME_DOC);
  assert.equal(await readFile(path.join(isolation.workspace, "Runner.cs"), "utf8"), SLOT_RUNNER);
}
export async function buildSlotFixture(isolation) {
  const source = await fingerprint(isolation, SLOT_SOURCE_PATHS);
  const command = await runDotnet(isolation, SLOT_BUILD_ARGS);
  assert.equal(command.exitCode, 0, command.stdout + command.stderr);
  assert.deepEqual(await fingerprint(isolation, SLOT_SOURCE_PATHS), source);
  const build = await fingerprint(isolation, SLOT_BUILD_PATHS);
  for (const file of SLOT_BUILD_PATHS)
    assert.ok((await stat(path.join(isolation.workspace, file))).mtimeMs >= command.startedAt);
  return { source, build, command };
}
export async function testSlotFixture(isolation, proof) {
  const operationId = randomUUID(),
    reportPath = `results/${operationId}.json`;
  const values = {
    operationId,
    sourceDigest: proof.source.digest,
    buildDigest: proof.build.digest,
    reportPath,
  };
  const args = SLOT_TEST_ARGS.map((argument) =>
    argument.replace(/^\{(\w+)\}$/, (_, key) => values[key]),
  );
  const command = await runDotnet(isolation, args);
  const report = JSON.parse(await readFile(path.join(isolation.workspace, reportPath), "utf8"));
  return { operationId, reportPath, command, report };
}
export async function verifySlotResult(isolation, proof, execution) {
  assert.deepEqual(await fingerprint(isolation, SLOT_SOURCE_PATHS), proof.source);
  assert.deepEqual(await fingerprint(isolation, SLOT_BUILD_PATHS), proof.build);
  assert.equal(execution.command.exitCode, 0);
  assert.equal(execution.report.format, "zcode-test-v1");
  assert.equal(execution.report.operationId, execution.operationId);
  assert.equal(execution.report.sourceDigest, proof.source.digest);
  assert.equal(execution.report.buildDigest, proof.build.digest);
  assert.deepEqual(
    execution.report.tests.map((item) => item.name).sort(),
    [...REQUIRED_SLOT_TESTS].sort(),
  );
  assert.ok(execution.report.tests.every((item) => item.status === "passed"));
  await assertSlotAuthorityUnchanged(isolation);
}
export function slotRecipes(buildNodeId = "build") {
  return [
    {
      id: "slot-build",
      name: "Build explicit synthetic slot fixture",
      executable: "dotnet",
      args: SLOT_BUILD_ARGS,
      cwd: ".",
      timeoutMs: 60000,
      sourcePaths: SLOT_SOURCE_PATHS,
      expectedOutputs: SLOT_BUILD_PATHS,
      verifier: { kind: "build" },
    },
    {
      id: "slot-test",
      name: "Test source-linked synthetic slot edge cases",
      executable: "dotnet",
      args: SLOT_TEST_ARGS,
      cwd: ".",
      timeoutMs: 60000,
      sourcePaths: SLOT_SOURCE_PATHS,
      expectedOutputs: [],
      verifier: {
        kind: "test",
        format: "zcode-json-v1",
        reportPath: "results/test-report.json",
        minimumTests: REQUIRED_SLOT_TESTS.length,
        expectedTests: REQUIRED_SLOT_TESTS.length,
        requiredTests: REQUIRED_SLOT_TESTS,
        buildNodeId,
      },
    },
  ];
}
