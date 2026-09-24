import type { Event } from "@zcode/rpc";
import {
  ServiceChannels,
  type GitGraphBase,
  type GitGraphWorkspace,
  type ZCodeExecutionEnvironmentPreview,
} from "@zcode/shared";
import { createServiceDescriptor } from "../descriptors.js";
import type {
  GraphNativeSettings,
  GraphRecipe,
  GraphRun,
  GraphWorkspaceTarget,
} from "./contract.js";

export interface GraphParallelBranch {
  id: string;
  name: string;
  selected: boolean;
  instructions: string;
  files: string[];
  additions: string[];
}
export interface GraphParallelPlan {
  version: 1;
  revision: number;
  enabled: boolean;
  name: string;
  request: string;
  sharedContract: string;
  resultRequirements: string;
  concurrency: 1 | 2;
  deadlineMs: number;
  admissionBudget: number;
  branches: GraphParallelBranch[];
  buildRecipeId: string;
  testRecipeId: string;
}
export interface GraphParallelInventory {
  environment: ZCodeExecutionEnvironmentPreview;
  providerId: string;
  modelId: string;
  destination: string;
  modelDigest: string;
  digest: string;
  unknowns: string[];
}
export interface GraphParallelPreview {
  digest: string;
  base: GitGraphBase;
  inventory: GraphParallelInventory;
  recipes: GraphRecipe[];
}
export interface GraphParallelProposal {
  branchId: string;
  digest: string;
  files: Array<{ path: string; before: string; after: string; kind: "edit" | "add" | "delete" }>;
  sourceDigest: string;
}
export interface GraphParallelChild {
  id: string;
  requestId: string;
  selected: boolean;
  workspace?: GitGraphWorkspace;
  inventory?: GraphParallelInventory;
  definitionRevision?: number;
  runId?: string;
  admission?: "reserved" | "acknowledged";
  proposal?: GraphParallelProposal;
}
export interface GraphParallelRun {
  id: string;
  requestId: string;
  requestFingerprint: string;
  target: GraphWorkspaceTarget;
  plan: GraphParallelPlan;
  settings: GraphNativeSettings;
  preview: GraphParallelPreview;
  phase:
    | "Preparing"
    | "Prepared"
    | "Workers"
    | "JoinReview"
    | "Integrating"
    | "Validating"
    | "Completed"
    | "Stopped"
    | "Interrupted";
  createdAt: number;
  updatedAt: number;
  deadlineAt?: number;
  admissions: number;
  children: GraphParallelChild[];
  integration: GraphParallelChild;
  validation: GraphParallelChild;
  preparedDigest?: string;
  joinDigest?: string;
  planDecision?: { id: string; digest: string; approved: boolean; comment: string; at: number };
  integrationDecision?: {
    id: string;
    digest: string;
    approved: boolean;
    resolutions: Record<string, string>;
    comment: string;
    at: number;
  };
  expectedProposal?: GraphParallelProposal;
  message?: string;
  cancelledAt?: number;
  released?: { at: number; reason: string };
  preservedSlots: string[];
  retentionDecisions?: Array<{ slots: string[]; preserve: boolean; at: number; reason: string }>;
  cleanup: Array<{ slot: string; at: number; reason?: string }>;
}
export interface GraphParallelRecord {
  plan?: GraphParallelPlan;
  runs: GraphParallelRun[];
}
export interface GraphParallelView extends GraphParallelRecord {
  children: Record<string, GraphRun>;
  readOnly?: boolean;
}
export interface IGraphParallelService {
  get(target: GraphWorkspaceTarget): Promise<GraphParallelView>;
  save(params: {
    target: GraphWorkspaceTarget;
    plan: GraphParallelPlan;
    expectedRevision: number;
  }): Promise<GraphParallelPlan>;
  preview(params: {
    target: GraphWorkspaceTarget;
    revision: number;
    settings: GraphNativeSettings;
  }): Promise<GraphParallelPreview>;
  prepare(params: {
    target: GraphWorkspaceTarget;
    revision: number;
    settings: GraphNativeSettings;
    requestId: string;
    previewDigest: string;
    acknowledgedUnknowns: boolean;
  }): Promise<GraphParallelRun>;
  decide(params: {
    target: GraphWorkspaceTarget;
    runId: string;
    phase: "plan" | "integration";
    decisionId: string;
    digest: string;
    approved: boolean;
    acknowledgedUnknowns: boolean;
    comment: string;
    resolutions?: Record<string, string>;
  }): Promise<GraphParallelRun>;
  control(params: {
    target: GraphWorkspaceTarget;
    runId: string;
    action: "cancel" | "inspect" | "release" | "cleanup" | "preserve";
    reason: string;
    slots?: string[];
    preserve?: boolean;
  }): Promise<GraphParallelRun>;
  readonly onDidChange: Event<{ workspaceKey: string }>;
}
export const IGraphParallelService = createServiceDescriptor<IGraphParallelService>(
  ServiceChannels.GraphParallel,
);
