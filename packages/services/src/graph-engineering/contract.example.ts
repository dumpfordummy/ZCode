import type { IGraphEngineeringService, GraphWorkspaceTarget } from "./contract.js";

export async function inspectGraph(
  service: IGraphEngineeringService,
  target: GraphWorkspaceTarget,
) {
  const view = await service.getWorkspace(target);
  const latest = view.runs.at(-1);
  return {
    name: view.definition.name,
    latestSessionId:
      latest?.version === 2 ? latest.nodeAttempts.at(-1)?.sessionId : latest?.sessionId,
    readiness: await service.validateDefinition({ definition: view.definition }),
  };
}
