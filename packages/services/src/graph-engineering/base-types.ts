import type { ModelSelection } from "@zcode/shared";
import type { SubmissionMode } from "@zcode/shared/zcode-protocol-v4";
import type { GraphInputSource } from "./approval-types.js";

export interface GraphNativeSettings {
  modelSelection: ModelSelection;
  mode: SubmissionMode;
  planEnabled: boolean;
}
export interface GraphInputBinding {
  alias: string;
  source: GraphInputSource;
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
export type GraphRunStatus =
  | "NeedsHuman"
  | "BudgetExhausted"
  | "NoProgress"
  | "Starting"
  | "Running"
  | "WaitingForPermission"
  | "WaitingForUser"
  | "WaitingForApproval"
  | "AwaitingContinuation"
  | "StaleEvidence"
  | "Rejected"
  | "CancelRequested"
  | "Completed"
  | "Failed"
  | "Cancelled"
  | "Interrupted"
  | "Unknown";
export type GraphDispatchPhase = "planned" | "creating" | "created" | "sending" | "accepted";
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
