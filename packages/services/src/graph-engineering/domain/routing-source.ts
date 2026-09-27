import type { GraphInputSource, GraphSequentialDefinition } from "../contract.js";
import { routingTopology } from "./routing-topology.js";

/** Source rules shared by execution readiness and context selection; never resolves evidence. */
export function routingSourceErrors(
  graph: GraphSequentialDefinition,
  source: GraphInputSource,
  consumer: string,
  condition = false,
): string[] {
  const errors: string[] = [];
  if (source.kind === "repair-feedback") {
    if (consumer !== graph.routing?.region?.repairEntryNodeId || condition)
      errors.push("Repair feedback is only available to the declared repair entry.");
    return errors;
  }
  if (source.kind === "start") {
    const start = graph.nodes.find((node) => node.type === "start");
    if (start?.type !== "start" || !start.request.trim() || condition)
      errors.push(`Node ${consumer}: empty or unsupported Start binding.`);
    return errors;
  }
  const producer = graph.nodes.find((node) => node.id === source.nodeId);
  if (!producer || !routingTopology(graph).dominates(source.nodeId, consumer))
    errors.push(
      `Node ${consumer}: binding ${source.nodeId} is not available on every selected route.`,
    );
  if (source.kind === "node" && producer?.type !== "task")
    errors.push("Final text bindings must name an Agent Task.");
  if (source.kind === "artifact") {
    if (producer?.type !== "task" && producer?.type !== "tool")
      errors.push("Artifact bindings must name an executable node.");
    if (
      (condition || source.pointer) &&
      source.selector !== "structured" &&
      source.selector !== "verification"
    )
      errors.push("Typed routing bindings require structured or verification artifacts.");
    if (source.selector === "structured" && (producer?.type !== "task" || !producer.output))
      errors.push("Structured bindings require a configured structured Agent output.");
    if (source.selector === "verification" && producer?.type !== "tool")
      errors.push("Verification bindings require a native Test Tool.");
  }
  return errors;
}
