import type { ZCodeExecutionEnvironmentPreview } from "@zcode/shared";
import type { GraphRecipe, GraphWorkspaceTarget } from "../contract.js";
import type { GraphChecksSelection } from "../checks-types.js";
import type {
  GraphChecksPreview,
  GraphProjectDiscovery,
  GraphReferenceValidation,
} from "../project-setup-types.js";

export interface GraphChecksPort {
  capture(
    target: GraphWorkspaceTarget,
    revision: number,
    selection: GraphChecksSelection,
    expectedDigest: string,
  ): Promise<GraphChecksPreview>;
}
export interface GraphProjectPort extends GraphChecksPort {
  validateReference(target: GraphWorkspaceTarget, path: string): Promise<GraphReferenceValidation>;
  scan(target: GraphWorkspaceTarget, requestId: string): Promise<GraphProjectDiscovery>;
  cancelScan(target: GraphWorkspaceTarget, requestId: string): void;
  environment(
    target: GraphWorkspaceTarget,
    recipes: GraphRecipe[],
  ): Promise<ZCodeExecutionEnvironmentPreview>;
}
