import type { ZCodeExecutionEnvironmentPreview } from "@zcode/shared";

export type GraphParameterValue = string | number | boolean;
export interface GraphTemplateBindings {
  referencePolicy?: "native-aware-v1";
  references: Record<string, string>;
  recipes: Record<string, string>;
  recipeGroups?: Record<string, string[]>;
  buildMappings?: Record<string, string>;
  sourcePaths: string[];
}
export interface GraphTemplateInstance {
  id: string;
  name: string;
  version: number;
  digest: string;
  parameters: Record<string, GraphParameterValue>;
  bindings: GraphTemplateBindings;
  references: Array<{ id: string; kind: "document" | "instruction" | "skill"; nodeIds: string[] }>;
  excluded: Array<{ nodeId: string; reason: string }>;
}
export interface GraphRunProvenance {
  operationalDecision?: { acknowledgedUnknowns: boolean; acceptedAt: number };
  digest: string;
  template: GraphTemplateInstance;
  environment: ZCodeExecutionEnvironmentPreview;
  models: Array<{
    nodeId: string;
    providerId: string;
    modelId: string;
    type: string;
    destination: string;
    configurationDigest: string;
  }>;
  auxiliary: string[];
  references: Array<{
    id: string;
    kind: "document" | "instruction" | "skill";
    path: string;
    digest: string;
    origin: string;
    nativeName?: string;
    delivery?: "native-instructions" | "explicit-read" | "native-skill";
  }>;
  recipes: Array<{ nodeId: string; id: string; digest: string; command: string; cwd: string }>;
  permissions: Array<{ nodeId: string; mode: string; planEnabled: boolean }>;
  unknowns: string[];
}
