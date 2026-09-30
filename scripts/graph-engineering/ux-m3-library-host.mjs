// UX-M3 library fixture for the browser harness.
//
// REAL (repository code): `GraphWorkflowService` itself (list, mutate, preview, instantiate), the
// built-in templates and their real digests, `libraryStoreSchema` validation, the portable-template
// validation (secret and private-path scan, limits), `instantiateTemplate`, the recipe
// compatibility check, and the exact-version and digest checks.
// FIXTURE (labelled in the report): the library store is in memory instead of
// `workflow-library.json` (same `GraphLibraryStore` port, same revision rule and error text, same
// schema validation), the graph service behind `instantiate` is the harness's own workspace state,
// and the Playwright bridge replaces RPC.
import { createHash } from "node:crypto";
import { GraphWorkflowService } from "../../packages/services/src/graph-engineering/app/workflow-service.ts";
import { libraryStoreSchema } from "../../packages/services/src/graph-engineering/domain/workflow-schema.ts";
import { builtinTemplates } from "../../packages/services/src/graph-engineering/domain/workflow-samples.ts";

const sha = (value) => createHash("sha256").update(value).digest("hex");

/** In-memory `GraphLibraryStore`: the same revision check and schema validation as the file store. */
function memoryStore() {
  let state = { revision: 0, entries: [] };
  return {
    async read() {
      return structuredClone(state);
    },
    async change(expectedRevision, change) {
      if (state.revision !== expectedRevision)
        throw new Error("Workflow library revision changed; refresh before saving.");
      const entries = structuredClone(state.entries);
      change(entries);
      const result = libraryStoreSchema.parse({
        version: 1,
        revision: state.revision + 1,
        entries,
      });
      state = { revision: result.revision, entries: structuredClone(result.entries) };
      return structuredClone(state);
    },
    reset() {
      state = { revision: 0, entries: [] };
    },
  };
}

/**
 * `graph` supplies the two members `GraphWorkflowService.instantiate` reads: the saved checks and
 * the design save. `op(name, detail, body)` is the harness's logging/gating wrapper.
 */
export function createLibraryFixture({ graph, op }) {
  const store = memoryStore();
  let counter = 0;
  const service = new GraphWorkflowService({
    store,
    graph,
    preflight: {
      async capture() {
        throw new Error("The harness preflight is the fixture Host's `prepare`.");
      },
    },
    digest: sha,
    id: () => `user-workflow-${++counter}`,
    now: () => Date.UTC(2026, 8, 30, 9, 0, 0) + counter * 60_000,
  });
  const builtin = (id) => structuredClone(builtinTemplates.find((item) => item.id === id).template);
  /** Built-in versions exactly as the Host publishes them (never a constant in a scenario). */
  const offered = {};
  return {
    service,
    store,
    /** Reads the versions the Host offers; call once before scenarios need `key`/`versionOf`. */
    async warm() {
      for (const entry of (await service.list()).entries)
        if (entry.builtin) offered[entry.id] = entry.versions.map((item) => item.version);
    },
    versionOf: (id) => offered[id].at(-1),
    /** The template-draft key (`<id>:<version>`) of a built-in as offered by the Host. */
    key: (id) => `${id}:${offered[id].at(-1)}`,
    bridge: {
      list: () => op("wf.list", {}, () => service.list()),
      mutate: (params) => op("wf.mutate", { action: params.action }, () => service.mutate(params)),
      preview: (params) =>
        op("wf.preview", { action: params.action }, () => service.preview(params)),
    },
    /** A portable template derived from a real built-in, renamed and re-described (still validated on save). */
    template(base, name, description) {
      const template = builtin(base);
      template.name = name;
      template.graph.name = name;
      if (description !== undefined) template.description = description;
      return template;
    },
    /** Creates a user workflow (and optional further versions) through the REAL service. */
    async seedUser(name, { base = "generic", versions = 1 } = {}) {
      let view = await service.list();
      await service.mutate({
        action: "create",
        template: this.template(base, name, `${name}: version 1`),
        expectedRevision: view.revision,
      });
      view = await service.list();
      const entry = view.entries.find((item) => !item.builtin && item.name === name);
      for (let version = 2; version <= versions; version += 1) {
        view = await service.list();
        await service.mutate({
          action: "version",
          id: entry.id,
          template: this.template(base, name, `${name}: version ${version}`),
          expectedRevision: view.revision,
        });
      }
      return (await service.list()).entries.find((item) => item.id === entry.id);
    },
    /** A change made by another window: it advances the library revision without the page's knowledge. */
    async externalChange() {
      const view = await service.list();
      await service.mutate({
        action: "create",
        template: this.template("agent-assisted", `External workflow ${++counter}`),
        expectedRevision: view.revision,
      });
    },
    reset() {
      store.reset();
      counter = 0;
    },
  };
}
