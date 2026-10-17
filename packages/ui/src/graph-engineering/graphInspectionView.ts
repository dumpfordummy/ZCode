import type { GraphInspection } from "@zcode/services";

type GraphInspectionStatus = GraphInspection["status"];

/**
 * 项目检查（MSBuild 求值）的呈现规则。只决定“显示什么”，不决定“能做什么”：
 * 启动、取消、刷新的处理函数与参数仍由 GraphProjectInspection 持有，记录由 Host 拥有。
 */
export interface GraphInspectionView {
  /** 授权前的副作用披露：操作一旦提交（占用）即由阶段行取代。 */
  notice: boolean;
  /** 选择已被记录或预设固定：用一行摘要代替一组禁用的选择框。 */
  locked: boolean;
  /** 只有真实存在原生权限会话时才提供“打开权限会话”。 */
  conversation: boolean;
  /** 提示用户回应权限提示（仅当提示确实存在）。 */
  permissionInstruction: boolean;
  start: boolean;
  /** 重新审核；操作被占用时不提供（旧记录由状态/取消处理）。 */
  review: boolean;
  /** 查看原操作状态：仅当原操作仍被占用（含 executor-lost）。 */
  refresh: boolean;
  /** 取消：仅当存在可取消的占用或待启动的审核。 */
  cancel: boolean;
  /** 需要用户注意的终态（失败、过期、被拒绝、所有权不确定等）。 */
  attention: boolean;
  /** 审核按钮是下一步的唯一主操作（无记录或终态后重新检查）。 */
  reviewIsPrimary: boolean;
}

const settled: readonly GraphInspectionStatus[] = [
  "review-ready",
  "verifying-sources",
  "awaiting-permission",
  "running",
  "succeeded",
  "cancelled",
];

export function graphInspectionView(input: {
  status?: GraphInspectionStatus;
  reserved?: boolean;
  fixedSelection?: boolean;
  busy?: boolean;
  /** 记录带有受管会话，且调用方提供了跳转函数。 */
  hasSession?: boolean;
}): GraphInspectionView {
  const { status, reserved = false, fixedSelection = false, busy = false } = input;
  const recorded = status !== undefined;
  return {
    notice: !reserved,
    locked: fixedSelection || reserved,
    conversation:
      Boolean(input.hasSession) && (status === "awaiting-permission" || status === "running"),
    permissionInstruction: status === "awaiting-permission",
    start: status === "review-ready",
    review: !reserved,
    refresh: recorded && reserved,
    cancel: recorded && (reserved || status === "review-ready"),
    attention: recorded && !busy && !settled.includes(status),
    reviewIsPrimary: !reserved && status !== "review-ready",
  };
}
