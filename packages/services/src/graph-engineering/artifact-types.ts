import type { GraphWorkspaceTarget } from "./approval-types.js";

export type GraphJsonValue =
  | null
  | boolean
  | number
  | string
  | GraphJsonValue[]
  | { [key: string]: GraphJsonValue };
export type GraphJsonSchema =
  | {
      type: "object";
      properties: Record<string, GraphJsonSchema>;
      required: string[];
      additionalProperties: false;
    }
  | { type: "array"; items: GraphJsonSchema; minItems?: number; maxItems?: number }
  | { type: "string"; enum?: string[]; minLength?: number; maxLength?: number }
  | { type: "number"; enum?: number[]; minimum?: number; maximum?: number }
  | { type: "boolean"; enum?: boolean[] }
  | { type: "null" };

export type GraphArtifactType = "text" | "json" | "file" | "diff" | "command" | "test";
export type GraphArtifactProvenance =
  | "native-agent-final"
  | "workspace-file"
  | "native-command"
  | "native-test";
export interface GraphArtifact {
  id: string;
  runId: string;
  nodeId: string;
  attemptId: string;
  workspaceKey: string;
  type: GraphArtifactType;
  provenance: GraphArtifactProvenance;
  bytes: number;
  digest: string;
  capturedAt: number;
  validation: "valid" | "invalid" | "incomplete";
  issue?: string;
  redacted?: boolean;
  sourceBaseline?: string;
  sourcePath?: string;
  sessionId?: string;
  inputId?: string;
  commandId?: string;
  operationId?: string;
}
export interface GraphArtifactIdentity {
  target: GraphWorkspaceTarget;
  runId: string;
  nodeId: string;
  attemptId: string;
  artifactId: string;
}
export interface GraphArtifactWrite extends GraphArtifactIdentity {
  type: GraphArtifactType;
  provenance: GraphArtifactProvenance;
  content: string;
  capturedAt: number;
  validation?: GraphArtifact["validation"];
  issue?: string;
  sourceBaseline?: string;
  sourcePath?: string;
  sessionId?: string;
  inputId?: string;
  commandId?: string;
  operationId?: string;
}
export interface GraphArtifactStore {
  put(input: GraphArtifactWrite): Promise<GraphArtifact>;
  read(identity: GraphArtifactIdentity): Promise<{ artifact: GraphArtifact; content: string }>;
  captureFile(
    input: Omit<GraphArtifactWrite, "type" | "provenance" | "content"> & { path: string },
  ): Promise<GraphArtifact>;
}
export type GraphRecipeVerifier =
  | { kind: "command" }
  | { kind: "build" }
  | {
      kind: "test";
      format: "zcode-json-v1";
      reportPath: string;
      minimumTests: number;
      expectedTests?: number;
      requiredTests: string[];
      buildNodeId: string;
    };
export interface GraphRecipe {
  id: string;
  name: string;
  executable: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  sourcePaths: string[];
  expectedOutputs: string[];
  redactEnvironmentVariables?: string[];
  verifier: GraphRecipeVerifier;
}
export interface GraphFileFingerprint {
  digest: string;
  files: Array<{ path: string; bytes: number; digest: string; modifiedAt: number }>;
}
export type GraphFileObservation =
  | { path: string; exists: false }
  | { path: string; exists: true; bytes: number; digest: string; modifiedAt: number };
export interface GraphRecipeSnapshot {
  recipes: GraphRecipe[];
  digest: string;
  sourcePath: ".zcode/config.json";
}
export interface GraphRecipeStore {
  read(target: GraphWorkspaceTarget): Promise<GraphRecipeSnapshot>;
  save(
    target: GraphWorkspaceTarget,
    recipes: GraphRecipe[],
    expectedDigest: string,
  ): Promise<GraphRecipeSnapshot>;
  fingerprint(target: GraphWorkspaceTarget, paths: string[]): Promise<GraphFileFingerprint>;
  observeFiles(target: GraphWorkspaceTarget, paths: string[]): Promise<GraphFileObservation[]>;
}
