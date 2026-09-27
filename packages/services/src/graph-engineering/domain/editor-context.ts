import type {
  GraphInputSource,
  GraphRecipeSnapshot,
  GraphSequentialDefinition,
} from "../contract.js";
import type {
  GraphContextCandidate,
  GraphContextEdit,
  GraphContextProjection,
} from "../editor-types.js";
import { graphRecipeCompatibility, graphRequiredRecipeKind } from "./recipe-compatibility.js";
import { routingSourceErrors } from "./routing-source.js";
import { routingStructure } from "./routing-structure.js";
import { sequentialTopology } from "./sequential-topology.js";
import { inputSourceSchema, sequentialDefinitionSchema } from "./sequential.js";
import { graphInstructionParts } from "./prompt-parts.js";

export function graphSourceKey(source: GraphInputSource): string {
  // 空 pointer 和未指定均表示完整 artifact；比较时合并，编辑时保留原声明字节。
  return JSON.stringify(
    source.kind === "artifact"
      ? [source.kind, source.nodeId, source.selector, source.pointer || null]
      : source.kind === "node"
        ? [source.kind, source.nodeId]
        : [source.kind],
  );
}

/** Static authoring choices; eligible producers are still unresolved future runtime facts. */
export function graphContextCandidates(
  definition: GraphSequentialDefinition,
  nodeId: string,
  recipes?: GraphRecipeSnapshot,
): GraphContextProjection {
  const task = definition.nodes.find((node) => node.id === nodeId);
  if (task?.type !== "task")
    return { candidates: [], issues: ["Select an existing Agent Task for context."] };
  const parsed = sequentialDefinitionSchema.safeParse(definition);
  const topology =
    definition.version === 5 ? routingStructure(definition) : sequentialTopology(definition);
  const issues = [
    ...(parsed.success ? [] : parsed.error.issues.map((issue) => issue.message)),
    ...topology.errors,
  ];
  const candidates: GraphContextCandidate[] = [];
  const add = (
    source: GraphInputSource,
    label: string,
    outputKind: GraphContextCandidate["outputKind"],
    unsupported?: string,
  ) => {
    const key = graphSourceKey(source);
    if (candidates.some((candidate) => graphSourceKey(candidate.source) === key)) return;
    let reason = unsupported;
    if (!reason && source.kind !== "start" && issues.length)
      reason = "Correct the graph topology before selecting dependent context.";
    if (!reason) {
      if (definition.version === 5) reason = routingSourceErrors(definition, source, nodeId)[0];
      else if (source.kind === "repair-feedback")
        reason = "Repair feedback requires a declared version-5 repair entry.";
      else if (source.kind === "start") {
        const start = definition.nodes.find((node) => node.type === "start");
        if (start?.type !== "start" || !start.request.trim())
          reason = "The Start request is empty.";
      } else {
        const path = "path" in topology ? topology.path : [];
        if (path.indexOf(source.nodeId) < 0 || path.indexOf(source.nodeId) >= path.indexOf(nodeId))
          reason = "Select an earlier producer on the same Start-to-End path.";
      }
    }
    candidates.push({
      source: structuredClone(source),
      label,
      outputKind,
      scope: source.kind === "start" || definition.version !== 5 ? "run" : "current-iteration",
      selectable: !reason,
      ...(reason ? { reason } : {}),
      aliases: task.inputs
        .filter((input) => graphSourceKey(input.source) === key)
        .map((input) => input.alias),
    });
  };
  add({ kind: "start" }, "Original request", "request");
  for (const producer of definition.nodes) {
    if (producer.type === "task") {
      add({ kind: "node", nodeId: producer.id }, producer.name || producer.id, "text");
      if (definition.version >= 4 && producer.output)
        add(
          { kind: "artifact", nodeId: producer.id, selector: "structured" },
          producer.name || producer.id,
          "structured",
        );
    }
    if (definition.version >= 4 && producer.type === "tool") {
      add(
        { kind: "artifact", nodeId: producer.id, selector: "command" },
        producer.name || producer.id,
        "command",
      );
      const configured = recipes?.recipes.find((recipe) => recipe.id === producer.recipeId);
      const compatibility = configured
        ? graphRecipeCompatibility(definition, producer.id, configured)
        : undefined;
      const required = graphRequiredRecipeKind(definition, producer.id);
      if (required === "test" || configured?.verifier.kind === "test")
        add(
          { kind: "artifact", nodeId: producer.id, selector: "verification" },
          producer.name || producer.id,
          "verification",
          producer.verification?.kind === "build"
            ? "A Build-only step cannot supply configured Test verification evidence."
            : compatibility && !compatibility.compatible
              ? compatibility.issues.join(" ")
              : undefined,
        );
    }
  }
  if (definition.version === 5)
    add({ kind: "repair-feedback" }, "Current repair feedback", "repair");
  for (const binding of task.inputs) {
    if (
      candidates.some(
        (candidate) => graphSourceKey(candidate.source) === graphSourceKey(binding.source),
      )
    )
      continue;
    const source = binding.source;
    const producer =
      source.kind === "node" || source.kind === "artifact"
        ? definition.nodes.find((node) => node.id === source.nodeId)
        : undefined;
    add(
      source,
      producer && "name" in producer ? producer.name : binding.alias,
      source.kind === "start"
        ? "request"
        : source.kind === "repair-feedback"
          ? "repair"
          : source.kind === "node"
            ? "text"
            : source.selector === "verification"
              ? "verification"
              : "structured",
      producer
        ? "This explicit source uses an Advanced selector or pointer; preserve and edit it in Advanced."
        : "This selected source is unavailable; correct it explicitly in Advanced.",
    );
  }
  return { candidates, issues: [...new Set(issues)] };
}

/** Apply one explicit chip edit to the canonical draft, never to an execution record. */
export function addGraphContextBinding(
  definition: GraphSequentialDefinition,
  nodeId: string,
  source: GraphInputSource,
  recipes?: GraphRecipeSnapshot,
): GraphContextEdit {
  inputSourceSchema.parse(source);
  const original = definition.nodes.find((node) => node.id === nodeId);
  if (original?.type !== "task") throw new Error("Select an existing Agent Task for context.");
  // literal 中的花括号原本不是语法；自动切换会重解释用户文本，必须由 Advanced 明确处理。
  if (original.instructionMode === "literal" && /\{\{|\}\}/.test(original.instructions))
    throw new Error(
      "Literal instructions contain braces; edit their meaning explicitly in Advanced before adding context.",
    );
  const candidate = graphContextCandidates(definition, nodeId, recipes).candidates.find(
    (item) => graphSourceKey(item.source) === graphSourceKey(source),
  );
  if (!candidate?.selectable)
    throw new Error(
      candidate?.reason ?? "This context source is not supported by the guided editor.",
    );
  const existing = original.inputs.find(
    (input) => graphSourceKey(input.source) === graphSourceKey(source),
  );
  let alias = existing?.alias;
  if (!alias) {
    if (original.inputs.length >= 16)
      throw new Error("An Agent Task supports at most sixteen context bindings.");
    const base =
      source.kind === "start"
        ? "request"
        : source.kind === "repair-feedback"
          ? "feedback"
          : source.kind === "artifact"
            ? source.selector
            : "result";
    alias = base;
    let index = 2;
    while (original.inputs.some((input) => input.alias === alias)) alias = `${base}${index++}`;
  }
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(alias))
    throw new Error("Correct the selected alias in Advanced before adding its token.");
  const tokenExists = graphInstructionParts(original.instructions).some(
    (part) => part.kind === "token" && part.alias === alias,
  );
  const changed = !existing || !tokenExists || original.instructionMode !== "bound";
  const next = structuredClone(definition);
  const task = next.nodes.find((node) => node.id === nodeId)!;
  if (task.type !== "task") throw new Error("Select an existing Agent Task for context.");
  task.instructionMode = "bound";
  if (!existing) task.inputs.push({ alias, source: structuredClone(source) });
  if (!tokenExists) task.instructions += `\n\n{{inputs.${alias}}}`;
  sequentialDefinitionSchema.parse(next);
  return { definition: next, alias, changed };
}
