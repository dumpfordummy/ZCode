import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GOOD_SOURCE, RUNNER } from "./z4-csharp-source.mjs";
import { fingerprint, prepareCSharpFixture, SOURCE_PATHS } from "./z4-fixture.mjs";

export { GOOD_SOURCE };
export const SEED_SOURCE = GOOD_SOURCE.replace("left + right;", "left + right + 2;");
export const INITIAL_SOURCE = GOOD_SOURCE.replace("left + right;", "left + right + 1;");
export const PARTIAL_SOURCE = GOOD_SOURCE.replace(
  "left + right;",
  "left < 0 ? left + right + 1 : left + right;",
);
export const permanentSource = (offset) => {
  assert.ok(Number.isInteger(offset) && offset >= 1 && offset <= 6);
  return GOOD_SOURCE.replace("left + right;", `left + right + ${offset};`);
};

export async function prepareZ5Fixture(isolation) {
  const original = await prepareCSharpFixture(isolation);
  await writeFile(path.join(isolation.workspace, "MathOps.cs"), SEED_SOURCE);
  await writeFile(
    path.join(isolation.workspace, "AGENTS.md"),
    "Synthetic Z5 C# workspace. Use actual Read/Edit only on MathOps.cs when requested. Preserve Runner.cs and all three assertions. Build/Test run through separately configured native Tool nodes. Never inspect parent directories, install packages, commit or alter graph configuration.\n",
  );
  await writeFile(path.join(isolation.home, "z5-source-before.cs"), SEED_SOURCE);
  return { ...original, source: await fingerprint(isolation, SOURCE_PATHS) };
}

export async function assertRunnerUnchanged(isolation) {
  assert.equal(await readFile(path.join(isolation.workspace, "Runner.cs"), "utf8"), RUNNER);
}

export function repairedSource(current, scenario) {
  if (scenario === "no-progress") return current;
  if (scenario === "exhausted") {
    const match = current.match(/left \+ right \+ ([1-5]);/);
    assert.ok(match, "Permanent-fault repair must consume the actual current faulty source.");
    return permanentSource(Number(match[1]) + 1);
  }
  if (current === INITIAL_SOURCE) return PARTIAL_SOURCE;
  if (current === PARTIAL_SOURCE) return GOOD_SOURCE;
  throw new Error("Unexpected source for a controlled two-step repair.");
}
