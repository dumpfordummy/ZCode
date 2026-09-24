import type {
  GraphNodeAttempt,
  GraphResolvedBinding,
  GraphSequentialDefinition,
  GraphTaskNode,
} from "../contract.js";
import { GRAPH_RESOLVED_LIMIT } from "./sequential.js";

export function resolveGraphInstructions(
  task: GraphTaskNode,
  graph: GraphSequentialDefinition,
  attempts: GraphNodeAttempt[],
) {
  if (task.instructionMode === "literal")
    return { instructions: task.instructions, bindings: [] as GraphResolvedBinding[] };
  const bindings = task.inputs.map((binding): GraphResolvedBinding => {
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
  if (instructions.length > GRAPH_RESOLVED_LIMIT)
    throw new Error(`Resolved instructions exceed ${GRAPH_RESOLVED_LIMIT} characters.`);
  return { instructions, bindings };
}
