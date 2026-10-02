import type { IZCodeAgentService, IZCodeSessionService } from "../../index.js";
import type { GraphRuntimeGate } from "../app/runtime-ports.js";
import {
  evaluateGraphNativeRuntime,
  GraphRuntimeIncompatibleError,
  type GraphRuntimeProbe,
} from "../domain/native-runtime-contract.js";

export function createGraphRuntimeGate(options: {
  agentService: Pick<IZCodeAgentService, "readRuntimeCapabilities">;
  sessionService: Pick<IZCodeSessionService, "initializeWorkspace">;
}): GraphRuntimeGate {
  return {
    async require(target, purpose) {
      // 与对应 create() 相同的初始化方式：Tool-only 工作流不需要模型，不能被模型就绪门禁拦住。
      const initialized = await options.sessionService.initializeWorkspace(
        purpose === "tool" ? { ...target, purpose: "native-recipe" } : target,
      );
      if (!initialized.available)
        throw new Error(initialized.reason ?? "The native agent runtime is unavailable.");
      let probe: GraphRuntimeProbe;
      try {
        const read = await options.agentService.readRuntimeCapabilities(target);
        probe = read.supported
          ? { kind: "response", value: read.capabilities }
          : { kind: "unsupported" };
      } catch {
        // 传输错误文本可能含路径或环境信息；只保留「无法验证」这一类别，并按不兼容处理。
        probe = { kind: "failed" };
      }
      const verdict = evaluateGraphNativeRuntime(probe);
      if (!verdict.compatible) throw new GraphRuntimeIncompatibleError(verdict.diagnostic);
    },
  };
}
