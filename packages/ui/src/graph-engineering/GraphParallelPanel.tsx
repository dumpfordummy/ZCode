import { useState } from "react";
import type {
  GraphNativeSettings,
  GraphParallelPlan as Plan,
  GraphParallelPreview,
} from "@zcode/services";
import { submissionModeSchema } from "@zcode/shared/zcode-protocol-v4";
import { Button } from "@/components/ui/button.js";
import { Checkbox } from "@/components/ui/checkbox.js";
import { useGraphParallel } from "@/hooks/useGraphParallel.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { GraphConfiguration, useGraphConfiguration } from "./GraphConfiguration.js";
import { GraphParallelPlan } from "./GraphParallelPlan.js";
import { GraphParallelRun } from "./GraphParallelRun.js";
import { emptyParallelPlan } from "./graphParallelView.js";
import type { GraphPanelProps } from "./graphEngineeringView.js";

export function GraphParallelPanel(props: GraphPanelProps) {
  const graph = useGraphParallel(props),
    config = useGraphConfiguration(props.workspacePath, props.workspaceIdentity);
  const { intl } = useZCodeIntl(),
    t = (key: string) => intl.formatMessage({ id: `graph.z7.${key}` });
  const [draft, setDraft] = useState<Plan | null>(null),
    [preview, setPreview] = useState<GraphParallelPreview | null>(null),
    [ack, setAck] = useState(false),
    [runId, setRunId] = useState<string>(),
    [editing, setEditing] = useState(true);
  const plan = draft ?? graph.view?.plan ?? emptyParallelPlan();
  const mode = submissionModeSchema.safeParse(config.draftConfig.mode),
    selection = config.draftConfig.modelSelection;
  const settings: GraphNativeSettings | null =
    selection && mode.success
      ? {
          modelSelection: selection,
          mode: mode.data,
          planEnabled: config.draftConfig.planEnabled ?? false,
        }
      : null;
  const disabled = graph.pending || Boolean(props.readOnlyReason) || graph.view?.readOnly === true;
  const current = graph.view?.runs.find((r) => r.id === runId) ?? graph.view?.runs.at(-1);
  const dirty = JSON.stringify(plan) !== JSON.stringify(graph.view?.plan);
  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3" data-testid="parallel-panel">
      <p className="text-ui-sm text-foreground-subtle">{t("help")}</p>
      <p
        className="rounded-xl border border-border bg-card p-3 text-ui-sm"
        data-testid="parallel-topology"
      >
        {t("topology")}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant={editing ? "secondary" : "ghost"} onClick={() => setEditing(true)}>
          {t("design")}
        </Button>
        <Button
          variant={!editing ? "secondary" : "ghost"}
          onClick={() => setEditing(false)}
          data-testid="parallel-runs"
        >
          {t("runs")}
        </Button>
        <Button variant="ghost" onClick={() => void graph.reload()}>
          {t("refresh")}
        </Button>
      </div>
      {graph.error ? (
        <p role="alert" className="text-ui-sm text-destructive">
          {graph.error}
        </p>
      ) : null}
      {!graph.supported ? (
        <p className="text-ui-sm">{t("unavailable")}</p>
      ) : editing ? (
        <>
          <GraphParallelPlan
            plan={plan}
            disabled={disabled}
            onChange={(value) => {
              setDraft(value);
              setPreview(null);
              setAck(false);
            }}
          />
          <details className="text-ui-sm">
            <summary>{t("configuration")}</summary>
            <GraphConfiguration
              workspacePath={props.workspacePath}
              workspaceIdentity={props.workspaceIdentity}
              config={config}
              disabled={disabled}
            />
          </details>
          <p className="text-ui-sm text-foreground-subtle">{t("recipesHelp")}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() =>
                void graph.save(plan).then((saved) => {
                  if (saved) setDraft(saved);
                })
              }
              data-testid="parallel-save"
            >
              {t("save")}
            </Button>
            <Button
              variant="outline"
              disabled={disabled || dirty || !settings || !plan.enabled}
              onClick={() => {
                if (settings)
                  void graph.preview(plan.revision, settings).then((value) => {
                    if (value) {
                      setPreview(value);
                      setAck(false);
                    }
                  });
              }}
              data-testid="parallel-preview"
            >
              {t("preview")}
            </Button>
          </div>
          {preview ? (
            <section
              className="space-y-3 rounded-xl border border-border p-3"
              data-testid="parallel-preflight"
            >
              <p className="break-all font-mono text-ui-xs">
                {preview.base.workspacePath} · {preview.base.head}
              </p>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all text-ui-xs">
                {JSON.stringify(preview, null, 2)}
              </pre>
              <label className="flex items-start gap-2 text-ui-sm">
                <Checkbox
                  checked={ack}
                  onCheckedChange={(v) => setAck(v === true)}
                  data-testid="parallel-prepare-ack"
                />
                {t("prepareAck")}
              </label>
              <Button
                disabled={disabled || dirty || !ack || !settings}
                onClick={() => {
                  if (settings)
                    void graph.prepare(plan.revision, settings, preview.digest, ack).then((run) => {
                      if (run) {
                        setRunId(run.id);
                        setEditing(false);
                        setPreview(null);
                      }
                    });
                }}
                data-testid="parallel-prepare"
              >
                {t("prepare")}
              </Button>
            </section>
          ) : null}
        </>
      ) : (
        <>
          <label className="block text-ui-sm">
            {t("runs")}
            <select
              className="ml-2 max-w-full rounded-lg border border-input-border bg-input p-2"
              value={current?.id ?? ""}
              onChange={(e) => setRunId(e.target.value)}
            >
              {graph.view?.runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.plan.name} · {t(`phase.${r.phase}`)} · {r.id}
                </option>
              ))}
            </select>
          </label>
          {current && graph.view ? (
            <GraphParallelRun
              key={current.id}
              run={current}
              view={graph.view}
              actions={graph}
              onOpenConversation={props.onOpenConversation}
            />
          ) : (
            <p className="text-ui-sm">{t("empty")}</p>
          )}
        </>
      )}
    </div>
  );
}
