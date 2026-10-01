import {
  encodeAutomaticNetworkDeny,
  resolveAutomaticNetworkPolicy,
  ZCODE_AUTOMATIC_NETWORK_DENY_ENV,
  ZCODE_PRODUCT_FLAVOR,
  type ZCodeProductFlavor,
} from "@zcode/shared";

/**
 * Agent 进程自身不判断产品身份：Host 总是显式下发被拒绝的自动网络类别（非 Graph 为空串），
 * 同时覆盖从环境继承来的同名变量，保证 Host 启动的 Agent 不会缺失或沿用外部设置的策略。
 */
export function buildAgentAutomaticNetworkEnv(
  /** 仅供测试覆盖；运行时使用编译期身份。 */
  flavor: ZCodeProductFlavor = ZCODE_PRODUCT_FLAVOR,
): Record<string, string> {
  return {
    [ZCODE_AUTOMATIC_NETWORK_DENY_ENV]: encodeAutomaticNetworkDeny(
      resolveAutomaticNetworkPolicy(flavor),
    ),
  };
}
