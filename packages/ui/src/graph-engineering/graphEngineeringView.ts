import type { GraphDefinition, GraphWorkspaceTarget } from "@zcode/services";

interface GraphTarget {
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string | null;
  remoteTarget?: unknown;
}

export interface GraphDraftState {
  base: GraphDefinition;
  draft: GraphDefinition;
}

export function reconcileGraphDraft(
  current: GraphDraftState,
  incoming: GraphDefinition,
): GraphDraftState {
  if (current.base.revision === incoming.revision) return current;
  const content = (definition: GraphDefinition) => JSON.stringify({ ...definition, revision: 0 });
  // 本地保存的确认可以推进 revision；其他编辑器保存不能抹去尚未提交的本地指令。
  if (
    content(current.draft) === content(current.base) ||
    content(current.draft) === content(incoming)
  ) {
    return { base: incoming, draft: incoming };
  }
  return current;
}

export function isLocalGraphTarget(target: GraphTarget): boolean {
  return (
    Boolean(target.workspacePath.trim()) &&
    !(target.workspaceIdentity?.trim() || target.remoteSessionId?.trim() || target.remoteTarget)
  );
}

/** Keep identity distinct from the filesystem path, even when a platform rejects this scope. */
export function graphWorkspaceTarget(target: GraphTarget): GraphWorkspaceTarget {
  return {
    workspacePath: target.workspacePath,
    ...(target.workspaceIdentity ? { workspaceIdentity: target.workspaceIdentity } : {}),
  };
}

/** Navigation consumes only the persisted native identity; it never constructs a new task. */
export function graphConversationTarget(
  attempt: {
    workspacePath: string;
    workspaceIdentity?: string;
    sessionId: string | null;
  } | null,
): { workspacePath: string; workspaceIdentity?: string; sessionId: string } | null {
  return attempt?.sessionId
    ? {
        workspacePath: attempt.workspacePath,
        ...(attempt.workspaceIdentity ? { workspaceIdentity: attempt.workspaceIdentity } : {}),
        sessionId: attempt.sessionId,
      }
    : null;
}
