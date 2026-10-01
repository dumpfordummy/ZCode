// `runtime/capabilities.nativeContract`：agent 对外声明的最小原生契约（Graph 等客户端据此在准入
// 时判断运行时是否兼容）。名字只增不改；命令列表取自执行器自己的注册表，具名行为由本目录的
// 测试用真实 V4InteractionRegistry 逐条验证，协议方法由 server.ts 的分发 case 交叉校验。
import {
  zcodeNativeContractFeatures,
  zcodeProtocolMethods,
  ZCODE_PROTOCOL_NAME,
  ZCODE_PROTOCOL_VERSION,
  type ZCodeNativeContract,
} from "@zcode/shared";
import { V4_METHODS, V4_WIRE_PROTOCOL_VERSION } from "@zcode/shared/zcode-protocol-v4";

/** 刻意保持很小：只列出外部客户端会据此做兼容判断的方法。 */
export const NATIVE_CONTRACT_METHODS = [
  zcodeProtocolMethods.runtimeCapabilities,
  zcodeProtocolMethods.sessionCreate,
  zcodeProtocolMethods.sessionRecipeStart,
  zcodeProtocolMethods.sessionRecipeInspect,
  zcodeProtocolMethods.sessionRecipeCancel,
  zcodeProtocolMethods.workspaceUpdateInteractionPreferences,
  V4_METHODS.conversationSubscribe,
  V4_METHODS.command,
] as const;

/** 不是协议方法的具名行为；每一项都必须有真实实现上的测试。 */
export const NATIVE_CONTRACT_FEATURES = [
  zcodeNativeContractFeatures.interactionProtectedSessions,
] as const;

export function buildNativeContract(commandTypes: Iterable<string>): ZCodeNativeContract {
  return {
    protocol: {
      name: ZCODE_PROTOCOL_NAME,
      version: ZCODE_PROTOCOL_VERSION,
      v4WireVersion: V4_WIRE_PROTOCOL_VERSION,
    },
    methods: [...NATIVE_CONTRACT_METHODS],
    commands: [...commandTypes],
    features: [...NATIVE_CONTRACT_FEATURES],
  };
}
