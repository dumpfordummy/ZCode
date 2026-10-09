import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  desktopProductIdentities,
  resolveGraphDistributionVersion,
} from "../../packages/desktop/scripts/desktop-product-identity.mjs";
import { resolveSpawnRuntimeOptions } from "../spawn-command.mjs";
import {
  IDENTITY_FILE,
  MANIFEST_FILE,
  buildEmbeddedIdentity,
  collectSourceIdentity,
  collectToolchain,
  graphBuildEnvironment,
  protocolVersions,
  readUpstreamReference,
  resolveDistDirName,
  resolvePackagePolicies,
} from "./release-manifest.mjs";
import { finalizeRelease } from "./finalize-release.mjs";
import { checkWindowsBuildDependencies } from "./windows-build-preflight.mjs";

if (process.platform !== "win32" || process.arch !== "x64") {
  throw new Error("This release entry requires Windows x64.");
}
const root = path.resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
const version = args[0];
const optionValue = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const distName = resolveDistDirName(optionValue("--dist-dir"));
// 支持的 Graph 构建器固定并行能力策略（关闭），没有可配置项；见 graph-capabilities.ts。
const env = {
  ...process.env,
  PATH: `${path.join(root, "node_modules/.bin")}${path.delimiter}${process.env.PATH ?? ""}`,
  ...graphBuildEnvironment(version, distName),
};
resolveGraphDistributionVersion(env, "");
async function run(commandArgs) {
  await new Promise((resolve, reject) => {
    const child = spawn("pnpm", commandArgs, {
      cwd: root,
      env,
      stdio: "inherit",
      windowsHide: true,
      ...resolveSpawnRuntimeOptions("pnpm"),
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`pnpm ${commandArgs.join(" ")} exited ${code}`)),
    );
  });
}
async function pnpmVersion() {
  const { stdout } = await promisify(execFile)("pnpm", ["--version"], {
    cwd: root,
    env,
    ...resolveSpawnRuntimeOptions("pnpm"),
  });
  return stdout.trim();
}

// 先记录源码身份与工具链：脏工作区仍可构建，但会被如实写入内嵌身份与清单。
await checkWindowsBuildDependencies(root);
const reference = await readUpstreamReference(root);
const source = await collectSourceIdentity(root, reference);
if (source.dirty)
  process.stderr.write(
    `WARNING: source tree has ${source.dirtyPathCount} uncommitted path(s); the manifest records dirty=true and this build is not eligible for the two-build comparison.\n`,
  );
const toolchain = await collectToolchain(root, await pnpmVersion());
await run(["--filter", "@zcode/desktop", "prepare:runtime-assets"]);
await run(["--filter", "@zcode/desktop", "build:no-runtime-assets"]);

// 内嵌构建身份在打包前写入（作为 extraResource）；它不含安装包自身哈希或构建机路径。
await checkWindowsBuildDependencies(root);
const policies = await resolvePackagePolicies(root);
const protocol = await protocolVersions(root);
const rootPackage = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const embedded = buildEmbeddedIdentity({
  version,
  baseVersion: rootPackage.version,
  source,
  toolchain,
  protocol,
  policies,
  identity: desktopProductIdentities.graph,
});
const metadataDirectory = path.join(root, "packages/desktop/out/metadata");
await mkdir(metadataDirectory, { recursive: true });
await writeFile(
  path.join(metadataDirectory, IDENTITY_FILE),
  `${JSON.stringify(embedded, null, 2)}\n`,
);
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
const output = path.join(root, "packages/desktop", distName);
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
// 构建记录：只含源码身份与工具链（无构建机路径），外部清单之后可据此重新生成。
// 构建步骤本身可能改动已跟踪文件（行尾），所以构建后再记录一次工作区状态。
const afterBuild = await collectSourceIdentity(root, reference);
await writeFile(
  path.join(output, "build-record.json"),
  `${JSON.stringify(
    {
      version,
      distName,
      source,
      sourceAfterBuild: { dirty: afterBuild.dirty, dirtyPaths: afterBuild.dirtyPaths },
      toolchain,
    },
    null,
    2,
  )}\n`,
);
await finalizeRelease({ root, distName, validationPath: optionValue("--validation") });
process.stdout.write(`Graph installer, SHA256SUMS.txt and ${MANIFEST_FILE}: ${output}\n`);
