import { create } from "zustand";

export type GraphViewMode = "workflows" | "design" | "runs" | "setup";

interface GraphViewSelection {
  mode: GraphViewMode;
  returnToWorkflow?: boolean;
  runId?: string;
  nodeId?: string;
  attemptId?: string;
  regionId?: string;
  editorMode?: "guided" | "advanced";
  edgeKey?: string;
}

/** Renderer-local navigation only. Accepted graphs, attempts and settings remain Host facts. */
export const useGraphEngineeringViewStore = create<{
  selections: Record<string, GraphViewSelection>;
  select: (workspaceKey: string, selection: Partial<GraphViewSelection>) => void;
}>((set) => ({
  selections: {},
  select: (workspaceKey, selection) =>
    set((state) => ({
      selections: {
        ...state.selections,
        [workspaceKey]: { mode: "design", ...state.selections[workspaceKey], ...selection },
      },
    })),
}));
