import { createHash } from "node:crypto";
import type { IModelSelectionService, IZCodeAgentService } from "../../index.js";
import type { GraphPreflightPort } from "../app/workflow-ports.js";
import type { GraphRunProvenance } from "../workflow-provenance.js";
import { runFingerprint } from "../app/attempts.js";
import { createGraphRecipeStore } from "./recipes.js";
import { readDeclaredFile } from "./artifact-files.js";
import { graphSettingsSchema } from "../domain/sequential.js";
import { localTarget, validateReadiness } from "../domain/definition.js";
import { runProvenanceSchema } from "../domain/workflow-provenance-schema.js";
import { workflowToolQueries, checkWorkflowTools } from "./workflow-tools.js";

export const workflowDigest = (value: unknown): string =>
  createHash("sha256")
    .update(typeof value === "string" ? value : runFingerprint(value))
    .digest("hex");
function destination(value: string | null | undefined): string {
  try {
    const url = new URL(value ?? "");
    return ["http:", "https:"].includes(url.protocol) ? url.origin : "Unknown";
  } catch {
    return "Unknown";
  }
}
export function createWorkflowPreflight(options: {
  agentService: IZCodeAgentService;
  modelSelectionService: IModelSelectionService;
}): GraphPreflightPort {
  const recipes = createGraphRecipeStore();
  return {
    async capture(value, definition, inputSettings) {
      const target = localTarget(value),
        settings = graphSettingsSchema.parse(inputSettings),
        template = definition.template;
      if (!template || definition.version !== 5)
        throw new Error("An explicit versioned workflow instance is required.");
      const ready = validateReadiness(definition);
      if (ready.errors.length) throw new Error(ready.errors.join("\n"));
      const configured = await recipes.read(target);
      const tooling = workflowToolQueries(target, definition, configured.recipes);
      const environment = await options.agentService.previewExecutionEnvironment({
        ...target,
        executables: tooling.queries,
      });
      if (environment.status !== "available")
        throw new Error(
          `Native configuration is Unknown. Open this workspace in native Chat to initialize its runtime, then prepare again. ${environment.unknowns.join(" ")}`,
        );
      const result: GraphRunProvenance = {
        digest: "0".repeat(64),
        template: structuredClone(template),
        environment,
        models: [],
        auxiliary: [
          "Native title generation uses each session's selected primary model (Graph supplies no title-model override).",
        ],
        references: [],
        recipes: [],
        permissions: [],
        unknowns: [
          ...environment.unknowns,
          ...checkWorkflowTools(tooling.queries, environment),
          ...tooling.pending,
          "Executable availability does not verify its SDK version, script contents or network behavior; review the existing project toolchain and recipes.",
          "Provider redirects, backend routing and external tools cannot be established from local configuration.",
          "Native web/search, memory and delegated-tool behavior may contact additional destinations; primary endpoint locality is not a traffic guarantee.",
        ],
      };
      for (const ref of template.references) {
        const binding = template.bindings.references[ref.id];
        if (!binding) throw new Error(`Reference ${ref.id} is unresolved.`);
        if (ref.kind === "skill") {
          const skill = environment.skills.find((s) => s.id === binding && s.enabled);
          if (!skill?.digest)
            throw new Error(
              `Native skill ${binding} is unavailable or has no verifiable digest. Select an existing enabled skill through native configuration.`,
            );
          result.references.push({
            id: ref.id,
            kind: ref.kind,
            path: skill.path,
            digest: skill.digest,
            origin: `${skill.scope}:${skill.plugin ?? skill.name}${skill.version ? `@${skill.version}` : ""}`,
            nativeName: skill.name,
          });
        } else {
          const bytes = await readDeclaredFile(target, binding, 100 * 1024);
          if (!bytes.length) throw new Error(`Reference ${ref.id} is empty.`);
          result.references.push({
            id: ref.id,
            kind: ref.kind,
            path: binding,
            digest: workflowDigest(bytes.toString("utf8")),
            origin: "explicit workspace reference",
          });
        }
      }
      for (const node of definition.nodes) {
        if (node.type === "task") {
          const chosen = node.configuration.kind === "inherit" ? settings : node.configuration;
          const view = await options.modelSelectionService.getView({
            selection: chosen.modelSelection,
          });
          if (
            view.selectionIssue ||
            runFingerprint(view.effectiveSelection) !== runFingerprint(chosen.modelSelection)
          )
            throw new Error(`Node ${node.name}: selected native model changed or is unavailable.`);
          const provider = view.providers.find(
            (p) => p.providerId === chosen.modelSelection.providerId,
          );
          const api = provider?.config.api;
          const dest = destination(api?.baseUrl);
          const configurationDigest = workflowDigest({
            api: { type: api?.type, baseUrl: api?.baseUrl },
            model: provider?.models.find((m) => m.modelId === chosen.modelSelection.modelId)
              ?.config,
          });
          result.models.push({
            nodeId: node.id,
            providerId: chosen.modelSelection.providerId,
            modelId: chosen.modelSelection.modelId,
            type: api?.type ?? "Unknown",
            destination: dest,
            configurationDigest,
          });
          if (dest === "Unknown")
            result.unknowns.push(`Node ${node.name}: model destination is Unknown.`);
          result.permissions.push({
            nodeId: node.id,
            mode: chosen.mode,
            planEnabled: chosen.planEnabled,
          });
        }
        if (node.type === "tool") {
          const recipe = configured.recipes.find((r) => r.id === node.recipeId);
          if (!recipe)
            throw new Error(
              `Node ${node.name}: choose an existing project recipe (${node.recipeId}).`,
            );
          if (node.id === "build" && recipe.verifier.kind !== "build")
            throw new Error("Build slot requires a Build verifier.");
          if (
            node.id === "test" &&
            (recipe.verifier.kind !== "test" || recipe.verifier.buildNodeId !== "build")
          )
            throw new Error("Test slot requires an independent Test verifier tied to Build.");
          await recipes.fingerprint(target, recipe.sourcePaths);
          result.recipes.push({
            nodeId: node.id,
            id: recipe.id,
            digest: workflowDigest(recipe),
            command: JSON.stringify([recipe.executable, ...recipe.args]),
            cwd: recipe.cwd,
          });
        }
      }
      const region = definition.routing?.region;
      if (region) {
        await recipes.fingerprint(target, region.sourcePaths);
        for (const node of definition.nodes) {
          if (node.type !== "tool" || !region.bodyNodeIds.includes(node.id)) continue;
          const recipe = configured.recipes.find((r) => r.id === node.recipeId)!;
          if (runFingerprint(recipe.sourcePaths) !== runFingerprint(region.sourcePaths))
            throw new Error("Repair-region recipes and source paths must match exactly.");
        }
      }
      // 摘要绑定完整 URL/模型配置的非凭据语义与整个配方文件；展示仅返回来源，不返回鉴权材料。
      result.digest = workflowDigest({
        target,
        definition,
        settings,
        inventory: { ...result, digest: undefined },
        recipeConfigurationDigest: configured.digest,
      });
      return runProvenanceSchema.parse(result);
    },
  };
}
