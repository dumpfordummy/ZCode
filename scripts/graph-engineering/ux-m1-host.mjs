// Node-side Graph Host fixture for the UX-M1 browser harness.
//
// REAL (repository code, run over real temporary workspaces): `instantiateTemplate` (the Host's own
// template instantiation and its required/undeclared checks), `validateReadiness`, the recipe store
// (`createGraphRecipeStore`: reads and saves `.zcode/config.json` with digest-conflict detection and
// schema validation), and the project-setup facade behind reference validation and search.
// FIXTURE (labelled in the report): the workspace view (`getWorkspace`, the run list and the
// definition's revision counter), `run` (admits a fixture run record), the workflow preflight
// (`prepare`, built from the REAL reference validation and the REAL recipe store, but with a fixture
// native environment), change events, and the transport (a Playwright bridge instead of RPC).
// UX-M3: the workflow library is the REAL `GraphWorkflowService` over an in-memory store
// (ux-m3-library-host.mjs).
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  defaultDefinition,
  validateReadiness,
} from "../../packages/services/src/graph-engineering/domain/definition.ts";
import { createGraphRecipeStore } from "../../packages/services/src/graph-engineering/adapters/recipes.ts";
import { createContextPickerHost } from "./context-picker-host.mjs";
import { createLibraryFixture } from "./ux-m3-library-host.mjs";
import { resolved, runningRun } from "./ux-m1-runs.mjs";

// 与 Host 的 isConfirmedTerminal 相同的判定（domain/definition.ts）：未结束的运行占用工作区。
const TERMINAL = [
  "Completed",
  "Failed",
  "Rejected",
  "Cancelled",
  "NeedsHuman",
  "BudgetExhausted",
  "NoProgress",
];
const confirmedTerminal = (run) => !run.release && TERMINAL.includes(run.status);

const sha = (value) => createHash("sha256").update(value).digest("hex");

export async function createUxM1Host() {
  const picker = await createContextPickerHost();
  const store = createGraphRecipeStore();
  const ids = Object.keys(picker.workspaces);
  const idOf = (target) =>
    ids.find((id) => picker.workspaces[id] === target?.workspacePath) ?? "unknown";
  const graph = {};
  let page = null;
  let runCounter = 0;
  const freshWorkspace = () => ({ definition: defaultDefinition(), runs: [] });
  const resetState = () => {
    for (const id of ids) graph[id] = freshWorkspace();
    runCounter = 0;
  };
  resetState();
  const notify = (id) => {
    void page
      ?.evaluate((key) => window.__emitGraphChange?.(key), picker.workspaces[id])
      .catch(() => undefined);
  };
  /** Log, honour holds and injected failures, then run `body`; every operation is recorded. */
  const op = async (name, detail, body) => {
    picker.log(name, "start", detail);
    try {
      await picker.gate(name);
      picker.maybeFail(name);
      const result = await body();
      picker.log(name, "done", detail);
      return result;
    } catch (error) {
      picker.log(name, "error", { ...detail, message: String(error?.message ?? error) });
      throw error;
    }
  };
  const environment = {
    version: 1,
    status: "available",
    configDigest: "1".repeat(64),
    executables: [],
    instructions: [],
    skills: [],
    plugins: [],
    hooks: [],
    mcp: [],
    unknowns: [],
  };

  const saveDefinitionNow = (id, definition, expectedRevision) => {
    if (graph[id].definition.revision !== expectedRevision)
      throw new Error("Graph revision changed; reload before saving.");
    const saved = { ...structuredClone(definition), revision: expectedRevision + 1 };
    graph[id].definition = saved;
    notify(id);
    return structuredClone(saved);
  };
  // UX-M3：真实的 GraphWorkflowService（内存库存储）。instantiate 读取的两个成员由这里的工作区状态提供，
  // 不经过 graph.saveDefinition 的日志包装，所以一次实例化在调用日志里仍是一次 wf.instantiate。
  const libraryFixture = createLibraryFixture({
    op,
    graph: {
      recipes: ({ target }) => store.read(target),
      saveDefinition: async ({ target, definition, expectedRevision }) =>
        saveDefinitionNow(idOf(target), definition, expectedRevision),
    },
  });

  await libraryFixture.warm();
  // UX-M3：导入/导出的文件边界。stat 与 readFileRange 读真实的临时文件；saveFile 只记录调用者交来的字节（FIXTURE：没有真实的系统保存对话框）。
  const saves = [];
  let saveResult = { success: true, filePath: "saved-by-harness.json" };
  const bridge = {
    ...picker.bridge,
    async stat({ path: file }) {
      return op("stat", {}, async () => {
        const info = await fs.stat(file);
        return {
          type: info.isFile() ? "file" : "directory",
          size: info.size,
          mtimeMs: info.mtimeMs,
        };
      });
    },
    async readFileRange({ path: file, offset, length }) {
      return op("readFileRange", { offset, length }, async () =>
        Array.from((await fs.readFile(file)).subarray(offset, offset + length)),
      );
    },
    async saveFile({ suggestedName, bytes }) {
      return op("saveFile", { suggestedName }, async () => {
        saves.push({ suggestedName, text: Buffer.from(bytes).toString("utf8") });
        return structuredClone(saveResult);
      });
    },
    async getWorkspace(target) {
      const id = idOf(target);
      return op("graph.getWorkspace", { workspace: id }, async () => ({
        definition: structuredClone(graph[id].definition),
        runs: structuredClone(graph[id].runs),
        availability: { available: true },
      }));
    },
    async saveDefinition({ target, definition, expectedRevision }) {
      const id = idOf(target);
      return op("graph.saveDefinition", { workspace: id, expectedRevision }, async () =>
        saveDefinitionNow(id, definition, expectedRevision),
      );
    },
    async validateDefinition({ definition }) {
      return op("graph.validateDefinition", {}, async () => validateReadiness(definition));
    },
    async recipes(params) {
      const id = idOf(params.target);
      const name = params.action === "save" ? "graph.recipes.save" : "graph.recipes.read";
      return op(
        name,
        {
          workspace: id,
          ...(params.action === "save"
            ? {
                recipeIds: params.recipes.map((recipe) => recipe.id),
                expectedDigest: params.expectedDigest,
              }
            : {}),
        },
        async () => {
          if (params.action === "save") {
            // 镜像真实 Host（app/service.ts）的规则：图运行未结束时拒绝保存检查。
            if (graph[id].runs.some((run) => !confirmedTerminal(run)))
              throw new Error("Project recipe edits are blocked while a graph is unresolved.");
            const saved = await store.save(params.target, params.recipes, params.expectedDigest);
            notify(id);
            return saved;
          }
          return store.read(params.target);
        },
      );
    },
    async run(params) {
      const id = idOf(params.target);
      return op(
        "graph.run",
        {
          workspace: id,
          requestId: params.requestId,
          revision: params.revision,
          ...(params.preflight ? { preflight: params.preflight } : {}),
        },
        async () => {
          if (
            graph[id].runs.some((run) => !["Completed", "Failed", "Cancelled"].includes(run.status))
          )
            throw new Error("Another run still owns this workspace.");
          const run = runningRun(`run-new-${++runCounter}`, params.requestId);
          run.createdAt = Date.now();
          // 与真实 Host（app/service.ts）一致：新运行追加到记录末尾（创建顺序）。UX-M2.1 之前夹具误用了 unshift。
          graph[id].runs.push(run);
          notify(id);
          return structuredClone(run);
        },
      );
    },
    ...libraryFixture.bridge,
    async instantiate({ target, id: templateId, version, expectedRevision, parameters, bindings }) {
      const id = idOf(target);
      return op(
        "wf.instantiate",
        {
          workspace: id,
          templateId,
          version,
          expectedRevision,
          parameters: structuredClone(parameters),
          bindings: structuredClone(bindings),
        },
        () =>
          libraryFixture.service.instantiate({
            target,
            id: templateId,
            version,
            expectedRevision,
            parameters,
            bindings,
          }),
      );
    },
    async prepare({ target, revision, settings }) {
      const id = idOf(target);
      return op("wf.prepare", { workspace: id, revision }, async () => {
        const definition = graph[id].definition;
        if (definition.revision !== revision)
          throw new Error("Graph revision changed before preflight.");
        const template = definition.template;
        if (!template) throw new Error("The saved definition has no workflow instance.");
        const references = [];
        for (const [refId, value] of Object.entries(template.bindings.references)) {
          if (!value) continue;
          const role = template.references.find((item) => item.id === refId);
          if (role?.kind === "skill") {
            references.push({
              id: refId,
              kind: "skill",
              path: value,
              digest: sha(value),
              origin: "catalog",
              nativeName: value,
              delivery: "native-skill",
            });
            continue;
          }
          // 真实的引用验证（路径规则、大小、摘要、交付判定），不是夹具。
          const checked = await picker.bridge.projectSetup({
            action: "validate-reference",
            target,
            path: value,
          });
          references.push({
            id: refId,
            kind: role?.kind ?? "document",
            path: checked.path,
            digest: checked.digest,
            origin: "workspace",
            delivery: checked.delivery,
          });
        }
        const saved = await store.read(target);
        const recipes = Object.entries(template.bindings.recipes)
          .filter(([, recipeId]) => recipeId)
          .map(([nodeId, recipeId]) => {
            const recipe = saved.recipes.find((item) => item.id === recipeId);
            if (!recipe) throw new Error(`Saved check ${recipeId} no longer exists.`);
            return {
              nodeId,
              id: recipe.id,
              digest: sha(JSON.stringify(recipe)),
              command: [recipe.executable, ...recipe.args].join(" "),
              cwd: recipe.cwd,
            };
          });
        return {
          digest: sha(JSON.stringify([definition.revision, template.digest, template.bindings])),
          template: structuredClone(template),
          environment,
          models: [],
          auxiliary: [],
          references,
          recipes,
          permissions: [
            { nodeId: "implement", mode: settings.mode, planEnabled: settings.planEnabled },
          ],
          unknowns: ["Fixture: native runtime behaviour is Unknown in this harness."],
        };
      });
    },
  };

  return {
    ...picker,
    bridge,
    graph,
    library: libraryFixture,
    /** What the page handed to the save dialog, in order. */
    saves,
    setSaveResult(result) {
      saveResult = result;
    },
    /** A real file outside every workspace, for the import file chooser to return. */
    async writeTemp(name, content) {
      const file = path.join(picker.root, name);
      await fs.writeFile(file, content);
      return file;
    },
    attachPage(target) {
      page = target;
    },
    /** Write saved checks straight into the workspace's real `.zcode/config.json` (as an external editor would). */
    async seedRecipes(id, recipes) {
      const folder = path.join(picker.workspaces[id], ".zcode");
      await fs.mkdir(folder, { recursive: true });
      await fs.writeFile(
        path.join(folder, "config.json"),
        JSON.stringify({ graphRecipes: recipes }, null, 2),
      );
    },
    async readRecipes(id) {
      return store.read({ workspacePath: picker.workspaces[id] });
    },
    setRuns(id, runs) {
      graph[id].runs = structuredClone(runs);
      notify(id);
    },
    /** The current runs settle (the Host projection changes); nothing else happens. */
    resolveRuns(id) {
      graph[id].runs = graph[id].runs.map((run) => resolved(run));
      notify(id);
    },
    async reset() {
      picker.reset();
      resetState();
      libraryFixture.reset();
      saves.length = 0;
      saveResult = { success: true, filePath: "saved-by-harness.json" };
      // 真实的检查存储把配置写在工作区的 .zcode/config.json：每个场景从干净状态开始。
      await Promise.all(
        ids.map((id) =>
          fs.rm(path.join(picker.workspaces[id], ".zcode"), { recursive: true, force: true }),
        ),
      );
    },
    calls: picker.calls,
  };
}
