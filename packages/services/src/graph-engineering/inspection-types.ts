import type { InspectionSelection, ZCodeRecipeRequest, InspectionProjection } from "@zcode/shared";
import type { GraphWorkspaceTarget } from "./approval-types.js";
export type GraphInspectionStatus =
  | "review-ready"
  | "verifying-sources"
  | "awaiting-permission"
  | "running"
  | "succeeded"
  | "denied"
  | "cancelled"
  | "expired"
  | "source-changed"
  | "runtime-changed"
  | "invalid-output"
  | "failed"
  | "executor-lost"
  | "unavailable";
export interface GraphInspection {
  version: 1;
  kind: "project-inspection";
  id: string;
  status: GraphInspectionStatus;
  target: GraphWorkspaceTarget;
  selection: InspectionSelection;
  request?: ZCodeRecipeRequest;
  requestDigest?: string;
  sessionId?: string;
  runtimeIdentity?: string;
  environmentDigest?: string;
  reserved: boolean;
  projection?: InspectionProjection;
  scopeComplete: false;
  message: string;
  timings: Array<{ phase: string; elapsedMs: number }>;
}
type WithoutTarget<T> = T extends unknown ? Omit<T, "target"> : never;
export type GraphInspectionSetupCommand = WithoutTarget<GraphInspectionCommand>;
export type GraphInspectionCommand = { target: GraphWorkspaceTarget } & (
  | { action: "review"; selection: InspectionSelection }
  | { action: "start"; id: string; requestDigest: string; selection: InspectionSelection }
  | { action: "status"; id: string }
  | { action: "cancel"; id: string }
);
