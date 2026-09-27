import type { GraphRecipeSnapshot } from "@zcode/services";

export type GraphRecipeReadState =
  | { status: "not-loaded"; snapshot: null }
  | { status: "loading"; snapshot: GraphRecipeSnapshot | null }
  | { status: "ready"; snapshot: GraphRecipeSnapshot }
  | { status: "error"; snapshot: GraphRecipeSnapshot | null; error: string };
export interface GraphRecipeReadScope {
  sequence: number;
  snapshot: GraphRecipeSnapshot | null;
}

/** 旧 workspace 或旧读取的回执既不能写投影，也不能返回给保留在 store 中的表单。 */
export async function readGraphRecipeSnapshot({
  scope,
  isCurrent,
  read,
  publish,
}: {
  scope: GraphRecipeReadScope;
  isCurrent(): boolean;
  read(): Promise<GraphRecipeSnapshot>;
  publish(state: GraphRecipeReadState): void;
}): Promise<GraphRecipeSnapshot | undefined> {
  const sequence = ++scope.sequence;
  const current = () => isCurrent() && sequence === scope.sequence;
  if (!current()) return;
  publish({ status: "loading", snapshot: scope.snapshot });
  try {
    const snapshot = await read();
    if (!current()) return;
    scope.snapshot = snapshot;
    publish({ status: "ready", snapshot });
    return snapshot;
  } catch (cause) {
    if (current())
      publish({
        status: "error",
        snapshot: scope.snapshot,
        error: cause instanceof Error ? cause.message : String(cause),
      });
  }
}
