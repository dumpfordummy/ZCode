import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveGraphDistributionVersion } from "../../packages/desktop/scripts/desktop-product-identity.mjs";
import { resolveSpawnRuntimeOptions } from "../spawn-command.mjs";

if (process.platform !== "win32" || process.arch !== "x64") {
  throw new Error("This release entry requires Windows x64.");
}
const root = path.resolve(import.meta.dirname, "../..");
const version = process.argv[2];
const env = {
  ...process.env,
  PATH: `${path.join(root, "node_modules/.bin")}${path.delimiter}${process.env.PATH ?? ""}`,
  ZCODE_GRAPH_DISTRIBUTION: "1",
  ZCODE_GRAPH_VERSION: version,
  ZCODE_ENV: "production",
  ZCODE_SKIP_REMOTE_ASSETS: "1",
  ZCODE_DESKTOP_DIST_DIR: "dist-graph",
  CSC_IDENTITY_AUTO_DISCOVERY: "false",
  ZCODE_ELECTRON_RUNTIME_MIRROR: "https://github.com/electron/electron/releases/download/",
  ELECTRON_BUILDER_BINARIES_MIRROR:
    "https://github.com/electron-userland/electron-builder-binaries/releases/download/",
};
resolveGraphDistributionVersion(env, "");
async function run(args) {
  await new Promise((resolve, reject) => {
    const child = spawn("pnpm", args, {
      cwd: root,
      env,
      stdio: "inherit",
      windowsHide: true,
      ...resolveSpawnRuntimeOptions("pnpm"),
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`pnpm ${args.join(" ")} exited ${code}`)),
    );
  });
}
await run(["--filter", "@zcode/desktop", "prepare:runtime-assets"]);
await run(["--filter", "@zcode/desktop", "build:no-runtime-assets"]);
await run([
  "bundle:desktop",
  "--",
  "--os",
  "win",
  "--arch",
  "x64",
  "--skip-prepare",
  "--skip-build",
]);
const output = path.join(root, "packages/desktop/dist-graph");
const installers = (await readdir(output)).filter(
  (name) => name === `ZCode Graph-${version}-win-x64.exe`,
);
if (installers.length !== 1) throw new Error("Expected exactly one versioned Graph installer.");
const checksums = [];
for (const file of installers) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path.join(output, file))) hash.update(chunk);
  checksums.push(`${hash.digest("hex")}  ${file}`);
}
await writeFile(path.join(output, "SHA256SUMS.txt"), `${checksums.join("\n")}\n`);
process.stdout.write(`Graph installer and SHA256SUMS.txt: ${output}\n`);
