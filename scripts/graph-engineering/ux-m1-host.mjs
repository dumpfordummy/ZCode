// Node-side Graph Host fixture for the UX-M1 browser harness.
//
// REAL (repository code, run over real temporary workspaces): `instantiateTemplate` (the Host's own
// template instantiation and its required/undeclared checks), `validateReadiness`, the recipe store
// (`createGraphRecipeStore`: reads and saves `.zcode/config.json` with digest-conflict detection and
// schema validation), and the project-setup facade behind reference validation and search.
// FIXTURE (labelled in the report): the workspace view (`getWorkspace`, the run list and the
// definition's revision counter), `run` (admits a fixture run record), the workflow preflight
// (`prepare`, built from the REAL reference validation and the REAL recipe store, but with a fixture
// native environment), the library view (built from the real built-in templates), change events, and
// the transport (a Playwright bridge instead of RPC).
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { builtinTemplates } from "../../packages/services/src/graph-engineering/domain/workflow-samples.ts";
import { instantiateTemplate } from "../../packages/services/src/graph-engineering/domain/workflow.ts";
import {
  defaultDefinition,
  validateReadiness,
} from "../../packages/services/src/graph-engineering/domain/definition.ts";
import { createGraphRecipeStore } from "../../packages/services/src/graph-engineering/adapters/recipes.ts";
import { createContextPickerHost } from "./context-picker-host.mjs";
import { resolved, runningRun } from "./ux-m1-runs.mjs";

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
  const library = {
    revision: 1,
    entries: builtinTemplates.map(({ id, template }) => ({
      id,
      name: template.name,
      archived: false,
      builtin: true,
      versions: [
        { version: 1, digest: sha(id), createdAt: 0, template: structuredClone(template) },
      ],
    })),
  };
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

  const bridge = {
    ...picker.bridge,
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
      return op("graph.saveDefinition", { workspace: id, expectedRevision }, async () => {
        if (graph[id].definition.revision !== expectedRevision)
          throw new Error("Graph revision changed; reload before saving.");
        const saved = { ...structuredClone(definition), revision: expectedRevision + 1 };
        graph[id].definition = saved;
        notify(id);
        return structuredClone(saved);
      });
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
          graph[id].runs.unshift(run);
          notify(id);
          return structuredClone(run);
        },
      );
    },
    async list() {
      return op("wf.list", {}, async () => structuredClone(library));
    },
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
        async () => {
          const entry = library.entries.find((item) => item.id === templateId);
          const selected = entry?.versions.find((item) => item.version === version);
          if (!selected) throw new Error("Unknown workflow version.");
          if (graph[id].definition.revision !== expectedRevision)
            throw new Error("Graph revision changed; reload before instantiating.");
          // 真实的 Host 实例化：必填/未声明的引用与参数由这里的领域函数拒绝。
          const built = instantiateTemplate(templateId, selected, parameters, bindings);
          const saved = { ...built, revision: expectedRevision + 1 };
          graph[id].definition = saved;
          notify(id);
          return structuredClone(saved);
        },
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
    library,
    attachPage(target) {
      page = target;
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
