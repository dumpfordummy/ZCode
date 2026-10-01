import { resolveFeedbackSubmissionPolicy, ZCODE_PRODUCT_FLAVOR } from "@zcode/shared";

/**
 * Feedback 提交与上传是否可用（Z8.3-N1）。判据只来自 shared 的 Feedback 策略；
 * Graph 内部版不提供上传，所有入口据此隐藏，Host 服务与 Main 命令各自再拒绝一次。
 */
export const FEEDBACK_SUBMISSION_AVAILABLE: boolean =
  resolveFeedbackSubmissionPolicy(ZCODE_PRODUCT_FLAVOR).allowed;
