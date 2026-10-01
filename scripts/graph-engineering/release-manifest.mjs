import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const IDENTITY_SCHEMA = "zcode-graph-build-identity/1";
export const MANIFEST_SCHEMA = "zcode-graph-release-manifest/1";
export const IDENTITY_FILE = "graph-build-identity.json";
export const MANIFEST_FILE = "RELEASE_MANIFEST.json";
export const UNPACKED_HASHES_FILE = "unpacked-file-hashes.json";

/** `dist-graph`（默认）或 `dist-graph-b1` 这类并排目录；不允许路径分隔符或任意名字。 */
export const DIST_DIR_PATTERN = /^dist-graph(?:-[A-Za-z0-9.]+)*$/;
export function resolveDistDirName(name) {
  const value = name ?? "dist-graph";
  if (!DIST_DIR_PATTERN.test(value))
    throw new Error("--dist-dir must be dist-graph or dist-graph-<letters, digits, dots>.");
  return value;
}

/** 构建器显式设置的环境变量；清单只记录这些，不记录环境中的其它变量。 */
export function graphBuildEnvironment(version, distDir) {
  return {
    ZCODE_GRAPH_DISTRIBUTION: "1",
    ZCODE_GRAPH_VERSION: version,
    ZCODE_ENV: "production",
    ZCODE_SKIP_REMOTE_ASSETS: "1",
    ZCODE_DESKTOP_DIST_DIR: distDir,
    CSC_IDENTITY_AUTO_DISCOVERY: "false",
    ZCODE_ELECTRON_RUNTIME_MIRROR: "https://github.com/electron/electron/releases/download/",
    ELECTRON_BUILDER_BINARIES_MIRROR:
      "https://github.com/electron-userland/electron-builder-binaries/releases/download/",
  };
}

export async function sha256File(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

/** 以相对路径（正斜杠）列出目录树下的所有文件；排序后稳定。 */
export async function listFiles(root) {
  const result = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) result.push(path.relative(root, full).split(path.sep).join("/"));
    }
  }
  await walk(root);
  return result.sort();
}

/** 目录树的逐文件哈希与整体摘要（摘要覆盖相对路径与内容哈希，不含时间戳）。 */
export async function hashTree(root, files) {
  const list = files ?? (await listFiles(root));
  const entries = {};
  let bytes = 0;
  for (const relative of list) {
    const full = path.join(root, ...relative.split("/"));
    const size = (await stat(full)).size;
    bytes += size;
    entries[relative] = { sha256: await sha256File(full), bytes: size };
  }
  const digest = createHash("sha256");
  for (const relative of list) digest.update(`${relative}\0${entries[relative].sha256}\n`);
  return { count: list.length, bytes, digest: digest.digest("hex"), files: entries };
}

async function git(root, args) {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: root, maxBuffer: 64_000_000 });
    return stdout.trim();
  } catch {
    return undefined;
  }
}

/** 固定的上游比较基准（见 upstream-reference.json）；实际 merge-base 每次由 Git 计算。 */
export async function readUpstreamReference(root) {
  return JSON.parse(
    await readFile(path.join(root, "scripts/graph-engineering/upstream-reference.json"), "utf8"),
  );
}

export async function collectSourceIdentity(root, reference) {
  const commit = await git(root, ["rev-parse", "HEAD"]);
  const status = (await git(root, ["status", "--porcelain=v1", "--untracked-files=all"])) ?? "?";
  const dirtyPaths = status
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3));
  const referenceKnown = await git(root, ["cat-file", "-t", reference.contentReference.sha]);
  const mergeBase =
    referenceKnown === "commit"
      ? await git(root, ["merge-base", "HEAD", reference.contentReference.sha])
      : undefined;
  return {
    commit,
    branch: (await git(root, ["branch", "--show-current"])) || undefined,
    dirty: dirtyPaths.length > 0,
    dirtyPathCount: dirtyPaths.length,
    dirtyPaths: dirtyPaths.slice(0, 50),
    mergeBase: mergeBase ?? "unavailable",
    contentReference: {
      tag: reference.contentReference.tag,
      sha: reference.contentReference.sha,
      presentInRepository: referenceKnown === "commit",
      scope: reference.contentReference.scope,
    },
  };
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

export async function protocolVersions(root) {
  const read = async (relative, name) => {
    const text = await readFile(path.join(root, relative), "utf8");
    return Number(new RegExp(`${name}\\s*=\\s*(\\d+)`).exec(text)?.[1]);
  };
  return {
    zcode: await read("packages/shared/src/zcode-protocol/index.ts", "ZCODE_PROTOCOL_VERSION"),
    v4Wire: await read("packages/shared/src/zcode-protocol-v4/index.ts", "V4_WIRE_PROTOCOL_VERSION"),
  };
}

async function installedVersion(root, from, name) {
  try {
    const manifest = path.join(root, from, "node_modules", name, "package.json");
    return (await readJson(manifest)).version;
  } catch {
    return undefined;
  }
}

/** 仅用于报告：构建所用的实际工具链。 */
export async function collectToolchain(root, pnpmVersion) {
  return {
    node: process.version.replace(/^v/, ""),
    pnpm: pnpmVersion,
    electron: await installedVersion(root, "packages/desktop", "electron"),
    electronBuilder: await installedVersion(root, "packages/desktop", "electron-builder"),
    zcodeCli: (await readJson(path.join(root, "apps/zcode-cli/package.json"))).version,
    pinned: {
      node: /node\s*=\s*"([^"]+)"/.exec(await readFile(path.join(root, "mise.toml"), "utf8"))?.[1],
      pnpm: /pnpm\s*=\s*"([^"]+)"/.exec(await readFile(path.join(root, "mise.toml"), "utf8"))?.[1],
    },
  };
}

/** 能力策略：与运行时使用同一个解析函数（Node 24 原生剥离类型）。 */
export async function resolvePackagePolicies(root) {
  const base = path.join(root, "packages/shared/src");
  const url = (name) => new URL(`file:///${path.join(base, name).replace(/\\/g, "/")}`).href;
  const capabilities = await import(url("graph-capabilities.ts"));
  const env = await import(url("env.ts"));
  return {
    parallel: capabilities.resolveGraphParallelPolicy({ flavor: "graph", env: {} }),
    automaticTelemetry: env.resolveAutomaticTelemetryPolicy("graph", {
      ZCODE_TELEMETRY_REPORT_ENDPOINT: "inherited-endpoint-ignored",
      ZCODE_ARMS_RUM_ENDPOINT: "inherited-endpoint-ignored",
    }),
  };
}

/** 嵌入包内的构建身份：确定性、无时间戳、不含自身哈希或构建机路径。 */
export function buildEmbeddedIdentity({ version, baseVersion, source, toolchain, protocol, policies, identity }) {
  return {
    schema: IDENTITY_SCHEMA,
    product: { productName: identity.productName, appId: identity.appId, flavor: identity.flavor },
    version,
    baseVersion,
    source: {
      commit: source.commit,
      dirty: source.dirty,
      mergeBase: source.mergeBase,
      contentReference: {
        tag: source.contentReference.tag,
        sha: source.contentReference.sha,
        scope: source.contentReference.scope,
      },
    },
    components: {
      zcodeCli: toolchain.zcodeCli,
      electron: toolchain.electron,
      electronBuilder: toolchain.electronBuilder,
      protocol,
    },
    capabilityPolicy: {
      parallel: { mode: policies.parallel.mode, source: policies.parallel.source },
      automaticTelemetry: { enabled: policies.automaticTelemetry.enabled },
    },
  };
}

/**
 * 能力表：enabled（策略）、devVerified（开发期证据，仅文档引用）、packageVerified（打包运行证据）。
 * enabled 绝不等于已验证；packageVerified 只来自 packaged-smoke 实际通过的用例。
 */
export function buildCapabilityTable({ policies, packagedCases }) {
  const passed = (...names) => names.filter((n) => packagedCases[n] === "PASS");
  const doc = (...files) => files.map((f) => `docs/graph-engineering/${f}`);
  return [
    { id: "ordinary-chat", enabled: true, devVerified: doc("evidence/chat-summary.json", "Z6_SPEC.md"), packageVerified: passed("ordinary-chat") },
    { id: "no-provider-startup", enabled: true, devVerified: doc("evidence/no-provider-summary.json"), packageVerified: passed("no-provider") },
    { id: "sequential-graph", enabled: true, devVerified: doc("Z2_REPORT.md", "Z6_SPEC.md"), packageVerified: passed("z1-literal-compatibility", "z2-complete", "z2-question") },
    { id: "build-test-checks", enabled: true, devVerified: doc("Z4_REPORT.md", "pre-z8/U2_CONTRACT_DRAFT.md"), packageVerified: [] },
    { id: "reviewer-and-repair", enabled: true, devVerified: doc("Z5_REPORT.md"), packageVerified: [] },
    { id: "final-approval", enabled: true, devVerified: doc("Z3_REPORT.md"), packageVerified: [] },
    { id: "workflow-library", enabled: true, devVerified: doc("ux-audit/UX_M3_WINDOWS_REPORT.md", "Z6_SPEC.md"), packageVerified: [] },
    { id: "sequential-import-export", enabled: true, devVerified: doc("ux-audit/UX_M3_WINDOWS_REPORT.md"), packageVerified: [] },
    { id: "historical-pins", enabled: true, devVerified: doc("ux-audit/UX_M3_WINDOWS_REPORT.md"), packageVerified: [] },
    { id: "restart-and-recovery", enabled: true, devVerified: doc("Z2_REPORT.md", "Z3_REPORT.md", "Z5_REPORT.md"), packageVerified: passed("z2-restart-interrupted", "z2-restart-permission", "z2-persistence-recovery") },
    { id: "parallel-fork-join", enabled: policies.parallel.mode === "experimental", policy: { mode: policies.parallel.mode, source: policies.parallel.source }, devVerified: doc("Z7_SPEC.md"), packageVerified: [], note: "Z7-A12 (export/import) FAIL; not part of the supported set." },
    { id: "remote-or-mobile-graph", enabled: false, devVerified: [], packageVerified: [] },
    { id: "scheduled-or-background-graph", enabled: false, devVerified: [], packageVerified: [] },
    { id: "automatic-telemetry", enabled: policies.automaticTelemetry.enabled, devVerified: [], packageVerified: [], note: "Disabled by policy; no claim about all network egress." },
  ];
}

export async function readPackagedCases(distDirectory) {
  try {
    const smoke = await readJson(path.join(distDirectory, "packaged-smoke.json"));
    return Object.fromEntries(
      (smoke.results ?? []).map((r) => [r.name, r.status === "PASS" && r.exitCode === 0 ? "PASS" : "FAIL"]),
    );
  } catch {
    return {};
  }
}

const COMPONENT_FILES = [
  "ZCode Graph.exe",
  "resources/app.asar",
  "resources/graph-build-identity.json",
  "resources/THIRD-PARTY-NOTICES.md",
  "resources/config/default.json",
  "resources/config/provider/zcode-builtin.json",
];
const COMPONENT_TREES = ["resources/glm", "resources/tools"];

/** 外部清单：安装包完成之后生成；安装包哈希只在这里，不会进入包内。 */
export async function buildReleaseManifest({
  root,
  distDirectory,
  distName,
  version,
  baseVersion,
  source,
  toolchain,
  protocol,
  policies,
  embedded,
  validation,
  inspection,
}) {
  const installerName = `ZCode Graph-${version}-win-x64.exe`;
  const installer = path.join(distDirectory, installerName);
  const unpacked = path.join(distDirectory, "win-unpacked");
  const files = await listFiles(unpacked);
  const tree = await hashTree(unpacked, files);
  const components = {};
  for (const relative of COMPONENT_FILES)
    if (tree.files[relative]) components[relative] = tree.files[relative];
  for (const prefix of COMPONENT_TREES) {
    const subset = files.filter((f) => f.startsWith(`${prefix}/`));
    if (!subset.length) continue;
    const digest = createHash("sha256");
    let bytes = 0;
    for (const f of subset) {
      digest.update(`${f}\0${tree.files[f].sha256}\n`);
      bytes += tree.files[f].bytes;
    }
    components[`${prefix}/`] = { files: subset.length, bytes, treeDigest: digest.digest("hex") };
  }
  await writeFile(
    path.join(distDirectory, UNPACKED_HASHES_FILE),
    `${JSON.stringify({ digest: tree.digest, files: tree.files }, null, 2)}\n`,
  );
  const lockfiles = {};
  for (const relative of ["pnpm-lock.yaml", "apps/zcode-cli/pnpm-lock.yaml"]) {
    try {
      lockfiles[relative] = { sha256: await sha256File(path.join(root, relative)) };
    } catch {
      /* 不存在的锁文件不记录 */
    }
  }
  const packagedCases = await readPackagedCases(distDirectory);
  return {
    schema: MANIFEST_SCHEMA,
    product: embedded.product,
    version,
    baseVersion,
    platform: { os: "win32", arch: "x64" },
    artifact: {
      installer: {
        path: installerName,
        sha256: await sha256File(installer),
        bytes: (await stat(installer)).size,
        signing: "unsigned",
      },
      checksumFile: "SHA256SUMS.txt",
      unpackedHashes: UNPACKED_HASHES_FILE,
      unpackedTree: { path: "win-unpacked", files: tree.count, bytes: tree.bytes, digest: tree.digest },
      components,
    },
    source,
    embeddedIdentity: { resource: `resources/${IDENTITY_FILE}`, sha256: tree.files[`resources/${IDENTITY_FILE}`]?.sha256 },
    toolchain,
    protocol,
    lockfiles,
    build: {
      command: `node scripts/graph-engineering/build-windows.mjs ${version}${distName === "dist-graph" ? "" : ` --dist-dir ${distName}`}`,
      environment: graphBuildEnvironment(version, distName),
      distDirectory: distName,
    },
    capabilities: buildCapabilityTable({ policies, packagedCases }),
    inspection: inspection ?? { status: "not-run" },
    validation: validation ?? { status: "not-recorded", results: [], exceptions: [] },
    reproducibility: { status: "not-assessed", note: "Measured by compare-builds.mjs; never asserted here." },
  };
}
