// UX-M1.4 manual acceptance launcher: the freshly built Desktop in a NEW isolated profile with a
// disposable workspace, a second empty workspace folder and the controlled loopback provider (no
// credentials, no network). Nothing is clicked for you: answer every permission and approval yourself.
//   node scripts/graph-engineering/ux-m1-launch-manual.mjs [--smoke]
// `--smoke` only proves the launch and closes the app again (used to verify this launcher itself).
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createIsolation, root } from "./isolation.mjs";
import { startZ6Fixture } from "./z6-provider-fixture.mjs";
import { reviewerNativeResponse } from "./reviewer-native-responses.mjs";
import { REQUEST, prepareUxWorkspace } from "./ux-m1-native-common.mjs";

const smoke = process.argv.includes("--smoke");
const isolation = await createIsolation({
  fixtureFactory: (workspace) => startZ6Fixture(workspace, "pass", reviewerNativeResponse),
});
await prepareUxWorkspace(isolation);
const second = path.join(isolation.home, "workspace-b");
await mkdir(path.join(second, "docs"), { recursive: true });
await writeFile(
  path.join(second, "AGENTS.md"),
  "Second disposable workspace for the switch test.\n",
);
await writeFile(
  path.join(second, "docs/Other.md"),
  "A document that only exists in workspace B.\n",
);
await isolation.launch({
  bootstrapEntry: path.join(root, "scripts/graph-engineering/ux-m1-native-bootstrap.cjs"),
});
console.log(
  JSON.stringify(
    {
      profile: isolation.home,
      workspace: isolation.workspace,
      secondWorkspaceFolder: second,
      controlledProvider: isolation.fixture.origin,
      sentence: "Every request you run must CONTAIN this sentence (extra text is fine): " + REQUEST,
      note: "Quit the app normally (window close) to end this launcher. Nothing outside the profile is touched.",
    },
    null,
    2,
  ),
);
if (smoke) {
  await isolation.close();
} else {
  await new Promise((resolve) => isolation.app.process().once("exit", resolve));
  await isolation.close();
}
