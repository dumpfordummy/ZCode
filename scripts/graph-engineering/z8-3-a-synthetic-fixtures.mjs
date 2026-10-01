import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { NtExecutable, NtExecutableResource, Resource } from "resedit";
import {
  computeAsarHeaderHash,
  WindowsAsarIntegrityError,
} from "../../packages/desktop/scripts/windows-asar-integrity.mjs";

/**
 * Z8.3-A 的可移植测试。所有 PE 和 app.asar 都是测试里现场生成的 SYNTHETIC 夹具：
 * 不含 Electron 二进制、安装包、签名或网络，只在 Linux 上也能跑。stale 记录由 electron-builder
 * 自己的 addWinAsarIntegrity 写入，保证测试走的是真实的“追加”行为。
 */
export const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "../..");
export const desktopRoot = path.join(root, "packages/desktop");
export const requireFromDesktop = createRequire(path.join(desktopRoot, "package.json"));
export const asar = requireFromDesktop("@electron/asar");
export const { addWinAsarIntegrity } = requireFromDesktop(
  "app-builder-lib/out/electron/electronWin.js",
);
export const { computeData: builderComputeData } = requireFromDesktop(
  "app-builder-lib/out/asar/integrity.js",
);
export const { PlatformPackager } = requireFromDesktop("app-builder-lib");
const requireFromBuilder = createRequire(
  requireFromDesktop.resolve("app-builder-lib/package.json"),
);
export const { flipFuses } = requireFromBuilder("@electron/fuses");

export const EXE_NAME = "ZCode Graph.exe";
export const SENTINEL = "dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX";
// 观察到的 Electron 41 形态：8 个已命名 fuse + 第 9 个未命名（值 1）。第 9 个不识别也不修改。
export const OBSERVED_STATES = ["1", "0", "1", "1", "0", "0", "0", "1", "1"];

/** SYNTHETIC：最小 PE32+（一个 .text 节），可选内嵌 fuse wire，再用 resedit 写入资源。 */
export function syntheticPe({
  wire = OBSERVED_STATES,
  sentinels = 1,
  wireVersion = 1,
  wireLength,
  signed = false,
} = {}) {
  const b = Buffer.alloc(0x400);
  b.write("MZ", 0);
  b.writeUInt32LE(0x40, 0x3c);
  b.write("PE\0\0", 0x40);
  b.writeUInt16LE(0x8664, 0x44);
  b.writeUInt16LE(1, 0x46);
  b.writeUInt16LE(240, 0x54);
  b.writeUInt16LE(0x22, 0x56);
  const opt = 0x58;
  b.writeUInt16LE(0x20b, opt);
  b.writeUInt32LE(0x1000, opt + 16);
  b.writeBigUInt64LE(0x140000000n, opt + 24);
  b.writeUInt32LE(0x1000, opt + 32);
  b.writeUInt32LE(0x200, opt + 36);
  b.writeUInt16LE(6, opt + 40);
  b.writeUInt16LE(6, opt + 48);
  b.writeUInt32LE(0x2000, opt + 56);
  b.writeUInt32LE(0x200, opt + 60);
  b.writeUInt16LE(3, opt + 68);
  b.writeUInt32LE(16, opt + 108);
  const section = opt + 240;
  b.write(".text", section);
  b.writeUInt32LE(0x200, section + 8);
  b.writeUInt32LE(0x1000, section + 12);
  b.writeUInt32LE(0x200, section + 16);
  b.writeUInt32LE(0x200, section + 20);
  b.writeUInt32LE(0x60000020, section + 36);
  if (wire) {
    const one = Buffer.concat([
      Buffer.from(SENTINEL),
      Buffer.from([wireVersion, wireLength ?? wire.length]),
      Buffer.from(wire.join("")),
    ]);
    let at = 0x200;
    for (let i = 0; i < sentinels; i += 1) {
      one.copy(b, at);
      at += 0x80;
    }
  }
  if (signed) {
    const certDirectory = opt + 112 + 4 * 8;
    b.writeUInt32LE(b.length, certDirectory);
    b.writeUInt32LE(8, certDirectory + 4);
    return Buffer.concat([b, Buffer.alloc(8)]);
  }
  return b;
}

/** SYNTHETIC：带 VersionInfo、两个无关资源（含非默认 lang/codepage）的 PE，其余字节全由测试构造。 */
export function syntheticExeWithResources(options) {
  const executable = NtExecutable.from(syntheticPe(options));
  const resource = NtExecutableResource.from(executable);
  const versionInfo = Resource.VersionInfo.createEmpty();
  versionInfo.setStringValues(
    { lang: 1033, codepage: 1200 },
    { FileDescription: "SYNTHETIC fixture" },
  );
  versionInfo.outputToResourceEntries(resource.entries);
  resource.entries.push(
    {
      type: 10,
      id: "UNRELATED_A",
      bin: Buffer.from("synthetic-unrelated-a"),
      lang: 1033,
      codepage: 1200,
    },
    {
      type: "CUSTOMTYPE",
      id: 7,
      bin: Buffer.from("synthetic-unrelated-b"),
      lang: 2052,
      codepage: 936,
    },
  );
  resource.outputResource(executable);
  return Buffer.from(executable.generate());
}

export const summarize = (buffer, { ignoreCert = false } = {}) => {
  const resource = NtExecutableResource.from(NtExecutable.from(buffer, { ignoreCert }));
  return resource.entries.map((entry) => ({
    type: entry.type,
    id: entry.id,
    lang: entry.lang,
    codepage: entry.codepage,
    sha256: createHash("sha256").update(Buffer.from(entry.bin)).digest("hex"),
  }));
};
export const integrityEntries = (buffer) =>
  NtExecutableResource.from(NtExecutable.from(buffer, { ignoreCert: true })).entries.filter(
    (entry) => entry.type === "INTEGRITY" && entry.id === "ELECTRONASAR",
  );
export const recordOf = (buffer) =>
  JSON.parse(Buffer.from(integrityEntries(buffer)[0].bin).toString("utf8"));

/** SYNTHETIC app.asar：由 @electron/asar 现场打包的小目录。 */
export async function packSyntheticAsar(appOutDir, marker) {
  const source = await mkdtemp(path.join(os.tmpdir(), "z83a-asar-src-"));
  try {
    await writeFile(path.join(source, "index.js"), `// SYNTHETIC ${marker}\n`);
    await writeFile(path.join(source, `${marker}.txt`), marker.repeat(marker.length + 3));
    await mkdir(path.join(appOutDir, "resources"), { recursive: true });
    await asar.createPackage(source, path.join(appOutDir, "resources/app.asar"));
  } finally {
    await rm(source, { recursive: true, force: true });
  }
}

/** 搭一个“builder 刚写完 stale 记录”的 appOutDir：先打包旧归档，用真实 addWinAsarIntegrity 追加记录，再重写归档。 */
export async function stalePackage(t, exeOptions) {
  const appOutDir = await mkdtemp(path.join(os.tmpdir(), "z83a-app-"));
  t.after(() => rm(appOutDir, { recursive: true, force: true }));
  const exePath = path.join(appOutDir, EXE_NAME);
  await packSyntheticAsar(appOutDir, "first");
  await writeFile(exePath, syntheticExeWithResources(exeOptions));
  await addWinAsarIntegrity(exePath, {
    "resources/app.asar": {
      algorithm: "SHA256",
      hash: await computeAsarHeaderHash(path.join(appOutDir, "resources/app.asar")),
    },
  });
  await packSyntheticAsar(appOutDir, "second-after-afterpack-rewrite");
  return { appOutDir, exePath, asarPath: path.join(appOutDir, "resources/app.asar") };
}

export const rejectsWithCode = (promise, code) =>
  assert.rejects(promise, (error) => {
    assert.ok(error instanceof WindowsAsarIntegrityError, String(error));
    assert.equal(error.code, code, error.message);
    return true;
  });

export const builderContext = (appOutDir, arch = 1) => ({
  appOutDir,
  arch,
  packager: { appInfo: { productFilename: "ZCode Graph" } },
});

/** SYNTHETIC：给 PE 加 VersionInfo 后交给 mutate 增删资源条目，返回生成的字节。 */
export function syntheticExeWithEntries(mutate) {
  const executable = NtExecutable.from(syntheticPe());
  const resource = NtExecutableResource.from(executable);
  const versionInfo = Resource.VersionInfo.createEmpty();
  versionInfo.setStringValues({ lang: 1033, codepage: 1200 }, { FileDescription: "SYNTHETIC" });
  versionInfo.outputToResourceEntries(resource.entries);
  mutate(resource.entries);
  resource.outputResource(executable);
  return Buffer.from(executable.generate());
}
