import { createHash } from "node:crypto";
import path from "node:path";

export function acceptancePaths(isolation) {
  const key = createHash("sha256").update(isolation.workspace).digest("hex");
  // 原因：Graph 安装包先切换私有 HOME；开发 harness 的 data/home 路径不再是事实来源。
  // 只使用本次 createIsolation 创建的 profile，不回退到机器的已安装配置。
  const home = isolation.graphProfile?.env.HOME ?? path.join(isolation.home, "home");
  const data = isolation.graphProfile?.env.ZCODE_DATA_BASE_DIR ?? path.join(isolation.home, "data");
  return {
    record: path.join(data, ".zcode/v2/graph-engineering", `${key}.json`),
    ledger: path.join(home, ".zcode/cli/db/db.sqlite"),
  };
}
