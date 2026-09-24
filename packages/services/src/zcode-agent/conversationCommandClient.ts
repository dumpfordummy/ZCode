/** Native interaction answers cannot require a provider or revive a missing runtime. */
export function conversationCommandClient<T>(
  command: { type: string; sessionId?: string | null; expectedRuntimeIdentity?: string },
  ports: {
    expected(identity: string): Promise<T>;
    existing(): Promise<T>;
    modelEnabled(): Promise<T>;
  },
): Promise<T> {
  if (command.expectedRuntimeIdentity) return ports.expected(command.expectedRuntimeIdentity);
  // 原生工具权限并非模型输入；只向仍存在的同一会话控制面转交，缺失时不能重启后猜测回答。
  if (command.type === "resolveInteraction" && command.sessionId?.trim()) return ports.existing();
  return ports.modelEnabled();
}
