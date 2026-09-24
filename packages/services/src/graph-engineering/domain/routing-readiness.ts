import type {
  GraphInputSource,
  GraphSequentialDefinition,
  GraphConditionNode,
} from "../contract.js";
import { predicateAliases } from "./routing-predicates.js";
import { routingTopology } from "./routing-topology.js";

/** Pure exclusive-DAG validation. The one declared repair edge is the only removable cycle. */
export function routingReadiness(graph: GraphSequentialDefinition) {
  const errors: string[] = [];
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const starts = graph.nodes.filter((n) => n.type === "start"),
    ends = graph.nodes.filter((n) => n.type === "end");
  const routing = graph.routing,
    region = routing?.region;
  if (!routing || starts.length !== 1 || ends.length !== 1 || byId.size !== graph.nodes.length)
    return {
      errors: ["Routing requires unique nodes, one Start, one End and explicit limits/final gate."],
      path: [],
    };
  if (byId.get(routing.finalGateId)?.type !== "approval")
    errors.push("Routing requires a final Human Approval node.");
  for (const type of ["task", "tool", "approval", "condition"] as const)
    if (graph.nodes.filter((n) => n.type === type).length > 8)
      errors.push(`At most eight ${type} nodes are supported.`);
  if (!graph.nodes.some((n) => n.type === "task" || n.type === "tool"))
    errors.push("A routed graph requires an executable node.");
  const outgoing = new Map<string, typeof graph.edges>(),
    incoming = new Map<string, typeof graph.edges>();
  const seen = new Set<string>();
  for (const edge of graph.edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target))
      errors.push("An edge references a missing node.");
    const key = `${edge.source}\0${edge.sourcePort ?? ""}\0${edge.target}`;
    if (seen.has(key)) errors.push("Duplicate routing edge.");
    seen.add(key);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge]);
  }
  for (const node of graph.nodes) {
    const exits = outgoing.get(node.id) ?? [];
    if (node.type === "condition") {
      const names = [...node.branches.map((b) => b.exit), node.defaultExit];
      if (
        !node.name.trim() ||
        new Set(names).size !== names.length ||
        exits.length !== names.length ||
        names.some((port) => exits.filter((e) => e.sourcePort === port).length !== 1)
      )
        errors.push(`Condition ${node.id} requires one edge per distinct named exit.`);
      const aliases = node.inputs.map((b) => b.alias);
      if (
        new Set(aliases).size !== aliases.length ||
        node.branches.some((b) => predicateAliases(b.predicate).some((a) => !aliases.includes(a)))
      )
        errors.push(`Condition ${node.id} references missing/duplicate input aliases.`);
      if (
        node.verification &&
        (!names.includes(node.verification.successExit) ||
          new Set(node.verification.testNodeIds).size !== node.verification.testNodeIds.length)
      )
        errors.push(`Condition ${node.id} has invalid verification exits or test references.`);
    } else if (
      exits.length !== (node.type === "end" ? 0 : 1) ||
      exits.some((e) => e.sourcePort !== undefined)
    )
      errors.push(`Node ${node.id} requires exactly one unlabelled successor, except End.`);
    if (
      node.type === "start"
        ? (incoming.get(node.id)?.length ?? 0) !== 0
        : !incoming.get(node.id)?.length
    )
      errors.push(`Node ${node.id} has invalid incoming edges.`);
  }
  const { isBack, dag, next, roots, reachable, dominates } = routingTopology(graph);
  const indegree = new Map(
    graph.nodes.map((n) => [n.id, dag.filter((e) => e.target === n.id).length]),
  );
  const queue = graph.nodes.filter((n) => !indegree.get(n.id)).map((n) => n.id),
    ordered: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    ordered.push(id);
    for (const child of next(id)) {
      indegree.set(child, indegree.get(child)! - 1);
      if (indegree.get(child) === 0) queue.push(child);
    }
  }
  if (ordered.length !== graph.nodes.length)
    errors.push("Only the declared decision-to-repair edge may form a cycle.");
  for (const node of graph.nodes) {
    if (!roots.some((root) => reachable(root, node.id)) || !reachable(node.id, ends[0]!.id))
      errors.push(`Node ${node.id} is outside a supported Start/repair-to-End route.`);
  }
  for (const root of roots)
    if (reachable(root, ends[0]!.id, routing.finalGateId))
      errors.push("Every success path to End must pass the required final Human Approval.");
  // 最终批准必须覆盖全部原生执行结果；仅支配 End 仍会允许批准后再次修改或执行。
  if (
    graph.nodes.some(
      (node) =>
        (node.type === "task" || node.type === "tool") && reachable(routing.finalGateId, node.id),
    )
  )
    errors.push("Final Human Approval must follow all native executable work on every End path.");
  const validateSource = (source: GraphInputSource, consumer: string, condition = false) => {
    if (source.kind === "repair-feedback") {
      if (consumer !== region?.repairEntryNodeId || condition)
        errors.push("Repair feedback is only available to the declared repair entry.");
      return;
    }
    if (source.kind === "start") {
      if (!starts[0]!.request.trim() || condition)
        errors.push(`Node ${consumer}: empty or unsupported Start binding.`);
      return;
    }
    const producer = byId.get(source.nodeId);
    if (!producer || !dominates(source.nodeId, consumer))
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
