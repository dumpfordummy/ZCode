#!/usr/bin/env node
// Z8.2：把 historical-capture.mjs 捕获的旧版本 Graph 数据，导出为可提交的 fixture 和 PROVENANCE.json。
// 只导出 Graph 自己的数据目录（记录、产物、工作流库）的原始字节：不改写、不清理。
// 不导出安装包、凭据、provider 配置、Electron 会话数据、原始 profile 或原生日志。
//   node scripts/graph-engineering/export-historical-fixtures.mjs [--profiles <dir>] [--historical <dir>]
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { RELEASES } from "./historical-capture.mjs";
import { root } from "./isolation.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) =>
  args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback;
const profiles = path.resolve(option("profiles", path.join(root, ".tmp/z8-2/profiles")));
const historical = path.resolve(option("historical", path.join(root, ".tmp/z8-2/historical")));
const destination = path.join(root, "docs/graph-engineering/z8/fixtures/historical");

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function files(directory, prefix = "") {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory())
      found.push(...(await files(path.join(directory, entry.name), relative)));
    else found.push(relative);
  }
  return found.sort();
}

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
const releases = {};
for (const [key, release] of Object.entries(RELEASES)) {
  const sums = (await readFile(path.join(historical, key, "SHA256SUMS.txt"), "utf8")).trim();
  const installer = path.join(historical, key, release.asset);
  releases[release.tag] = {
    appVersion: release.version,
    asset: release.asset,
    // 只记录基础下载地址；GitHub 会重定向到带签名的临时地址，那个地址不记录。
    url: `https://github.com/dumpfordummy/ZCode/releases/download/${release.tag}/${release.asset}`,
    sha256sumsUrl: `https://github.com/dumpfordummy/ZCode/releases/download/${release.tag}/SHA256SUMS.txt`,
    sha256sums: sums,
    installerBytes: (await stat(installer)).size,
    installerSha256: sha256(await readFile(installer)),
    installedByThisWork: false,
    extraction: "7za x (read-only unpack of the NSIS payload; the installer was never executed)",
  };
}

const fixtures = {};
for (const id of (await readdir(profiles)).sort()) {
  const capture = JSON.parse(await readFile(path.join(profiles, id, "capture.json"), "utf8"));
  const source = path.join(profiles, id, "kept/profile-home/.zcode/v2/graph-engineering");
  const target = path.join(destination, id, "graph-engineering");
  await cp(source, target, { recursive: true });
  const exported = [];
  for (const relative of await files(target)) {
    const bytes = await readFile(path.join(target, relative));
    exported.push({
      path: `${id}/graph-engineering/${relative}`,
      bytes: bytes.length,
      sha256: sha256(bytes),
    });
  }
  const recordName = (await readdir(target)).find((name) => /^[0-9a-f]{64}\.json$/.test(name));
  const record = recordName
    ? JSON.parse(await readFile(path.join(target, recordName), "utf8"))
    : undefined;
  // capture.json 里记录的哈希必须与导出的字节一致，否则这不是「旧应用写出的原样字节」。
  for (const entry of capture.graphFiles) {
    const match = exported.find((item) =>
      item.path.endsWith(path.posix.basename(entry.profileRelative)),
    );
    if (!match || match.sha256 !== entry.sha256)
      throw new Error(
        `${id}: exported bytes differ from the capture record for ${entry.profileRelative}`,
      );
  }
  fixtures[id] = {
    release: capture.sourceRelease,
    installerSha256: capture.installer.sha256,
    oldApp: capture.oldAppIdentity,
    scenario: capture.scenario,
    workspaceIdentity: record?.workspaceKey ?? null,
    graphProfileRelativeRoot: ".zcode/v2/graph-engineering/",
    recordVersion: record?.version ?? null,
    runStatuses:
      record?.runs?.map((run) => ({
        version: run.version ?? "z1-unversioned",
        status: run.status,
      })) ?? [],
    capturedFiles: capture.graphFiles,
    exportedFiles: exported,
    byteForByteProducedByOldApp: capture.byteForByteProducedByOldApp,
    sanitization: capture.sanitization,
    harnessPatch: capture.harnessPatch,
  };
}

await writeFile(
  path.join(destination, "PROVENANCE.json"),
  `${JSON.stringify(
    {
      schema: "zcode-graph-historical-fixtures/1",
      note: "Graph data written by the genuine old release binaries (extracted, not installed) in an isolated temporary profile with synthetic workspaces and a loopback provider. Bytes are exported unmodified. Not included: installers, credentials, provider configuration, Electron session data, raw profiles, native logs. Recipe: scripts/graph-engineering/historical-capture.mjs.",
      releases,
      fixtures,
    },
    null,
    2,
  )}\n`,
);
console.log(
  `exported ${Object.keys(fixtures).length} fixtures to ${path.relative(root, destination)}`,
);
