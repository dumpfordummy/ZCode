import type {
  IGitService,
  IZCodeAgentService,
  IZCodeSessionService,
  IModelSelectionService,
} from "../../index.js";
import type { GraphParallelPort } from "../app/parallel-ports.js";
import type {
  GraphNativeSettings,
  GraphWorkspaceTarget,
  GraphRecipe,
  GraphSequentialDefinition,
} from "../contract.js";
import type { GraphParallelInventory } from "../parallel-contract.js";
import { workflowDigest } from "./workflow-preflight.js";
import { createGraphRecipeStore } from "./recipes.js";
import { isConfirmedTerminal } from "../domain/definition.js";
import { workflowToolQueries, checkWorkflowTools } from "./workflow-tools.js";
import type { GitGraphWorkspace } from "@zcode/shared";

export function createGraphParallelPort(options: {
  cleanupWorkspace?: (workspace: GitGraphWorkspace) => Promise<GitGraphWorkspace>;
  gitService: IGitService;
  agentService: IZCodeAgentService;
  sessionService: IZCodeSessionService;
  modelSelectionService: IModelSelectionService;
}): GraphParallelPort {
  const recipes = createGraphRecipeStore();
  async function inventory(
    target: GraphWorkspaceTarget,
    settings: GraphNativeSettings,
    selected?: GraphRecipe[],
  ): Promise<GraphParallelInventory> {
    const configured = selected ?? (await recipes.read(target)).recipes;
    const position = { x: 0, y: 0 };
    const definition: GraphSequentialDefinition = {
      version: 4,
      revision: 0,
      name: "Combined tools preflight",
      nodes: [
        { id: "start", type: "start", position, request: "Combined tools" },
        ...configured.map((recipe, index) => ({
          id: index === 0 ? "build" : "test",
          type: "tool" as const,
          position,
          name: recipe.name,
          recipeId: recipe.id,
        })),
        { id: "end", type: "end", position, outputNodeId: "test" },
      ],
      edges: [
        { source: "start", target: "build" },
        { source: "build", target: "test" },
        { source: "test", target: "end" },
      ],
    };
    const tooling = workflowToolQueries(target, definition, configured);
    const environment = await options.agentService.previewExecutionEnvironment({
      ...target,
      executables: tooling.queries,
    });
    if (environment.status !== "available")
      throw new Error(
        "Open this workspace in native Chat to initialize its configuration, then preview again.",
      );
    const view = await options.modelSelectionService.getView({
      selection: settings.modelSelection,
    });
    if (
      view.selectionIssue ||
      workflowDigest(view.effectiveSelection) !== workflowDigest(settings.modelSelection)
    )
      throw new Error("Selected native model is unavailable or changed.");
    const provider = view.providers.find(
      (p) => p.providerId === settings.modelSelection.providerId,
    );
    const api = provider?.config.api;
    let destination = "Unknown";
    try {
      const url = new URL(api?.baseUrl ?? "");
      if (["http:", "https:"].includes(url.protocol)) destination = url.origin;
    } catch {
      /* Unknown is explicit below. */
    }
    const value = {
      environment,
      providerId: settings.modelSelection.providerId,
      modelId: settings.modelSelection.modelId,
      destination,
      modelDigest: workflowDigest({
        api,
        model: provider?.models.find((m) => m.modelId === settings.modelSelection.modelId)?.config,
      }),
      unknowns: [
        ...environment.unknowns,
        ...checkWorkflowTools(tooling.queries, environment),
        ...tooling.pending,
        "Native title requests use the selected session model. Delegated tools, hooks, MCP, redirects and backend routing may contact additional destinations. Directory separation is not an OS sandbox.",
      ],
    };
    return { ...value, digest: workflowDigest({ value, recipes: configured }) };
  }
  return {
    async validate(workspace) {
      await options.gitService.graphWorkspace({ action: "validate", workspace });
    },
    async preview(target, plan, settings) {
      if (!plan.enabled) throw new Error("Explicit Fork/Join is disabled.");
      const base = await options.gitService.getGraphBase(target);
      const selected = plan.branches.filter((b) => b.selected);
      if (plan.admissionBudget < selected.length + 3)
        throw new Error(
          "Admission budget must cover each worker, integration and combined Build/Test.",
        );
      const config = await recipes.read(target);
      const build = config.recipes.find((r) => r.id === plan.buildRecipeId);
      const test = config.recipes.find((r) => r.id === plan.testRecipeId);
      if (
        !build ||
        build.verifier.kind !== "build" ||
        !test ||
        test.verifier.kind !== "test" ||
        test.verifier.buildNodeId !== "build"
      )
        throw new Error(
          "Select an existing Build recipe and independent Test recipe tied to node build.",
        );
      for (const recipe of [build, test]) await recipes.fingerprint(target, recipe.sourcePaths);
      for (const branch of selected)
        for (const path of branch.files) {
          if (!base.trackedPaths.includes(path) && !branch.additions.includes(path))
            throw new Error(`Explicitly approve new file ${path}.`);
        }
      const current = await inventory(target, settings, [build, test]);
      const value = { base, inventory: current, recipes: [build, test] };
      return { ...value, digest: workflowDigest({ value, plan, settings }) };
    },
    prepare: (preview, ownerId, slot, token) =>
      options.gitService.graphWorkspace({
        action: "prepare",
        base: preview.base,
        ownerId,
        slot,
        token,
      }),
    async initialize(workspace, settings, configured) {
      const target = { workspacePath: workspace.workspacePath };
      const snapshot = await recipes.read(target);
      await recipes.save(target, configured, snapshot.digest);
      const initialized = await options.sessionService.initializeWorkspace(target);
      if (!initialized.available)
        throw new Error(initialized.reason ?? "Native workspace initialization failed.");
      return inventory(target, settings);
    },
    async inventory(workspace, settings) {
      await options.gitService.graphWorkspace({ action: "validate", workspace });
      return inventory({ workspacePath: workspace.workspacePath }, settings);
    },
    async verifyBase(preview) {
      if (
        (await options.gitService.getGraphBase({ workspacePath: preview.base.workspacePath }))
          .digest !== preview.base.digest
      )
        throw new Error("Original base changed. No integration or new worker will be admitted.");
      const current = await recipes.read({ workspacePath: preview.base.workspacePath });
      if (
        workflowDigest(preview.recipes.map((p) => current.recipes.find((r) => p.id === r.id))) !==
        workflowDigest(preview.recipes)
      )
        throw new Error("Approved project recipes changed.");
    },
    async capture(child, files, additions) {
      if (!child.workspace) throw new Error("Owned workspace is missing.");
      await options.gitService.graphWorkspace({ action: "validate", workspace: child.workspace });
      const source = await options.gitService.getSourceSnapshot({
        workspacePath: child.workspace.workspacePath,
      });
      if (!source.complete) throw new Error(`Incomplete proposal: ${source.issues.join("; ")}`);
      const proposed = source.files
        .map((file) => {
          if (!files.includes(file.path))
            throw new Error(`Shared contract/scope violation: ${file.path}`);
          if (file.status === "untracked" && !additions.includes(file.path))
            throw new Error(`Unapproved untracked addition: ${file.path}`);
          if (
            !["untracked", "unstaged:M", "unstaged:D"].includes(file.status) ||
            /(?:old mode|new mode|new file mode (?!100644)|deleted file mode (?!100644))/.test(
              file.diff ?? "",
            )
          )
            throw new Error(`Unsupported staged change or mode: ${file.path}`);
          if (file.beforeText === undefined || file.afterText === undefined)
            throw new Error("Proposal text is incomplete.");
          return {
            path: file.path,
            before: file.beforeText,
            after: file.afterText,
            kind:
              file.status === "untracked"
                ? ("add" as const)
                : file.status === "unstaged:D"
                  ? ("delete" as const)
                  : ("edit" as const),
          };
        })
        .sort((a, b) => a.path.localeCompare(b.path));
      if (new Set(proposed.map((p) => p.path)).size !== proposed.length)
        throw new Error("Proposal contains duplicate source entries.");
      const value = { branchId: child.id, files: proposed, sourceDigest: workflowDigest(source) };
      return { ...value, digest: workflowDigest(value) };
    },
    async cleanup(workspace, runs) {
      if (runs.some((r) => !isConfirmedTerminal(r) && r.recovery?.state !== "inactive"))
        throw new Error("Owned native work is not confirmed inactive.");
      const active = await options.agentService.collectLocalRuntimeChildProcesses();
      if (active.some((runtime) => runtime.workspacePath === workspace.workspacePath))
        throw new Error(
          "A native runtime still owns this workspace. Retain it; close its workspace/app normally before cleanup.",
        );
      if (!options.cleanupWorkspace) throw new Error("Owned cleanup is unavailable in this Host.");
      return options.cleanupWorkspace(workspace);
    },
  };
}
