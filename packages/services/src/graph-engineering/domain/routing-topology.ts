import type { GraphSequentialDefinition } from "../contract.js";

/** Shared exclusive DAG: each repair starts at its entry after removing only its declared back edge. */
export function routingTopology(graph: GraphSequentialDefinition) {
  const region = graph.routing?.region;
  const isBack = (edge: (typeof graph.edges)[number]) =>
    Boolean(
      region &&
      edge.source === region.decisionNodeId &&
      edge.sourcePort === region.repairExit &&
      edge.target === region.repairEntryNodeId,
    );
  const dag = graph.edges.filter((edge) => !isBack(edge));
  const next = (id: string) => dag.filter((edge) => edge.source === id).map((edge) => edge.target);
  const roots = [
    ...graph.nodes.filter((node) => node.type === "start").map((node) => node.id),
    ...(region ? [region.repairEntryNodeId] : []),
  ];
  const reachable = (from: string, target: string, avoid?: string): boolean => {
    const queue = [from],
      visited = new Set<string>();
    while (queue.length) {
      const id = queue.shift()!;
      if (id === avoid || visited.has(id)) continue;
      if (id === target) return true;
      visited.add(id);
      queue.push(...next(id));
    }
    return false;
  };
  const dominates = (source: string, consumer: string) =>
    source !== consumer &&
    roots.every((root) => !reachable(root, consumer) || !reachable(root, consumer, source));
  return { isBack, dag, next, roots, reachable, dominates };
}
