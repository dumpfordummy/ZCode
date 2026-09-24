import type { GraphSequentialRun, GraphToolAttempt } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

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
  // 报告只属于 Test 验证器；Build 的 false 默认值不应显示成缺失报告或验证失败。
  const hasTestReport = attempt.recipe.verifier.kind === "test";
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
        {intl.formatMessage({ id: `graph.status.${attempt.status}` })}
      </p>
      <p className="text-ui-sm text-foreground-subtle">{t("toolMeaning")}</p>
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
      {attempt.message ? <p className="text-ui-sm text-warning">{attempt.message}</p> : null}
      <dl className="grid grid-cols-1 gap-1 break-all text-ui-sm">
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
        <dt>{t("classification")}</dt>
        <dd>{verify?.classification ?? attempt.recipe.verifier.kind}</dd>
        <dt>{t("counts")}</dt>
        <dd>
          {verify
            ? `${verify.testCount ?? "—"} / ${verify.passed ?? "—"} / ${verify.failed ?? "—"} / ${verify.skipped ?? "—"}`
            : "—"}
        </dd>
      </dl>
      {verify?.issues.map((issue, index) => (
        <p key={index} className="text-ui-sm text-warning">
          {issue}
        </p>
      ))}
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
            },
            null,
            2,
          )}
        </pre>
      </details>
    </div>
  );
}
