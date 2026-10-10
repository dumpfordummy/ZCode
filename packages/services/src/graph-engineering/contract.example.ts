import type { IGraphEngineeringService, GraphWorkspaceTarget } from "./contract.js";
import {
  graphRecipeCompatibility,
  graphRequiredRecipeKind,
  type IGraphWorkflowService,
} from "./workflow-contract.js";

/** The required role is a declaration, never evidence that a Test ran or passed. */
export function declaredCheckRole(
  definition: import("./contract.js").GraphSequentialDefinition,
  nodeId: string,
) {
  return graphRequiredRecipeKind(definition, nodeId);
}

/** Existing-only metadata: no cold runtime startup, recipe lookup or model admission. */
export function inspectGraphReferences(
  service: IGraphWorkflowService,
  target: GraphWorkspaceTarget,
) {
  return service.projectSetup({ action: "reference-catalog", target });
}

/**
 * Discovery reads bounded metadata only; it does not save or execute project checks.
 * A project candidate may expose `quick.assemblies[framework]` for literal Debug
 * SDK outputs. Absent hints or nonempty `quickIssues` require Advanced review;
 * callers must never fill the gap using a Test-like filename. Hints are not evidence.
 */
export async function discoverProjectChecks(
  service: IGraphWorkflowService,
  target: GraphWorkspaceTarget,
  requestId: string,
) {
  return service.projectSetup({ action: "scan", target, requestId });
}

/** A separate bounded scope job establishes membership, never Build/Test execution evidence. */
export function prepareSelectedProject(
  service: IGraphWorkflowService,
  target: GraphWorkspaceTarget,
  requestId: string,
  selectedProject: string,
) {
  return service.projectSetup({ action: "scan", target, requestId, selectedProject });
}

/** Static compatibility neither probes tools nor executes a saved project check. */
export function compatibleCheck(
  definition: import("./contract.js").GraphSequentialDefinition,
  nodeId: string,
  recipe: import("./contract.js").GraphRecipe,
) {
  return graphRecipeCompatibility(definition, nodeId, recipe);
}

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
