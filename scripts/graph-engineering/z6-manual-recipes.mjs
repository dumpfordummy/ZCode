import { readFile } from "node:fs/promises";
import path from "node:path";
import { createIsolation } from "./isolation.mjs";
import { configureDotnetEnvironment, fingerprint } from "./z4-fixture.mjs";
import {
  assertSlotAuthorityUnchanged,
  SLOT_BUILD_PATHS,
  SLOT_SOURCE_PATHS,
  slotRecipes,
  testSlotFixture,
  verifySlotResult,
} from "./z6-fixture.mjs";

const index = process.argv.indexOf("--profile");
if (index === -1 || !process.argv[index + 1])
  throw new Error("Supply the exact isolated Z6 manual profile with --profile.");
const isolation = await createIsolation({ manual: true, profile: process.argv[index + 1] });
try {
  await readFile(path.join(isolation.home, "z6-manual-fixture.json"), "utf8");
  if (process.argv.includes("--verify")) {
    await configureDotnetEnvironment(isolation);
    await assertSlotAuthorityUnchanged(isolation);
    const proof = {
      source: await fingerprint(isolation, SLOT_SOURCE_PATHS),
      build: await fingerprint(isolation, SLOT_BUILD_PATHS),
    };
    const execution = await testSlotFixture(isolation, proof);
    await verifySlotResult(isolation, proof, execution);
    console.log(JSON.stringify(execution, null, 2));
  } else console.log(JSON.stringify(slotRecipes("build"), null, 2));
} finally {
  await isolation.close();
}
