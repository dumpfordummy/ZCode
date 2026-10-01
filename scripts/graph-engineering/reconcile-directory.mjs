// 对一个一次性 Graph 数据目录运行一次冷加载对账（用当前代码、静默的原生桩）。仅用于演练文档里的命令。
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { GraphEngineeringService } from "../../packages/services/src/graph-engineering/app/service.ts";
import { createGraphRepository } from "../../packages/services/src/graph-engineering/adapters/repository.ts";

const directory = path.resolve(process.argv[2]);
const name = (await readdir(directory)).find((n) => /^[0-9a-f]{64}\.json$/.test(n));
const workspacePath = JSON.parse(await readFile(path.join(directory, name), "utf8")).workspaceKey;
const native = new Proxy({}, { get: () => async () => ({ available: true }) });
const service = new GraphEngineeringService({
  repository: createGraphRepository(directory),
  native,
  id: () => "id",
  now: () => Date.now(),
});
const view = await service.getWorkspace({ workspacePath });
await service.disposeAndWait();
console.log(view.runs.map((r) => r.status).join(","));
