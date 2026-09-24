import { create } from "zustand";

interface GraphViewSelection {
  mode: "design" | "runs";
  runId?: string;
  nodeId?: string;
  attemptId?: string;
  regionId?: string;
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
