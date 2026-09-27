import { isAbsolute, resolve } from "node:path";
import type { IZCodeAgentService } from "../../index.js";
import type { GraphProjectPort } from "../app/project-ports.js";
import type { GraphChecksPreview } from "../project-setup-types.js";
import { createGraphRecipeStore } from "./recipes.js";
import { workflowDigest } from "./workflow-preflight.js";
import { compileChecksDefinition } from "../domain/project-checks.js";
import { effectiveGraphRecipe } from "../domain/effective-recipe.js";
import { createProjectDiscovery } from "./project-discovery.js";
import { checkWorkflowTools } from "./workflow-tools.js";
import { projectEnvironmentUnknowns } from "../app/project-setup.js";
import { noProjectRecipes } from "../domain/recipe-dependency.js";
import { readProjectReference, nativeReferenceDelivery } from "./project-references.js";

export function createProjectSetupPort(options: {
  agentService: Pick<IZCodeAgentService, "previewExecutionEnvironment">;
}): GraphProjectPort {
  const store = createGraphRecipeStore();
  const discovery = createProjectDiscovery();
  const port: GraphProjectPort = {
    ...discovery,
    async validateReference(target, path) {
      const reference = await readProjectReference(target, path);
      const environment = await port.environment(target, []);
      return {
        kind: "reference-validation",
        ...reference,
        delivery: nativeReferenceDelivery(target, reference, environment),
        issues:
          environment.status === "unknown"
            ? [
                "Native instruction delivery is Unknown; this selection requires explicit Read until preflight proves otherwise.",
              ]
            : [],
      };
    },
    async environment(target, recipes) {
      const executables = [
        ...new Set(
          recipes.map((recipe) =>
            isAbsolute(recipe.executable) || /[\\/]/.test(recipe.executable)
              ? resolve(target.workspacePath, recipe.cwd, recipe.executable)
              : recipe.executable,
          ),
        ),
      ];
      return options.agentService.previewExecutionEnvironment({ ...target, executables });
    },
    async capture(target, revision, selection, expectedDigest) {
      const configured =
        selection.kind === "dotnet-probe"
          ? { recipes: [], digest: workflowDigest(noProjectRecipes) }
          : await store.read(target);
      if (
        configured.digest !== expectedDigest &&
        !(selection.kind === "dotnet-probe" && expectedDigest === "")
      )
        throw new Error("Project checks changed; reload and prepare a new review.");
      const compiled = compileChecksDefinition(selection, configured.recipes, revision);
      const recipes = compiled.definition.nodes.flatMap((node) =>
        node.type === "tool"
          ? [
              effectiveGraphRecipe(
                compiled.definition,
                node.id,
                compiled.recipes.find((r) => r.id === node.recipeId)!,
              ),
            ]
          : [],
      );
      const sourcePaths = [...new Set(recipes.flatMap((r) => r.sourcePaths))].sort();
      const fingerprint = await store.fingerprint(target, sourcePaths);
      const environment = await port.environment(target, recipes);
      if (environment.status !== "available")
        throw new Error(
          "Native configuration is Unknown. Initialize this workspace through native Chat before preparing checks.",
        );
      const effects = recipes.map((recipe) => {
        const verifier = recipe.verifier;
        if (verifier.kind === "test" && verifier.format === "dotnet-vstest-trx-v1")
          return `${recipe.name}: executes tests without build/restore; writes a unique operation-owned TRX report. Project code can perform IO; native controls apply.`;
        if (verifier.kind === "build" && verifier.dotnet)
          return `${recipe.name}: Rebuild writes declared project outputs; ${verifier.dotnet.restore === "disabled" ? "restore is disabled and existing assets/packages are required" : "restore is explicit and can contact configured package feeds"}.`;
        return `${recipe.name}: executes the exact reviewed command under native permission; file/network effects of custom project commands are not inferred.`;
      });
      const preview: GraphChecksPreview = {
        kind: "checks-preview",
        version: 1,
        digest: "",
        revision,
        recipeDigest: configured.digest,
        sourceDigest: fingerprint.digest,
        selection: structuredClone(selection),
        definition: compiled.definition,
        recipes,
        environment,
        effects,
        unknowns: [
          ...environment.unknowns,
          ...checkWorkflowTools(
            environment.executables.map((item) => item.executable),
            environment,
          ),
          ...projectEnvironmentUnknowns.filter((line) => !line.startsWith("No package")),
        ],
      };
      preview.digest = workflowDigest({ target, ...preview, digest: undefined });
      return preview;
    },
  };
  return port;
}
