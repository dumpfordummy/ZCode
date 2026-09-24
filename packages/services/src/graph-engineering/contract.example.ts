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
      latest?.version !== undefined ? latest.nodeAttempts.at(-1)?.sessionId : latest?.sessionId,
    readiness: await service.validateDefinition({ definition: view.definition }),
  };
}

/** Invocation belongs only to an explicit user action after reading this exact request. */
export async function approveDisplayedRequest(
  service: IGraphEngineeringService,
  request: import("./contract.js").GraphApprovalRequest,
  decisionId: string,
  comment: string,
) {
  return service.decideApproval({
    target: request.target,
    runId: request.runId,
    nodeId: request.nodeId,
    requestId: request.id,
    requestVersion: request.version,
    requestDigest: request.digest,
    decisionId,
    value: "approve",
    comment,
  });
}
