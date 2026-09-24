import type { ZCodeAgentRuntimeRetirement } from "./zcodeAgent.js";

const MAX_RETIREMENT_RECEIPTS = 256;

/** Ephemeral owner evidence; missing/evicted receipts always mean unknown. */
export class RuntimeRetirementLedger {
  private readonly receipts = new Map<string, ZCodeAgentRuntimeRetirement>();
  constructor(private readonly now: () => number = Date.now) {}

  async afterCleanup(
    identity: { workspaceKey: string; identity: string },
    cleanup: Promise<void>,
  ): Promise<void> {
    await cleanup;
    // unavailable 先于进程树清理；只有已拒绝在途 RPC 且清理成功才能证明原进程不再执行。
    if (!this.receipts.has(identity.identity)) {
      this.receipts.set(identity.identity, {
        runtimeIdentity: identity.identity,
        workspaceKey: identity.workspaceKey,
        retiredAt: this.now(),
      });
    }
    if (this.receipts.size > MAX_RETIREMENT_RECEIPTS) {
      const oldest = this.receipts.keys().next().value;
      if (oldest !== undefined) this.receipts.delete(oldest);
    }
  }

  get(workspaceKey: string, identity: string): ZCodeAgentRuntimeRetirement | null {
    const receipt = this.receipts.get(identity);
    return receipt?.workspaceKey === workspaceKey ? { ...receipt } : null;
  }
}

export function runtimeIdentityWithInstance(params: {
  workspaceKey: string;
  generation: number;
  processId?: number;
  runtimeInstanceId: string;
  lane?: string;
}): string {
  // Host 重启会重置 generation，OS 也会复用 PID；使用既有随机实例 ID 阻止旧图误认新进程。
  return `${params.workspaceKey}:${params.generation}:${params.processId ?? "unknown"}:${params.runtimeInstanceId}${params.lane ? `:${params.lane}` : ""}`;
}
