import type {
  GraphDefinition,
  GraphLegacyRun,
  GraphNativeSettings,
  GraphNodeAttempt,
  GraphRun,
  GraphSequentialRun,
  GraphWorkspaceTarget,
} from "../contract.js";
import { runFingerprint } from "./attempts.js";
import type { GraphOptions } from "./state.js";
import { appendIteration, frozenRoutingConfiguration } from "./routing-plan.js";
import { routingTopology } from "../domain/routing-topology.js";

interface RunPlanInput {
  definition: GraphDefinition;
  target: GraphWorkspaceTarget;
  requestId: string;
  fingerprint: string;
  defaults: GraphNativeSettings;
  path: string[];
}

/** Build the immutable admission plan; GraphState remains the only persistence owner. */
export async function createRunPlan(
  options: GraphOptions,
  { definition, target, requestId, fingerprint, defaults, path }: RunPlanInput,
): Promise<GraphRun> {
  let run: GraphRun;
  const now = options.now();
  if (definition.version !== undefined) {
    if (definition.version >= 3 && !options.evidence)
      throw new Error("Native approval evidence service is unavailable.");
    const nodeAttempts: GraphNodeAttempt[] = [];
    for (const nodeId of path) {
      const node = definition.nodes.find((n) => n.id === nodeId)!;
      if (node.type !== "task") continue;
      const settings =
        node.configuration.kind === "inherit"
          ? { ...structuredClone(defaults), source: "workspace" as const }
          : {
              modelSelection: structuredClone(node.configuration.modelSelection),
              mode: node.configuration.mode,
              planEnabled: node.configuration.planEnabled,
              source: "node" as const,
            };
      await options.native.validateSelection(settings);
      const commandId = options.id();
      nodeAttempts.push({
        nodeId,
        attemptId: options.id(),
        commandId,
        inputId: commandId,
        status: "Pending",
        dispatchPhase: "planned",
        settings,
        createdAt: now,
        updatedAt: now,
      });
    }
    const start = definition.nodes.find((n) => n.type === "start")!;
    run = {
      version: definition.version,
      id: options.id(),
      requestId: requestId,
      requestFingerprint: fingerprint,
      target: structuredClone(target),
      definition: structuredClone(definition),
      defaults,
      plannedPath: path,
      startInput: start.type === "start" ? start.request : "",
      nodeAttempts,
      ...(definition.version >= 3
        ? {
            approvalAttempts: path.flatMap((nodeId) =>
              definition.nodes.find((n) => n.id === nodeId)?.type === "approval"
                ? [
                    {
                      nodeId,
                      attemptId: options.id(),
                      status: "Pending" as const,
                      createdAt: now,
                      updatedAt: now,
                    },
                  ]
                : [],
            ),
          }
        : {}),
      status: "Starting",
      createdAt: now,
      updatedAt: now,
    } satisfies GraphSequentialRun;
    if (definition.version >= 4) {
      const recipes = options.recipes;
      if (!recipes || !options.tools || !options.artifacts)
        throw new Error("Native Tool/artifact services are unavailable.");
      const configured = await recipes.read(target);
      run.toolAttempts = path.flatMap((nodeId) => {
        const node = definition.nodes.find((n) => n.id === nodeId)!;
        if (node.type !== "tool") return [];
        const recipe = configured.recipes.find((r) => r.id === node.recipeId);
        if (!recipe)
          throw new Error(`Tool ${node.name}: configured recipe ${node.recipeId} is missing.`);
        if (recipe.verifier.kind === "test") {
          const buildId = recipe.verifier.buildNodeId;
          const predecessor = definition.nodes.find((n) => n.id === buildId);
          if (
            predecessor?.type !== "tool" ||
            path.indexOf(buildId) >= path.indexOf(nodeId) ||
            configured.recipes.find((r) => r.id === predecessor.recipeId)?.verifier.kind !== "build"
          )
            throw new Error("Test recipe must select an earlier Build node in this frozen graph.");
          // 拓扑排序中的先后不等于每条分支都执行；初始与修复入口都必须经过同一 Build。
          if (definition.version === 5 && !routingTopology(definition).dominates(buildId, nodeId))
            throw new Error(
              "Test requires its configured Build on every initial and repair route.",
            );
        }
        return [
          {
            nodeId,
            attemptId: options.id(),
            operationId: options.id(),
            recipe: structuredClone(recipe),
            recipeDigest: options.evidence!.digest(runFingerprint(recipe)),
            status: "Pending" as const,
            dispatchPhase: "planned" as const,
            createdAt: now,
            updatedAt: now,
          },
        ];
      });
      run.artifacts = [];
      run.artifactBindings = [];
      if (definition.version === 5) {
        const routing = definition.routing!;
        const region = routing.region;
        for (const node of definition.nodes)
          if (node.type === "condition")
            for (const testNodeId of node.verification?.testNodeIds ?? [])
              if (
                run.toolAttempts.find((tool) => tool.nodeId === testNodeId)?.recipe.verifier
                  .kind !== "test"
              )
                throw new Error("Condition verification must reference a configured Test recipe.");
        if (region)
          for (const tool of run.toolAttempts) {
            if (
              region.bodyNodeIds.includes(tool.nodeId) &&
              runFingerprint(tool.recipe.sourcePaths) !== runFingerprint(region.sourcePaths)
            )
              throw new Error(
                "Region Build/Test recipes must declare the same ordered source paths as the region.",
              );
          }
        run.routing = {
          configurationDigest: "",
          recipeConfigurationDigest: configured.digest,
          currentIterationId: "",
          cursorNodeId: definition.edges.find((e) => e.source === start.id)!.target,
          iterations: [],
          conditionAttempts: [],
          admissions: 0,
          deadlineAt: now + routing.limits.deadlineMs,
          checkpoints: [],
          continuations: [],
        };
        const iteration = appendIteration(run, options);
        if (region)
          iteration.sourceDigest = (await recipes.fingerprint(target, region.sourcePaths)).digest;
        run.routing.configurationDigest = options.evidence!.digest(
          runFingerprint(frozenRoutingConfiguration(run)),
        );
      }
    }
  } else {
    await options.native.validateSelection(defaults);
    const commandId = options.id();
    run = {
      id: options.id(),
      attemptId: options.id(),
      requestId: requestId,
      target: structuredClone(target),
      definition: structuredClone(definition),
      ...defaults,
      commandId,
      inputId: commandId,
      status: "Starting",
      createdAt: now,
      updatedAt: now,
    } satisfies GraphLegacyRun;
  }
  return run;
}
