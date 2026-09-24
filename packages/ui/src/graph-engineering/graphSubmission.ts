import type {
  GraphDefinition,
  GraphSequentialDefinition,
  GraphNativeSettings,
  IGraphEngineeringService,
  GraphRunProvenance,
} from "@zcode/services";
import { graphDefinitionContent } from "./graphEngineeringView.js";

export type GraphSubmission = Exclude<
  Parameters<IGraphEngineeringService["run"]>[0],
  { action: "continue" }
>;
export interface GraphRunConfirmationSnapshot {
  definition: GraphSequentialDefinition;
  settings: GraphNativeSettings;
  provenance?: GraphRunProvenance;
}

/** A lost Run reply retains the exact admitted intent; retry never saves another revision. */
export async function captureGraphSubmission(params: {
  retained: GraphSubmission | null;
  retainedDefinition?: GraphDefinition | null;
  confirmed?: boolean;
  definition: GraphDefinition;
  intent: Omit<GraphSubmission, "revision">;
  save: (definition: GraphDefinition) => Promise<GraphDefinition>;
}): Promise<GraphSubmission> {
  if (params.retained) {
    // Z5 确认必须对应原意图；丢失回执后不能展示新快照却重试旧 Run。
    if (params.definition.version === 5 || params.retainedDefinition?.version === 5) {
      const settings = (value: Omit<GraphSubmission, "revision">) =>
        JSON.stringify([
          value.target.workspaceIdentity?.trim() || value.target.workspacePath,
          value.modelSelection,
          value.mode,
          value.planEnabled ?? false,
          value.preflight ?? null,
        ]);
      if (
        !params.retainedDefinition ||
        graphDefinitionContent(params.definition) !==
          graphDefinitionContent(params.retainedDefinition) ||
        settings(params.retained) !== settings(params.intent)
      )
        throw new Error(
          "An unconfirmed run retains its original confirmation. Refresh to reconcile it before confirming a changed definition or settings.",
        );
    }
    return params.retained;
  }
  const intent = structuredClone(params.intent);
  const saved =
    params.confirmed && params.definition.version === 5
      ? params.definition
      : await params.save(params.definition);
  return { ...intent, revision: saved.revision };
}

/** Save before confirmation so the displayed revision is the one admitted by Confirm. */
export async function prepareGraphRunConfirmation(params: {
  definition: GraphSequentialDefinition;
  settings: GraphNativeSettings;
  retained?: GraphSubmission | null;
  retainedDefinition?: GraphDefinition | null;
  retainedProvenance?: GraphRunProvenance | null;
  save(definition: GraphDefinition): Promise<GraphDefinition | undefined>;
  prepare?(
    definition: GraphSequentialDefinition,
    settings: GraphNativeSettings,
  ): Promise<GraphRunProvenance>;
}): Promise<GraphRunConfirmationSnapshot | undefined> {
  const captured = structuredClone({ definition: params.definition, settings: params.settings });
  if (params.retained) {
    await captureGraphSubmission({
      retained: params.retained,
      retainedDefinition: params.retainedDefinition,
      definition: captured.definition,
      intent: { ...params.retained, ...captured.settings },
      save: async () => captured.definition,
    });
    if (params.retainedDefinition?.version !== 5)
      throw new Error("The retained confirmation is not a version-5 graph.");
    if (
      captured.definition.template &&
      (!params.retainedProvenance ||
        params.retainedProvenance.digest !== params.retained.preflight?.digest)
    )
      throw new Error(
        "The retained workflow preflight is unavailable. Refresh to reconcile the original request.",
      );
    return {
      definition: structuredClone({
        ...params.retainedDefinition,
        revision: params.retained.revision,
      }),
      settings: captured.settings,
      ...(params.retainedProvenance
        ? { provenance: structuredClone(params.retainedProvenance) }
        : {}),
    };
  }
  const saved = await params.save(captured.definition);
  if (!saved) return undefined;
  if (saved.version !== 5) throw new Error("Only the saved version-5 definition can be confirmed.");
  if (saved.template && !params.prepare) throw new Error("Workflow preflight is unavailable.");
  const provenance = saved.template ? await params.prepare!(saved, captured.settings) : undefined;
  return {
    definition: structuredClone(saved),
    settings: captured.settings,
    ...(provenance ? { provenance } : {}),
  };
}
