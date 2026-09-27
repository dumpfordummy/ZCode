import { z } from "zod";
import type { GraphChecksSelection } from "../checks-types.js";
import type { GraphRecipe, GraphSequentialDefinition } from "../contract.js";
import { graphRecipeSchema, validateGraphRecipes } from "./artifact-schemas.js";
import { isDotnetExecutable } from "./dotnet-command.js";
import { validateReadiness } from "./definition.js";

const id = z.string().min(1).max(128);
export const checksSelectionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("recipes"),
      recipeIds: z.array(id).min(1).max(8),
      buildMappings: z
        .record(id, id)
        .refine(
          (value) => Object.keys(value).length <= 8,
          "At most eight check mappings are supported.",
        ),
    })
    .strict(),
  z
    .object({
      kind: z.literal("dotnet-probe"),
      executable: z.string().min(1).max(1024),
      cwd: z.string().min(1).max(1024),
    })
    .strict(),
]);
export function compileChecksDefinition(
  input: GraphChecksSelection,
  configured: GraphRecipe[],
  revision: number,
) {
  const selection = checksSelectionSchema.parse(input);
  if (selection.kind === "dotnet-probe" && !isDotnetExecutable(selection.executable))
    throw new Error(
      "The .NET probe accepts only a dotnet executable and the fixed --version argument.",
    );
  const recipes =
    selection.kind === "dotnet-probe"
      ? [
          graphRecipeSchema.parse({
            id: "dotnet-version-probe",
            name: ".NET SDK version",
            executable: selection.executable,
            args: ["--version"],
            cwd: selection.cwd,
            timeoutMs: 30000,
            sourcePaths: [],
            expectedOutputs: [],
            verifier: { kind: "command" },
          }),
        ]
      : selection.recipeIds.map((id) => {
          const recipe = configured.find((r) => r.id === id);
          if (!recipe) throw new Error(`Selected saved check is missing: ${id}.`);
          return structuredClone(recipe);
        });
  if (new Set(recipes.map((r) => r.id)).size !== recipes.length)
    throw new Error("Select unique saved recipe identities.");
  validateGraphRecipes(recipes);
  const definition: GraphSequentialDefinition = {
    version: 4,
    revision,
    name: selection.kind === "dotnet-probe" ? ".NET SDK probe" : "Project checks",
    nodes: [
      {
        id: "start",
        type: "start",
        request: "Explicit project-check calibration",
        position: { x: 0, y: 0 },
      },
    ],
    edges: [],
  };
  const mapped = new Set<string>();
  for (const [index, recipe] of recipes.entries()) {
    const nodeId = `check-${index + 1}`;
    let verification: { kind: "build" } | { kind: "test"; buildNodeId: string } | undefined;
    if (recipe.verifier.kind === "build") verification = { kind: "build" };
    if (recipe.verifier.kind === "test") {
      const buildRecipeId =
        selection.kind === "recipes" ? selection.buildMappings[recipe.id] : undefined;
      const buildIndex = recipes.findIndex((r) => r.id === buildRecipeId);
      if (buildIndex < 0 || recipes[buildIndex]!.verifier.kind !== "build")
        throw new Error(`Test ${recipe.name} needs an explicit selected Build recipe mapping.`);
      if (buildIndex >= index)
        throw new Error("Each selected Test must follow its earlier Build check.");
      if (
        recipe.verifier.format === "dotnet-vstest-trx-v1" &&
        !recipes[buildIndex]!.expectedOutputs.includes(recipe.verifier.target.assembly)
      )
        throw new Error("Mapped Build must capture the explicit test assembly.");
      verification = { kind: "test", buildNodeId: `check-${buildIndex + 1}` };
      mapped.add(recipe.id);
    }
    definition.nodes.push({
      id: nodeId,
      type: "tool",
      name: recipe.name,
      recipeId: recipe.id,
      position: { x: (index + 1) * 220, y: 0 },
      ...(verification ? { verification } : {}),
    });
    definition.edges.push({ source: index ? `check-${index}` : "start", target: nodeId });
  }
  if (
    selection.kind === "recipes" &&
    Object.keys(selection.buildMappings).some((key) => !mapped.has(key))
  )
    throw new Error("Build mappings must refer only to selected Test recipes.");
  definition.nodes.push({
    id: "end",
    type: "end",
    outputNodeId: `check-${recipes.length}`,
    position: { x: (recipes.length + 1) * 220, y: 0 },
  });
  definition.edges.push({ source: `check-${recipes.length}`, target: "end" });
  const ready = validateReadiness(definition);
  if (ready.errors.length) throw new Error(ready.errors.join("\n"));
  return { definition, recipes };
}
