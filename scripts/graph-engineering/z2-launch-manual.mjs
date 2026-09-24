import { createIsolation } from "./isolation.mjs";
import { Z2_ANALYZE, Z2_IMPLEMENT, Z2_START, Z2_VERIFY } from "./z2-provider-fixture.mjs";

const profileIndex = process.argv.indexOf("--profile");
if (profileIndex !== -1 && !process.argv[profileIndex + 1])
  throw new Error("--profile requires the printed isolated profile path.");
const isolation = await createIsolation({
  manual: true,
  profile: profileIndex === -1 ? undefined : process.argv[profileIndex + 1],
});
try {
  await isolation.launch();
  console.log(
    `Isolated profile: ${isolation.home}\nSynthetic workspace: ${isolation.workspace}\nConfigure your approved provider in this app's Settings. This manual launcher permits external model traffic but never configures a provider or submits an agent task.\n\nOpen Graph Engineering, select Enable sequential editing if offered, and create Start -> Analyze -> Implement -> Verify -> End. Choose Ask before changes using the native configuration controls and keep automatic question continuation off.\n\nStart request:\n${Z2_START}\n\nAnalyze: Bound instructions; bind request to Start.\n${Z2_ANALYZE}\n\nImplement: Bound instructions; bind request to Start and analysis to Analyze.\n${Z2_IMPLEMENT}\n\nVerify: Bound instructions; bind implementation to Implement.\n${Z2_VERIFY}\n\nEnd output: Verify. Save before your explicit Run. Inspect permissions and each actual conversation, then independently check the fixture and test.\n\nIndependent test command:\nSet-Location -LiteralPath '${isolation.workspace.replaceAll("'", "''")}'\nnode --test fixture.test.mjs\n\nReopen later without rewriting sample or settings:\nnode scripts/graph-engineering/z2-launch-manual.mjs --profile "${isolation.home}"\n\nQuit this isolated application to finish. No user-operated result is implied by launching it.`,
  );
  await new Promise((resolve) => isolation.app.process().once("exit", resolve));
} finally {
  await isolation.close();
}
