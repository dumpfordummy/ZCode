import type { GraphSequentialDefinition } from "../contract.js";
import { predicateAliases } from "./routing-predicates.js";
import { routingTopology } from "./routing-topology.js";

/** The existing exclusive route structure, shared by readiness and draft projections. */
export function routingStructure(graph: GraphSequentialDefinition) {
  const errors: string[] = [];
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const starts = graph.nodes.filter((n) => n.type === "start"),
    ends = graph.nodes.filter((n) => n.type === "end");
  const routing = graph.routing,
    region = routing?.region;
  if (!routing || starts.length !== 1 || ends.length !== 1 || byId.size !== graph.nodes.length)
    return {
      errors: ["Routing requires unique nodes, one Start, one End and explicit limits/final gate."],
      structure: undefined,
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
  const topology = routingTopology(graph);
  const { dag, next, roots, reachable } = topology;
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
  for (const node of graph.nodes)
    if (!roots.some((root) => reachable(root, node.id)) || !reachable(node.id, ends[0]!.id))
      errors.push(`Node ${node.id} is outside a supported Start/repair-to-End route.`);
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
  return {
    errors,
    structure: { byId, starts, ends, routing, region, outgoing, incoming, ordered, ...topology },
  };
}
