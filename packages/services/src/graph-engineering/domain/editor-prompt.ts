import type { GraphSequentialDefinition } from "../contract.js";
import type {
  GraphPromptPreview,
  GraphPromptReferenceMetadata,
  GraphPromptSegment,
} from "../editor-types.js";
import { graphContextCandidates, graphSourceKey } from "./editor-context.js";
import {
  graphInstructionParts,
  graphPromptReferences,
  graphReferenceSuffix,
} from "./prompt-parts.js";
import { GRAPH_RESOLVED_LIMIT, taskBindingErrors } from "./sequential.js";

/** A draft projection only: future output never becomes a fabricated successful attempt. */
export function previewGraphTaskPrompt(
  definition: GraphSequentialDefinition,
  nodeId: string,
  metadata?: GraphPromptReferenceMetadata,
): GraphPromptPreview {
  const task = definition.nodes.find((node) => node.id === nodeId);
  if (task?.type !== "task")
    return {
      kind: "draft",
      segments: [],
      bindings: [],
      references: [],
      issues: ["Select an existing Agent Task to preview its prompt."],
    };
  const context = graphContextCandidates(definition, nodeId);
  const references = graphPromptReferences(definition, nodeId, metadata);
  const issues = [
    ...context.issues,
    ...taskBindingErrors(
      task,
      new Set(definition.nodes.filter((node) => node.type === "task").map((node) => node.id)),
      new Set(
        definition.nodes
          .filter((node) => node.type === "task" || node.type === "tool")
          .map((node) => node.id),
      ),
    ),
  ];
  for (const reference of references) {
    if (!reference.selected) issues.push(`Reference ${reference.id} is not selected.`);
    if (reference.kind === "skill" && !reference.nativeName)
      issues.push(
        `Native skill name for ${reference.id} is unresolved until verified preparation.`,
      );
    if (definition.template?.bindings.referencePolicy === "native-aware-v1" && !reference.delivery)
      issues.push(`Reference ${reference.id} delivery is unresolved until verified preparation.`);
  }
  const suffix = graphReferenceSuffix(
    references,
    definition.template?.bindings.referencePolicy === "native-aware-v1",
  );
  const bindings: GraphPromptPreview["bindings"] = [];
  const segments: GraphPromptSegment[] = [];
  if (task.instructionMode === "literal") {
    if (task.instructions) segments.push({ kind: "text", text: task.instructions });
  } else {
    const start = definition.nodes.find((node) => node.type === "start");
    for (const binding of task.inputs) {
      const candidate = context.candidates.find(
        (item) => graphSourceKey(item.source) === graphSourceKey(binding.source),
      );
      if (candidate?.reason) issues.push(`Input ${binding.alias}: ${candidate.reason}`);
      const resolved =
        binding.source.kind === "start" &&
        start?.type === "start" &&
        Boolean(start.request.trim()) &&
        task.inputs.filter((item) => item.alias === binding.alias).length === 1;
      bindings.push({
        alias: binding.alias,
        source: structuredClone(binding.source),
        status: resolved ? "resolved-start" : "unresolved",
        ...(resolved ? { text: start!.request } : {}),
      });
    }
    const used = new Set<string>();
    for (const part of graphInstructionParts(task.instructions)) {
      if (part.kind === "text") {
        segments.push(part);
        continue;
      }
      if (used.has(part.alias))
        issues.push(
          `Input ${part.alias} occurs more than once; preserve or edit repeated tokens in Advanced.`,
        );
      used.add(part.alias);
      const binding = bindings.find((item) => item.alias === part.alias);
      if (binding?.status === "resolved-start")
        segments.push({ kind: "text", text: binding.text! });
      else
        segments.push({
          kind: "unresolved",
          alias: part.alias,
          token: part.token,
          reason: binding
            ? "Resolved only from the selected run's captured input or evidence at execution."
            : "This token has no explicit input binding.",
        });
    }
  }
  if (suffix) segments.push({ kind: "text", text: suffix });
  const length = segments.reduce(
    (total, part) => total + (part.kind === "text" ? part.text.length : part.token.length),
    0,
  );
  if (length > GRAPH_RESOLVED_LIMIT)
    issues.push(
      `Resolved instructions exceed ${GRAPH_RESOLVED_LIMIT} characters; preview is unavailable until the draft is reduced.`,
    );
  return {
    kind: "draft",
    segments: length > GRAPH_RESOLVED_LIMIT ? [] : segments,
    bindings,
    references,
    issues: [...new Set(issues)],
  };
}
