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

export interface GraphDefinition {
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

export interface GraphRun {
  id: string;
  attemptId: string;
  requestId: string;
  target: GraphWorkspaceTarget;
  definition: GraphDefinition;
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
}

export interface GraphWorkspaceView {
  definition: GraphDefinition;
  runs: GraphRun[];
  availability: { available: boolean; reason?: string };
  /** Another live Host owns this workspace's graph metadata. */
  readOnly?: boolean;
}

export interface IGraphEngineeringService {
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
  isSessionOwned(params: GraphWorkspaceTarget & { sessionId: string }): Promise<boolean>;
  readonly onDidChange: Event<{ workspaceKey: string }>;
}

export const IGraphEngineeringService = createServiceDescriptor<IGraphEngineeringService>(
  ServiceChannels.GraphEngineering,
);
