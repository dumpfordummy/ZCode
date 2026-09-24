import type { GraphNodeBase, GraphWorkspaceTarget } from "./approval-types.js";
import type { GraphRecipe, GraphArtifact, GraphFileObservation } from "./artifact-types.js";
import type { GraphRunStatus, GraphDispatchPhase } from "./base-types.js";
export type { GraphArtifactSource } from "./approval-types.js";

export interface GraphToolNode extends GraphNodeBase {
  type: "tool";
  name: string;
  recipeId: string;
}
export interface GraphCommandResult {
  status: "completed" | "failed" | "timed_out" | "cancelled" | "spawn_error";
  exitCode?: number;
  signal?: string;
  stdout: { text: string; bytes: number; truncated: boolean };
  stderr: { text: string; bytes: number; truncated: boolean };
  durationMs: number;
  timedOut: boolean;
  cancelled: boolean;
  processExitObserved?: boolean;
}
export interface GraphToolOperation {
  operationId: string;
  sessionId: string;
  requestDigest?: string;
  recipeId?: string;
  cwd?: string;
  status: "awaiting_permission" | "running" | "completed" | "failed" | "cancelled" | "unknown";
  processStarted: boolean;
  startedAt?: number;
  completedAt?: number;
  result?: GraphCommandResult;
  error?: string;
}
export interface GraphToolVerification {
  observationValid?: boolean;
  outcome?: "pass" | "fail";
  tests?: Array<{ name: string; status: "passed" | "failed" | "skipped"; message?: string }>;
  processKnown: boolean;
  exitSuccessful: boolean;
  reportFresh: boolean;
  reportParsed: boolean;
  acceptancePassed: boolean;
  classification: "command" | "build" | "test";
  testCount?: number;
  passed?: number;
  failed?: number;
  skipped?: number;
  issues: string[];
}
export interface GraphToolAttempt {
  iterationId?: string;
  iteration?: number;
  nodeId: string;
  attemptId: string;
  operationId: string;
  recipe: GraphRecipe;
  recipeDigest: string;
  status: GraphRunStatus | "Pending" | "Skipped";
  dispatchPhase: GraphDispatchPhase;
  createdAt: number;
  updatedAt: number;
  sessionId?: string;
  runtimeIdentity?: string;
  sourceDigest?: string;
  buildDigest?: string;
  outputDigest?: string;
  resolvedArgs?: string[];
  beforeReportDigest?: string;
  outputsBefore?: GraphFileObservation[];
  operation?: GraphToolOperation;
  verification?: GraphToolVerification;
  message?: string;
}
export interface GraphArtifactContent {
  artifact: GraphArtifact;
  content: string;
}
export interface GraphArtifactRequest {
  target: GraphWorkspaceTarget;
  runId: string;
  artifactId: string;
}
