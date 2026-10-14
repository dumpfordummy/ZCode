import {
  ZCODE_NATIVE_CONTRACT_KEY,
  zcodeNativeContractSchema,
  zcodeNativeContractFeatures,
} from "@zcode/shared";
import type { IZCodeAgentService } from "../../index.js";
import type { GraphWorkspaceTarget } from "../approval-types.js";
export async function requireWebExecution(
  agent: Partial<Pick<IZCodeAgentService, "readRuntimeCapabilities">>,
  target: GraphWorkspaceTarget,
) {
  const result = await agent.readRuntimeCapabilities?.(target);
  const parsed = zcodeNativeContractSchema.safeParse(
    result?.supported
      ? (result.capabilities as Record<string, unknown>)[ZCODE_NATIVE_CONTRACT_KEY]
      : undefined,
  );
  if (
    !parsed.success ||
    !parsed.data.features.includes(zcodeNativeContractFeatures.projectWebProfileExecution)
  )
    throw Error(
      "This native runtime does not support the owned Web profile execution purpose; update the source runtime or use an existing supported configuration. No command fallback.",
    );
}
