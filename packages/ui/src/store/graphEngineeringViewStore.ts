import { create } from "zustand";

/**
 * Destinations: Runs (new run, supervision, results), Workflows (graph design, library, versions,
 * transfer; id kept as "design" for compatibility with native test ids), Checks (id "setup").
 */
export type GraphViewMode = "runs" | "design" | "setup";

/**
 * UX-M1.3: where keyboard focus should land after a navigation the user asked for. Renderer-local,
 * consumed once by the element's owner when it mounts, and cleared by any navigation that does not
 * set it again, so it can never move focus later, on a refresh or on a Host event.
 */
export type GraphFocusRequest = "run" | "draft" | { checkId: string };

interface GraphViewSelection {
  mode: GraphViewMode;
  /** Runs destination: "new" shows the new-run form; undefined shows the selected run. */
  pane?: "new";
  returnToWorkflow?: boolean;
  focus?: GraphFocusRequest;
  /** Checks destination: the saved check (by stable id) the editor should open. Navigation only. */
  checkId?: string;
  runId?: string;
  nodeId?: string;
  attemptId?: string;
  regionId?: string;
  editorMode?: "guided" | "advanced";
  edgeKey?: string;
  /** Runs destination: show the read-only graph of the frozen run definition. */
  runGraph?: boolean;
}

/** Renderer-local navigation only. Accepted graphs, attempts and settings remain Host facts. */
export const useGraphEngineeringViewStore = create<{
  selections: Record<string, GraphViewSelection>;
  select: (workspaceKey: string, selection: Partial<GraphViewSelection>) => void;
  /** Open one run (and optionally one step); leaves the new-run pane. */
  selectRun: (
    workspaceKey: string,
    runId: string,
    step?: { nodeId?: string; attemptId?: string },
  ) => void;
}>((set) => ({
  selections: {},
  select: (workspaceKey, selection) =>
    set((state) => ({
      selections: {
        ...state.selections,
        // 没有已存选择时进入“新建运行”，而不是一个空白设计草稿。
        [workspaceKey]: {
          mode: "runs",
          pane: "new",
          ...state.selections[workspaceKey],
          ...selection,
          // 焦点请求只属于发起它的那一次导航。
          focus: "focus" in selection ? selection.focus : undefined,
        },
      },
    })),
  selectRun: (workspaceKey, runId, step) =>
    set((state) => ({
      selections: {
        ...state.selections,
        [workspaceKey]: {
          ...state.selections[workspaceKey],
          mode: "runs",
          pane: undefined,
          runId,
          nodeId: step?.nodeId,
          attemptId: step?.attemptId,
          regionId: undefined,
          focus: undefined,
        },
      },
    })),
}));
