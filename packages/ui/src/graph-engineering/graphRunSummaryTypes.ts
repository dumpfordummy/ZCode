import type {
  GraphApprovalDecision,
  GraphNode,
  GraphRunStatus,
  GraphSourceSnapshot,
  GraphToolVerification,
  GraphWorkspaceTarget,
} from "@zcode/services";

export interface GraphRunCheck {
  nodeId: string;
  name: string;
  attemptId?: string;
  kind: "command" | "build" | "test";
  state: "not-run" | "command-result" | "passed" | "failed" | "invalid";
  status?: string;
  verification?: GraphToolVerification;
  artifactIds: string[];
  /** Stable projection issue codes. Native diagnostics remain in verification.issues. */
  issues: string[];
}
export interface GraphRunEvidence {
  state:
    | "no-tests"
    | "not-run"
    | "agent-reported"
    | "command-only"
    | "tests-passed"
    | "tests-failed"
    | "invalid";
  configuredTestCount: number;
  checks: GraphRunCheck[];
  issues: string[];
}
export interface GraphRunStep {
  nodeId: string;
  name: string;
  kind: GraphNode["type"];
  attemptId?: string;
  status?: string;
}
export interface GraphRunSession {
  nodeId: string;
  name: string;
  attemptId: string;
  sessionId: string;
  kind: "task" | "tool";
  status: string;
}
export interface GraphRunGate {
  nodeId: string;
  name: string;
  attemptId?: string;
  status?: string;
  /**
   * Derived from gate facts and the run outcome, never from one status label.
   * not-reached: no request yet and the run is still active.
   * not-requested: the run settled without dispatching this gate.
   * unknown: request/decision issues, or the run outcome itself is unresolved.
   */
  state: "pending" | "not-reached" | "not-requested" | "approved" | "rejected" | "unknown";
  requestId?: string;
  requestVersion?: number;
  requestDigest?: string;
  complete: boolean;
  decision?: GraphApprovalDecision;
  canDecide: boolean;
  canContinue: boolean;
  issues: string[];
}
export interface GraphRunSourceChange {
  nodeId: string;
  attemptId: string;
  requestId: string;
  alias: string;
  capturedAt: number;
  snapshot: GraphSourceSnapshot;
}
export interface GraphRunSummary {
  runId: string;
  target: GraphWorkspaceTarget;
  requestText: string;
  result:
    | { kind: "text"; text: string }
    | { kind: "artifact"; artifactId: string }
    | { kind: "absent" };
  execution: { status: GraphRunStatus; currentStep?: GraphRunStep; stopRequested: boolean };
  evidence: GraphRunEvidence;
  human: {
    state:
      | "not-required"
      | "pending"
      | "not-reached"
      | "not-requested"
      | "approved"
      | "rejected"
      | "unknown";
    gates: GraphRunGate[];
    issues: string[];
  };
  sourceChanges: GraphRunSourceChange[];
  actionableSessions: GraphRunSession[];
  checkpoint?: { id: string; digest: string; successorNodeId: string };
}
