const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
require("./z3-boundary-hook.cjs");
// Z2 原 --require 预加载未命中边界；显式加载隔离拦截器，再导入不变的真实 Host。
void (async () => {
  await fs.writeFile(
    path.join(process.env.Z3_GRAPH_BOUNDARY_PROFILE, "z3-hook-loaded.json"),
    JSON.stringify({ loadedAt: Date.now() }),
    { flag: "wx" },
  );
  await import(
    pathToFileURL(path.resolve(__dirname, "../../packages/desktop/out/host/index.js")).href
  );
})();
