import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createIsolation } from "./isolation.mjs";
import { readGraphRecord } from "./z2-native-helpers.mjs";
import {
  BUILD_PATHS,
  SOURCE_PATHS,
  configureDotnetEnvironment,
  fingerprint,
  testFixture,
  verifyFixtureResult,
} from "./z4-fixture.mjs";
import { fixtureRecipes } from "./z4-recipes.mjs";
import { assertRunnerUnchanged } from "./z5-fixture.mjs";

const index = process.argv.indexOf("--profile");
if (index === -1 || !process.argv[index + 1])
  throw new Error("Supply the exact Z5 manual profile using --profile.");
const isolation = await createIsolation({ manual: true, profile: process.argv[index + 1] });
try {
  await readFile(path.join(isolation.home, "z5-manual-fixture.json"), "utf8");
  if (process.argv.includes("--verify")) {
    await configureDotnetEnvironment(isolation);
    await assertRunnerUnchanged(isolation);
    const proof = {
      source: await fingerprint(isolation, SOURCE_PATHS),
      build: await fingerprint(isolation, BUILD_PATHS),
    };
    const result = await testFixture(isolation, proof);
    await verifyFixtureResult(isolation, proof, result);
    console.log(JSON.stringify(result, null, 2));
  } else {
    const supplied = process.argv.indexOf("--build-node-id");
    let nodeId = supplied === -1 ? undefined : process.argv[supplied + 1];
    if (supplied !== -1)
      assert.ok(
        nodeId?.trim() && !nodeId.startsWith("--"),
        "Copy the exact Build node ID from its native editor field.",
      );
    if (!nodeId) {
      const record = await readGraphRecord(isolation);
      const nodes = record.definition.nodes.filter(
        (node) => node.type === "tool" && node.name === "Build",
      );
      assert.equal(
        nodes.length,
        1,
        "First save exactly one Tool named Build, or provide its actual ID using --build-node-id.",
      );
      nodeId = nodes[0].id;
    }
    console.log(JSON.stringify(fixtureRecipes(nodeId), null, 2));
  }
} finally {
  await isolation.close();
}
