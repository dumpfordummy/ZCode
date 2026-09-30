import type { GraphErrorSource } from "@/hooks/useGraphEngineering.js";

/** A failure of the admission path, framed by the New-run bar and the review commit bar. */
export interface GraphAdmissionFailure {
  kind: "review" | "start";
  /** The authoritative message, shown verbatim beneath the UI framing. */
  message: string;
}

/**
 * UX-M2.3：新建运行操作栏与审阅提交栏只显示准入路径（预检、Start）的失败。
 * 修复原因：UX-M1 规范第 9 节已规定这两处只显示实例化/预检/Start 的失败，但实现只排除了检查保存，
 * 取消、审批决定、设计保存等其他操作的失败仍可能出现在 Review and run 旁边，像是审阅失败。
 * 依据：useGraphEngineering 为每个动作错误标注来源；这里按来源放行，其他来源仍由各自页面的通用提示显示。
 * 实例化失败来自 useGraphWorkflow（不经过这里），由 GraphLibrary 作为 review 类失败传入。
 */
export function graphAdmissionFailure(
  error: string | null | undefined,
  source: GraphErrorSource | undefined,
): GraphAdmissionFailure | undefined {
  if (!error || (source !== "review" && source !== "start")) return undefined;
  return { kind: source, message: error };
}
