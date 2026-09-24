import type {
  GraphNodeAttempt,
  GraphResolvedBinding,
  GraphSequentialDefinition,
  GraphTaskNode,
} from "../contract.js";
import { GRAPH_RESOLVED_LIMIT } from "./sequential.js";
import type { GraphRunProvenance } from "../workflow-provenance.js";

export function resolveGraphInstructions(
  task: GraphTaskNode,
  graph: GraphSequentialDefinition,
  attempts: GraphNodeAttempt[],
  artifacts: GraphResolvedBinding[] = [],
  provenance?: GraphRunProvenance,
) {
  const references =
    graph.template?.references
      .filter((r) => r.nodeIds.includes(task.id))
      .map((r) => ({
        id: r.id,
        kind: r.kind,
        selected: graph.template!.bindings.references[r.id],
        ...(r.kind === "skill"
          ? { nativeSkillName: provenance?.references.find((ref) => ref.id === r.id)?.nativeName }
          : {}),
      })) ?? [];
  if (references.some((ref) => ref.kind === "skill" && !ref.nativeSkillName))
    throw new Error("The selected native skill name is missing from frozen provenance.");
  const suffix = references.length
    ? `\n\nExplicit native references (data): ${JSON.stringify(references)}\nRead document/instruction references through native Read. Load nativeSkillName through the existing native Skill tool; the selected catalog ID is provenance, not the Skill tool argument. Cite reference IDs; missing source is a question, never an invented rule.`
    : "";
  if (task.instructionMode === "literal")
    return {
      instructions: bounded(task.instructions + suffix),
      bindings: [] as GraphResolvedBinding[],
    };
  const bindings = task.inputs.map((binding): GraphResolvedBinding => {
    if (binding.source.kind === "artifact" || binding.source.kind === "repair-feedback") {
      const captured = artifacts.find(
        (a) =>
          a.alias === binding.alias && JSON.stringify(a.source) === JSON.stringify(binding.source),
      );
      if (!captured)
        throw new Error(`Input ${binding.alias}: the exact artifact was not validated.`);
      return captured;
    }
    if (binding.source.kind === "start") {
      const start = graph.nodes.find((n) => n.type === "start");
      if (start?.type !== "start" || !start.request.trim())
        throw new Error(`Input ${binding.alias}: Start text is missing.`);
      return { ...binding, text: start.request };
    }
    const source = binding.source;
    const attempt = attempts.find((a) => a.nodeId === source.nodeId);
    if (
      attempt?.status !== "Completed" ||
      attempt.terminalProof?.state !== "completedSuccess" ||
      !attempt.finalOutput?.text.trim() ||
      !attempt.sessionId
    )
      throw new Error(
        `Input ${binding.alias}: completed output from task ${source.nodeId} is unavailable.`,
      );
    return {
      ...binding,
      text: attempt.finalOutput.text,
      sourceSessionId: attempt.sessionId,
      sourceInputId: attempt.inputId,
      sourceCommandId: attempt.commandId,
    };
  });
  const values = new Map(bindings.map((b) => [b.alias, b.text]));
  const instructions = task.instructions.replace(
    /\{\{inputs\.([A-Za-z][A-Za-z0-9_]*)\}\}/g,
    (_token, alias: string) => {
      const text = values.get(alias);
      if (text === undefined) throw new Error(`Input ${alias} has no binding.`);
      return text;
    },
  );
  return { instructions: bounded(instructions + suffix), bindings };
}
function bounded(instructions: string): string {
  if (instructions.length > GRAPH_RESOLVED_LIMIT)
    throw new Error(`Resolved instructions exceed ${GRAPH_RESOLVED_LIMIT} characters.`);
  return instructions;
}
