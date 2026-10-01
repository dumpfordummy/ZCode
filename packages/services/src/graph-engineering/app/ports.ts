import type { IDisposable } from "@zcode/rpc";
import type {
  GraphRun,
  GraphWorkspaceTarget,
  GraphDefinition,
  GraphFinalOutput,
  GraphInactivityProof,
  GraphSourceSnapshot,
} from "../contract.js";
import type {
  GraphArtifactStore,
  GraphRecipeSnapshot,
  GraphRecipe,
  GraphToolAttempt,
  GraphToolOperation,
  GraphFileObservation,
  GraphTrxReport,
  GraphDotnetTestTarget,
} from "../contract.js";
import type { ModelSelection } from "@zcode/shared";
import type { SubmissionMode } from "@zcode/shared/zcode-protocol-v4";

export interface GraphEvidencePort {
  captureSource(target: GraphWorkspaceTarget): Promise<GraphSourceSnapshot>;
  digest(value: string): string;
}
export interface GraphRecipePort {
  read(target: GraphWorkspaceTarget): Promise<GraphRecipeSnapshot>;
  save(
    target: GraphWorkspaceTarget,
    recipes: GraphRecipe[],
    expectedDigest: string,
  ): Promise<GraphRecipeSnapshot>;
  fingerprint(
    target: GraphWorkspaceTarget,
    paths: string[],
  ): Promise<{ digest: string; files: Array<{ path: string; bytes: number; digest: string }> }>;
  validatePaths(target: GraphWorkspaceTarget, paths: string[]): Promise<void>;
  observeFiles(target: GraphWorkspaceTarget, paths: string[]): Promise<GraphFileObservation[]>;
}
export interface GraphToolPort {
  available(): Promise<{ available: boolean; reason?: string }>;
  create(target: GraphWorkspaceTarget): Promise<{ sessionId: string; runtimeIdentity: string }>;
  start(target: GraphWorkspaceTarget, attempt: GraphToolAttempt): Promise<GraphToolOperation>;
  inspect(target: GraphWorkspaceTarget, attempt: GraphToolAttempt): Promise<GraphToolOperation>;
  cancel(target: GraphWorkspaceTarget, attempt: GraphToolAttempt): Promise<GraphToolOperation>;
}
export interface GraphArtifactOptions {
  reports?: {
    captureTrx(
      target: GraphWorkspaceTarget,
      path: string,
      scope: GraphDotnetTestTarget,
      startedAt: number,
      completedAt: number,
    ): Promise<{
      content: string;
      original: { digest: string; bytes: number; modifiedAt: number };
      report?: GraphTrxReport;
      issue?: string;
    }>;
  };
  artifacts?: GraphArtifactStore;
  recipes?: GraphRecipePort;
  tools?: GraphToolPort;
}

export interface GraphRecord {
  parallel?: import("../parallel-contract.js").GraphParallelRecord;
  parallelParent?: { target: GraphWorkspaceTarget; runId: string; slot: string };
  definition: GraphDefinition;
  runs: GraphRun[];
}
export interface GraphInputGuardRequest extends GraphWorkspaceTarget {
  sessionId: string;
  commandId?: string;
  commandType: string;
  expectedRuntimeIdentity?: string;
  envelope?: { clientId: string; payload: unknown };
  request?: unknown;
}
export interface GraphRepository {
  acquireOwnership?(target: GraphWorkspaceTarget): Promise<boolean>;
  dispose?(): Promise<void>;
  read(target: GraphWorkspaceTarget): Promise<GraphRecord | null>;
  write(target: GraphWorkspaceTarget, record: GraphRecord): Promise<void>;
  /**
   * 冷加载对账会改写既有记录之前调用：保存最近一次 read 的原始磁盘字节。
   * 失败必须抛出（对账随之中止，原记录不变）。不建模磁盘字节的测试替身可以不实现。
   */
  snapshotBeforeReconcile?(target: GraphWorkspaceTarget): Promise<unknown>;
}
export interface GraphNativeFact {
  sourceCommandId: string;
  state: "running" | "completedSuccess" | "completedInterrupted" | "failed";
  waiting?: "permission" | "userInput";
  foregroundExecutionId?: string;
  logEpoch: string;
  seq: number;
  turnId?: string;
  finalOutput?: GraphFinalOutput;
  outputIssue?: string;
}
/** One native attempt; this is a call DTO, never a second state owner. */
export interface GraphNativeExecution {
  id: string;
  attemptId: string;
  target: GraphWorkspaceTarget;
  instructions: string;
  modelSelection: ModelSelection;
  mode: SubmissionMode;
  planEnabled?: boolean;
  commandId: string;
  inputId: string;
  createdAt: number;
  sessionId?: string;
  runtimeIdentity?: string;
  foregroundExecutionId?: string;
  observationEpoch?: string;
}
export type GraphNativeInspection =
  | { kind: "inactive"; proof: GraphInactivityProof; fact?: GraphNativeFact }
  | { kind: "active"; fact: GraphNativeFact }
  | { kind: "unknown"; reason: string };
export interface GraphNativePort {
  available(): Promise<{ available: boolean; reason?: string }>;
  validateSelection(run: Pick<GraphNativeExecution, "modelSelection" | "mode">): Promise<void>;
  create(run: GraphNativeExecution): Promise<{ sessionId: string; runtimeIdentity: string }>;
  observe(
    run: GraphNativeExecution,
    fact: (value: GraphNativeFact) => void,
    lost: (reason: string) => void,
  ): Promise<IDisposable>;
  send(run: GraphNativeExecution): Promise<{ accepted: boolean; reason?: string }>;
  cancel(run: GraphNativeExecution): Promise<void>;
  reconcile(run: GraphNativeExecution): Promise<"same-runtime" | "interrupted">;
  inspect(run: GraphNativeExecution): Promise<GraphNativeInspection>;
}
