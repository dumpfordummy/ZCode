import { isAbsolute, resolve } from "node:path";
import type { GraphRecipe, GraphSequentialDefinition, GraphWorkspaceTarget } from "../contract.js";
import type { ZCodeExecutionEnvironmentPreview } from "@zcode/shared";
import { routingTopology } from "../domain/routing-topology.js";

/** Only explicit recipe executable metadata; never invokes a command or scans arbitrary files. */
export function workflowToolQueries(
  target: GraphWorkspaceTarget,
  definition: GraphSequentialDefinition,
  recipes: GraphRecipe[],
) {
  const queries: string[] = [],
    pending: string[] = [];
  for (const node of definition.nodes) {
    if (node.type !== "tool") continue;
    const recipe = recipes.find((r) => r.id === node.recipeId);
    if (!recipe)
      throw new Error(`Node ${node.name}: choose an existing project recipe (${node.recipeId}).`);
    const executable =
      isAbsolute(recipe.executable) || /[\\/]/.test(recipe.executable)
        ? resolve(target.workspacePath, recipe.cwd, recipe.executable)
        : recipe.executable;
    const generatedByBuild = definition.nodes.some((predecessor) => {
      if (
        predecessor.type !== "tool" ||
        predecessor.id === node.id ||
        !routingTopology(definition).dominates(predecessor.id, node.id)
      )
        return false;
      const build = recipes.find((r) => r.id === predecessor.recipeId);
      return (
        build?.verifier.kind === "build" &&
        build.expectedOutputs.some((path) => resolve(target.workspacePath, path) === executable)
      );
    });
    if (generatedByBuild)
      pending.push(
        `Node ${node.name}: executable is a declared earlier Build output; actual creation remains verified by the existing native Build/Test evidence contract.`,
      );
    else if (!queries.includes(executable)) queries.push(executable);
  }
  return { queries, pending };
}
export function checkWorkflowTools(
  queries: string[],
  environment: ZCodeExecutionEnvironmentPreview,
): string[] {
  const unknowns: string[] = [];
  for (const executable of queries) {
    const result = environment.executables.find((item) => item.executable === executable);
    if (result?.status === "missing")
      throw new Error(
        `Required recipe executable is missing: ${executable}. Install/configure the selected project's tooling before starting a run.`,
      );
    if (!result || result.status === "unknown")
      unknowns.push(
        `Recipe executable availability is Unknown: ${executable}. Make an explicit operational decision; no probe command was run.`,
      );
  }
  return unknowns;
}
