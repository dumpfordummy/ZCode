export type GraphRecipeDraftObject = Record<string, unknown>;
const object = (value: unknown): value is GraphRecipeDraftObject =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const strings = (value: unknown) =>
  Array.isArray(value) && value.every((item) => typeof item === "string");
const extras = (value: GraphRecipeDraftObject, keys: string[]) =>
  Object.keys(value).some((key) => !keys.includes(key));
const invalidStrings = (value: GraphRecipeDraftObject, keys: readonly string[]) =>
  keys.some((key) => value[key] !== undefined && typeof value[key] !== "string");
const invalidNumbers = (value: GraphRecipeDraftObject, keys: string[]) =>
  keys.some(
    (key) => value[key] !== undefined && value[key] !== "" && typeof value[key] !== "number",
  );
export function graphRecipeDraft(
  text: string,
): { kind: "ready"; recipes: GraphRecipeDraftObject[] } | { kind: "invalid"; error: string } {
  try {
    const recipes: unknown = JSON.parse(text);
    if (!Array.isArray(recipes) || !recipes.every(object))
      throw Error("Project checks must be an array of recipe objects.");
    return { kind: "ready", recipes };
  } catch (cause) {
    return { kind: "invalid", error: cause instanceof Error ? cause.message : String(cause) };
  }
}
export function graphRecipeGuidedIssue(
  recipe: GraphRecipeDraftObject,
): "unknownFields" | "unsupportedVerifier" | "invalidShape" | undefined {
  if (
    extras(recipe, [
      "id",
      "name",
      "executable",
      "args",
      "cwd",
      "timeoutMs",
      "sourcePaths",
      "expectedOutputs",
      "redactEnvironmentVariables",
      "verifier",
    ])
  )
    return "unknownFields";
  const verifier = recipe.verifier;
  if (!object(verifier)) return "invalidShape";
  if (
    invalidStrings(recipe, ["id", "name", "executable", "cwd"]) ||
    invalidNumbers(recipe, ["timeoutMs"]) ||
    invalidStrings(verifier, ["kind", "format", "reportPath", "buildNodeId"]) ||
    invalidNumbers(verifier, ["minimumTests", "expectedTests"])
  )
    return "invalidShape";
  if (!["command", "build", "test"].includes(String(verifier.kind))) return "unsupportedVerifier";
  const fields =
    verifier.kind === "command"
      ? ["kind"]
      : verifier.kind === "build"
        ? ["kind", "dotnet"]
        : [
            "kind",
            "format",
            "target",
            "reportPath",
            "minimumTests",
            "expectedTests",
            "requiredTests",
            "buildNodeId",
          ];
  if (extras(verifier, fields)) return "unknownFields";
  if (
    verifier.kind === "test" &&
    !["zcode-json-v1", "dotnet-vstest-trx-v1"].includes(String(verifier.format))
  )
    return "unsupportedVerifier";
  for (const field of ["args", "sourcePaths", "expectedOutputs", "redactEnvironmentVariables"]) {
    if (recipe[field] !== undefined && !strings(recipe[field])) return "invalidShape";
  }
  if (verifier.requiredTests !== undefined && !strings(verifier.requiredTests))
    return "invalidShape";
  for (const [field, keys] of [
    ["dotnet", ["project", "configuration", "framework", "runtime", "restore"]],
    ["target", ["project", "configuration", "framework", "runtime", "filter", "assembly"]],
  ] as const) {
    if (
      verifier[field] !== undefined &&
      (!object(verifier[field]) || extras(verifier[field], [...keys]))
    )
      return "unknownFields";
    if (object(verifier[field]) && invalidStrings(verifier[field], keys)) return "invalidShape";
  }
}
export function updateGraphRecipeField(
  text: string,
  index: number,
  path: string[],
  value: unknown,
): string {
  const parsed = graphRecipeDraft(text);
  if (parsed.kind !== "ready") throw Error(parsed.error);
  const recipe = parsed.recipes[index];
  if (!recipe || graphRecipeGuidedIssue(recipe))
    throw Error("This recipe requires Advanced editing.");
  if (!path.length || path.some((part) => ["__proto__", "prototype", "constructor"].includes(part)))
    throw Error("Invalid field path.");
  let parent = recipe;
  for (const part of path.slice(0, -1)) {
    const entry = parent[part];
    if (entry !== undefined && !object(entry)) throw Error("Invalid field parent.");
    parent[part] = entry ?? {};
    parent = parent[part] as GraphRecipeDraftObject;
  }
  const leaf = path.at(-1)!;
  if (JSON.stringify(parent[leaf]) === JSON.stringify(value)) return text;
  if (value === undefined) delete parent[leaf];
  else parent[leaf] = value;
  return JSON.stringify(parsed.recipes, null, 2);
}
export function appendGraphRecipes(text: string, additions: unknown[]): string {
  const parsed = graphRecipeDraft(text);
  if (parsed.kind !== "ready") throw Error(parsed.error);
  const ids = new Set(parsed.recipes.map((recipe) => recipe.id));
  for (const recipe of additions) {
    if (!object(recipe) || typeof recipe.id !== "string" || ids.has(recipe.id))
      throw Error("Duplicate or invalid recipe identity; choose a different ID prefix.");
    ids.add(recipe.id);
  }
  return JSON.stringify([...parsed.recipes, ...additions], null, 2);
}
