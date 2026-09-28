import type { GraphRun } from "@zcode/services";
import { graphSummaryAttempt } from "./graphRunSelection.js";

export function graphRunOutputs(run: GraphRun) {
  if (run.version === undefined) return [];
  return run.definition.nodes.flatMap((node) => {
    if (node.type !== "task" || node.output?.kind !== "json") return [];
    const attempt = graphSummaryAttempt(run, node.id, run.nodeAttempts);
    if (!attempt?.outputValidation) return [];
    const identity = { nodeId: node.id, name: node.name, attemptId: attempt.attemptId };
    if (attempt.outputValidation.status === "invalid")
      return [
        { ...identity, state: "invalid", issues: [...new Set(attempt.outputValidation.issues)] },
      ];
    // 这里只展示 Host 已验证的当前输出，不能把解析成功当作新的验收，也不能回退到旧迭代。
    try {
      const output = JSON.parse(attempt.finalOutput?.text ?? "");
      if (["pass", "needs_changes", "needs_human"].includes(output.outcome))
        return [{ ...identity, state: output.outcome as string, issues: [] as string[] }];
    } catch {
      // 历史记录不完整时不在 UI 发明结论；保留原检查器证据供查看。
    }
    return [];
  });
}
