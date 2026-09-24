import { createInterface } from "node:readline/promises";
import { createIsolation } from "./isolation.mjs";
import { prepareZ7Fixture } from "./z7-fixture.mjs";
import { startZ7Provider } from "./z7-provider-fixture.mjs";

const scenario = process.argv.find((v) => v.startsWith("--scenario="))?.slice(11) ?? "complete";
if (!["complete", "conflict", "combined-failure", "failure", "restart"].includes(scenario))
  throw new Error("Use complete, conflict, combined-failure, failure or restart.");
// 保持自动验收的私有目录和回环 provider 限制；不能使用允许真实账户网络的 manual profile。
const isolation = await createIsolation({ fixtureFactory: (w) => startZ7Provider(w, scenario) });
let input;
try {
  const fixture = await prepareZ7Fixture(isolation);
  await isolation.launch();
  console.log(
    JSON.stringify(
      { scenario, profile: isolation.home, workspace: isolation.workspace, base: fixture.base },
      null,
      2,
    ),
  );
  console.log(
    "Use docs/graph-engineering/Z7_SETUP.md. Only the controlled local provider is configured. Commands: restart, fail, quit. Files remain for inspection.",
  );
  input = createInterface({ input: process.stdin, output: process.stdout });
  for await (const value of input) {
    const command = value.trim();
    if (command === "quit") break;
    if (command === "restart") {
      await isolation.stopApp();
      await isolation.launch();
      console.log(
        "Reopened the same isolated profile; inspect retained work without resubmitting.",
      );
    } else if (command === "fail" && scenario === "failure") isolation.fixture.failWorker();
    else console.log("Commands: restart, fail (failure scenario only), quit.");
  }
} finally {
  input?.close();
  await isolation.close();
}
