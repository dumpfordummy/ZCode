import { createIsolation } from "./isolation.mjs";
import { Z2_ANALYZE, Z2_IMPLEMENT, Z2_START, Z2_VERIFY } from "./z2-provider-fixture.mjs";
import { prepareSourceFixture } from "./z3-fixture.mjs";

const profileIndex = process.argv.indexOf("--profile");
if (profileIndex !== -1 && !process.argv[profileIndex + 1])
  throw new Error("--profile requires the exact printed isolated manual profile path.");
const isolation = await createIsolation({
  manual: true,
  profile: profileIndex === -1 ? undefined : process.argv[profileIndex + 1],
});
try {
  if (profileIndex === -1) await prepareSourceFixture(isolation);
  await isolation.launch();
  console.log(`Isolated profile: ${isolation.home}
Synthetic workspace: ${isolation.workspace}
Configure only your approved provider in this isolated app. This launcher permits external model traffic but configures no provider and submits no task.

Create Start -> Approve request -> Analyze -> Approve interpretation -> Implement -> Verify -> Approve result -> End.
Keep permission mode set to Ask before changes. Keep automatic question continuation off. Each approval needs explicit review instructions and evidence; require a comment for this check.

Start request:
${Z2_START}

Approve request: evidence request = Start request.
Analyze: Bound instructions, request = Start.
${Z2_ANALYZE}

Approve interpretation: evidence analysis = Analyze final text; source = Source changes.
Implement: Bound instructions, request = Start and analysis = Analyze.
${Z2_IMPLEMENT}

Verify: Bound instructions, implementation = Implement.
${Z2_VERIFY}

Approve result: evidence verification = Verify final text; source = Source changes. End output = Verify.

Save and explicitly Run. Check that approval gates create no task session/input. Review the exact frozen request/version/workspace/evidence and enter a comment before Approve or Reject. Graph approval must not answer native tool permissions or questions. Open conversation must navigate to the existing source session.

For pending-gate restart: quit while Approve interpretation is pending. Reopen the exact profile below. Confirm identical request/evidence and no new task; Continue only re-arms a pending gate, after which approval is a separate action. A committed approval with a provably undispatched successor requires an explicit Continue. Uncertain work must retain its guard.

Independent test (the original test must remain unchanged):
Set-Location -LiteralPath '${isolation.workspace.replaceAll("'", "''")}'
node --test fixture.test.mjs

Reopen without rewriting settings, source, tests or review evidence:
node scripts/graph-engineering/z3-launch-manual.mjs --profile "${isolation.home}"

The source review covers bounded Git changed/untracked entries, not all workspace files. Other editors can write between checks. Final approval does not authorize commit, push, merge or release.
Quit this isolated app to finish. No user-operated PASS is implied by launching it.`);
  await new Promise((resolve) => isolation.app.process().once("exit", resolve));
} finally {
  await isolation.close();
}
