import { z } from "zod";

/**
 * `runtime/capabilities` 的可选增量键：agent 声明自己实际分发的协议方法、已原生化的 v4 命令
 * 与具名行为。它是一组「名字」，只通过新增名字演进，因此不带 schema 版本；Host 读不懂的形状
 * 一律按不兼容处理。名字缺席表示「不能证明支持」，调用方必须保守解读。
 */
export const ZCODE_NATIVE_CONTRACT_KEY = "nativeContract" as const;

/** 不属于任何协议方法、但调用方依赖的行为名。 */
export const zcodeNativeContractFeatures = {
  /** `workspace/updateInteractionPreferences.protectedSessionIds` 会真正排除受保护 session 的自动应答。 */
  interactionProtectedSessions: "interaction.protectedSessions",
} as const;

const MAX_ENTRIES = 256;
const MAX_NAME_LENGTH = 128;
const nameList = z.array(z.string().max(MAX_NAME_LENGTH)).max(MAX_ENTRIES);

/** 宽松解析：未知附加键与未知附加名字都被容忍；缺字段或类型错误整体失败。 */
export const zcodeNativeContractSchema = z.object({
  protocol: z.object({
    name: z.string().max(MAX_NAME_LENGTH),
    version: z.number(),
    v4WireVersion: z.number(),
  }),
  methods: nameList,
  commands: nameList,
  features: nameList,
});
export type ZCodeNativeContract = z.infer<typeof zcodeNativeContractSchema>;
