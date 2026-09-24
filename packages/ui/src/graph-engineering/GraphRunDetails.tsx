import type { GraphRun } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { graphConversationTarget } from "./graphEngineeringView.js";

export function GraphRunDetails({
  run,
  disabled,
  onCancel,
  onOpenConversation,
}: {
  run: GraphRun;
  disabled: boolean;
  onCancel: (runId: string) => void;
  onOpenConversation: (
    workspacePath: string,
    sessionId: string,
    workspaceIdentity?: string,
  ) => void;
}) {
  const { intl } = useZCodeIntl();
  const t = (id: string) => intl.formatMessage({ id: `graph.${id}` });
  const cancellable = ["Starting", "Running", "WaitingForPermission", "WaitingForUser"].includes(
    run.status,
  );
  const conversation = graphConversationTarget({
    workspacePath: run.target.workspacePath,
    workspaceIdentity: run.target.workspaceIdentity,
    sessionId: run.sessionId ?? null,
  });
  return (
    <article
      className="space-y-3 rounded-xl border border-border bg-surface p-4"
      data-testid="graph-run"
      data-session-id={run.sessionId ?? ""}
      data-input-id={run.inputId}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-ui-base font-medium">{run.definition.taskName}</h3>
          <p role="status" className="text-ui-sm text-foreground-subtle">
            {t(`status.${run.status}`)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {conversation ? (
            <Button
              variant="outline"
              size="sm"
              data-testid="graph-open-conversation"
              onClick={() =>
                onOpenConversation(
                  conversation.workspacePath,
                  conversation.sessionId,
                  conversation.workspaceIdentity,
                )
              }
            >
              {t("openConversation")}
            </Button>
          ) : null}
          {cancellable ? (
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => onCancel(run.id)}
            >
              {t("cancel")}
            </Button>
          ) : null}
        </div>
      </div>
      {run.message && run.status !== "Completed" ? (
        <p className="break-words text-ui-sm text-foreground-subtle">{run.message}</p>
      ) : null}
      {run.status === "Completed" ? (
        <p className="text-ui-sm text-foreground-subtle">{t("completionMeaning")}</p>
      ) : null}
      {["WaitingForPermission", "WaitingForUser"].includes(run.status) ? (
        <p className="text-ui-sm text-foreground-subtle">{t("waitingHelp")}</p>
      ) : null}
      {["Unknown", "Interrupted"].includes(run.status) ? (
        <p className="text-ui-sm text-warning">{t("uncertainHelp")}</p>
      ) : null}
      <details className="text-ui-sm">
        <summary className="cursor-pointer text-foreground-subtle">{t("correlation")}</summary>
        <dl className="mt-2 grid grid-cols-1 gap-1 break-all font-mono text-foreground-subtle">
          <dt>{t("attempt")}</dt>
          <dd>{run.attemptId}</dd>
          <dt>{t("session")}</dt>
          <dd>{run.sessionId ?? "—"}</dd>
          <dt>{t("input")}</dt>
          <dd>{run.inputId}</dd>
          <dt>{t("command")}</dt>
          <dd>{run.commandId}</dd>
          <dt>{t("configuration")}</dt>
          <dd>
            {run.modelSelection.providerId} / {run.modelSelection.modelId} · {run.mode}
            {run.planEnabled ? " + plan" : ""}
          </dd>
          <dt>{t("workspace")}</dt>
          <dd>{run.target.workspacePath}</dd>
          <dt>{t("instructions")}</dt>
          <dd className="whitespace-pre-wrap">{run.definition.instructions}</dd>
        </dl>
      </details>
    </article>
  );
}
