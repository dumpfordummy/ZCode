import type {
  GraphNodeAttempt,
  GraphResolvedBinding,
  GraphSequentialDefinition,
  GraphTaskNode,
} from "../contract.js";
import { GRAPH_RESOLVED_LIMIT } from "./sequential.js";
import type { GraphRunProvenance } from "../workflow-provenance.js";
import {
  graphInstructionParts,
  graphPromptReferences,
  graphReferenceSuffix,
} from "./prompt-parts.js";

export function resolveGraphInstructions(
  task: GraphTaskNode,
  graph: GraphSequentialDefinition,
  attempts: GraphNodeAttempt[],
  artifacts: GraphResolvedBinding[] = [],
  provenance?: GraphRunProvenance,
) {
  const references = graphPromptReferences(graph, task.id, provenance?.references);
  if (references.some((ref) => ref.kind === "skill" && !ref.nativeName))
    throw new Error("The selected native skill name is missing from frozen provenance.");
  if (
    graph.template?.bindings.referencePolicy === "native-aware-v1" &&
    references.some((reference) => !reference.delivery)
  )
    throw new Error("The selected reference delivery is missing from frozen provenance.");
  const suffix = graphReferenceSuffix(references);
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
  let length = suffix.length;
  const instructions = graphInstructionParts(task.instructions)
    .map((part) => {
      const text = part.kind === "text" ? part.text : values.get(part.alias);
      if (text === undefined && part.kind === "token")
        throw new Error(`Input ${part.alias} has no binding.`);
      length += text!.length;
      if (length > GRAPH_RESOLVED_LIMIT)
        throw new Error(`Resolved instructions exceed ${GRAPH_RESOLVED_LIMIT} characters.`);
      return text;
    })
    .join("");
  return { instructions: bounded(instructions + suffix), bindings };
}
function bounded(instructions: string): string {
  if (instructions.length > GRAPH_RESOLVED_LIMIT)
    throw new Error(`Resolved instructions exceed ${GRAPH_RESOLVED_LIMIT} characters.`);
  return instructions;
}
