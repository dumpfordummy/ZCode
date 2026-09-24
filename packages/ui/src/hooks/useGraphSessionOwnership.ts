import { useEffect, useState } from "react";
import { useWorkspaceServicesResolution } from "./useWorkspaceServices.js";

/** UI indication only; the native Host guard remains authoritative, including other attachments. */
export function useGraphSessionOwnership(
  scope: { workspacePath: string; workspaceIdentity?: string; remoteSessionId?: string | null },
  sessionId: string | null,
): boolean {
  const { services, rpcReady } = useWorkspaceServicesResolution(
    scope.workspacePath,
    scope.remoteSessionId,
    scope.workspaceIdentity,
  );
  const service = services.graphEngineeringService;
  const workspaceKey = scope.workspaceIdentity?.trim() || scope.workspacePath;
  const [ownedState, setOwnedState] = useState<{ key: string; owned: boolean } | null>(null);
  const key = `${workspaceKey}:${sessionId ?? ""}`;
  useEffect(() => {
    if (!service || !rpcReady || !sessionId) return;
    let live = true;
    let sequence = 0;
    const read = async () => {
      const current = ++sequence;
      try {
        const owned = await service.isSessionOwned({
          workspacePath: scope.workspacePath,
          workspaceIdentity: scope.workspaceIdentity,
          sessionId,
        });
        if (live && current === sequence) setOwnedState({ key, owned });
      } catch {
        // Host 拒绝仍是最终门禁；读取失败不得阻断普通聊天或交互应答。
      }
    };
    const subscription = service.onDidChange((event) => {
      if (event.workspaceKey === workspaceKey) void read();
    });
    void read();
    return () => {
      live = false;
      subscription.dispose();
    };
  }, [
    service,
    rpcReady,
    sessionId,
    scope.workspacePath,
    scope.workspaceIdentity,
    workspaceKey,
    key,
  ]);
  return ownedState?.key === key && ownedState.owned;
}
