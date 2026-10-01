#!/usr/bin/env node
// CLOUD-BOOTSTRAP-1: 只对 PR 变更文件运行 `oxfmt --check`，从不改写文件，更不做全仓库格式化。
// 字节必须保持不变的历史证据与 fixture 目录在这里按路径前缀排除（见 docs 中的说明）；
// 排除只作用于变更文件的选择，不修改 .oxfmtrc.json，开发者本地的行为不变。
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { changedFilesSince } from "./pr-changed-files.mjs";

/** 字节保持不变的路径（历史证据 / fixture）。 */
export const BYTE_PRESERVED = [
  "docs/graph-engineering/z8/evidence/",
  "docs/graph-engineering/evidence/",
  "docs/graph-engineering/z8/fixtures/",
];

export function selectFormatTargets(changed) {
  const excluded = changed.filter((file) =>
    BYTE_PRESERVED.some((prefix) => file.startsWith(prefix)),
  );
  const targets = changed.filter((file) => !excluded.includes(file));
  return { targets, excluded };
}

async function main() {
  const { targets, excluded } = selectFormatTargets(
    await changedFilesSince(process.argv[2] ?? "HEAD^1"),
  );
  console.log(
    `format: ${targets.length} file(s) checked, ${excluded.length} byte-preserved file(s) excluded`,
  );
  for (const file of excluded) console.log(`  excluded (byte-preserved): ${file}`);
  if (targets.length === 0) return 0;
  return new Promise((resolve) => {
    const child = spawn(
      "pnpm",
      ["exec", "oxfmt", "--check", "--no-error-on-unmatched-pattern", "--", ...targets],
      { stdio: "inherit" },
    );
    child.on("error", () => resolve(127));
    child.on("close", (code) => resolve(code ?? 1));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await main());
}
