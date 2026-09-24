import type { IGraphEngineeringService, GraphWorkspaceTarget } from "./contract.js";

export async function inspectGraph(
  service: IGraphEngineeringService,
  target: GraphWorkspaceTarget,
) {
  const view = await service.getWorkspace(target);
  return { name: view.definition.name, latestSessionId: view.runs.at(-1)?.sessionId };
}
