import { readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

// B1-F1：这六类 ssh2 MSBuild 中间文件会携带构建机路径；拒绝打包，不删除运行时文件。
const metadata = new Set([
  "sshcrypto.node.recipe",
  "cl.items.tlog",
  "link.secondary.1.tlog",
  "sshcrypto.lastbuildstate",
  "sshcrypto.vcxproj",
  "sshcrypto.vcxproj.filters",
]);
export async function assertCleanSsh2BuildMetadata(ssh2Root) {
  const found = [];
  async function visit(directory, prefix = "") {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const relative = prefix + entry.name;
      if (metadata.has(entry.name.toLowerCase())) found.push(relative);
      if (entry.isDirectory()) await visit(path.join(directory, entry.name), relative + "/");
    }
  }
  await visit(path.join(ssh2Root, "lib/protocol/crypto/build"));
  if (found.length) throw new Error("Unintended ssh2 build metadata: " + found.sort().join(", "));
  return { status: "PASS", rejectedMetadataFiles: 0 };
}
export async function checkWindowsBuildDependencies(root) {
  const require = createRequire(path.join(root, "packages/desktop/package.json"));
  return assertCleanSsh2BuildMetadata(path.dirname(require.resolve("ssh2/package.json")));
}
