import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  normalizeWebRestore,
  webRestoreXml,
} from "../../packages/services/src/graph-engineering/domain/web-profile-restore.ts";
const home = process.env.F1_WEB_ORACLE;
assert.ok(home);
const oracle = JSON.parse(await readFile(path.join(home, "oracle.json"), "utf8"));
assert.equal(oracle.status, "PASS");
const workspace = path.join(home, "workspace");
const testAssets = JSON.parse(
  await readFile(path.join(workspace, "Tests/obj/project.assets.json"), "utf8"),
);
const ids = {
  workspace,
  packageRoot: Object.keys(testAssets.packageFolders)[0],
  sdkDirectory: "C:/Program Files/dotnet/sdk/8.0.426",
  webProject: "Web/Web.csproj",
  testProject: "Tests/Tests.csproj",
};
const result = {};
for (const [role, folder] of [
  ["web", "Web"],
  ["test", "Tests"],
]) {
  const assets = JSON.parse(
    await readFile(path.join(workspace, folder, "obj/project.assets.json"), "utf8"),
  );
  const props = webRestoreXml(
    await readFile(path.join(workspace, folder, `obj/${folder}.csproj.nuget.g.props`), "utf8"),
  );
  const targets = webRestoreXml(
    await readFile(path.join(workspace, folder, `obj/${folder}.csproj.nuget.g.targets`), "utf8"),
  );
  result[role] = normalizeWebRestore({ assets, props, targets }, ids);
}
await writeFile(
  "packages/services/src/graph-engineering/domain/web-profile-restore-policy.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log("Wrote normalized installed-engine restore template; no raw user paths.");
