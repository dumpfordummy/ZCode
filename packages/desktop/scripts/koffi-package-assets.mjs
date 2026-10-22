// CLI 与 CUA 的查找根不同；CLI 外置依赖必须由清空 glm 的同一 owner 暂存。
import { createHash } from "node:crypto";
import { access, cp, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const sourceRepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const ADAPTERS = "apps/zcode-cli/packages/adapters";
const INVENTORY = ".koffi-runtime.json";
const peMachines = { x64: 0x8664, arm64: 0xaa64 };
const json = async (file) => JSON.parse(await readFile(file, "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const present = async (file) =>
  access(file).then(
    () => true,
    () => false,
  );

export function cliKoffiExtraResources(targetPlatform) {
  if (targetPlatform.os !== "win32") return [];
  // electron-builder 的 FileMatcher 会排除复制根目录的 node_modules；单独从包根复制。
  return [
    {
      from: `bundled-agents/${targetPlatform.os}-${targetPlatform.arch}/glm/node_modules/koffi`,
      to: "glm/node_modules/koffi",
      filter: ["**/*", "!**/*.map"],
    },
  ];
}

export async function lockedCliKoffiVersion(repoRoot = sourceRepoRoot) {
  const manifest = await json(resolve(repoRoot, ADAPTERS, "package.json"));
  const version = manifest.dependencies?.koffi;
  if (!/^\d+\.\d+\.\d+$/.test(version ?? ""))
    throw new Error("CLI koffi must declare an exact version");
  const lock = await readFile(resolve(repoRoot, "pnpm-lock.yaml"), "utf8");
  // 只接受当前 pnpm importer 的精确标量格式；格式改变时明确失败，不猜版本。
  const importer = lock.split(`  ${ADAPTERS}:`)[1]?.split(/\n  \S/)[0];
  const dependency = importer?.match(
    /\n      koffi:\r?\n        specifier: ([^\r\n]+)\r?\n        version: ([^\r\n]+)/,
  );
  if (!dependency || dependency[1] !== version || dependency[2] !== version)
    throw new Error("CLI koffi manifest/lockfile version mismatch");
  return version;
}

async function inspectPackage(root, version, targetPlatform) {
  const metadata = await json(resolve(root, "package.json"));
  if (metadata.name !== "koffi" || metadata.version !== version)
    throw new Error(`incorrect koffi package identity/version (expected koffi@${version})`);
  if (metadata.main !== "./index.js") throw new Error("unreviewed koffi entry point");
  for (const file of ["index.js", "LICENSE.txt"])
    if (!(await present(resolve(root, file))))
      throw new Error(`missing koffi runtime file: ${file}`);
  const platformKey = `${targetPlatform.os}_${targetPlatform.arch}`;
  const nativePath = resolve(root, "build", "koffi", platformKey, "koffi.node");
  const bytes = await readFile(nativePath).catch(() => {
    throw new Error(`missing target native addon: ${platformKey}/koffi.node`);
  });
  if (targetPlatform.os === "win32") {
    const machine = peMachines[targetPlatform.arch];
    const offset = bytes.length >= 64 ? bytes.readUInt32LE(0x3c) : 0;
    if (
      !machine ||
      bytes.toString("ascii", 0, 2) !== "MZ" ||
      offset < 64 ||
      offset + 6 > bytes.length ||
      bytes.readUInt32LE(offset) !== 0x4550 ||
      bytes.readUInt16LE(offset + 4) !== machine
    )
      throw new Error(`wrong architecture or invalid PE addon: ${platformKey}`);
  }
  return nativePath;
}

async function inventory(root, prefix = "") {
  const files = {};
  for (const entry of (await readdir(resolve(root, prefix), { withFileTypes: true })).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  )) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`unexpected staged symlink: ${name}`);
    if (entry.isDirectory()) Object.assign(files, await inventory(root, name));
    else if (entry.isFile()) files[name] = sha256(await readFile(resolve(root, name)));
    else throw new Error(`unexpected staged file type: ${name}`);
  }
  return files;
}

export async function stageKoffiIntoBundledAgents({
  repoRoot = sourceRepoRoot,
  glmDir,
  targetPlatform,
}) {
  const targetRoot = resolve(glmDir, "node_modules", "koffi");
  // 先移除旧产物；缺包/错版本也不能让旧 native 被误认为本轮成功产物。
  await rm(targetRoot, { recursive: true, force: true });
  await rm(resolve(glmDir, INVENTORY), { force: true });
  if (targetPlatform.os !== "win32") return null;
  const version = await lockedCliKoffiVersion(repoRoot);
  const require = createRequire(resolve(repoRoot, ADAPTERS, "package.json"));
  let sourceRoot;
  try {
    sourceRoot = await realpath(dirname(require.resolve("koffi/package.json")));
  } catch (cause) {
    throw new Error("missing installed CLI koffi package", { cause });
  }
  const repository = await realpath(repoRoot);
  if (!sourceRoot.startsWith(`${repository}${sep}`))
    throw new Error("koffi resolved outside the build repository");
  await inspectPackage(sourceRoot, version, targetPlatform);
  const platformKey = `${targetPlatform.os}_${targetPlatform.arch}`;
  try {
    // 保留完整发行包及其嵌套许可；仅裁剪非目标 build 与嵌套依赖，不猜运行时最小文件集。
    await cp(sourceRoot, targetRoot, {
      recursive: true,
      dereference: true,
      filter: (source) => {
        const parts = relative(sourceRoot, source).split(sep);
        if (parts.includes("node_modules")) return false;
        return (
          parts[0] !== "build" ||
          parts.length === 1 ||
          (parts[1] === "koffi" && (parts.length === 2 || parts[2] === platformKey))
        );
      },
    });
    const nativePath = await inspectPackage(targetRoot, version, targetPlatform);
    await mkdir(glmDir, { recursive: true });
    await writeFile(
      resolve(glmDir, INVENTORY),
      `${JSON.stringify(
        {
          schema: 1,
          name: "koffi",
          version,
          platform: platformKey,
          files: await inventory(targetRoot),
        },
        null,
        2,
      )}\n`,
    );
    return nativePath;
  } catch (error) {
    await rm(targetRoot, { recursive: true, force: true });
    await rm(resolve(glmDir, INVENTORY), { force: true });
    throw error;
  }
}

export async function verifyStagedKoffi({
  resourcesDir,
  targetPlatform,
  repoRoot = sourceRepoRoot,
  pluginRelativePath,
  asarEntries = [],
}) {
  const errors = [];
  const glmDir = resolve(resourcesDir, "glm");
  if (targetPlatform.os === "win32") {
    try {
      const version = await lockedCliKoffiVersion(repoRoot);
      const root = resolve(glmDir, "node_modules", "koffi");
      await inspectPackage(root, version, targetPlatform);
      const recorded = await json(resolve(glmDir, INVENTORY));
      if (
        recorded.schema !== 1 ||
        recorded.name !== "koffi" ||
        recorded.version !== version ||
        recorded.platform !== `${targetPlatform.os}_${targetPlatform.arch}`
      )
        throw new Error("incorrect koffi inventory identity/version/platform");
      const builds = await readdir(resolve(root, "build", "koffi"));
      if (builds.length !== 1 || builds[0] !== recorded.platform)
        throw new Error("stale/wrong-architecture koffi build directory");
      if (JSON.stringify(await inventory(root)) !== JSON.stringify(recorded.files))
        throw new Error("koffi runtime inventory/hash mismatch");
    } catch (error) {
      errors.push(`CLI koffi at glm/node_modules/koffi: ${error.message}`);
    }
  }
  // 插件不是 CLI 的后备查找根；显式要求或实际存在时独立校验。
  const plugin = pluginRelativePath ?? "packages/zcode-cua-plugin";
  const pluginRoot = resolve(glmDir, plugin);
  if (pluginRelativePath || (await present(pluginRoot))) {
    try {
      const metadata = await json(resolve(pluginRoot, "package.json"));
      const version = metadata.dependencies?.koffi;
      if (!/^\d+\.\d+\.\d+$/.test(version ?? ""))
        throw new Error("plugin must declare its own exact koffi version");
      await inspectPackage(resolve(pluginRoot, "node_modules", "koffi"), version, targetPlatform);
    } catch (error) {
      errors.push(`plugin koffi at ${plugin}: ${error.message}`);
    }
  }
  for (const entry of asarEntries)
    if (
      entry.packState === "pack" &&
      /(?:^|\/)koffi\/.*\.node$/i.test(entry.path.replaceAll("\\", "/"))
    )
      errors.push(`koffi native addon packed inside ASAR: ${entry.path}`);
  return errors;
}
