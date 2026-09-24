import type { IZCodeAgentService, IZCodeSessionService } from "../../index.js";
import type { GraphToolPort } from "../app/ports.js";
import type { GraphToolAttempt, GraphWorkspaceTarget } from "../contract.js";

export function createGraphToolPort(options: {
  agentService: Pick<
    IZCodeAgentService,
    "getWorkspaceRuntimeIdentity" | "startRecipe" | "inspectRecipe" | "cancelRecipe"
  >;
  sessionService: Pick<IZCodeSessionService, "initializeWorkspace" | "createSession">;
}): GraphToolPort {
  const target = (workspace: GraphWorkspaceTarget, attempt: GraphToolAttempt) => {
    if (!attempt.sessionId || !attempt.runtimeIdentity)
      throw new Error("The original Tool session/runtime is unavailable.");
    return {
      ...workspace,
      sessionId: attempt.sessionId,
      expectedRuntimeIdentity: attempt.runtimeIdentity,
    };
  };
  return {
    async available() {
      return { available: true };
    },
    async create(workspace) {
      const initialized = await options.sessionService.initializeWorkspace({
        ...workspace,
        purpose: "native-recipe",
      });
      if (!initialized.available)
        throw new Error(initialized.reason ?? "Native command runtime is unavailable.");
      const before = await options.agentService.getWorkspaceRuntimeIdentity(workspace);
      const snapshot = await options.sessionService.createSession({
        ...workspace,
        purpose: "native-recipe",
        persistence: "deferred",
        mode: "edit",
      });
      const after = await options.agentService.getWorkspaceRuntimeIdentity(workspace);
      if (before.identity !== after.identity)
        throw new Error("Tool session runtime changed during creation.");
      return { sessionId: snapshot.session.sessionId, runtimeIdentity: after.identity };
    },
    async start(workspace, attempt) {
      if (!attempt.resolvedArgs) throw new Error("Frozen recipe arguments are missing.");
      return options.agentService.startRecipe({
        ...target(workspace, attempt),
        request: {
          operationId: attempt.operationId,
          recipe: {
            id: attempt.recipe.id,
            executable: attempt.recipe.executable,
            args: attempt.resolvedArgs,
            cwdRelative: attempt.recipe.cwd,
            timeoutMs: attempt.recipe.timeoutMs,
            ...(attempt.recipe.redactEnvironmentVariables
              ? { redactEnvironmentVariables: attempt.recipe.redactEnvironmentVariables }
              : {}),
          },
        },
      });
    },
    inspect(workspace, attempt) {
      return options.agentService.inspectRecipe({
        ...target(workspace, attempt),
        operationId: attempt.operationId,
      });
    },
    cancel(workspace, attempt) {
      return options.agentService.cancelRecipe({
        ...target(workspace, attempt),
        operationId: attempt.operationId,
      });
    },
  };
}
