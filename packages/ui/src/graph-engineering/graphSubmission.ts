import type { GraphDefinition, IGraphEngineeringService } from "@zcode/services";

export type GraphSubmission = Parameters<IGraphEngineeringService["run"]>[0];

/** A lost Run reply retains the exact admitted intent; retry never saves another revision. */
export async function captureGraphSubmission(params: {
  retained: GraphSubmission | null;
  definition: GraphDefinition;
  intent: Omit<GraphSubmission, "revision">;
  save: (definition: GraphDefinition) => Promise<GraphDefinition>;
}): Promise<GraphSubmission> {
  if (params.retained) return params.retained;
  const intent = structuredClone(params.intent);
  const saved = await params.save(params.definition);
  return { ...intent, revision: saved.revision };
}
