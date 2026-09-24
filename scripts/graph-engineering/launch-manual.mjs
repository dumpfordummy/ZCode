import { createIsolation, instruction } from "./isolation.mjs";
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
    `Fresh isolated profile: ${isolation.home}\nSynthetic workspace: ${isolation.workspace}\nConfigure your approved provider in this app's Settings. External model traffic is allowed only in this manual launcher. No task is submitted by this script.\nTask:\n${instruction}\nQuit the isolated application to finish.`,
  );
  console.log(
    `Reopen later without rewriting sample/settings:\nnode scripts/graph-engineering/launch-manual.mjs --profile "${isolation.home}"`,
  );
  await new Promise((resolve) => isolation.app.process().once("exit", resolve));
} finally {
  await isolation.close();
}
