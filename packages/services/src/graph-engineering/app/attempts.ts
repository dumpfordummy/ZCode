import type {
  GraphLegacyRun,
  GraphNodeAttempt,
  GraphRun,
  GraphSequentialRun,
} from "../contract.js";
import type { GraphNativeExecution } from "../app/ports.js";

export function nativeExecution(run: GraphRun, attemptId: string): GraphNativeExecution {
  if (run.version === undefined)
    return {
      id: run.attemptId,
      attemptId: run.attemptId,
      target: run.target,
      instructions: run.definition.instructions,
      modelSelection: run.modelSelection,
      mode: run.mode,
      planEnabled: run.planEnabled,
      commandId: run.commandId,
      inputId: run.inputId,
      createdAt: run.createdAt,
      sessionId: run.sessionId,
      runtimeIdentity: run.runtimeIdentity,
      foregroundExecutionId: run.foregroundExecutionId,
    };
  const node = run.nodeAttempts.find((a) => a.attemptId === attemptId);
  if (!node) throw new Error("Graph node attempt not found.");
  return {
    id: node.attemptId,
    attemptId: node.attemptId,
    target: run.target,
    instructions: node.resolvedInstructions ?? "",
    ...node.settings,
    commandId: node.commandId,
    inputId: node.inputId,
    createdAt: node.createdAt,
    sessionId: node.sessionId,
    runtimeIdentity: node.runtimeIdentity,
    foregroundExecutionId: node.foregroundExecutionId,
    observationEpoch: node.observationEpoch,
  };
}
export function activeAttempt(run: GraphRun): GraphNodeAttempt | GraphLegacyRun | undefined {
  if (run.version === undefined) return run;
  return run.nodeAttempts.find(
    (a) => a.dispatchPhase !== "planned" && !a.terminalProof && a.status !== "Skipped",
  );
}
export function skipPending(run: GraphSequentialRun, now: number): void {
  for (const condition of run.routing?.conditionAttempts ?? [])
    if (condition.status === "Pending") {
      condition.status = "Skipped";
      condition.updatedAt = now;
    }
  for (const tool of run.toolAttempts ?? [])
    if (tool.status === "Pending") {
      tool.status = "Skipped";
      tool.updatedAt = now;
    }
  for (const gate of run.approvalAttempts ?? [])
    if (gate.status === "Pending" || gate.status === "WaitingForApproval") {
      gate.status = "Skipped";
      gate.updatedAt = now;
    }
  for (const node of run.nodeAttempts)
    if (node.status === "Pending") {
      node.status = "Skipped";
      node.updatedAt = now;
    }
}
export function runFingerprint(value: unknown): string {
  const canonical = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(canonical);
    if (input && typeof input === "object")
      return Object.fromEntries(
        Object.entries(input)
          .filter(([, v]) => v !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, canonical(v)]),
      );
    return input;
  };
  return JSON.stringify(canonical(value));
}
