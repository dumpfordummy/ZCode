import { createHash } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { NtExecutable, NtExecutableResource } from "resedit";

/**
 * Graph Windows 包的 ASAR 完整性修复（Z8.3-A，规格见 docs/graph-engineering/z8/Z8_3_A_SPEC.md）。
 *
 * 根因：electron-builder 在 afterPack 之前就把 app.asar 的头部哈希写进 exe 的 ELECTRONASAR 资源，
 * 而仓库的 afterPack 随后又重写了两次 app.asar，记录因此过期。这里在最后一次重写之后
 * 原位替换该资源条目（不追加），并在 builder 翻转 fuse 之后做最终断言。
 */

const requireFromHere = createRequire(import.meta.url);

const ASAR_INTEGRITY_RESOURCE_TYPE = "INTEGRITY";
const ASAR_INTEGRITY_RESOURCE_ID = "ELECTRONASAR";
const APP_ASAR_RECORD_FILE = "resources\\app.asar";
const SUPPORTED_ALGORITHM = "SHA256";
const SHA256_HEX = /^[0-9a-f]{64}$/;

const FUSE_SENTINEL = Buffer.from("dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX");
const FUSE_WIRE_VERSION_V1 = 1;
// 与 @electron/fuses 1.8.0 的 FuseV1Options 顺序一致；超出已命名范围的位置按 fuse<N> 报告，不猜测名字。
const FUSE_NAMES = [
  "RunAsNode",
  "EnableCookieEncryption",
  "EnableNodeOptionsEnvironmentVariable",
  "EnableNodeCliInspectArguments",
  "EnableEmbeddedAsarIntegrityValidation",
  "OnlyLoadAppFromAsar",
  "LoadBrowserProcessSpecificV8Snapshot",
  "GrantFileProtocolExtraPrivileges",
];
const INTEGRITY_FUSE_INDEX = FUSE_NAMES.indexOf("EnableEmbeddedAsarIntegrityValidation");
const FUSE_STATE_CHARS = new Set(["0", "1", "r"]);

/** electron-builder 的 `electronFuses` 形状：只打开完整性校验，其余 fuse 一律不出现（保持 Electron 默认）。 */
export const GRAPH_WINDOWS_ELECTRON_FUSES = Object.freeze({
  enableEmbeddedAsarIntegrityValidation: true,
});

export class WindowsAsarIntegrityError extends Error {
  /** @param {string} code 稳定的失败类别，测试按它断言 @param {string} message */
  constructor(code, message) {
    super(`[windows-asar-integrity] ${code}: ${message}`);
    this.name = "WindowsAsarIntegrityError";
    this.code = code;
  }
}

/**
 * 归档头部哈希：archive 中 header JSON 字符串原样的 SHA-256 小写十六进制。
 * 与 electron-builder `hashHeader` 及 Electron 校验端使用同一定义。
 */
export async function computeAsarHeaderHash(asarPath) {
  let headerString;
  try {
    headerString = requireFromHere("@electron/asar").getRawHeader(asarPath).headerString;
  } catch (error) {
    throw new WindowsAsarIntegrityError(
      "archive-unreadable",
      `cannot read the app.asar header at ${asarPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return createHash("sha256").update(headerString).digest("hex");
}

function openResources(buffer, { allowSigned }) {
  let executable;
  try {
    // resedit 默认拒绝带证书表的 PE：写回会丢弃签名。只读校验才允许 ignoreCert。
    executable = NtExecutable.from(buffer, { ignoreCert: allowSigned });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    // pe-library 对带证书表的 PE 抛 "Parsing signed executable binary is not allowed by default."
    if (!allowSigned && /signed executable/i.test(detail)) {
      throw new WindowsAsarIntegrityError(
        "signed-pe",
        `executable already carries a signature; rewriting resources would drop it (${detail})`,
      );
    }
    throw new WindowsAsarIntegrityError("malformed-pe", `cannot parse the executable: ${detail}`);
  }
  try {
    return { executable, resource: NtExecutableResource.from(executable) };
  } catch (error) {
    throw new WindowsAsarIntegrityError(
      "malformed-pe",
      `cannot parse the resource section: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function findIntegrityEntryIndex(resource) {
  const matches = [];
  resource.entries.forEach((entry, index) => {
    if (entry.type === ASAR_INTEGRITY_RESOURCE_TYPE && entry.id === ASAR_INTEGRITY_RESOURCE_ID) {
      matches.push(index);
    }
  });
  if (matches.length === 0) {
    throw new WindowsAsarIntegrityError(
      "resource-missing",
      `no ${ASAR_INTEGRITY_RESOURCE_TYPE}/${ASAR_INTEGRITY_RESOURCE_ID} resource; electron-builder did not write the integrity record`,
    );
  }
  if (matches.length > 1) {
    throw new WindowsAsarIntegrityError(
      "resource-ambiguous",
      `${matches.length} ${ASAR_INTEGRITY_RESOURCE_TYPE}/${ASAR_INTEGRITY_RESOURCE_ID} resources found; expected exactly one`,
    );
  }
  return matches[0];
}

const normalizeRecordFile = (file) => path.win32.normalize(file).toLowerCase();

function parseRecord(entry) {
  let list;
  try {
    list = JSON.parse(Buffer.from(entry.bin).toString("utf8"));
  } catch (error) {
    throw new WindowsAsarIntegrityError(
      "record-malformed",
      `integrity resource is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!Array.isArray(list) || list.length === 0) {
    throw new WindowsAsarIntegrityError(
      "record-malformed",
      "integrity record is not a non-empty array",
    );
  }
  for (const item of list) {
    if (
      item === null ||
      typeof item !== "object" ||
      typeof item.file !== "string" ||
      typeof item.alg !== "string" ||
      typeof item.value !== "string" ||
      Object.keys(item).length !== 3
    ) {
      throw new WindowsAsarIntegrityError(
        "record-malformed",
        'every record entry must be exactly {"file","alg","value"} strings',
      );
    }
    if (item.alg !== SUPPORTED_ALGORITHM) {
      throw new WindowsAsarIntegrityError(
        "record-unsupported",
        `unsupported algorithm ${JSON.stringify(item.alg)} for ${item.file}; only ${SUPPORTED_ALGORITHM} is supported`,
      );
    }
    if (!SHA256_HEX.test(item.value)) {
      throw new WindowsAsarIntegrityError(
        "record-malformed",
        `recorded value for ${item.file} is not a 64-character lowercase hex SHA-256`,
      );
    }
  }
  const appAsarIndexes = list.flatMap((item, index) =>
    normalizeRecordFile(item.file) === APP_ASAR_RECORD_FILE ? [index] : [],
  );
  if (appAsarIndexes.length !== 1) {
    throw new WindowsAsarIntegrityError(
      appAsarIndexes.length === 0 ? "record-missing-app-asar" : "record-ambiguous",
      `integrity record has ${appAsarIndexes.length} entries for ${APP_ASAR_RECORD_FILE}; expected exactly one`,
    );
  }
  return { list, appAsarIndex: appAsarIndexes[0] };
}

/** 读取 exe 里的 fuse wire。严格校验：哨兵必须唯一，版本为 V1，长度覆盖完整性 fuse，状态字符合法。 */
export function readFuseWire(exeBuffer) {
  const first = exeBuffer.indexOf(FUSE_SENTINEL);
  if (first === -1) {
    throw new WindowsAsarIntegrityError(
      "fuse-missing",
      "fuse sentinel not found in the executable",
    );
  }
  if (exeBuffer.lastIndexOf(FUSE_SENTINEL) !== first) {
    throw new WindowsAsarIntegrityError(
      "fuse-ambiguous",
      "fuse sentinel occurs more than once (universal binary is not a Windows package shape)",
    );
  }
  const wireStart = first + FUSE_SENTINEL.length;
  const version = exeBuffer[wireStart];
  const length = exeBuffer[wireStart + 1];
  if (version !== FUSE_WIRE_VERSION_V1) {
    throw new WindowsAsarIntegrityError(
      "fuse-malformed",
      `unsupported fuse wire version ${String(version)}; expected ${FUSE_WIRE_VERSION_V1}`,
    );
  }
  if (!(length > INTEGRITY_FUSE_INDEX) || wireStart + 2 + length > exeBuffer.length) {
    throw new WindowsAsarIntegrityError(
      "fuse-malformed",
      `fuse wire length ${String(length)} does not cover EnableEmbeddedAsarIntegrityValidation or runs past the file end`,
    );
  }
  const states = [...exeBuffer.subarray(wireStart + 2, wireStart + 2 + length)].map((byte) =>
    String.fromCharCode(byte),
  );
  const bad = states.findIndex((state) => !FUSE_STATE_CHARS.has(state));
  if (bad !== -1) {
    throw new WindowsAsarIntegrityError(
      "fuse-malformed",
      `fuse ${FUSE_NAMES[bad] ?? `fuse${bad}`} has invalid state byte 0x${exeBuffer[wireStart + 2 + bad].toString(16)}`,
    );
  }
  return {
    version,
    states,
    byName: Object.fromEntries(
      states.map((state, index) => [FUSE_NAMES[index] ?? `fuse${index}`, state]),
    ),
  };
}

const archivePathForRecord = (appOutDir, file) => path.join(appOutDir, ...file.split(/[\\/]/));

/**
 * 在最后一次 app.asar 重写之后调用：用当前归档头部哈希原位替换 ELECTRONASAR 记录。
 * 只改 app.asar 那一项，其余记录和全部其他 PE 资源原样保留；已是最新时不改写文件（幂等）。
 */
export async function refreshWindowsAsarIntegrity({ exePath, appOutDir }) {
  const original = await readFile(exePath);
  const { executable, resource } = openResources(original, { allowSigned: false });
  const entryIndex = findIntegrityEntryIndex(resource);
  const entry = resource.entries[entryIndex];
  const { list, appAsarIndex } = parseRecord(entry);
  const hash = await computeAsarHeaderHash(archivePathForRecord(appOutDir, APP_ASAR_RECORD_FILE));
  const previous = list[appAsarIndex].value;
  if (previous === hash) return { changed: false, previous, hash };

  list[appAsarIndex] = { ...list[appAsarIndex], value: hash };
  const payload = Buffer.from(JSON.stringify(list));
  // 原位替换：保留 type/id/lang/codepage，只换 bin；不向 entries 追加任何条目。
  resource.entries[entryIndex] = {
    ...entry,
    bin: payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength),
  };
  resource.outputResource(executable);
  const next = Buffer.from(executable.generate());

  // 先写临时文件再替换，避免中途失败留下半个 exe。
  const temporaryPath = `${exePath}.integrity.tmp`;
  try {
    await writeFile(temporaryPath, next);
    await rename(temporaryPath, exePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
  // 写回后立即重读并核对：记录等于头部哈希，且仍然只有一条 ELECTRONASAR。
  await assertWindowsAsarIntegrity({ exePath, appOutDir, requireFuse: false });
  return { changed: true, previous, hash };
}

/**
 * 校验 exe 中的记录与磁盘上的归档一致；requireFuse 为真时还要求完整性校验 fuse 已打开。
 * 记录里的每一项都对照其归档文件，缺文件或哈希不符都抛错（记录过期不会被接受）。
 */
export async function assertWindowsAsarIntegrity({ exePath, appOutDir, requireFuse }) {
  const buffer = await readFile(exePath);
  const { resource } = openResources(buffer, { allowSigned: true });
  const { list } = parseRecord(resource.entries[findIntegrityEntryIndex(resource)]);
  const records = [];
  for (const item of list) {
    const actual = await computeAsarHeaderHash(archivePathForRecord(appOutDir, item.file));
    records.push({ file: item.file, recorded: item.value, actual });
    if (item.value !== actual) {
      throw new WindowsAsarIntegrityError(
        "record-stale",
        `recorded hash for ${item.file} is ${item.value} but the archive header hash is ${actual}`,
      );
    }
  }
  let fuses;
  if (requireFuse) {
    fuses = readFuseWire(buffer);
    if (fuses.states[INTEGRITY_FUSE_INDEX] !== "1") {
      throw new WindowsAsarIntegrityError(
        "fuse-off",
        `EnableEmbeddedAsarIntegrityValidation is ${fuses.states[INTEGRITY_FUSE_INDEX]}, expected 1`,
      );
    }
  }
  return { records, fuses };
}

/**
 * Graph Windows 配置的生命周期控制器。electron-builder.config.js 只负责把三个入口接进钩子：
 * - electronFuses：只在启用时给出，其余配置（含非 Graph、非 Windows）为 undefined，即不设置任何 fuse。
 * - refreshAfterFinalAsarRewrite：afterPack 的最后一步，此后没有任何步骤再重写 app.asar。
 * - assertAfterFuses：接到 artifactBuildStarted。electron-builder 只在 doPack（翻转 fuse、签名）
 *   完成之后才调用 target.build 并发出该事件，所以这是 fuse 写入之后的第一个可断言阶段。
 */
export function createGraphWindowsAsarIntegrityLifecycle({ enabled, log = console.log }) {
  const refreshedByArch = new Map();
  return {
    electronFuses: enabled ? GRAPH_WINDOWS_ELECTRON_FUSES : undefined,
    async refreshAfterFinalAsarRewrite(context) {
      if (!enabled) return null;
      const exePath = path.join(
        context.appOutDir,
        `${context.packager.appInfo.productFilename}.exe`,
      );
      const result = await refreshWindowsAsarIntegrity({ exePath, appOutDir: context.appOutDir });
      refreshedByArch.set(context.arch, { exePath, appOutDir: context.appOutDir });
      log(
        `[afterPack] ELECTRONASAR ${result.changed ? "replaced" : "already current"} hash=${result.hash}`,
      );
      return result;
    },
    async assertAfterFuses(event) {
      if (!enabled) return null;
      const refreshed = refreshedByArch.get(event.arch);
      if (!refreshed) {
        throw new WindowsAsarIntegrityError(
          "refresh-not-run",
          `artifactBuildStarted for arch ${String(event.arch)} arrived but no integrity refresh ran for it`,
        );
      }
      const result = await assertWindowsAsarIntegrity({ ...refreshed, requireFuse: true });
      log(
        `[artifactBuildStarted] ELECTRONASAR matches the archive header and the integrity fuse is on (${event.targetPresentableName})`,
      );
      return result;
    },
  };
}

/** 供后续 Windows 验证使用的只读检查：`node windows-asar-integrity.mjs <win-unpacked-dir> <exe-file-name> [--require-fuse]`。 */
async function main(argv) {
  const [appOutDir, exeName, ...flags] = argv;
  if (!appOutDir || !exeName) {
    throw new Error(
      "usage: windows-asar-integrity.mjs <win-unpacked-dir> <exe-file-name> [--require-fuse]",
    );
  }
  const result = await assertWindowsAsarIntegrity({
    exePath: path.resolve(appOutDir, exeName),
    appOutDir: path.resolve(appOutDir),
    requireFuse: flags.includes("--require-fuse"),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
