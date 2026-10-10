import type { IGraphEngineeringService } from "../contract.js";
import type {
  GraphProjectSetupRequest,
  GraphProjectSetupResult,
  GraphRecipeValidation,
} from "../project-setup-types.js";
import type { GraphProjectPort } from "./project-ports.js";
import { localTarget } from "../domain/definition.js";
import { validateGraphRecipes } from "../domain/artifact-schemas.js";
import { compileDotnetRecipes } from "../domain/dotnet-recipes.js";
import { compileChecksDefinition } from "../domain/project-checks.js";
import {
  RECIPE_CONFIGURATION_BYTES,
  RECIPE_CONFIGURATION_MEMBERS,
} from "../domain/project-budgets.js";
import { parseBoundedGraphJson } from "../domain/artifacts.js";

export const projectEnvironmentUnknowns = [
  "Executable lookup does not establish SDK version or installed package readiness.",
  "Native private-home, package-feed authentication and network policy are Unknown from this metadata. Existing native permissions and sandbox controls remain in force.",
  "No package installation, restore, script, model or MCP command was executed by this lookup.",
];
/** Read-only facade. GraphEngineeringService remains the configuration/execution owner. */
export async function projectSetup(
  input: GraphProjectSetupRequest,
  options: {
    graph: Pick<IGraphEngineeringService, "recipes" | "getWorkspace">;
    project?: GraphProjectPort;
    digest(value: string): string;
  },
): Promise<GraphProjectSetupResult> {
  const target = localTarget(input.target);
  if (input.action === "validate" || input.action === "dotnet-preset") {
    const result: GraphRecipeValidation = {
      kind: "validation",
      digest: options.digest(JSON.stringify(input)),
      diagnostics: [],
    };
    try {
      if (
        input.action === "validate" &&
        (typeof input.json !== "string" || input.json.length > RECIPE_CONFIGURATION_BYTES)
      )
        throw new Error("Recipe JSON exceeds its 32 MiB limit.");
      result.recipes =
        input.action === "validate"
          ? validateGraphRecipes(
              parseBoundedGraphJson(input.json, {
                bytes: RECIPE_CONFIGURATION_BYTES,
                members: RECIPE_CONFIGURATION_MEMBERS,
              }),
            )
          : compileDotnetRecipes(input.preset);
    } catch (error) {
      const details = (error as { issues?: Array<{ path: PropertyKey[]; message: string }> })
        .issues;
      result.diagnostics = details
        ? details.slice(0, 128).map((issue) => ({
            path: issue.path.map(String).join("."),
            message: issue.message.slice(0, 1000),
          }))
        : [
            {
              path: "",
              message: error instanceof Error ? error.message : "Invalid recipe configuration.",
            },
          ];
    }
    return result;
  }
  const port = options.project;
  if (!port) throw new Error("Project setup is unavailable on this host.");
  if (input.action === "reference-catalog") {
    const environment = await port.environment(target, []);
    return {
      kind: "reference-catalog",
      status: environment.status,
      instructions: structuredClone(environment.instructions),
      skills: structuredClone(environment.skills),
      unknowns: [
        ...environment.unknowns,
        ...(environment.status === "unknown"
          ? [
              "Open this workspace in native Chat to initialize its runtime, then refresh the catalog.",
            ]
          : []),
      ],
    };
  }
  if (input.action === "validate-reference") return port.validateReference(target, input.path);
  if (
    input.action === "scan" ||
    input.action === "cancel-scan" ||
    input.action === "scan-progress"
  ) {
    if (!input.requestId?.trim() || input.requestId.length > 200)
      throw new Error("A bounded scan request ID is required.");
    if (input.action === "scan-progress") {
      if (!port.progress) throw Error("Scan progress is unavailable.");
      return port.progress(target, input.requestId);
    }
    if (input.action === "scan") return port.scan(target, input.requestId, input);
    port.cancelScan(target, input.requestId);
    return { kind: "scan-cancelled", requestId: input.requestId };
  }
  if (input.action === "availability") {
    const configured =
      input.selection.kind === "recipes"
        ? await options.graph.recipes({ target, action: "read" })
        : { recipes: [] };
    const { recipes } = compileChecksDefinition(input.selection, configured.recipes, 0);
    const environment = await port.environment(target, recipes);
    return {
      kind: "availability",
      environment,
      unknowns: [...environment.unknowns, ...projectEnvironmentUnknowns],
    };
  }
  const view = await options.graph.getWorkspace(target);
  if (view.readOnly) throw new Error("Another Host owns this workspace.");
  if (view.definition.revision !== input.revision)
    throw new Error("Graph revision changed; reload before preparing checks.");
  return port.capture(target, input.revision, input.selection, input.expectedDigest);
}
