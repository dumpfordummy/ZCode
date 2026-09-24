import { randomUUID } from "node:crypto";
import type { GitGraphWorkspace } from "@zcode/shared";
import type {
  IZCodeAgentService,
  IZCodeSessionService,
  IModelSelectionService,
  ISettingService,
  IGitService,
} from "../index.js";
import { GraphEngineeringService } from "./app/service.js";
import { createGraphRepository } from "./adapters/repository.js";
import { createGraphNativePort } from "./adapters/native.js";
import { createGraphEvidencePort } from "./adapters/evidence.js";
import { createGraphArtifactStore } from "./adapters/artifacts.js";
import { createGraphRecipeStore } from "./adapters/recipes.js";
import { assertWorkspaceFilePath } from "./adapters/artifact-files.js";
import { createGraphToolPort } from "./adapters/tools.js";
import { createWorkflowPreflight, workflowDigest } from "./adapters/workflow-preflight.js";
import { createWorkflowStore } from "./adapters/workflow-store.js";
import { GraphWorkflowService } from "./app/workflow-service.js";
import { createGraphParallelPort } from "./adapters/parallel-workspaces.js";

export function createGraphEngineeringService(options: {
  directory: string;
  agentService: IZCodeAgentService;
  sessionService: IZCodeSessionService;
  modelSelectionService: IModelSelectionService;
  settingService: ISettingService;
  gitService: IGitService;
  cleanupWorkspace?: (workspace: GitGraphWorkspace) => Promise<GitGraphWorkspace>;
}) {
  const preflight = createWorkflowPreflight(options);
  const graph = new GraphEngineeringService({
    parallel: createGraphParallelPort(options),
    preflight,
    repository: createGraphRepository(options.directory),
    native: createGraphNativePort(options),
    evidence: createGraphEvidencePort(options.gitService),
    artifacts: createGraphArtifactStore(options.directory),
    recipes: {
      ...createGraphRecipeStore(),
      async validatePaths(target, paths) {
        for (const path of paths) await assertWorkspaceFilePath(target, path, true);
      },
    },
    tools: createGraphToolPort(options),
    id: randomUUID,
    now: Date.now,
  });
  const workflowService = new GraphWorkflowService({
    store: createWorkflowStore(options.directory),
    graph,
    preflight,
    digest: workflowDigest,
    id: randomUUID,
    now: Date.now,
  });
  return Object.assign(graph, { workflowService });
}
