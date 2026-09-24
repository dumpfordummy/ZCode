import { useState } from "react";
import type { GraphArtifactContent, GraphSequentialRun } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { Textarea } from "@/components/ui/textarea.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

export interface GraphEvidenceActions {
  readArtifact(runId: string, artifactId: string): Promise<GraphArtifactContent | undefined>;
  exportManifest(runId: string): Promise<string | undefined>;
}
export function GraphArtifactInspector({
  run,
  nodeId,
  attemptId,
  actions,
  disabled,
}: {
  run: GraphSequentialRun;
  nodeId?: string;
  attemptId?: string;
  actions: GraphEvidenceActions;
  disabled: boolean;
}) {
  const { intl } = useZCodeIntl(),
    t = (id: string) => intl.formatMessage({ id: `graph.z4.${id}` });
  const [content, setContent] = useState<GraphArtifactContent>(),
    [manifest, setManifest] = useState<string>();
  const artifacts =
    run.artifacts?.filter(
      (artifact) =>
        (artifact.nodeId === nodeId && (!attemptId || artifact.attemptId === attemptId)) ||
        (run.definition.nodes.find((node) => node.id === nodeId)?.type === "end" &&
          artifact.id === run.resultArtifactId),
    ) ?? [];
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
            disabled={disabled}
            data-testid={`graph-artifact-open-${artifact.id}`}
            onClick={() =>
              void actions.readArtifact(run.id, artifact.id).then((value) => {
                if (value) setContent(value);
              })
            }
          >
            {t("inspectContent")}
          </Button>
        </details>
      ))}
      {content ? (
        <div>
          <p className="text-ui-sm text-foreground-subtle">{t("contentMeaning")}</p>
          <pre
            data-testid="graph-artifact-content"
            data-artifact-id={content.artifact.id}
            className="max-h-80 overflow-auto whitespace-pre-wrap break-all font-mono text-ui-sm"
          >
            {content.content}
          </pre>
        </div>
      ) : null}
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        data-testid="graph-export-manifest"
        onClick={() => void actions.exportManifest(run.id).then(setManifest)}
      >
        {t("exportManifest")}
      </Button>
      {manifest !== undefined ? (
        <div data-testid="graph-export-manifest-content">
          <p className="text-ui-sm text-foreground-subtle">{t("manifestHelp")}</p>
          <Textarea
            readOnly
            data-testid="graph-artifact-manifest"
            aria-label={t("exportManifest")}
            value={manifest}
            rows={8}
            className="w-full rounded-lg border border-input-border bg-input p-2 font-mono text-ui-sm"
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
      ) : null}
    </div>
  );
}
