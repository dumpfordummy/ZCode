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
