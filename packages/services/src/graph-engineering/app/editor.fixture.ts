import type { GraphSequentialDefinition, GraphTaskNode } from "../contract.js";
import { builtinTemplates } from "../domain/workflow-samples.js";

export function editorFixture(id = "generic"): GraphSequentialDefinition {
  const graph = structuredClone(builtinTemplates.find((item) => item.id === id)!.template.graph);
  const start = graph.nodes.find((node) => node.type === "start")!;
  if (start.type === "start") start.request = "Frozen request {{inputs.future}}";
  return graph;
}

export function editorTask(graph: GraphSequentialDefinition, id: string): GraphTaskNode {
  const task = graph.nodes.find((node) => node.id === id);
  if (task?.type !== "task") throw new Error(`Missing fixture task ${id}.`);
  return task;
}
