import type { GraphTemplateInstance, GraphRunProvenance } from "./workflow-provenance.js";
import type {
  GraphWorkspaceTarget,
  GraphNodeBase,
  GraphApprovalNode,
  GraphApprovalAttempt,
  GraphApprovalCommand,
} from "./approval-types.js";
export type {
  GraphWorkspaceTarget,
  GraphInputSource,
  GraphNodeBase,
  GraphApprovalNode,
  GraphApprovalAttempt,
  GraphApprovalCommand,
  GraphApprovalEvidenceSource,
  GraphApprovalRequest,
  GraphApprovalEvidence,
  GraphApprovalDecision,
  GraphSourceSnapshot,
} from "./approval-types.js";
import type { Event } from "@zcode/rpc";
import type { ModelSelection } from "@zcode/shared";
import type { SubmissionMode } from "@zcode/shared/zcode-protocol-v4";
import { ServiceChannels } from "@zcode/shared";
import { createServiceDescriptor } from "../descriptors.js";
import type {
  GraphArtifact,
  GraphJsonSchema,
  GraphRecipe,
  GraphRecipeSnapshot,
} from "./artifact-types.js";
import type {
  GraphArtifactContent,
  GraphArtifactRequest,
  GraphToolAttempt,
  GraphToolNode,
} from "./tool-types.js";
import type {
  GraphRunStatus,
  GraphDispatchPhase,
  GraphNativeSettings,
  GraphInputBinding,
  GraphTerminalProof,
  GraphFinalOutput,
} from "./base-types.js";
import type {
  GraphConditionNode,
  GraphRoutingDefinition,
  GraphRoutingState,
  GraphRunContinueCommand,
  GraphRunStartCommand,
} from "./routing-types.js";
export type * from "./routing-types.js";
export type {
  GraphRunStatus,
  GraphDispatchPhase,
  GraphNativeSettings,
  GraphInputBinding,
  GraphTerminalProof,
  GraphFinalOutput,
} from "./base-types.js";
export type * from "./artifact-types.js";
export type * from "./tool-types.js";

export interface GraphLegacyDefinition {
  version?: undefined;
  revision: number;
  name: string;
  taskName: string;
  instructions: string;
  nodes: Array<{ id: string; type: "start" | "task" | "end"; position: { x: number; y: number } }>;
  edges: Array<{ source: string; target: string }>;
}

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
  output?: { kind: "json"; schema: GraphJsonSchema };
}
export interface GraphEndNode extends GraphNodeBase {
  type: "end";
  outputNodeId: string | null;
}
export type GraphNode =
  | GraphStartNode
  | GraphTaskNode
  | GraphEndNode
  | GraphApprovalNode
  | GraphConditionNode
  | GraphToolNode;
export interface GraphSequentialDefinition {
  template?: GraphTemplateInstance;
  version: 2 | 3 | 4 | 5;
  revision: number;
  name: string;
  nodes: GraphNode[];
  edges: Array<{ source: string; target: string; sourcePort?: string }>;
  routing?: GraphRoutingDefinition;
}
export type GraphDefinition = GraphLegacyDefinition | GraphSequentialDefinition;
export interface GraphReadiness {
  errors: string[];
  path: string[];
}
export interface GraphResolvedBinding extends GraphInputBinding {
  text: string;
  sourceSessionId?: string;
  sourceInputId?: string;
  sourceCommandId?: string;
  artifactId?: string;
}
export interface GraphNodeAttempt {
  iterationId?: string;
  iteration?: number;
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
  outputValidation?: { status: "valid" | "invalid"; issues: string[] };
  message?: string;
}
export type GraphInactivityProof =
  | {
      kind: "tool-terminal";
      runtimeIdentity: string;
      sessionId: string;
      operationId: string;
      completedAt: number;
      status: "completed" | "failed" | "cancelled";
    }
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
  provenance?: GraphRunProvenance;
  version: 2 | 3 | 4 | 5;
  routing?: GraphRoutingState;
  id: string;
  requestId: string;
  requestFingerprint: string;
  target: GraphWorkspaceTarget;
  definition: GraphSequentialDefinition;
  defaults: GraphNativeSettings;
  plannedPath: string[];
  startInput: string;
  nodeAttempts: GraphNodeAttempt[];
  approvalAttempts?: GraphApprovalAttempt[];
  toolAttempts?: GraphToolAttempt[];
  artifacts?: GraphArtifact[];
  artifactBindings?: Array<{
    nodeId: string;
    attemptId: string;
    selector: string;
    artifactId: string;
  }>;
  status: GraphRunStatus;
  createdAt: number;
  updatedAt: number;
  message?: string;
  cancelRequestedAt?: number;
  result?: GraphFinalOutput;
  resultArtifactId?: string;
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
  recipes(
    params:
      | { target: GraphWorkspaceTarget; action: "read" }
      | {
          target: GraphWorkspaceTarget;
          action: "save";
          recipes: GraphRecipe[];
          expectedDigest: string;
        },
  ): Promise<GraphRecipeSnapshot>;
  artifact(
    params:
      | (GraphArtifactRequest & { action: "read" })
      | { target: GraphWorkspaceTarget; runId: string; action: "manifest" },
  ): Promise<(GraphArtifactContent & { kind: "content" }) | { kind: "manifest"; text: string }>;
  decideApproval(
    params: GraphApprovalCommand & {
      decisionId: string;
      value: "approve" | "reject";
      comment: string;
    },
  ): Promise<GraphRun>;
  continueApproval(params: GraphApprovalCommand): Promise<GraphRun>;
  validateDefinition(params: { definition: GraphDefinition }): Promise<GraphReadiness>;
  getWorkspace(target: GraphWorkspaceTarget): Promise<GraphWorkspaceView>;
  saveDefinition(params: {
    target: GraphWorkspaceTarget;
    definition: GraphDefinition;
    expectedRevision: number;
  }): Promise<GraphDefinition>;
  run(params: GraphRunStartCommand | GraphRunContinueCommand): Promise<GraphRun>;
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
