import type { GraphWorkspaceView } from "@zcode/services";

export interface GraphWorkspaceReadScope {
  sequence: number;
}
interface GraphWorkspaceReadState {
  view: GraphWorkspaceView | null;
  loading: boolean;
  error: string | null;
}
export interface GraphWorkspaceReadProjection {
  scope: GraphWorkspaceReadScope;
  state: GraphWorkspaceReadState;
}

/** effect 重置之前也按 scope 隔离，避免旧视图被写入新 workspace 的持久草稿。 */
export function graphWorkspaceReadState(
  scope: GraphWorkspaceReadScope,
  stored: GraphWorkspaceReadProjection | undefined,
  supported = true,
): GraphWorkspaceReadState {
  return stored?.scope === scope ? stored.state : { view: null, loading: supported, error: null };
}

export async function readGraphWorkspaceProjection({
  scope,
  isCurrent,
  read,
  publish,
}: {
  scope: GraphWorkspaceReadScope;
  isCurrent(): boolean;
  read(): Promise<GraphWorkspaceView>;
  publish(patch: Partial<GraphWorkspaceReadState>): void;
}): Promise<GraphWorkspaceView | undefined> {
  const sequence = ++scope.sequence;
  const current = () => isCurrent() && sequence === scope.sequence;
  if (!current()) return;
  try {
    const view = await read();
    if (!current()) return;
    publish({ view, loading: false, error: null });
    return view;
  } catch (cause) {
    if (current())
      publish({ error: cause instanceof Error ? cause.message : String(cause), loading: false });
  }
}
