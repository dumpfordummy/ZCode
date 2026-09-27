import type { GraphInputSource, GraphSequentialDefinition } from "./contract.js";
import type { GraphRunProvenance } from "./workflow-provenance.js";

/** Renderer projections only; never an accepted execution plan or evidence. */
export interface GraphContextCandidate {
  source: GraphInputSource;
  label: string;
  outputKind: "request" | "text" | "structured" | "verification" | "command" | "repair";
  scope: "run" | "current-iteration";
  selectable: boolean;
  reason?: string;
  aliases: string[];
}
export interface GraphContextProjection {
  candidates: GraphContextCandidate[];
  issues: string[];
}
export interface GraphContextEdit {
  definition: GraphSequentialDefinition;
  alias: string;
  changed: boolean;
}
export type GraphPromptSegment =
  | { kind: "text"; text: string }
  | { kind: "unresolved"; alias: string; token: string; reason: string };
export type GraphInstructionPart =
  | { kind: "text"; text: string }
  | { kind: "token"; alias: string; token: string };
export interface GraphPromptPreview {
  kind: "draft";
  segments: GraphPromptSegment[];
  bindings: Array<{
    alias: string;
    source: GraphInputSource;
    status: "resolved-start" | "unresolved";
    text?: string;
  }>;
  references: Array<{
    id: string;
    kind: "document" | "instruction" | "skill";
    selected?: string;
    nativeName?: string;
    delivery?: "native-instructions" | "explicit-read" | "native-skill";
  }>;
  issues: string[];
}
export type GraphPromptReferenceMetadata = GraphRunProvenance["references"];
export interface GraphScalarConditionPreset {
  alias: string;
  pointer: string;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "present";
  value?: null | boolean | number | string;
  exit: string;
  defaultExit: string;
}
export interface GraphRepairPolicyEdit {
  additionalRepairs: number;
  deadlineMinutes: number;
  maxNodeAdmissions: number;
  stopOnNoProgress: boolean;
}
export interface GraphRepairPresetProjection {
  supported: boolean;
  reason?: string;
  policy?: GraphRepairPolicyEdit;
  testNodeIds: string[];
  finalGateId?: string;
}
