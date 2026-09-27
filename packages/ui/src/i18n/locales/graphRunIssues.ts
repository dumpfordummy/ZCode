export const graphRunIssues: Record<string, [string, string]> = {
  "issue.missing-verification": ["No captured verification is available.", "没有可用的捕获验证。"],
  "issue.unconfirmed-observation": [
    "The test observation was not confirmed as valid.",
    "测试观察未被确认为有效。",
  ],
  "issue.mismatched-check-kind": [
    "The captured result does not match the required Test kind.",
    "捕获结果与必需的测试类型不匹配。",
  ],
  "issue.incomplete-observation": [
    "The process, fresh report, or parsed report is unconfirmed.",
    "进程、新报告或已解析报告未确认。",
  ],
  "issue.no-executed-tests": [
    "No executed tests were established by this report.",
    "此报告未证实实际执行过测试。",
  ],
  "issue.failed-pass-criteria": [
    "The captured result does not satisfy every passing criterion.",
    "捕获结果未满足全部通过标准。",
  ],
  "issue.missing-definitive-outcome": [
    "No definitive passing or failing Test outcome was captured.",
    "没有捕获明确通过或失败的测试结果。",
  ],
  "issue.missing-valid-verification-artifact": [
    "A valid matching verification artifact is missing from the captured record.",
    "捕获记录中缺少有效且匹配的验证工件。",
  ],
  "issue.missing-normalization-metadata": [
    "The matching normalization receipt or normalized report is missing or invalid.",
    "匹配的规范化收据或规范化报告缺失或无效。",
  ],
  "issue.missing-current-attempt": [
    "No matching check attempt exists in the selected iteration.",
    "所选迭代中没有匹配的检查尝试。",
  ],
  "issue.unconfirmed-command-result": [
    "The native process result is unconfirmed.",
    "原生进程结果未确认。",
  ],
  "issue.missing-check-node": [
    "The retained check does not match a captured Tool node.",
    "保留的检查与捕获的工具节点不匹配。",
  ],
  "issue.missing-current-gate": [
    "No approval attempt exists in the selected iteration.",
    "所选迭代中没有审批尝试。",
  ],
  "issue.missing-approval-request": [
    "The approval request has not been captured.",
    "审批请求尚未捕获。",
  ],
  "issue.mismatched-approval-request": [
    "The request does not match this run, step, attempt, and workspace.",
    "请求与此运行、步骤、尝试和工作区不匹配。",
  ],
  "issue.incomplete-approval-request": [
    "The captured approval evidence is incomplete.",
    "捕获的审批证据不完整。",
  ],
  "issue.stale-approval-request": [
    "The approval request is stale and needs a new review.",
    "审批请求已过期，需要重新审阅。",
  ],
  "issue.mismatched-approval-decision": [
    "The saved decision does not match this exact approval request.",
    "保存的决定与此确切审批请求不匹配。",
  ],
};
