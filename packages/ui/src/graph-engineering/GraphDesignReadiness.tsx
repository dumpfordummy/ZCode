import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

export function GraphDesignReadiness({
  reason,
  errors,
  activeRunId,
  onOpenRun,
}: {
  reason?: string;
  errors: string[];
  activeRunId?: string;
  onOpenRun(runId: string): void;
}) {
  const { intl } = useZCodeIntl();
  const u = (id: string) => intl.formatMessage({ id: `graph.preZ8.${id}` });
  return (
    <>
      {reason ? (
        <div
          id="graph-run-reason"
          className="flex flex-wrap items-center gap-2 text-ui-sm"
          role="status"
          data-testid="graph-run-blocked-reason"
        >
          <p className="text-warning">{reason}</p>
          {activeRunId ? (
            <Button variant="outline" size="sm" onClick={() => onOpenRun(activeRunId)}>
              {u("openRuns")}
            </Button>
          ) : null}
          {errors.length ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                document
                  .querySelector<HTMLElement>(
                    '[data-testid="graph-node-inspector"] input, [data-testid="graph-node-inspector"] textarea, [data-testid="graph-node-inspector"] button',
                  )
                  ?.focus()
              }
            >
              {u("openDesign")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {errors.length ? (
        <details
          className="max-h-32 shrink-0 overflow-auto text-ui-sm"
          open
          data-testid="graph-readiness-errors"
        >
          <summary className="text-warning">{intl.formatMessage({ id: "graph.notReady" })}</summary>
          <ul className="list-disc pl-5">
            {errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}
