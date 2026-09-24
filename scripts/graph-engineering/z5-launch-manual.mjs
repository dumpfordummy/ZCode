import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createIsolation } from "./isolation.mjs";
import { configureDotnetEnvironment, SOURCE_PATHS } from "./z4-fixture.mjs";
import { prepareManualSetupCheck } from "./z4-manual-setup-check.mjs";
import { prepareZ5Fixture } from "./z5-fixture.mjs";
import { REVIEW_SCHEMA } from "./z5-native-editor.mjs";
import { REPAIR_PROMPT, REVIEW_PROMPT } from "./z5-provider-responses.mjs";

const profileIndex = process.argv.indexOf("--profile");
if (profileIndex !== -1 && !process.argv[profileIndex + 1])
  throw new Error("--profile requires the exact printed isolated manual profile path.");
const isolation = await createIsolation({
  manual: true,
  profile: profileIndex === -1 ? undefined : process.argv[profileIndex + 1],
});
try {
  if (profileIndex === -1) {
    const proof = await prepareZ5Fixture(isolation);
    await writeFile(
      path.join(isolation.home, "z5-manual-fixture.json"),
      JSON.stringify(proof, null, 2),
    );
  } else {
    await readFile(path.join(isolation.home, "z5-manual-fixture.json"), "utf8");
    await configureDotnetEnvironment(isolation);
  }
  const check = process.argv.includes("--verify-setup")
    ? await prepareManualSetupCheck(isolation, profileIndex === -1)
    : undefined;
  const window = await isolation.launch();
  console.log(`Isolated profile: ${isolation.home}
Synthetic C# workspace: ${isolation.workspace}
This launcher configures no provider and sends no native input or command. Use only an approved provider in this private app for user-operated testing; the offline C# project has no external packages and cleared feeds. Reopening preserves existing private source, tests, configuration, graph and history.

In Graph Engineering, explicitly upgrade the draft to the sequential editor and then version 5. Create Implement -> Build -> Test -> Reviewer -> Condition. Add Repair -> Build. Condition pass -> Final human review -> End; needs_changes -> Repair; needs_human -> Final human review. The final gate remains outside the repair region. Set End result source to Test.

Create Build/Test as Tool nodes. Copy the visible Build Node ID and run in a second repository terminal:
node scripts/graph-engineering/z5-manual-recipes.mjs --profile "${isolation.home}" --build-node-id "COPIED_BUILD_NODE_ID"
Load Project recipes, paste the printed array, and Save recipes. Select fixture-build / fixture-test. This helper only prints configuration until --verify is explicitly requested.

Implement instructions: Read MathOps.cs and Runner.cs. For this deliberate synthetic defect, set Add to return left + right + 1. Preserve all tests and build configuration; do not build or run commands. Separate Tool nodes will verify the result.
Reviewer instructions (bound mode, alias verification, artifact source Test, selector verification):
${REVIEW_PROMPT}
Reviewer strict output schema:
${JSON.stringify(REVIEW_SCHEMA, null, 2)}
Repair instructions (bound mode, alias feedback, source repair-feedback):
${REPAIR_PROMPT}
For a manual model run, append: Correct MathOps.cs using the actual previous failures. The controlled automatic acceptance fixture deliberately needs two repairs; a manual provider may correct it in one.

Condition declared inputs: [{"alias":"review","source":{"kind":"artifact","nodeId":"REVIEWER_NODE_ID","selector":"structured"}},{"alias":"machine","source":{"kind":"artifact","nodeId":"TEST_NODE_ID","selector":"verification"}}]
Branches: [{"exit":"pass","predicate":{"op":"eq","alias":"review","pointer":"/outcome","value":"pass"}},{"exit":"needs_changes","predicate":{"op":"eq","alias":"review","pointer":"/outcome","value":"needs_changes"}}]
Default exit: needs_human. Verification: {"testNodeIds":["TEST_NODE_ID"],"reviewerNodeId":"REVIEWER_NODE_ID","successExit":"pass"}. Replace exact IDs, Apply, and wire the named exits. Final human review binds Test artifact selector test with a required comment.

Routing settings: final gate = Final human review; max admissions = 12; deadline = 600000 ms. Region entry = Implement; repair entry = Repair; decision = Condition; body = Implement, Build, Test, Reviewer, Repair and Condition IDs (one per line); repair exit = needs_changes; pass exit = pass; max repairs = 2; stop on no progress = checked. Source paths (one per line):
${SOURCE_PATHS.join("\n")}

Save, Run, inspect the exact frozen confirmation and limits, then confirm. Native permissions remain separate from human Graph approval. Inspect each iteration's exact input/operation/artifact IDs and open its existing conversation; navigation must not submit new work. Failed machine tests cannot become PASS because the reviewer claims success. Approve the final gate only after inspecting all three named passing tests. Approval does not authorize publication.

Independent runner verification after genuine Build/Test:
node scripts/graph-engineering/z5-manual-recipes.mjs --profile "${isolation.home}" --verify
Reopen the same private profile without rewriting it:
node scripts/graph-engineering/z5-launch-manual.mjs --profile "${isolation.home}"
Quit the isolated app when finished. Setup-only launch does not count as a user-operated acceptance PASS.`);
  if (check) await check(window);
  else await new Promise((resolve) => isolation.app.process().once("exit", resolve));
} finally {
  await isolation.close();
}
