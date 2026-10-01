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

/**
 * Z8.2：指令解析契约。1 = z7.5 及更早（没有 evidence 契约后缀）；2 = 当前。
 * 新准备的 attempt 一律写 `instructionContract: 2`；没有标记表示“旧数据、未标记”，从不写 1。
 */
export type GraphInstructionContract = 1 | 2;
export const GRAPH_INSTRUCTION_CONTRACT_CURRENT = 2 satisfies GraphInstructionContract;

/**
 * 一个已冻结的 attempt 允许用哪些契约重建期望指令。标记为 2 的只能用 2（没有回退）；
 * 未标记的数据可能由两种已知写入方产生，依次尝试 2、1，每次都要求完整、逐字相等。
 * 未知标记值返回空数组（schema 已先行拒绝；这里是第二道失败关闭）。
 */
export function instructionContractsFor(attempt: {
  instructionContract?: number;
}): GraphInstructionContract[] {
  if (attempt.instructionContract === undefined) return [GRAPH_INSTRUCTION_CONTRACT_CURRENT, 1];
  return attempt.instructionContract === GRAPH_INSTRUCTION_CONTRACT_CURRENT
    ? [GRAPH_INSTRUCTION_CONTRACT_CURRENT]
    : [];
}

export function resolveGraphInstructions(
  task: GraphTaskNode,
  graph: GraphSequentialDefinition,
  attempts: GraphNodeAttempt[],
  artifacts: GraphResolvedBinding[] = [],
  provenance?: GraphRunProvenance,
  contract: GraphInstructionContract = GRAPH_INSTRUCTION_CONTRACT_CURRENT,
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
  // 对于声明了 evidenceReferences 结构化输出的节点，把该 attempt 实际允许引用的证据
  // artifact ID 显式追加到提示中；模型只能从该清单选取，校验层据此拒绝越界引用。
  const evidenceSuffix = contract >= 2 ? graphEvidenceContractSuffix(task, bindings) : "";
  let length = suffix.length + evidenceSuffix.length;
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
  return { instructions: bounded(instructions + suffix + evidenceSuffix), bindings };
}
function graphEvidenceContractSuffix(
  task: GraphTaskNode,
  bindings: GraphResolvedBinding[],
): string {
  if (task.output?.kind !== "json") return "";
  const schema = task.output.schema;
  if (
    schema.type !== "object" ||
    !Object.prototype.hasOwnProperty.call(schema.properties, "evidenceReferences")
  )
    return "";
  const permitted = bindings
    .filter((binding) => binding.source.kind === "artifact" && binding.artifactId)
    .map((binding) => binding.artifactId!);
  return `\n\nPermitted evidence artifact IDs for evidenceReferences: ${JSON.stringify(permitted)}\nReturn exactly one JSON object: no prose before or after, no Markdown fence, no additional properties. evidenceReferences must contain only IDs from the permitted list above. A failed Test can never be pass. A passing Test is evidence, not a guarantee of correctness; return needs_changes only for a concrete issue grounded in the supplied request and evidence, otherwise pass. Do not invent acceptance criteria the request did not state; in particular, do not require Git-tracked or committed source unless an explicit supplied criterion says so. Unsupported uncertainty must be needs_human, not an invented blocking rule. Do not edit files or run commands.`;
}
function bounded(instructions: string): string {
  if (instructions.length > GRAPH_RESOLVED_LIMIT)
    throw new Error(`Resolved instructions exceed ${GRAPH_RESOLVED_LIMIT} characters.`);
  return instructions;
}
