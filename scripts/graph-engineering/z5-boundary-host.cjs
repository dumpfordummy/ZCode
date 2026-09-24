const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
require("./z5-boundary-hook.cjs");
// 只在指定的合成 Host 安装检查点，然后导入未修改的真实 Host；不替换任何原生服务。
void (async () => {
  await fs.writeFile(
    path.join(process.env.Z5_GRAPH_BOUNDARY_PROFILE, "z5-hook-loaded.json"),
    JSON.stringify({ at: Date.now() }),
    { flag: "wx" },
  );
  await import(
    pathToFileURL(path.resolve(__dirname, "../../packages/desktop/out/host/index.js")).href
  );
})();
