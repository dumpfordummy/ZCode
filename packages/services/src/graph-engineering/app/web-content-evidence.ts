import type { GraphRecipe } from "../artifact-types.js";
import type { GraphRecipePort } from "./ports.js";
import type { GraphWorkspaceTarget } from "../approval-types.js";
/** Copied mirrors preserve source mtimes. They are byte associations, never freshly generated outputs. */
export function associatedBuildPaths(recipe: GraphRecipe): string[] {
  return [
    ...new Set([
      ...recipe.expectedOutputs,
      ...(recipe.sourceScope?.version === 3
        ? recipe.sourceScope.copiedContent.map((row) => row.output)
        : []),
    ]),
  ];
}
export async function assertCopiedContent(
  store: Pick<GraphRecipePort, "fingerprint">,
  target: GraphWorkspaceTarget,
  recipe: GraphRecipe,
) {
  if (recipe.sourceScope?.version !== 3 || !recipe.sourceScope.copiedContent.length) return;
  const pairs = recipe.sourceScope.copiedContent;
  const result = await store.fingerprint(target, [
    ...new Set(pairs.flatMap((row) => [row.source, row.output])),
  ]);
  for (const pair of pairs) {
    const source = result.files.find((file) => file.path === pair.source),
      output = result.files.find((file) => file.path === pair.output);
    if (!source || !output || source.bytes !== output.bytes || source.digest !== output.digest)
      throw Error(`Copied Web Content differs from its freshly observed source: ${pair.output}.`);
  }
}
