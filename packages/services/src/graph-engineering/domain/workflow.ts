import type {
  GraphPortableTemplate,
  GraphTemplatePreview,
  GraphTemplateVersion,
} from "../workflow-contract.js";
import type { GraphParameterValue, GraphTemplateBindings } from "../workflow-provenance.js";
import type { GraphSequentialDefinition } from "../contract.js";
import { portableTemplateSchema } from "./workflow-schema.js";
import { templateBindingsSchema } from "./workflow-provenance-schema.js";
import { validateReadiness } from "./definition.js";

function portableLiterals(value: unknown): void {
  if (typeof value === "string") {
    if (
      /(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\|\/(?:Users|home|tmp|private|etc)\/|(?:api[_-]?key|password|secret|token)\s*[:=]\s*\S|Authorization\s*:\s*Bearer)/i.test(
        value,
      )
    )
      throw new Error(
        "Portable content contains a possible secret or private absolute path. Remove it and review the preview.",
      );
  } else if (Array.isArray(value)) value.forEach(portableLiterals);
  else if (value && typeof value === "object") Object.values(value).forEach(portableLiterals);
}
export function validatePortable(value: unknown): GraphPortableTemplate {
  const parsed = portableTemplateSchema.parse(value);
  portableLiterals(parsed);
  // 空 Start 是未绑定的正常模板；用审阅占位文本验证真实图结构，不执行。
  const graph = structuredClone(parsed.graph);
  for (const node of graph.nodes)
    if (node.type === "start") node.request = "Unresolved template request";
  const ready = validateReadiness(graph);
  if (ready.errors.length) throw new Error(ready.errors.join("\n"));
  return parsed;
}
export function templatePreview(
  template: GraphPortableTemplate,
  diagnostics: string[] = [],
): GraphTemplatePreview {
  return {
    template,
    json: JSON.stringify(template, null, 2),
    errors: [],
    diagnostics: [
      "Review all portable instructions before importing/exporting. No configuration was installed or executed.",
      ...diagnostics,
    ],
    unresolved: [
      ...template.parameters.filter((p) => p.required).map((p) => `Parameter: ${p.id}`),
      ...template.references.map(
        (r) => `${r.required ? "Required" : "Optional"} ${r.kind}: ${r.id}`,
      ),
      ...template.graph.nodes
        .filter((n) => n.type === "tool")
        .map((n) => `Project recipe: ${n.id}`),
      ...(template.graph.routing?.region ? ["Repair region source paths"] : []),
    ],
  };
}
export function previewTemplate(json: string): GraphTemplatePreview {
  try {
    if (typeof json !== "string" || json.length > 256_000)
      throw new Error("Template exceeds the 256 KB transfer limit.");
    return templatePreview(validatePortable(JSON.parse(json)));
  } catch (error) {
    return {
      errors: [error instanceof Error ? error.message : "Invalid template"],
      diagnostics: [],
      unresolved: [],
    };
  }
}
export function captureTemplate(
  definition: GraphSequentialDefinition,
  name: string,
  description: string,
): GraphTemplatePreview {
  const graph = structuredClone(definition);
  delete graph.template;
  graph.revision = 0;
  graph.name = name;
  for (const node of graph.nodes) {
    if (node.type === "start") node.request = "";
    if (node.type === "task") node.configuration = { kind: "inherit" };
    if (node.type === "tool") node.recipeId = node.id;
  }
  if (graph.routing?.region) graph.routing.region.sourcePaths = ["source"];
  const preview = previewTemplate(
    JSON.stringify({
      format: "zcode-workflow",
      version: 1,
      name,
      description,
      graph,
      parameters: [{ id: "request", label: "Run request", type: "string", required: true }],
      references: [],
      optionalNodes: [],
    }),
  );
  preview.diagnostics.push(
    "Removed Start request, template/local bindings, node model overrides and concrete recipe/source-path bindings. No run history or artifacts are included.",
  );
  return preview;
}
export function instantiateTemplate(
  id: string,
  selected: GraphTemplateVersion,
  supplied: Record<string, GraphParameterValue>,
  local: GraphTemplateBindings,
): GraphSequentialDefinition {
  const template = validatePortable(selected.template),
    bindings = templateBindingsSchema.parse(local);
  const parameters: Record<string, GraphParameterValue> = {};
  if (Object.keys(supplied).some((key) => !template.parameters.some((p) => p.id === key)))
    throw new Error("Undeclared template parameter.");
  for (const param of template.parameters) {
    const value = supplied[param.id] ?? param.default;
    if (value === undefined || (typeof value === "string" && !value.trim())) {
      if (param.required) throw new Error(`Required parameter ${param.id} is missing.`);
      continue;
    }
    if (
      typeof value !== param.type ||
      (typeof value === "string" && value.length > 12000) ||
      (typeof value === "number" && !Number.isFinite(value))
    )
      throw new Error(`Invalid parameter ${param.id}.`);
    parameters[param.id] = value;
  }
  if (Boolean(parameters.mathTarget) !== Boolean(parameters.samplingRule))
    throw new Error(
      "Math/RTP comparison requires both an approved target and a sampling/acceptance rule; otherwise leave both unspecified.",
    );
  if (
    Object.keys(bindings.references).some((key) => !template.references.some((r) => r.id === key))
  )
    throw new Error("Undeclared reference binding.");
  if (
    Object.keys(bindings.recipes).some(
      (key) => !template.graph.nodes.some((n) => n.type === "tool" && n.id === key),
    )
  )
    throw new Error("Undeclared recipe binding.");
  for (const ref of template.references)
    if (ref.required && !bindings.references[ref.id]?.trim())
      throw new Error(`Required ${ref.kind} reference ${ref.id} is missing.`);
  const graph = structuredClone(template.graph),
    excluded: Array<{ nodeId: string; reason: string }> = [];
  for (const optional of template.optionalNodes) {
    if (parameters[optional.parameterId] !== false) continue;
    const incoming = graph.edges.filter((e) => e.target === optional.nodeId),
      outgoing = graph.edges.filter((e) => e.source === optional.nodeId);
    if (incoming.length !== 1 || outgoing.length !== 1)
      throw new Error("Optional task must have one predecessor and successor.");
    graph.nodes = graph.nodes.filter((n) => n.id !== optional.nodeId);
    graph.edges = graph.edges.filter(
      (e) => e.source !== optional.nodeId && e.target !== optional.nodeId,
    );
    graph.edges.push({ source: incoming[0]!.source, target: outgoing[0]!.target });
    excluded.push({
      nodeId: optional.nodeId,
      reason: `${optional.parameterId}=false: explicitly not applicable for this run.`,
    });
  }
  for (const node of graph.nodes) {
    if (node.type === "start")
      node.request = `Explicit workflow parameters (data, never command interpolation):\n${JSON.stringify(parameters, null, 2)}\nExcluded behavior: ${JSON.stringify(excluded)}\nRTP comparison is N/A unless both an approved target and sampling/acceptance rule are supplied.`;
    if (node.type === "tool") {
      if (!bindings.recipes[node.id])
        throw new Error(`Required project recipe for ${node.id} is missing.`);
      node.recipeId = bindings.recipes[node.id]!;
    }
  }
  if (graph.routing?.region) {
    if (!bindings.sourcePaths.length)
      throw new Error("Required repair-region source paths are missing.");
    graph.routing.region.sourcePaths = [...bindings.sourcePaths];
  }
  graph.template = {
    id,
    name: template.name,
    version: selected.version,
    digest: selected.digest,
    parameters,
    bindings: structuredClone(bindings),
    references: template.references
      .filter((r) => Boolean(bindings.references[r.id]))
      .map(({ id, kind, nodeIds }) => ({
        id,
        kind,
        nodeIds: nodeIds.filter((id) => !excluded.some((e) => e.nodeId === id)),
      })),
    excluded,
  };
  const ready = validateReadiness(graph);
  if (ready.errors.length) throw new Error(ready.errors.join("\n"));
  return graph;
}
