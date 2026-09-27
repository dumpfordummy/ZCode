import type { ZCodeExecutionEnvironmentPreview } from "@zcode/shared";
import type { GraphWorkspaceTarget } from "./approval-types.js";
import type { GraphRecipe } from "./artifact-types.js";
import type { GraphSequentialDefinition } from "./contract.js";
import type { GraphDotnetTestTarget } from "./dotnet-types.js";
import type { GraphChecksReceipt, GraphChecksSelection } from "./checks-types.js";
export type * from "./checks-types.js";

export interface GraphProjectCandidate {
  path: string;
  kind: "solution" | "project";
  frameworks: string[];
  projects: string[];
  runner: "vstest" | "mtp" | "unknown" | "not-test";
  evidence: string[];
  sourcePaths: string[];
  coverage: "review-required" | "unsupported";
  issues: string[];
}
export interface GraphProjectDiscovery {
  kind: "discovery";
  requestId: string;
  status: "complete" | "limited" | "cancelled";
  digest: string;
  metadata: Array<{ path: string; digest: string; bytes: number }>;
  candidates: GraphProjectCandidate[];
  issues: string[];
  excluded: string[];
  limits: { files: number; depth: number; metadataBytes: number; sourceFiles: number };
}
export interface GraphRecipeDiagnostic {
  path: string;
  message: string;
}
export interface GraphRecipeValidation {
  kind: "validation";
  digest: string;
  recipes?: GraphRecipe[];
  diagnostics: GraphRecipeDiagnostic[];
}
export interface GraphDotnetPreset {
  idPrefix: string;
  executable: string;
  cwd: string;
  timeoutMs: number;
  buildProject: string;
  configuration: string;
  framework?: string;
  runtime?: string;
  sourcePaths: string[];
  expectedOutputs: string[];
  reviewedManifest: boolean;
  tests: Array<
    GraphDotnetTestTarget & {
      minimumTests: number;
      expectedTests?: number;
      requiredTests: string[];
    }
  >;
}
export interface GraphChecksPreview extends GraphChecksReceipt {
  definition: GraphSequentialDefinition;
}
export interface GraphReferenceCatalog {
  kind: "reference-catalog";
  status: ZCodeExecutionEnvironmentPreview["status"];
  instructions: ZCodeExecutionEnvironmentPreview["instructions"];
  skills: ZCodeExecutionEnvironmentPreview["skills"];
  unknowns: string[];
}
export interface GraphReferenceValidation {
  kind: "reference-validation";
  path: string;
  digest: string;
  bytes: number;
  delivery: "native-instructions" | "explicit-read";
  issues: string[];
}
export type GraphProjectSetupRequest = { target: GraphWorkspaceTarget } & (
  | { action: "reference-catalog" }
  | { action: "validate-reference"; path: string }
  | { action: "scan"; requestId: string }
  | { action: "cancel-scan"; requestId: string }
  | { action: "validate"; json: string }
  | { action: "dotnet-preset"; preset: GraphDotnetPreset }
  | { action: "availability"; selection: GraphChecksSelection }
  | {
      action: "prepare-checks";
      revision: number;
      expectedDigest: string;
      selection: GraphChecksSelection;
    }
);
export type GraphProjectSetupResult =
  | GraphReferenceCatalog
  | GraphReferenceValidation
  | GraphProjectDiscovery
  | { kind: "scan-cancelled"; requestId: string }
  | GraphRecipeValidation
  | { kind: "availability"; environment: ZCodeExecutionEnvironmentPreview; unknowns: string[] }
  | GraphChecksPreview;
