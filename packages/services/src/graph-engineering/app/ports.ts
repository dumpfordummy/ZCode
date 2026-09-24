import type { IDisposable } from "@zcode/rpc";
import type { GraphRun, GraphWorkspaceTarget, GraphDefinition } from "../contract.js";

export interface GraphRecord {
  definition: GraphDefinition;
  runs: GraphRun[];
}
export interface GraphRepository {
  acquireOwnership?(target: GraphWorkspaceTarget): Promise<boolean>;
  dispose?(): Promise<void>;
  read(target: GraphWorkspaceTarget): Promise<GraphRecord | null>;
  write(target: GraphWorkspaceTarget, record: GraphRecord): Promise<void>;
}
export interface GraphNativeFact {
  sourceCommandId: string;
  state: "running" | "completedSuccess" | "completedInterrupted" | "failed";
  waiting?: "permission" | "userInput";
  foregroundExecutionId?: string;
  logEpoch: string;
  seq: number;
}
export interface GraphNativePort {
  available(): Promise<{ available: boolean; reason?: string }>;
  validateSelection(run: Pick<GraphRun, "modelSelection" | "mode">): Promise<void>;
  create(run: GraphRun): Promise<{ sessionId: string; runtimeIdentity: string }>;
  observe(
    run: GraphRun,
    fact: (value: GraphNativeFact) => void,
    lost: (reason: string) => void,
  ): Promise<IDisposable>;
  send(run: GraphRun): Promise<{ accepted: boolean; reason?: string }>;
  cancel(run: GraphRun): Promise<void>;
  reconcile(run: GraphRun): Promise<"same-runtime" | "interrupted">;
}
