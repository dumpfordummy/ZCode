import type {
  GraphInactivityProof,
  GraphLegacyRun,
  GraphNodeAttempt,
  GraphRun,
  GraphSequentialRun,
  GraphTerminalProof,
} from "../contract.js";
import { resolveGraphInstructions } from "./bindings.js";
import { workspaceKey } from "./definition.js";

type Attempt = GraphLegacyRun | GraphNodeAttempt;
const RELEASABLE_STATUSES = new Set(["Interrupted", "Unknown", "CancelRequested"]);
const PRE_SEND_PHASES = new Set(["planned", "creating", "created"]);
const PRE_SEND_STATUSES = new Set([
  "Pending",
  "Skipped",
  "Starting",
  "Unknown",
  "Interrupted",
  "Failed",
]);

function sameTerminal(left: GraphTerminalProof, right: GraphTerminalProof): boolean {
  return (
    left.sourceCommandId === right.sourceCommandId &&
    left.state === right.state &&
    left.logEpoch === right.logEpoch &&
    left.seq === right.seq &&
    left.turnId === right.turnId
  );
}

function proofMatches(run: GraphRun, attempt: Attempt, proof: GraphInactivityProof): boolean {
  if (proof.kind === "never-submitted") {
    return (
      "dispatchPhase" in attempt &&
      proof.commandId === attempt.commandId &&
      proof.dispatchPhase === attempt.dispatchPhase &&
      PRE_SEND_PHASES.has(attempt.dispatchPhase) &&
      PRE_SEND_STATUSES.has(attempt.status) &&
      !attempt.terminalProof &&
      !attempt.finalOutput &&
      !attempt.observationEpoch &&
      !attempt.foregroundExecutionId
    );
  }
  if (!attempt.runtimeIdentity || proof.runtimeIdentity !== attempt.runtimeIdentity) return false;
  if (proof.kind === "runtime-retired") {
    return (
      proof.workspaceKey === workspaceKey(run.target) &&
      (!("dispatchPhase" in attempt) || attempt.dispatchPhase !== "planned")
    );
  }
  if (
    !attempt.sessionId ||
    proof.sessionId !== attempt.sessionId ||
    proof.commandId !== attempt.commandId ||
    proof.inputId !== attempt.inputId ||
    proof.terminalProof.sourceCommandId !== attempt.commandId
  )
    return false;
  if (
    "dispatchPhase" in attempt &&
    (PRE_SEND_PHASES.has(attempt.dispatchPhase) ||
      !proof.terminalProof.turnId?.trim() ||
      (attempt.observationEpoch !== undefined &&
        attempt.observationEpoch !== proof.terminalProof.logEpoch))
  )
    return false;
  return !attempt.terminalProof || sameTerminal(attempt.terminalProof, proof.terminalProof);
}

function bindingsMatch(run: GraphSequentialRun, attempt: GraphNodeAttempt): boolean {
  if (attempt.resolvedInstructions === undefined && attempt.bindings === undefined) return true;
  if (attempt.resolvedInstructions === undefined || attempt.bindings === undefined) return false;
  const task = run.definition.nodes.find((node) => node.id === attempt.nodeId);
  if (task?.type !== "task") return false;
  try {
    const expected = resolveGraphInstructions(task, run.definition, run.nodeAttempts);
    return (
      expected.instructions === attempt.resolvedInstructions &&
      expected.bindings.length === attempt.bindings.length &&
      expected.bindings.every((binding, index) => {
        const stored = attempt.bindings![index]!;
        return (
          binding.alias === stored.alias &&
          binding.source.kind === stored.source.kind &&
          (binding.source.kind !== "node" ||
            (stored.source.kind === "node" && binding.source.nodeId === stored.source.nodeId)) &&
          binding.text === stored.text &&
          binding.sourceSessionId === stored.sourceSessionId &&
          binding.sourceInputId === stored.sourceInputId &&
          binding.sourceCommandId === stored.sourceCommandId
        );
      })
    );
  } catch {
    return false;
  }
}

/** A release lifts guards on read, so its evidence must identify the complete original run. */
export function releaseAuditErrors(run: GraphRun): string[] {
  if (!run.release) return [];
  const errors: string[] = [];
  const attempts: Attempt[] = run.version === 2 ? run.nodeAttempts : [run];
  const inspection = run.release.inspection;
  const proofs = new Map(inspection.attempts.map((attempt) => [attempt.attemptId, attempt]));
  // 旧实现只验证存在一个 inactive 项；复制别的任务证明就可能在冷读时错误释放所有输入。
  if (!RELEASABLE_STATUSES.has(run.status) || inspection.state !== "inactive") {
    errors.push("Graph release requires an unresolved run and inactive inspection.");
  }
  if (
    inspection.attempts.length !== attempts.length ||
    proofs.size !== attempts.length ||
    attempts.some((attempt) => !proofs.has(attempt.attemptId))
  ) {
    errors.push("Graph release must cover every original attempt exactly once.");
  }
  for (const attempt of attempts) {
    const entry = proofs.get(attempt.attemptId);
    if (
      !entry ||
      entry.state !== "inactive" ||
      !entry.proof ||
      !proofMatches(run, attempt, entry.proof)
    ) {
      errors.push(`Graph release evidence does not match attempt ${attempt.attemptId}.`);
    }
  }
  if (run.version === 2 && run.nodeAttempts.some((attempt) => !bindingsMatch(run, attempt))) {
    errors.push("Graph release contains changed resolved instructions or handoff source evidence.");
  }
  return errors;
}
