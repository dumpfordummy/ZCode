import type { GraphArtifactContent, GraphSequentialRun } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { Textarea } from "@/components/ui/textarea.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useGraphInspectionRead } from "@/hooks/useGraphInspectionRead.js";
import { useGraphRunText } from "./GraphRunText.js";
import type { GraphInspectionState } from "./graphInspectionRead.js";
import { graphInspectionArtifacts } from "./graphRunPresentation.js";

export interface GraphEvidenceActions {
  readArtifact(runId: string, artifactId: string): Promise<GraphArtifactContent | undefined>;
  exportManifest(runId: string): Promise<string | undefined>;
}
export function GraphArtifactInspector({
  run,
  nodeId,
  attemptId,
  actions,
}: {
  run: GraphSequentialRun;
  nodeId?: string;
  attemptId?: string;
  actions: GraphEvidenceActions;
}) {
  const { intl } = useZCodeIntl(),
    t = (id: string) => intl.formatMessage({ id: `graph.z4.${id}` });
  const u = useGraphRunText();
  const scope = JSON.stringify([
    run.target.workspaceIdentity?.trim() || run.target.workspacePath,
    run.target.workspacePath,
    run.id,
    nodeId,
    attemptId,
  ]);
  const content = useGraphInspectionRead<GraphArtifactContent>(scope, actions.readArtifact);
  const manifest = useGraphInspectionRead<string>(scope, actions.exportManifest);
  const artifacts = graphInspectionArtifacts(run, nodeId, attemptId);
  return (
    <div className="space-y-3" data-testid="graph-artifact-inspector">
      <h4 className="text-ui-sm font-medium">{t("artifacts")}</h4>
      {artifacts.map((artifact) => (
        <details key={artifact.id} className="space-y-2 text-ui-sm">
          <summary className="cursor-pointer break-all">
            {artifact.type} · {artifact.sourcePath ?? artifact.id} · {artifact.validation}
          </summary>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-ui-xs">
            {JSON.stringify(artifact, null, 2)}
          </pre>
          {artifact.issue ? <p className="text-warning">{artifact.issue}</p> : null}
          <Button
            size="sm"
            variant="outline"
            disabled={content.state.status === "loading" && content.state.key === artifact.id}
            data-testid={`graph-artifact-open-${artifact.id}`}
            onClick={() =>
              void content.load(
                artifact.id,
                async () => {
                  const value = await actions.readArtifact(run.id, artifact.id);
                  if (
                    value &&
                    (value.artifact.id !== artifact.id || value.artifact.runId !== run.id)
                  )
                    throw new Error(u("readMismatch"));
                  return value;
                },
                u("readMissing"),
              )
            }
          >
            {t("inspectContent")}
          </Button>
        </details>
      ))}
      <ReadState state={content.state} testId="graph-artifact" />
      {content.state.status === "ready" ? (
        <div>
          <p className="text-ui-sm text-foreground-subtle">{t("contentMeaning")}</p>
          <pre
            data-testid="graph-artifact-content"
            data-artifact-id={content.state.value.artifact.id}
            className="max-h-80 overflow-auto whitespace-pre-wrap break-all font-mono text-ui-sm"
          >
            {content.state.value.content}
          </pre>
        </div>
      ) : null}
      <Button
        size="sm"
        variant="outline"
        disabled={manifest.state.status === "loading"}
        data-testid="graph-export-manifest"
        onClick={() =>
          void manifest.load(run.id, () => actions.exportManifest(run.id), u("readMissing"))
        }
      >
        {t("exportManifest")}
      </Button>
      <ReadState state={manifest.state} testId="graph-manifest" />
      {manifest.state.status === "ready" ? (
        <div data-testid="graph-export-manifest-content">
          <p className="text-ui-sm text-foreground-subtle">{t("manifestHelp")}</p>
          <Textarea
            readOnly
            data-testid="graph-artifact-manifest"
            aria-label={t("exportManifest")}
            value={manifest.state.value}
            rows={8}
            className="w-full rounded-lg border border-input-border bg-input p-2 font-mono text-ui-sm"
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
      ) : null}
    </div>
  );
}

function ReadState({ state, testId }: { state: GraphInspectionState<unknown>; testId: string }) {
  const u = useGraphRunText();
  return (
    <div
      role="status"
      data-testid={`${testId}-read-state`}
      data-state={state.status}
      className="text-ui-sm"
    >
      {state.status === "loading" ? <p>{u("reading")}</p> : null}
      {state.status === "error" ? (
        <div data-testid={`${testId}-read-error`} className="space-y-1 text-warning">
          <p>{u("readFailed")}</p>
          <p className="break-words">{state.error}</p>
        </div>
      ) : null}
    </div>
  );
}
