import type { ZCodeProductFlavor } from "./env.js";

/** 显式、不受支持的开发期并行 opt-in；受支持的 Graph 安装包永远忽略它。 */
export const GRAPH_EXPERIMENTAL_PARALLEL_ENV = "ZCODE_GRAPH_EXPERIMENTAL_PARALLEL" as const;

export type GraphParallelPolicyMode = "disabled" | "experimental";
export type GraphParallelPolicySource = "supported-package" | "development-opt-in" | "default";

export interface GraphParallelPolicy {
  readonly mode: GraphParallelPolicyMode;
  readonly source: GraphParallelPolicySource;
  readonly reason: string;
}

/**
 * 并行（Fork/Join）能力的唯一策略来源。
 * 原因：Z7-A12（导出/导入）未通过且没有安装包验收，因此受支持的 Graph 安装包默认关闭并行。
 * Host 在服务边界据此拒绝新的并行准入，UI 与发布清单只读取同一个结果，不各自判断。
 * 受支持安装包（flavor === "graph"）忽略环境变量，避免继承的变量意外开启。
 */
export function resolveGraphParallelPolicy(input: {
  flavor: ZCodeProductFlavor;
  env?: Record<string, string | undefined>;
}): GraphParallelPolicy {
  if (input.flavor === "graph")
    return {
      mode: "disabled",
      source: "supported-package",
      reason:
        "Parallel workflows are not enabled in this package: their export/import and packaged acceptance are incomplete. Existing parallel history stays readable and can be cancelled or cleaned up.",
    };
  if (input.env?.[GRAPH_EXPERIMENTAL_PARALLEL_ENV]?.trim() === "1")
    return {
      mode: "experimental",
      source: "development-opt-in",
      reason: "Experimental parallel workflows were enabled explicitly for development. Unsupported.",
    };
  return {
    mode: "disabled",
    source: "default",
    reason:
      "Parallel workflows are disabled by default. Set ZCODE_GRAPH_EXPERIMENTAL_PARALLEL=1 in a development build to try the unsupported experimental feature.",
  };
}
