import path from "node:path";
import {
  listGraphRecords,
  restoreGraphRecord,
} from "../../packages/services/src/graph-engineering/adapters/record-maintenance.ts";

/**
 * Z8.2 操作员维护脚本（没有产品界面）。必须在 Graph 应用关闭时运行。
 *   node --import tsx scripts/graph-engineering/graph-record-restore.mjs list <graph-engineering-dir>
 *   node --import tsx scripts/graph-engineering/graph-record-restore.mjs restore <graph-engineering-dir> --workspace-key <exact key> --snapshot <id or prefix> --yes
 * 恢复只替换这一个 Graph 记录；它不恢复原生会话、凭据、项目源码或项目 .zcode/config.json。
 * 说明见 docs/graph-engineering/z8/GRAPH_DATA_OPERATIONS.md。
 */
const [command, directoryArg, ...rest] = process.argv.slice(2);
const option = (name) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined);
const usage =
  "usage: graph-record-restore.mjs list <dir> | restore <dir> --workspace-key <key> --snapshot <id> --yes";
try {
  if (!command || !directoryArg) throw new Error(usage);
  const directory = path.resolve(directoryArg);
  if (command === "list") {
    process.stdout.write(`${JSON.stringify(await listGraphRecords(directory), null, 2)}\n`);
  } else if (command === "restore") {
    const key = option("--workspace-key");
    const snapshot = option("--snapshot");
    if (!key || !snapshot) throw new Error(usage);
    if (!rest.includes("--yes"))
      throw new Error(
        "Refusing without --yes. Close ZCode Graph first; this replaces the workspace's Graph record.",
      );
    const result = await restoreGraphRecord({ directory, workspaceKey: key, snapshot });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else throw new Error(usage);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
