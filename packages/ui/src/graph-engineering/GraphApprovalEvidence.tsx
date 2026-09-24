import type { GraphApprovalEvidence as Evidence, GraphWorkspaceTarget } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

export function GraphApprovalEvidence({
  evidence,
  target,
  onOpenConversation,
}: {
  evidence: Evidence;
  target: GraphWorkspaceTarget;
  onOpenConversation: (
    workspacePath: string,
    sessionId: string,
    workspaceIdentity?: string,
  ) => void;
}) {
  const { intl } = useZCodeIntl();
  const t = (id: string) => intl.formatMessage({ id: `graph.approval.${id}` });
  return (
    <details
      open
      className="space-y-2 rounded-lg border border-border p-2 text-ui-sm"
      data-testid={`graph-approval-evidence-details-${evidence.alias}`}
      data-digest={evidence.digest}
    >
      <summary className="cursor-pointer font-medium">
        {evidence.alias} ·{" "}
        {evidence.source.kind === "start"
          ? t("startEvidence")
          : evidence.source.kind === "source"
            ? t("sourceEvidence")
            : evidence.source.kind === "repair-feedback"
              ? intl.formatMessage({ id: "graph.z5.repairFeedback" })
              : evidence.source.nodeId}
      </summary>
      <p className="break-all font-mono text-ui-xs text-foreground-subtlest">{evidence.digest}</p>
      {evidence.issue ? <p className="text-warning">{evidence.issue}</p> : null}
      {evidence.sourceSessionId ? (
        <>
          <Button
            size="sm"
            variant="outline"
            data-testid={`graph-approval-open-conversation-${evidence.alias}`}
            onClick={() =>
              onOpenConversation(
                target.workspacePath,
                evidence.sourceSessionId!,
                target.workspaceIdentity,
              )
            }
          >
            {t("openSourceConversation")}
          </Button>
          <dl className="break-all font-mono text-ui-xs text-foreground-subtle">
            <dt>{t("sourceSession")}</dt>
            <dd>{evidence.sourceSessionId}</dd>
            <dt>{t("sourceInput")}</dt>
            <dd>{evidence.sourceInputId ?? "—"}</dd>
            <dt>{t("sourceCommand")}</dt>
            <dd>{evidence.sourceCommandId ?? "—"}</dd>
          </dl>
        </>
      ) : null}
      {evidence.text !== undefined ? (
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-sans text-ui-sm">
          {evidence.text}
        </pre>
      ) : null}
      {evidence.snapshot ? (
        <>
          <p>{evidence.snapshot.complete ? t("evidenceComplete") : t("evidenceIncomplete")}</p>
          <p className="break-all">{evidence.snapshot.scope}</p>
          <details>
            <summary>{t("sourceBaseline")}</summary>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-ui-xs">
              {evidence.snapshot.baseline}
            </pre>
          </details>
          {evidence.snapshot.issues.map((issue, index) => (
            <p key={index} className="text-warning">
              {issue}
            </p>
          ))}
          {evidence.snapshot.files.map((file) => (
            <details
              key={`${file.path}:${file.status}`}
              className="border-t border-border pt-2"
              data-testid="graph-approval-source-file"
              data-path={file.path}
            >
              <summary className="cursor-pointer break-all font-mono">
                {file.status} · {file.path}
              </summary>
              {file.issue ? <p className="text-warning">{file.issue}</p> : null}
              {file.diff !== undefined ? (
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all font-mono text-ui-sm">
                  {file.diff}
                </pre>
              ) : null}
              {file.beforeText !== undefined ? (
                <details>
                  <summary>{t("beforeText")}</summary>
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all font-mono text-ui-sm">
                    {file.beforeText}
                  </pre>
                </details>
              ) : null}
              {file.afterText !== undefined ? (
                <details>
                  <summary>{t("afterText")}</summary>
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all font-mono text-ui-sm">
                    {file.afterText}
                  </pre>
                </details>
              ) : null}
            </details>
          ))}
          <p className="text-foreground-subtle">{t("sourceCoverage")}</p>
        </>
      ) : null}
    </details>
  );
}
