import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { hashTree, listFiles, sha256File } from "./release-manifest.mjs";

/**
 * 对照该构建的原始 RELEASE_MANIFEST.json，重新计算安装包与包内组件的哈希。
 * 只读：不改清单，也不改包。用于在打包验收前后证明被测二进制没有变化。
 */
export async function verifyPackageHashes(distDirectory) {
  const manifest = JSON.parse(
    await readFile(path.join(distDirectory, "RELEASE_MANIFEST.json"), "utf8"),
  );
  const unpacked = path.join(distDirectory, "win-unpacked");
  const mismatches = [];
  const compare = (name, expected, actual) => {
    if (expected !== actual) mismatches.push({ name, expected, actual });
  };
  const installer = manifest.artifact.installer;
  compare(
    `installer:${installer.path}`,
    installer.sha256,
    await sha256File(path.join(distDirectory, installer.path)),
  );
  const files = await listFiles(unpacked);
  const tree = await hashTree(unpacked, files);
  compare("win-unpacked tree digest", manifest.artifact.unpackedTree.digest, tree.digest);
  compare("win-unpacked file count", manifest.artifact.unpackedTree.files, files.length);
  const observed = {};
  for (const [name, expected] of Object.entries(manifest.artifact.components)) {
    if (name.endsWith("/")) {
      const prefix = name.slice(0, -1);
      const subset = files.filter((f) => f.startsWith(`${prefix}/`));
      const digest = createHash("sha256");
      for (const f of subset) digest.update(`${f}\0${tree.files[f].sha256}\n`);
      observed[name] = { treeDigest: digest.digest("hex"), files: subset.length };
      compare(`${name} tree digest`, expected.treeDigest, observed[name].treeDigest);
    } else {
      observed[name] = { sha256: tree.files[name]?.sha256 };
      compare(name, expected.sha256, observed[name].sha256);
    }
  }
  return {
    checkedAt: new Date().toISOString(),
    version: manifest.version,
    manifestSha256: await sha256File(path.join(distDirectory, "RELEASE_MANIFEST.json")),
    installer: { path: installer.path, sha256: installer.sha256 },
    ok: mismatches.length === 0,
    mismatches,
    componentsChecked: Object.keys(manifest.artifact.components).length,
    unpackedFilesChecked: files.length,
    observed,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const [dist, output] = process.argv.slice(2);
  if (!dist)
    throw new Error("usage: verify-package-hashes.mjs <dist-graph-dir-path> [output.json]");
  const result = await verifyPackageHashes(path.resolve(dist));
  const text = `${JSON.stringify(result, null, 2)}\n`;
  if (output) await writeFile(output, text);
  else process.stdout.write(text);
  process.exitCode = result.ok ? 0 : 1;
}
