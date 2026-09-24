import type { Event } from "@zcode/rpc";
import type { ModelSelection } from "@zcode/shared";
import type { SubmissionMode } from "@zcode/shared/zcode-protocol-v4";
import { ServiceChannels } from "@zcode/shared";
import { createServiceDescriptor } from "../descriptors.js";

export interface GraphWorkspaceTarget {
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
}

export interface GraphLegacyDefinition {
  version?: undefined;
  revision: number;
  name: string;
  taskName: string;
  instructions: string;
  nodes: Array<{ id: string; type: "start" | "task" | "end"; position: { x: number; y: number } }>;
  edges: Array<{ source: string; target: string }>;
}

export type GraphRunStatus =
  | "Starting"
  | "Running"
  | "WaitingForPermission"
  | "WaitingForUser"
  | "CancelRequested"
  | "Completed"
  | "Failed"
  | "Cancelled"
  | "Interrupted"
  | "Unknown";

export interface GraphLegacyRun {
  version?: undefined;
  id: string;
  attemptId: string;
  requestId: string;
  target: GraphWorkspaceTarget;
  definition: GraphLegacyDefinition;
  modelSelection: ModelSelection;
  mode: SubmissionMode;
  planEnabled?: boolean;
  commandId: string;
  inputId: string;
  sessionId?: string;
  runtimeIdentity?: string;
  foregroundExecutionId?: string;
  status: GraphRunStatus;
  createdAt: number;
  updatedAt: number;
  message?: string;
  terminalProof?: {
    sourceCommandId: string;
    state: "completedSuccess" | "completedInterrupted" | "failed";
    logEpoch: string;
    seq: number;
  };
  recovery?: GraphRecoveryInspection;
  release?: GraphReleaseAudit;
}

export interface GraphNativeSettings {
  modelSelection: ModelSelection;
  mode: SubmissionMode;
  planEnabled: boolean;
}
export type GraphInputSource = { kind: "start" } | { kind: "node"; nodeId: string };
export interface GraphInputBinding {
  alias: string;
  source: GraphInputSource;
}
export interface GraphNodeBase {
  id: string;
  position: { x: number; y: number };
}
export interface GraphStartNode extends GraphNodeBase {
  type: "start";
  request: string;
}
export interface GraphTaskNode extends GraphNodeBase {
  type: "task";
  name: string;
  instructions: string;
  instructionMode: "literal" | "bound";
  inputs: GraphInputBinding[];
  configuration: { kind: "inherit" } | ({ kind: "override" } & GraphNativeSettings);
}
export interface GraphEndNode extends GraphNodeBase {
  type: "end";
  outputNodeId: string | null;
}
export type GraphNode = GraphStartNode | GraphTaskNode | GraphEndNode;
export interface GraphSequentialDefinition {
  version: 2;
  revision: number;
  name: string;
  nodes: GraphNode[];
  edges: Array<{ source: string; target: string }>;
}
export type GraphDefinition = GraphLegacyDefinition | GraphSequentialDefinition;
export interface GraphReadiness {
  errors: string[];
  /** Task IDs in edge order; empty for an invalid path. */
  path: string[];
}
export interface GraphTerminalProof {
  sourceCommandId: string;
  state: "completedSuccess" | "completedInterrupted" | "failed";
  logEpoch: string;
  seq: number;
  turnId?: string;
}
export interface GraphFinalOutput {
  text: string;
  turnId: string;
  rowId: number;
  entityId?: string;
  assistantResponseId?: string;
}
export interface GraphResolvedBinding extends GraphInputBinding {
  text: string;
  sourceSessionId?: string;
  sourceInputId?: string;
  sourceCommandId?: string;
}
export type GraphDispatchPhase = "planned" | "creating" | "created" | "sending" | "accepted";
export interface GraphNodeAttempt {
  nodeId: string;
  attemptId: string;
  commandId: string;
  inputId: string;
  status: GraphRunStatus | "Pending" | "Skipped";
  dispatchPhase: GraphDispatchPhase;
  settings: GraphNativeSettings & { source: "workspace" | "node" };
  createdAt: number;
  updatedAt: number;
  sessionId?: string;
  runtimeIdentity?: string;
  foregroundExecutionId?: string;
  observationEpoch?: string;
  resolvedInstructions?: string;
  bindings?: GraphResolvedBinding[];
  terminalProof?: GraphTerminalProof;
  finalOutput?: GraphFinalOutput;
  outputIssue?: string;
  message?: string;
}
export type GraphInactivityProof =
  | {
      kind: "input-terminal";
      runtimeIdentity: string;
      sessionId: string;
      inputId: string;
      commandId: string;
      terminalProof: GraphTerminalProof;
    }
  | { kind: "runtime-retired"; runtimeIdentity: string; workspaceKey: string; retiredAt: number }
  | { kind: "never-submitted"; commandId: string; dispatchPhase: GraphDispatchPhase };
export interface GraphRecoveryInspection {
  inspectedAt: number;
  state: "inactive" | "active" | "unknown";
  reason: string;
  attempts: Array<{
    attemptId: string;
    state: "inactive" | "active" | "unknown";
    reason: string;
    proof?: GraphInactivityProof;
    foregroundExecutionId?: string;
  }>;
}
export interface GraphReleaseAudit {
  releasedAt: number;
  reason: string;
  inspection: GraphRecoveryInspection;
}
export interface GraphSequentialRun {
  version: 2;
  id: string;
  requestId: string;
  requestFingerprint: string;
  target: GraphWorkspaceTarget;
  definition: GraphSequentialDefinition;
  defaults: GraphNativeSettings;
  plannedPath: string[];
  startInput: string;
  nodeAttempts: GraphNodeAttempt[];
  status: GraphRunStatus;
  createdAt: number;
  updatedAt: number;
  message?: string;
  cancelRequestedAt?: number;
  result?: GraphFinalOutput;
  recovery?: GraphRecoveryInspection;
  release?: GraphReleaseAudit;
}
export type GraphRun = GraphLegacyRun | GraphSequentialRun;

export interface GraphWorkspaceView {
  definition: GraphDefinition;
  runs: GraphRun[];
  availability: { available: boolean; reason?: string };
  /** Another live Host owns this workspace's graph metadata. */
  readOnly?: boolean;
}

export interface IGraphEngineeringService {
  validateDefinition(params: { definition: GraphDefinition }): Promise<GraphReadiness>;
  getWorkspace(target: GraphWorkspaceTarget): Promise<GraphWorkspaceView>;
  saveDefinition(params: {
    target: GraphWorkspaceTarget;
    definition: GraphDefinition;
    expectedRevision: number;
  }): Promise<GraphDefinition>;
  run(params: {
    target: GraphWorkspaceTarget;
    requestId: string;
    revision: number;
    modelSelection: ModelSelection;
    mode: SubmissionMode;
    planEnabled?: boolean;
  }): Promise<GraphRun>;
  cancel(params: { target: GraphWorkspaceTarget; runId: string }): Promise<GraphRun>;
  inspectRecovery(params: { target: GraphWorkspaceTarget; runId: string }): Promise<GraphRun>;
  releaseInterrupted(params: {
    target: GraphWorkspaceTarget;
    runId: string;
    reason: string;
    confirmed: boolean;
  }): Promise<GraphRun>;
  isSessionOwned(params: GraphWorkspaceTarget & { sessionId: string }): Promise<boolean>;
  readonly onDidChange: Event<{ workspaceKey: string }>;
}

export const IGraphEngineeringService = createServiceDescriptor<IGraphEngineeringService>(
  ServiceChannels.GraphEngineering,
);
