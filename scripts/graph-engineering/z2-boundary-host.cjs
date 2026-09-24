const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
require("./z2-boundary-hook.cjs");

// 原 --require 注入未命中已确认落盘边界；先显式装载测试拦截器并保存装载凭据，
// 再导入不变的真实 Host，避免把测试注入失效误判为产品执行行为。
void (async () => {
  await fs.writeFile(
    path.join(process.env.Z2_GRAPH_BOUNDARY_PROFILE, "z2-boundary-hook-loaded.json"),
    JSON.stringify({ kind: "isolated-write-hook-loaded", loadedAt: Date.now() }),
    { flag: "wx" },
  );
  await import(
    pathToFileURL(path.resolve(__dirname, "../../packages/desktop/out/host/index.js")).href
  );
})();
