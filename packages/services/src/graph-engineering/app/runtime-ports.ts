import type { GraphWorkspaceTarget } from "../contract.js";

/**
 * Admission-time native-runtime compatibility. Implementations resolve only for a runtime that
 * satisfies the Graph requirement set and otherwise throw `GraphRuntimeIncompatibleError`;
 * they never start a session, send input, retry or replace the agent.
 */
export interface GraphRuntimeGate {
  require(target: GraphWorkspaceTarget, purpose: "model" | "tool"): Promise<void>;
}
