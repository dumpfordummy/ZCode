const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
require("./z4-boundary-hook.cjs");
// 已验证的隔离包装器先安装写入检查点，再导入未修改的真实 Host；不替换任何原生服务。
void (async () => {
  await fs.writeFile(
    path.join(process.env.Z4_GRAPH_BOUNDARY_PROFILE, "z4-hook-loaded.json"),
    JSON.stringify({ loadedAt: Date.now() }),
    { flag: "wx" },
  );
  await import(
    pathToFileURL(path.resolve(__dirname, "../../packages/desktop/out/host/index.js")).href
  );
})();
