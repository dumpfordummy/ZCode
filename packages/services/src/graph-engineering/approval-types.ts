export interface GraphWorkspaceTarget {
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
}

export interface GraphArtifactSource {
  kind: "artifact";
  nodeId: string;
  selector: string;
  /** Empty/omitted selects the whole bounded content; otherwise strict JSON Pointer. */
  pointer?: string;
}
export type GraphInputSource =
  | { kind: "repair-feedback" }
  | { kind: "start" }
  | { kind: "node"; nodeId: string }
  | GraphArtifactSource;

export interface GraphNodeBase {
  id: string;
  position: { x: number; y: number };
}

export type GraphApprovalEvidenceSource = GraphInputSource | { kind: "source" };
export interface GraphApprovalNode extends GraphNodeBase {
  type: "approval";
  name: string;
  reviewInstructions: string;
  evidence: Array<{ alias: string; source: GraphApprovalEvidenceSource }>;
  commentPolicy: "optional" | "required";
}

/** Bounded native Git source snapshot. Ignored/unchanged file contents are not captured. */
export interface GraphSourceSnapshot {
  baseline: string;
  scope: string;
  files: Array<{
    path: string;
    status: string;
    beforeText?: string;
    afterText?: string;
    diff?: string;
    issue?: string;
  }>;
  complete: boolean;
  issues: string[];
}
export interface GraphApprovalEvidence {
  alias: string;
  source: GraphApprovalEvidenceSource;
  digest: string;
  text?: string;
  snapshot?: GraphSourceSnapshot;
  sourceSessionId?: string;
  sourceInputId?: string;
  sourceCommandId?: string;
  artifactId?: string;
  issue?: string;
}
export interface GraphApprovalRequest {
  id: string;
  version: number;
  runId: string;
  nodeId: string;
  attemptId: string;
  target: GraphWorkspaceTarget;
  graphDigest: string;
  digest: string;
  title: string;
  reviewText: string;
  commentPolicy: "optional" | "required";
  successorNodeId: string | null;
  evidence: GraphApprovalEvidence[];
  complete: boolean;
  issues: string[];
  createdAt: number;
}
export interface GraphApprovalDecision {
  id: string;
  requestId: string;
  requestVersion: number;
  requestDigest: string;
  value: "approve" | "reject";
  comment: string;
  decidedAt: number;
  actor: { kind: "local-user"; hostSessionId: string };
}
export interface GraphApprovalAttempt {
  iterationId?: string;
  iteration?: number;
  nodeId: string;
  attemptId: string;
  status: "Pending" | "WaitingForApproval" | "Approved" | "Rejected" | "StaleEvidence" | "Skipped";
  createdAt: number;
  updatedAt: number;
  request?: GraphApprovalRequest;
  decision?: GraphApprovalDecision;
  successorIntent?: { id: string; successorNodeId: string | null };
  resumeRequired?: boolean;
  message?: string;
}
export interface GraphApprovalCommand {
  target: GraphWorkspaceTarget;
  runId: string;
  nodeId: string;
  requestId: string;
  requestVersion: number;
  requestDigest: string;
}
