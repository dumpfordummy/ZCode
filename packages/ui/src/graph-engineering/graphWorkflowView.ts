import type {
  GraphParameterValue,
  GraphPortableTemplate,
  GraphTemplateBindings,
  GraphTemplatePreview,
  GraphLibraryEntry,
  GraphTemplateVersion,
  GraphRecipeSnapshot,
} from "@zcode/services";
import { graphRecipeCompatibility } from "@zcode/services";

export function initialTemplateParameters(
  template: GraphPortableTemplate,
): Record<string, GraphParameterValue> {
  return Object.fromEntries(
    template.parameters.flatMap((parameter) =>
      parameter.default === undefined ? [] : [[parameter.id, parameter.default]],
    ),
  );
}

/** Editing a transfer invalidates its reviewed preview before any import can be accepted. */
export function reviewedTemplate(
  preview: GraphTemplatePreview | undefined,
  reviewed: boolean,
): GraphPortableTemplate | undefined {
  return reviewed && preview?.errors.length === 0 ? preview.template : undefined;
}

export function templateBindingErrors(
  template: GraphPortableTemplate,
  parameters: Record<string, GraphParameterValue>,
  bindings: GraphTemplateBindings,
  recipes?: GraphRecipeSnapshot | null,
): string[] {
  const missing = template.parameters
    .filter((item) => {
      const value = parameters[item.id];
      return (
        (item.required && (value === undefined || (typeof value === "string" && !value.trim()))) ||
        (value !== undefined &&
          (typeof value !== item.type || (typeof value === "number" && !Number.isFinite(value))))
      );
    })
    .map((item) => item.label);
  missing.push(
    ...template.references
      .filter((item) => item.required && !bindings.references[item.id]?.trim())
      .map((item) => item.label),
  );
  missing.push(
    ...template.graph.nodes
      .filter((node) => {
        if (node.type !== "tool") return false;
        const primary = bindings.recipes[node.id];
        const group = bindings.recipeGroups?.[node.id] ?? [primary];
        if (
          !primary?.trim() ||
          group[0] !== primary ||
          group.length > 8 ||
          new Set(group).size !== group.length
        )
          return true;
        if (recipes === undefined) return false;
        const choices = compatibleTemplateRecipes(template, node.id, recipes, bindings);
        const build = bindings.buildMappings?.[node.id];
        return (
          group.some((id) => !choices.some((recipe) => recipe.id === id)) ||
          Boolean(
            build &&
            !recipes?.recipes.some(
              (recipe) => recipe.id === bindings.recipes[build] && recipe.verifier.kind === "build",
            ),
          )
        );
      })
      .map((node) => ("name" in node ? node.name : node.id)),
  );
  if (template.graph.routing?.region && !bindings.sourcePaths.some((path) => path.trim()))
    missing.push("sourcePaths");
  return missing;
}

export function compatibleTemplateRecipes(
  template: GraphPortableTemplate,
  nodeId: string,
  snapshot: GraphRecipeSnapshot | null,
  bindings?: GraphTemplateBindings,
) {
  const sample = snapshot?.recipes[0];
  const definition =
    !sample || !bindings?.buildMappings
      ? template.graph
      : {
          ...template.graph,
          nodes: template.graph.nodes.map((node) => {
            const buildNodeId = bindings.buildMappings?.[node.id];
            return node.type === "tool" &&
              buildNodeId &&
              graphRecipeCompatibility(template.graph, node.id, sample).requiredKind === "test"
              ? { ...node, verification: { kind: "test" as const, buildNodeId } }
              : node;
          }),
        };
  return (snapshot?.recipes ?? []).filter(
    (recipe) => graphRecipeCompatibility(definition, nodeId, recipe).compatible,
  );
}

export function setTemplatePrimaryRecipe(
  bindings: GraphTemplateBindings,
  nodeId: string,
  recipeId: string,
): GraphTemplateBindings {
  const group = bindings.recipeGroups?.[nodeId];
  return {
    ...bindings,
    recipes: { ...bindings.recipes, [nodeId]: recipeId },
    ...(group && recipeId
      ? {
          recipeGroups: {
            ...bindings.recipeGroups,
            [nodeId]: [recipeId, ...group.filter((id) => id !== recipeId)],
          },
        }
      : {}),
  };
}

export function toggleTemplateTestRecipe(
  bindings: GraphTemplateBindings,
  nodeId: string,
  recipeId: string,
  checked: boolean,
): GraphTemplateBindings {
  const primary = bindings.recipes[nodeId];
  if (!primary || recipeId === primary) return bindings;
  const group = bindings.recipeGroups?.[nodeId] ?? [primary];
  return {
    ...bindings,
    recipeGroups: {
      ...bindings.recipeGroups,
      [nodeId]: checked
        ? [...group.filter((id) => id !== recipeId), recipeId]
        : group.filter((id) => id !== recipeId),
    },
  };
}

export function latestCompatibleTemplateVersion(
  entry: GraphLibraryEntry,
): GraphTemplateVersion | undefined {
  if (entry.archived) return;
  return entry.versions.reduce<GraphTemplateVersion | undefined>(
    (latest, version) =>
      version.template.format === "zcode-workflow" &&
      version.template.version === 1 &&
      version.template.graph.version === 5 &&
      (!latest || version.version > latest.version)
        ? version
        : latest,
    undefined,
  );
}
