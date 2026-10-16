import type { IGraphEngineeringService } from "../contract.js";
import type { GraphState } from "./state.js";
import { localTarget, isConfirmedTerminal } from "../domain/definition.js";
import { parallelUnresolved } from "../domain/parallel.js";
import { currentWebInspections } from "./web-profile.js";
export async function projectRecipes(
  state: GraphState,
  params: Parameters<IGraphEngineeringService["recipes"]>[0],
) {
  const target = localTarget(params.target);
  return state.serial(target, async () => {
    const port = state.options.recipes;
    if (!port) throw new Error("Project recipes are unavailable.");
    const record = await state.load(target);
    if (params.action === "read") return port.read(target);
    await state.inspections.assertIdle(target);
    if (record.runs.some((r) => !isConfirmedTerminal(r)))
      throw new Error("Project recipe edits are blocked while a graph is unresolved.");
    if (record.parallel?.runs.some(parallelUnresolved))
      throw new Error("Project recipes are frozen while Fork/Join is unresolved.");
    const scopes = [
      ...new Map(
        params.recipes.flatMap((recipe) =>
          recipe.sourceScope?.version === 3
            ? [[recipe.sourceScope.preparationId, recipe.sourceScope] as const]
            : [],
        ),
      ).values(),
    ];
    for (const scope of scopes)
      await currentWebInspections(state, target, scope.inspectionIds, true);
    return port.save(target, params.recipes, params.expectedDigest);
  });
}
