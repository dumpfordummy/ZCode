import {
  unknownExecutionEnvironment,
  zcodeExecutionEnvironmentPreviewSchema,
  zcodeProtocolMethods,
  type ZCodeWorkspaceRef,
} from "@zcode/shared";
import type { ZCodeProtocolClient } from "./zcodeProtocolClient.js";

/** No callback capable of starting a process is accepted by this preview boundary. */
export async function previewExistingExecutionEnvironment(
  client: Pick<ZCodeProtocolClient, "request" | "isDisposed"> | undefined,
  workspace: ZCodeWorkspaceRef,
  executables?: string[],
) {
  if (!client || client.isDisposed)
    return unknownExecutionEnvironment(
      "Native workspace is not initialized. Open the existing native Chat workspace, then refresh this preview. Preview did not start an agent.",
    );
  try {
    const preview = await client.request(
      zcodeProtocolMethods.workspacePreviewExecutionEnvironment,
      { workspace, ...(executables ? { executables } : {}) },
      zcodeExecutionEnvironmentPreviewSchema,
    );
    return client.isDisposed
      ? unknownExecutionEnvironment(
          "The native runtime closed during preview. Refresh before making an execution decision.",
        )
      : preview;
  } catch {
    // 只读预检失败不能冷启动或回落到会写配置的发现入口，原始错误可能含路径与凭据。
    return unknownExecutionEnvironment(
      "Native environment preview is unavailable or unsupported. No fallback startup or configuration discovery was performed.",
    );
  }
}
