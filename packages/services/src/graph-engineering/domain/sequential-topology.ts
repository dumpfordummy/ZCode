import type { GraphSequentialDefinition } from "../contract.js";

/** Shared structural projection; incomplete task text does not change edge availability. */
export function sequentialTopology(graph: GraphSequentialDefinition) {
  const errors: string[] = [];
  const starts = graph.nodes.filter((n) => n.type === "start");
  const ends = graph.nodes.filter((n) => n.type === "end");
  const tasks = graph.nodes.filter((n) => n.type === "task");
  const tools = graph.nodes.filter((n) => n.type === "tool");
  if (tools.length > 8) errors.push("At most eight Tool nodes are supported.");
  if (graph.nodes.filter((n) => n.type === "approval").length > 8)
    errors.push("At most eight Human Approval nodes are supported.");
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  if (byId.size !== graph.nodes.length) errors.push("Node identifiers must be unique.");
  if (
    starts.length !== 1 ||
    ends.length !== 1 ||
    (graph.version === 4 ? tasks.length + tools.length < 1 : tasks.length < 1) ||
    tasks.length > 8
  )
    errors.push("Connect exactly one Start, one to eight Agent Tasks, and one End.");
  const outgoing = new Map<string, string>();
  const incoming = new Map<string, string>();
  for (const edge of graph.edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target))
      errors.push("An edge references a missing node.");
    if (outgoing.has(edge.source) || incoming.has(edge.target))
      errors.push("Branches, merges and duplicate edges are not supported.");
    outgoing.set(edge.source, edge.target);
    incoming.set(edge.target, edge.source);
  }
  for (const node of graph.nodes) {
    if (
      (node.type !== "start") !== incoming.has(node.id) ||
      (node.type !== "end") !== outgoing.has(node.id)
    )
      errors.push(`Node ${node.id} has an incomplete or invalid connection.`);
  }
  const visited = new Set<string>();
  const path: string[] = [];
  let current = starts[0]?.id;
  while (current && byId.has(current) && !visited.has(current)) {
    visited.add(current);
    const node = byId.get(current)!;
    if (node.type === "task" || node.type === "approval" || node.type === "tool")
      path.push(node.id);
    current = outgoing.get(current);
  }
  if (current || visited.size !== graph.nodes.length || !ends[0] || !visited.has(ends[0].id))
    errors.push(
      "Every node must be on the same Start-to-End path without cycles or disconnected nodes.",
    );
  return { errors, path, byId, starts, ends, tasks, tools };
}
