import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createIsolation } from "./isolation.mjs";
import { configureDotnetEnvironment, prepareCSharpFixture } from "./z4-fixture.mjs";
import { Z4_IMPLEMENT } from "./z4-provider-fixture.mjs";
import { OUTPUT_SCHEMA } from "./z4-recipes.mjs";
import { prepareManualSetupCheck } from "./z4-manual-setup-check.mjs";

const profileIndex = process.argv.indexOf("--profile");
if (profileIndex !== -1 && !process.argv[profileIndex + 1])
  throw new Error("--profile requires the exact printed isolated manual profile path.");
const isolation = await createIsolation({
  manual: true,
  profile: profileIndex === -1 ? undefined : process.argv[profileIndex + 1],
});
try {
  if (profileIndex === -1) {
    const proof = await prepareCSharpFixture(isolation, { buggy: true });
    await writeFile(
      path.join(isolation.home, "z4-manual-fixture.json"),
      JSON.stringify(proof, null, 2),
    );
  } else {
    await readFile(path.join(isolation.home, "z4-manual-fixture.json"), "utf8");
    await configureDotnetEnvironment(isolation);
  }
  const checkSetup = process.argv.includes("--verify-setup")
    ? await prepareManualSetupCheck(isolation, profileIndex === -1)
    : undefined;
  const window = await isolation.launch();
  console.log(`Isolated profile: ${isolation.home}
Synthetic C# workspace: ${isolation.workspace}
This launcher configures no provider and submits no task or command. Configure only an approved provider in this isolated app if testing the Agent Task. Tool-only recipes require no model provider. The launcher permits provider traffic for your explicit manual operation; the supplied C# project has no packages and cleared feeds.

Create Start -> Implement -> Review code -> Build -> Test -> Review evidence -> End. Add Build and Test as Tool nodes. Select Build and copy its visible readonly Node ID. In a second repository terminal run, replacing COPIED_BUILD_NODE_ID with that exact value:
node scripts/graph-engineering/z4-manual-recipes.mjs --profile "${isolation.home}" --build-node-id "COPIED_BUILD_NODE_ID"
Paste its recipe array in Project recipes after Load, then Save recipes. Select fixture-build and fixture-test on the corresponding Tool nodes. The helper prints configuration and does not edit it itself. Once a graph is saved, omitting --build-node-id reads the saved Tool named Build.

Implement instructions:
${Z4_IMPLEMENT}
Enable strict JSON output with this schema:
${JSON.stringify(OUTPUT_SCHEMA, null, 2)}

Review code: explicit artifact source Implement, selector structured, required comment. Review evidence: explicit artifact source Test, selector test, required comment. Set End result source to Test. Keep native permission mode Ask before changes. Save and explicitly Run. Native permissions remain separate from the two human approval gates.

Inspect each Tool's process-known, exit-success, report freshness/parsing and acceptance facts. Positive evidence requires exactly add-positive, add-negative and add-zero, all passed. Verify each Open conversation goes to that node's actual existing session. Manifest export must omit raw content and argv. A model PASS alone is not a machine test result.

After the run, independently execute the unchanged built runner in its private environment:
node scripts/graph-engineering/z4-manual-recipes.mjs --profile "${isolation.home}" --verify

Reopen without rewriting source, tests, recipes, settings or prior evidence:
node scripts/graph-engineering/z4-launch-manual.mjs --profile "${isolation.home}"

Quit this isolated app to finish. Opening it is setup only and is not a user-operated PASS. No Git publication is authorized by any graph approval.`);
  if (checkSetup) await checkSetup(window);
  else await new Promise((resolve) => isolation.app.process().once("exit", resolve));
} finally {
  await isolation.close();
}
