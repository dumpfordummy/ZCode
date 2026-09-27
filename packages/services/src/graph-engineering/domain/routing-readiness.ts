import type {
  GraphInputSource,
  GraphSequentialDefinition,
  GraphConditionNode,
} from "../contract.js";
import { routingStructure } from "./routing-structure.js";
import { routingSourceErrors } from "./routing-source.js";

/** Pure exclusive-DAG validation. The one declared repair edge is the only removable cycle. */
export function routingReadiness(graph: GraphSequentialDefinition) {
  const { errors, structure } = routingStructure(graph);
  if (!structure) return { errors, path: [] };
  const {
    byId,
    starts,
    ends,
    routing,
    region,
    outgoing,
    incoming,
    ordered,
    isBack,
    reachable,
    dominates,
  } = structure;
  const validateSource = (source: GraphInputSource, consumer: string, condition = false) => {
    errors.push(...routingSourceErrors(graph, source, consumer, condition));
  };
  for (const node of graph.nodes) {
    if (node.type === "task" || node.type === "condition")
      for (const binding of node.inputs)
        validateSource(binding.source, node.id, node.type === "condition");
    if (node.type === "approval")
      for (const binding of node.evidence)
        if (binding.source.kind !== "source") validateSource(binding.source, node.id);
    if (node.type === "condition" && node.verification) {
      for (const id of node.verification.testNodeIds) {
        if (byId.get(id)?.type !== "tool" || !dominates(id, node.id))
          errors.push(`Condition ${node.id}: Test evidence must precede every selected route.`);
        if (
          !node.inputs.some(
            (b) =>
              b.source.kind === "artifact" &&
              b.source.nodeId === id &&
              b.source.selector === "verification" &&
              !b.source.pointer,
          )
        )
          errors.push(
            `Condition ${node.id}: explicitly bind each whole Test verification artifact.`,
          );
      }
      if (node.verification.reviewerNodeId) {
        const reviewer = byId.get(node.verification.reviewerNodeId);
        if (reviewer?.type !== "task" || !reviewer.output || !dominates(reviewer.id, node.id))
          errors.push(`Condition ${node.id}: reviewer must provide preceding structured output.`);
        if (
          !node.inputs.some(
            (b) =>
              b.source.kind === "artifact" &&
              b.source.nodeId === node.verification!.reviewerNodeId &&
              b.source.selector === "structured" &&
              !b.source.pointer,
          )
        )
          errors.push(
            `Condition ${node.id}: explicitly bind the whole structured reviewer artifact.`,
          );
      }
    }
  }
  if (
    !ends[0]!.outputNodeId ||
    !dominates(ends[0]!.outputNodeId, ends[0]!.id) ||
    !["task", "tool"].includes(byId.get(ends[0]!.outputNodeId)?.type ?? "")
  )
    errors.push("End output must name an executable result available on every route.");
  if (region) {
    const body = new Set(region.bodyNodeIds),
      decision = byId.get(region.decisionNodeId);
    if (
      body.size !== region.bodyNodeIds.length ||
      new Set(region.sourcePaths).size !== region.sourcePaths.length ||
      body.has(routing.finalGateId) ||
      region.entryNodeId === region.repairEntryNodeId ||
      region.repairExit === region.passExit ||
      graph.edges.filter(isBack).length !== 1 ||
      byId.get(region.entryNodeId)?.type !== "task" ||
      byId.get(region.repairEntryNodeId)?.type !== "task" ||
      decision?.type !== "condition" ||
      ![region.entryNodeId, region.repairEntryNodeId, region.decisionNodeId].every((id) =>
        body.has(id),
      )
    )
      errors.push("Repair region identities, entries or declared back edge are invalid.");
    if (decision?.type === "condition") {
      if (
        !decision.verification?.reviewerNodeId ||
        decision.verification.successExit !== region.passExit ||
        !decision.verification.testNodeIds.every((id) => body.has(id)) ||
        !body.has(decision.verification.reviewerNodeId)
      )
        errors.push(
          "Repair decision requires current region machine evidence and a structured reviewer.",
        );
      validateReviewer(decision, graph, errors);
      for (const edge of outgoing.get(decision.id) ?? [])
        if (edge.sourcePort !== region.repairExit && body.has(edge.target))
          errors.push("Region decision exits must leave the body except its declared repair exit.");
    }
    const repair = byId.get(region.repairEntryNodeId);
    if (
      repair?.type !== "task" ||
      repair.instructionMode !== "bound" ||
      !repair.inputs.some((b) => b.source.kind === "repair-feedback")
    )
      errors.push("Repair entry requires an explicit bound repair-feedback input.");
    for (const id of body) {
      if (
        !byId.has(id) ||
        !["task", "tool", "condition", "approval"].includes(byId.get(id)?.type ?? "") ||
        ![region.entryNodeId, region.repairEntryNodeId].some((root) => reachable(root, id)) ||
        !reachable(id, region.decisionNodeId)
      )
        errors.push(`Region node ${id} must lie on an entry-to-decision path.`);
      for (const edge of outgoing.get(id) ?? [])
        if (id !== region.decisionNodeId && !body.has(edge.target))
          errors.push("Repair body cannot escape before its decision.");
      for (const edge of incoming.get(id) ?? [])
        if (!body.has(edge.source) && id !== region.entryNodeId)
          errors.push("Only the initial entry admits external edges into a repair region.");
    }
    if (
      !reachable(starts[0]!.id, region.entryNodeId) ||
      (incoming.get(region.repairEntryNodeId) ?? []).some((e) => !isBack(e))
    )
      errors.push("Repair entry may only be reached through the declared decision edge.");
  }
  return {
    errors: [...new Set(errors)],
    path: errors.length
      ? []
      : ordered.filter((id) => !["start", "end"].includes(byId.get(id)!.type)),
  };
}
function validateReviewer(
  decision: GraphConditionNode,
  graph: GraphSequentialDefinition,
  errors: string[],
) {
  const reviewer = graph.nodes.find((n) => n.id === decision.verification?.reviewerNodeId);
  const schema = reviewer?.type === "task" ? reviewer.output?.schema : undefined;
  if (schema?.type !== "object") return;
  const outcome = schema.properties.outcome,
    findings = schema.properties.findings,
    refs = schema.properties.evidenceReferences;
  if (
    !schema.required.includes("outcome") ||
    !schema.required.includes("findings") ||
    !schema.required.includes("evidenceReferences") ||
    outcome?.type !== "string" ||
    outcome.enum?.length !== 3 ||
    !["pass", "needs_changes", "needs_human"].every((v) => outcome.enum?.includes(v)) ||
    findings?.type !== "array" ||
    findings.items.type !== "object" ||
    findings.items.properties.code?.type !== "string" ||
    findings.items.properties.message?.type !== "string" ||
    refs?.type !== "array" ||
    refs.items.type !== "string"
  )
    errors.push(
      "Region reviewer schema requires typed outcome, findings and exact evidenceReferences.",
    );
  if (reviewer?.type === "task")
    for (const id of decision.verification!.testNodeIds)
      if (
        !reviewer.inputs.some(
          (b) =>
            b.source.kind === "artifact" &&
            b.source.nodeId === id &&
            b.source.selector === "verification" &&
            !b.source.pointer,
        )
      )
        errors.push("Reviewer must explicitly bind every current whole verification artifact.");
}
