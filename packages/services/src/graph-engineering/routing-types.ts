import type { GraphNodeBase, GraphWorkspaceTarget } from "./approval-types.js";
import type { GraphInputBinding, GraphNativeSettings } from "./base-types.js";
import type { GraphJsonValue } from "./artifact-types.js";

export type GraphPredicate =
  | {
      op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
      alias: string;
      pointer: string;
      value: null | boolean | number | string;
    }
  | { op: "present"; alias: string; pointer: string }
  | { op: "all" | "any"; predicates: GraphPredicate[] }
  | { op: "not"; predicate: GraphPredicate };
export interface GraphConditionNode extends GraphNodeBase {
  type: "condition";
  name: string;
  inputs: GraphInputBinding[];
  branches: Array<{ exit: string; predicate: GraphPredicate }>;
  defaultExit: string;
  errorPolicy: "needs-human";
  verification?: { testNodeIds: string[]; reviewerNodeId?: string; successExit: string };
}
export interface GraphRepairRegion {
  id: string;
  name: string;
  entryNodeId: string;
  repairEntryNodeId: string;
  decisionNodeId: string;
  bodyNodeIds: string[];
  repairExit: string;
  passExit: string;
  maxRepairIterations: number;
  stopOnNoProgress: boolean;
  sourcePaths: string[];
}
export interface GraphRoutingDefinition {
  finalGateId: string;
  limits: { maxNodeAdmissions: number; deadlineMs: number };
  region?: GraphRepairRegion;
}
export interface GraphConditionAttempt {
  nodeId: string;
  attemptId: string;
  iterationId: string;
  iteration: number;
  status: "Pending" | "Evaluated" | "Invalid" | "Skipped";
  createdAt: number;
  updatedAt: number;
  bindings?: Array<{ alias: string; artifactId: string; digest: string; value: GraphJsonValue }>;
  values?: Array<{ alias: string; pointer: string; present: boolean; value?: GraphJsonValue }>;
  selectedExit?: string;
  decisionId?: string;
  successorNodeId?: string;
  message?: string;
}
export interface GraphIteration {
  id: string;
  index: number;
  createdAt: number;
  attemptIds: Record<string, string>;
  visitedNodeIds: string[];
  sourceDigest?: string;
  feedback?: { text: string; digest: string; artifactIds: string[]; previousIterationId: string };
  failureFingerprint?: string;
}
export interface GraphRouteCheckpoint {
  id: string;
  digest: string;
  decisionId: string;
  iterationId: string;
  successorNodeId: string;
  sourceDigest?: string;
  createdAt: number;
  resumeRequired?: boolean;
  consumedAt?: number;
}
export interface GraphRoutingState {
  configurationDigest: string;
  recipeConfigurationDigest: string;
  currentIterationId: string;
  cursorNodeId: string;
  iterations: GraphIteration[];
  conditionAttempts: GraphConditionAttempt[];
  admissions: number;
  deadlineAt: number;
  checkpoints: GraphRouteCheckpoint[];
  continuations: Array<{ requestId: string; checkpointId: string; checkpointDigest: string }>;
  stopReason?: {
    kind: "NeedsHuman" | "BudgetExhausted" | "NoProgress";
    message: string;
    at: number;
  };
}
export interface GraphRunStartCommand extends Omit<GraphNativeSettings, "planEnabled"> {
  preflight?: { digest: string; acknowledgedUnknowns: boolean };
  planEnabled?: boolean;
  action?: "start";
  target: GraphWorkspaceTarget;
  requestId: string;
  revision: number;
}
export interface GraphRunContinueCommand {
  action: "continue";
  target: GraphWorkspaceTarget;
  runId: string;
  requestId: string;
  checkpointId: string;
  checkpointDigest: string;
}
