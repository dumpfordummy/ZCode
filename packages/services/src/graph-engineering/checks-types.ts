import type { ZCodeExecutionEnvironmentPreview } from "@zcode/shared";
import type { GraphRecipe } from "./artifact-types.js";

/** RPC preserves Error.name. Only a known refusal before any durable admission uses this name. */
export const GRAPH_CHECKS_ADMISSION_REJECTED = "GraphChecksAdmissionRejected";

export type GraphChecksSelection =
  | { kind: "recipes"; recipeIds: string[]; buildMappings: Record<string, string> }
  | { kind: "dotnet-probe"; executable: string; cwd: string };
/** Frozen facts; the run separately owns its complete transient definition. */
export interface GraphChecksReceipt {
  kind: "checks-preview";
  version: 1;
  digest: string;
  revision: number;
  recipeDigest: string;
  sourceDigest: string;
  selection: GraphChecksSelection;
  recipes: GraphRecipe[];
  environment: ZCodeExecutionEnvironmentPreview;
  effects: string[];
  unknowns: string[];
}
export interface GraphChecksPurpose {
  kind: "checks";
  preview: GraphChecksReceipt;
  acceptedAt: number;
  acknowledgedUnknowns: boolean;
}
