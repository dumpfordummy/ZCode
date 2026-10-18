import type { GraphSequentialRun, GraphToolAttempt } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { graphRunCheck } from "./graphRunEvidence.js";
import { useGraphRunText } from "./GraphRunText.js";
import { GraphDisclosure } from "./GraphDisclosure.js";

export function GraphToolInspector({
  run,
  attempt,
  onOpenConversation,
}: {
  run: GraphSequentialRun;
  attempt: GraphToolAttempt;
  onOpenConversation: (path: string, session: string, identity?: string) => void;
}) {
  const { intl } = useZCodeIntl(),
    t = (id: string) => intl.formatMessage({ id: `graph.z4.${id}` });
  const verify = attempt.verification;
  const u = useGraphRunText(),
    check = graphRunCheck(run, attempt);
  // 报告只属于 Test 验证器；Build 的 false 默认值不应显示成缺失报告或验证失败。
  const hasTestReport = attempt.recipe.verifier.kind === "test";
  // UX-P2-F1：只有被接受的证据（通过或失败）的数字才是结果；其他状态下的数字是运行器的原始报告，
  // 必须标明未被接受，且没有任何数字时整行不显示（不显示一排破折号）。
  const accepted = check.state === "passed" || check.state === "failed";
  const reported = [verify?.testCount, verify?.passed, verify?.failed, verify?.skipped].some(
    (count) => count !== undefined,
  );
  const facts: [string, boolean | null | undefined][] = [
    ["processStarted", attempt.operation?.processStarted],
    ["processKnown", verify?.processKnown],
    ["exitSuccessful", verify?.exitSuccessful],
    ["reportFresh", hasTestReport ? verify?.reportFresh : null],
    ["reportParsed", hasTestReport ? verify?.reportParsed : null],
    ["acceptancePassed", verify?.acceptancePassed],
  ];
  return (
    <div
      className="space-y-3"
      data-testid="graph-tool-inspector"
      data-operation-id={attempt.operationId}
      data-session-id={attempt.sessionId ?? ""}
      data-status={attempt.status}
    >
      <p role="status" className="text-ui-sm">
        {u(`execution.${attempt.status}`)}
      </p>
      {/* UX-P2：先给出证据结论、原因与测试计数；六项是/否事实与通用解释放入“证据检查”披露。 */}
      <p
        data-testid="graph-tool-evidence"
        data-state={check.state}
        className="text-ui-base font-semibold"
      >
        {u(`check.${check.state}`)}
      </p>
      {check.issues.map((issue) => (
        <p key={issue} className="text-ui-sm text-warning">
          {u(`issue.${issue}`)}
        </p>
      ))}
      {verify?.issues.map((issue, index) => (
        <p key={index} className="break-words text-ui-sm text-warning">
          {issue}
        </p>
      ))}
      {attempt.message ? <p className="text-ui-sm text-warning">{attempt.message}</p> : null}
      {verify && hasTestReport && (accepted || reported) ? (
        <p
          className={accepted ? "text-ui-sm" : "text-ui-sm text-foreground-subtle"}
          data-testid="graph-tool-counts"
          data-accepted={accepted}
        >
          {u(accepted ? "testCounts" : "testCountsReported", {
            count: verify.testCount ?? "—",
            passed: verify.passed ?? "—",
            failed: verify.failed ?? "—",
            skipped: verify.skipped ?? "—",
          })}
        </p>
      ) : null}
      {attempt.sessionId ? (
        <Button
          size="sm"
          variant="outline"
          data-testid="graph-open-conversation"
          onClick={() =>
            onOpenConversation(
              run.target.workspacePath,
              attempt.sessionId!,
              run.target.workspaceIdentity,
            )
          }
        >
          {intl.formatMessage({ id: "graph.openConversation" })}
        </Button>
      ) : null}
      {/*
        这些事实在任何状态下都默认展开：Windows 原生驱动用 innerText 读取已完成 Build 步骤的
        graph-tool-reportFresh / reportParsed，而折叠的 details 内文本读出来是空串。
        折叠仍可由用户手动完成；默认折叠需要与驱动负责人协调（见 UX-P2 报告）。
      */}
      <GraphDisclosure
        title={u("evidenceChecks")}
        testId="graph-tool-evidence-checks"
        defaultOpen
        className="border-y border-border"
      >
        <p className="text-foreground-subtle">{t("toolMeaning")}</p>
        <dl className="grid grid-cols-1 gap-1 break-all">
          {facts.map(([key, value]) => (
            <div key={key}>
              <dt className="text-foreground-subtle">{t(key)}</dt>
              <dd data-testid={`graph-tool-${key}`}>
                {t(
                  value === null
                    ? "notApplicable"
                    : value === undefined
                      ? "unknown"
                      : value
                        ? "yes"
                        : "no",
                )}
              </dd>
            </div>
          ))}
          <div>
            <dt className="text-foreground-subtle">{t("classification")}</dt>
            <dd>{u(`kind.${verify?.classification ?? attempt.recipe.verifier.kind}`)}</dd>
          </div>
        </dl>
      </GraphDisclosure>
      <details className="text-ui-sm">
        <summary>{t("operation")}</summary>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all font-mono text-ui-xs">
          {JSON.stringify(
            {
              attemptId: attempt.attemptId,
              operationId: attempt.operationId,
              sessionId: attempt.sessionId,
              runtimeIdentity: attempt.runtimeIdentity,
              dispatchPhase: attempt.dispatchPhase,
              recipe: attempt.recipe,
              recipeDigest: attempt.recipeDigest,
              sourceDigest: attempt.sourceDigest,
              buildDigest: attempt.buildDigest,
              outputDigest: attempt.outputDigest,
              operation: attempt.operation,
              verification: attempt.verification,
            },
            null,
            2,
          )}
        </pre>
      </details>
    </div>
  );
}
