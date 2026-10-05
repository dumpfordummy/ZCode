/** Stable read-state identifiers shared by the inspector, manifest and native drivers. */
export const graphArtifactReadIds = {
  "graph-artifact": { state: "graph-artifact-read-state", error: "graph-artifact-read-error" },
  "graph-manifest": { state: "graph-manifest-read-state", error: "graph-manifest-read-error" },
} as const;
