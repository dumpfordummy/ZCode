/** Inventory and verified preparation have independent counters, never shared remaining capacity. */
export const PROJECT_INVENTORY_BUDGET = Object.freeze({
  fileBytes: 4 * 1024 * 1024,
  metadataBytes: 64 * 1024 * 1024,
  metadataRecords: 2048,
  referenceEdges: 16384,
  entries: 250000,
  depth: 32,
  elapsedMs: 120000,
  diagnostics: 128,
  diagnosticCharacters: 1000,
  serializedBytes: 4 * 1024 * 1024,
});
export const PROJECT_SCOPE_BUDGET = Object.freeze({
  ...PROJECT_INVENTORY_BUDGET,
  sourceFiles: 20000,
  sourceBytes: 512 * 1024 * 1024,
  sourceFileBytes: 32 * 1024 * 1024,
  metadataRecheckBytes: 64 * 1024 * 1024,
  concurrency: 4,
});
export const RECIPE_CONFIGURATION_BYTES = 32 * 1024 * 1024;
export const RECIPE_CONFIGURATION_MEMBERS = 700000;
export const GRAPH_RECORD_FILE_BYTES = 64 * 1024 * 1024;

/** Versioned, immutable membership commitment; contents are freshly hashed at evidence boundaries. */
export type GraphSourceScope = {
  project: string;
  membershipDigest: string;
  sourceCount: number;
} & (
  | { version: 1 }
  | { version: 2; configuration: string }
  | {
      version: 3;
      policy: "web-static-net8-win-x64-v1";
      configuration: "Debug" | "Release";
      webProject: string;
      runtimeProfile: import("@zcode/shared").WebProfileRuntime;
      assemblies: { web: string; test: string };
      copiedContent: Array<{ source: string; output: string }>;
      preparationId: string;
      inspectionIds: [string, string];
    }
);
export type GraphWebProfileScope = Extract<GraphSourceScope, { version: 3 }>;
