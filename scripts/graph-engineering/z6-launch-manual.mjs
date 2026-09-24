import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createIsolation } from "./isolation.mjs";
import { configureDotnetEnvironment, fingerprint } from "./z4-fixture.mjs";
import { ledger, modelCount } from "./z3-native-helpers.mjs";
import { prepareSlotFixture, SLOT_SOURCE_PATHS } from "./z6-fixture.mjs";

const profileIndex = process.argv.indexOf("--profile");
if (profileIndex !== -1 && !process.argv[profileIndex + 1])
  throw new Error("--profile requires the exact printed isolated manual profile path.");
const fresh = profileIndex === -1;
const isolation = await createIsolation({
  manual: true,
  profile: fresh ? undefined : process.argv[profileIndex + 1],
});
try {
  if (fresh)
    await writeFile(
      path.join(isolation.home, "z6-manual-fixture.json"),
      JSON.stringify(await prepareSlotFixture(isolation), null, 2),
    );
  else {
    await readFile(path.join(isolation.home, "z6-manual-fixture.json"), "utf8");
    await configureDotnetEnvironment(isolation);
  }
  const before = await fingerprint(isolation, SLOT_SOURCE_PATHS);
  const settingsPath = path.join(isolation.home, "home/.zcode/v2/setting.json");
  const beforeSettings = JSON.parse(await readFile(settingsPath, "utf8"));
  const window = await isolation.launch();
  console.log(`Isolated profile: ${isolation.home}
Synthetic C# workspace: ${isolation.workspace}
This launcher configures no provider and sends no task or command. Configure only an authorized provider in this private app if you choose user-operated testing. No RTP target is supplied; no company pilot is authorized.

Read docs/graph-engineering/Z6_SETUP.md. In Graph Engineering, upgrade the draft to the sequential editor and version 5 so Project recipes is available. Print the exact recipe configuration in another terminal:
node scripts/graph-engineering/z6-manual-recipes.mjs --profile "${isolation.home}"
Load Project recipes, paste the printed array, Save recipes. Open Workflow library, choose Sequential slot refinement, version 1. Enter the request to implement GameDoc.md R1–R5, target engine C# Z6Slot.csproj, and all 13 unchanged Runner.cs test criteria. Include Normal and Free; explicitly exclude Bonus and Respin. Bind GameDoc to GameDoc.md, Build to slot-build, Test to slot-test. Leave mathTarget/samplingRule absent: RTP is N/A. Acknowledge replacing the unsaved draft, then Instantiate.

Run opens a preflight preview of the actual workspace, references, primary/auxiliary model destinations, hooks/plugins/MCP, recipes, permissions and Unknowns. Review them before acknowledgment and Confirm. Native permissions/questions remain separate. Review the source interpretation gate before any implementation, then the final current diff, Test/reviewer evidence and unresolved questions. Do not change GameDoc.md or Runner.cs to obtain a pass.

After genuine Build/Test, independently verify the unchanged built runner:
node scripts/graph-engineering/z6-manual-recipes.mjs --profile "${isolation.home}" --verify
Reopen the same isolated profile without rewriting source/configuration/history:
node scripts/graph-engineering/z6-launch-manual.mjs --profile "${isolation.home}"
Setup is not live-user acceptance. Quit the private app when finished.`);
  if (process.argv.includes("--verify-setup")) {
    const screenshot = path.join(
      isolation.home,
      fresh ? "z6-manual-setup.png" : "z6-manual-reopen.png",
    );
    const nativeWindow = await isolation.app.browserWindow(window);
    try {
      const encoded = await nativeWindow.evaluate(async (browserWindow) =>
        (await browserWindow.capturePage()).toPNG().toString("base64"),
      );
      await writeFile(screenshot, Buffer.from(encoded, "base64"));
    } finally {
      await nativeWindow.dispose();
    }
    assert.equal(modelCount(isolation), 0);
    assert.equal((await ledger(isolation)).length, 0);
    await isolation.stopApp();
    const after = await fingerprint(isolation, SLOT_SOURCE_PATHS);
    assert.deepEqual(after, before);
    if (!fresh) assert.deepEqual(JSON.parse(await readFile(settingsPath, "utf8")), beforeSettings);
    const summary = {
      status: "PASS",
      kind: fresh ? "fresh-setup-only" : "reopen-setup-only",
      home: isolation.home,
      screenshots: [screenshot],
      before,
      after,
      nativeInputs: 0,
      modelRequests: 0,
      userOperatedChecks: "NOT RUN",
    };
    await writeFile(
      path.join(isolation.home, fresh ? "z6-manual-setup.json" : "z6-manual-reopen.json"),
      JSON.stringify(summary, null, 2),
    );
    console.log(JSON.stringify(summary, null, 2));
  } else await new Promise((resolve) => isolation.app.process().once("exit", resolve));
} finally {
  await isolation.close();
}
