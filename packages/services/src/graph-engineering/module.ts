export const graphEngineeringModule = {
  id: "graph-engineering",
  requires: ["shared", "rpc", "services"],
  provides: ["graph-engineering-service"],
  publicEntrypoints: ["contract.ts", "workflow-contract.ts", "parallel-contract.ts", "node.ts"],
} as const;
