import type { ZCodeRecipeRequest } from "@zcode/shared";
import type { GraphToolAttempt } from "../tool-types.js";
/** One exact frozen request builder shared by Host dispatch and its one-use input guard. */
export function graphToolRequest(attempt: GraphToolAttempt): ZCodeRecipeRequest {
  if (!attempt.resolvedArgs) throw Error("Frozen recipe arguments are missing.");
  const scope = attempt.recipe.sourceScope;
  return {
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
    ...(scope?.version === 3
      ? {
          webProfile: {
            policy: scope.policy,
            webProject: scope.webProject,
            testProject: scope.project,
            configuration: scope.configuration,
            kind: attempt.recipe.verifier.kind === "build" ? ("build" as const) : ("test" as const),
            runtimeProfile: scope.runtimeProfile,
          },
        }
      : {}),
  };
}
