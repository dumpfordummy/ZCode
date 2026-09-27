import type {
  GraphSequentialDefinition,
  GraphWorkspaceTarget,
  GraphNativeSettings,
} from "./contract.js";
import type {
  GraphParameterValue,
  GraphTemplateBindings,
  GraphRunProvenance,
} from "./workflow-provenance.js";
import { ServiceChannels } from "@zcode/shared";
import { createServiceDescriptor } from "../descriptors.js";
import type { GraphProjectSetupRequest, GraphProjectSetupResult } from "./project-setup-types.js";
export type * from "./workflow-provenance.js";
export type * from "./project-setup-types.js";
export type * from "./editor-types.js";
export { GRAPH_CHECKS_ADMISSION_REJECTED } from "./checks-types.js";
export {
  graphRecipeCompatibility,
  graphRequiredRecipeKind,
} from "./domain/recipe-compatibility.js";
export { graphContextCandidates, addGraphContextBinding } from "./domain/editor-context.js";
export { previewGraphTaskPrompt } from "./domain/editor-prompt.js";
export { graphInstructionParts } from "./domain/prompt-parts.js";
export {
  applyGraphConditionPreset,
  graphRepairPreset,
  applyGraphRepairPolicy,
} from "./domain/editor-routing.js";
export { applyGraphRunRequest } from "./domain/workflow-request.js";
export {
  TRANSFER_BYTE_LIMIT,
  IMPORT_READ_BOUND,
  assertStatUnchanged,
  decodeImportBytes,
} from "./domain/workflow-transfer.js";
export type { TransferStatSnapshot } from "./domain/workflow-transfer.js";

export interface GraphPortableTemplate {
  format: "zcode-workflow";
  version: 1;
  name: string;
  description: string;
  graph: GraphSequentialDefinition;
  parameters: Array<{
    id: string;
    label: string;
    type: "string" | "boolean" | "number";
    required: boolean;
    default?: GraphParameterValue;
  }>;
  references: Array<{
    id: string;
    label: string;
    kind: "document" | "instruction" | "skill";
    required: boolean;
    nodeIds: string[];
  }>;
  optionalNodes: Array<{ nodeId: string; parameterId: string }>;
}
export interface GraphTemplateVersion {
  version: number;
  digest: string;
  createdAt: number;
  template: GraphPortableTemplate;
}
export interface GraphLibraryEntry {
  id: string;
  name: string;
  archived: boolean;
  builtin: boolean;
  versions: GraphTemplateVersion[];
}
export interface GraphLibraryView {
  revision: number;
  entries: GraphLibraryEntry[];
}
export interface GraphTemplatePreview {
  template?: GraphPortableTemplate;
  json?: string;
  errors: string[];
  diagnostics: string[];
  unresolved: string[];
}
export type GraphLibraryMutation =
  | { action: "create"; template: GraphPortableTemplate }
  | { action: "version"; id: string; template: GraphPortableTemplate }
  | { action: "duplicate"; id: string; version: number; name: string }
  | { action: "archive"; id: string; archived: boolean };
export interface IGraphWorkflowService {
  projectSetup(params: GraphProjectSetupRequest): Promise<GraphProjectSetupResult>;
  list(): Promise<GraphLibraryView>;
  mutate(params: GraphLibraryMutation & { expectedRevision: number }): Promise<GraphLibraryView>;
  preview(
    params:
      | { action: "import"; json: string }
      | { action: "export"; id: string; version: number }
      | {
          action: "capture";
          definition: GraphSequentialDefinition;
          name: string;
          description: string;
        },
  ): Promise<GraphTemplatePreview>;
  instantiate(params: {
    target: GraphWorkspaceTarget;
    id: string;
    version: number;
    expectedRevision: number;
    parameters: Record<string, GraphParameterValue>;
    bindings: GraphTemplateBindings;
  }): Promise<GraphSequentialDefinition>;
  prepare(params: {
    target: GraphWorkspaceTarget;
    revision: number;
    settings: GraphNativeSettings;
  }): Promise<GraphRunProvenance>;
}
export const IGraphWorkflowService = createServiceDescriptor<IGraphWorkflowService>(
  ServiceChannels.GraphWorkflow,
);
