import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

/**
 * 直接读取可执行文件里的 Electron ASAR 完整性记录（资源 ELECTRONASAR）和 fuse，并与两个构建的
 * exe 不同字节区间比较。只读，只报告测到的事实：
 * - 记录里的 value 是什么、位于哪个偏移、是否落在 exe 的差异区间内；
 * - 它是否等于该构建 app.asar 头部的 SHA-256（两种常见定义都计算）；
 * - EnableEmbeddedAsarIntegrityValidation fuse 的状态。
 * 记录为什么与头部哈希不同，这里不推断。
 * 用法：verify-asar-integrity.mjs <dist-dir-a> <dist-dir-b> [comparison.json] [output.json]
 */
const root = path.resolve(import.meta.dirname, "../..");
const [first, second, comparisonFile, output] = process.argv.slice(2);
if (!first || !second)
  throw new Error(
    "usage: verify-asar-integrity.mjs <dist-a> <dist-b> [comparison.json] [output.json]",
  );
const asar = createRequire(path.join(root, "packages/desktop/package.json"))("@electron/asar");

const FUSES = [
  "RunAsNode",
  "EnableCookieEncryption",
  "EnableNodeOptionsEnvironmentVariable",
  "EnableNodeCliInspectArguments",
  "EnableEmbeddedAsarIntegrityValidation",
  "OnlyLoadAppFromAsar",
  "LoadBrowserProcessSpecificV8Snapshot",
  "GrantFileProtocolExtraPrivileges",
];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function integrityRecord(exe) {
  // 资源值是一段 JSON 数组：[{"file":"resources\\app.asar","alg":"SHA256","value":"<hex>"}]
  const marker = Buffer.from('[{"file":"resources\\\\app.asar"');
  const at = exe.indexOf(marker);
  if (at === -1) return undefined;
  const end = exe.indexOf(Buffer.from("]"), at);
  const text = exe.subarray(at, end + 1).toString("latin1");
  const value = /"value":"([0-9a-f]{64})"/.exec(text)?.[1];
  const valueOffset = value ? at + text.indexOf(value) : undefined;
  return { offset: at, text, value, valueOffset };
}

function fuses(exe) {
  const sentinel = Buffer.from("dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX");
  const at = exe.indexOf(sentinel);
  if (at === -1) return undefined;
  const count = exe[at + sentinel.length + 1];
  const states = [...exe.subarray(at + sentinel.length + 2, at + sentinel.length + 2 + count)].map(
    (c) => String.fromCharCode(c),
  );
  return Object.fromEntries(states.map((state, index) => [FUSES[index] ?? `fuse${index}`, state]));
}

const region = comparisonFile
  ? JSON.parse(await readFile(comparisonFile, "utf8")).unpackedTree.differentFiles.find(
      (file) => file.file === "ZCode Graph.exe",
    )
  : undefined;
const builds = {};
for (const [label, dist] of [
  ["a", first],
  ["b", second],
]) {
  const unpacked = path.join(root, "packages/desktop", dist, "win-unpacked");
  const archive = path.join(unpacked, "resources/app.asar");
  const headerJson = asar.getRawHeader(archive).headerString;
  const exe = await readFile(path.join(unpacked, "ZCode Graph.exe"));
  const record = integrityRecord(exe);
  const headerJsonSha256 = sha256(headerJson);
  builds[label] = {
    dist,
    recordedIntegrity: record && {
      resourceOffset: record.offset,
      valueOffset: record.valueOffset,
      text: record.text,
    },
    appAsarHeaderJsonSha256: headerJsonSha256,
    recordedValueEqualsHeaderJsonSha256: record?.value === headerJsonSha256,
    valueInsideDifferingRange:
      region && record?.valueOffset !== undefined
        ? record.valueOffset >= region.firstOffset &&
          record.valueOffset + 63 <= region.lastOffset + 1
        : undefined,
    fuses: fuses(exe),
  };
}
const result = {
  schema: "zcode-graph-asar-integrity-check/2",
  exeDifferingRange: region && {
    first: region.firstOffset,
    last: region.lastOffset,
    differingBytes: region.differingBytes,
  },
  builds,
  findings: {
    differingRegionIsTheAsarIntegrityRecord: Object.values(builds).every(
      (build) => build.valueInsideDifferingRange === true,
    ),
    recordedValuesEqualCurrentHeaderHashes: Object.values(builds).every(
      (build) => build.recordedValueEqualsHeaderJsonSha256,
    ),
    integrityValidationFuseEnabled: Object.values(builds).map(
      (build) => build.fuses?.EnableEmbeddedAsarIntegrityValidation,
    ),
  },
  note: "Direct reads of the packaged executable and archive. Why a recorded value differs from the archive's current header hash is not determined here.",
};
const text = `${JSON.stringify(result, null, 2)}\n`;
if (output) await writeFile(output, text);
else process.stdout.write(text);
