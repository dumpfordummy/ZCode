import type { GraphDefinition, GraphWorkspaceTarget } from "@zcode/services";

interface GraphTarget {
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string | null;
  remoteTarget?: unknown;
}

export interface GraphPanelProps extends GraphTarget {
  readOnlyReason?: string;
  onBack: () => void;
  onOpenConversation: (
    workspacePath: string,
    sessionId: string,
    workspaceIdentity?: string,
  ) => void;
}

export interface GraphDraftState {
  base: GraphDefinition;
  draft: GraphDefinition;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalValue(entry)]),
  );
}

export function graphDefinitionContent(definition: GraphDefinition): string {
  // Z2 schema 会按声明顺序重建节点与配置字段；对象键顺序不代表编辑内容，数组顺序仍保留。
  return JSON.stringify(canonicalValue({ ...definition, revision: 0 }));
}

export function reconcileGraphDraft(
  current: GraphDraftState,
  incoming: GraphDefinition,
): GraphDraftState {
  if (current.base.revision === incoming.revision) return current;
  // 本地保存的确认可以推进 revision；其他编辑器保存不能抹去尚未提交的本地指令。
  if (
    graphDefinitionContent(current.draft) === graphDefinitionContent(current.base) ||
    graphDefinitionContent(current.draft) === graphDefinitionContent(incoming)
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
