import type {
  GraphWorkspaceTarget,
  GraphNativeSettings,
  GraphRecipe,
  GraphRun,
} from "../contract.js";
import type {
  GraphParallelInventory,
  GraphParallelPreview,
  GraphParallelPlan,
  GraphParallelChild,
  GraphParallelProposal,
} from "../parallel-contract.js";
import type { GitGraphWorkspace } from "@zcode/shared";
export interface GraphParallelPort {
  validate(workspace: GitGraphWorkspace): Promise<void>;
  preview(
    target: GraphWorkspaceTarget,
    plan: GraphParallelPlan,
    settings: GraphNativeSettings,
  ): Promise<GraphParallelPreview>;
  prepare(
    preview: GraphParallelPreview,
    ownerId: string,
    slot: string,
    token: string,
  ): Promise<GitGraphWorkspace>;
  initialize(
    workspace: GitGraphWorkspace,
    settings: GraphNativeSettings,
    recipes: GraphRecipe[],
  ): Promise<GraphParallelInventory>;
  inventory(
    workspace: GitGraphWorkspace,
    settings: GraphNativeSettings,
  ): Promise<GraphParallelInventory>;
  verifyBase(preview: GraphParallelPreview): Promise<void>;
  capture(
    child: GraphParallelChild,
    files: string[],
    additions: string[],
  ): Promise<GraphParallelProposal>;
  cleanup(workspace: GitGraphWorkspace, runs: GraphRun[]): Promise<GitGraphWorkspace>;
}
