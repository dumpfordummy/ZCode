import { useState } from "react";
import type { GraphProjectCandidate, GraphDotnetPreset } from "@zcode/services";
import type { useGraphProjectSetup } from "@/hooks/useGraphProjectSetup.js";
import { Button } from "@/components/ui/button.js";
import { GraphSelect } from "./GraphSelect.js";
import { useGraphSetupText } from "./GraphSetupFields.js";
import { useGraphM4Text } from "./GraphM4Text.js";

export function GraphProjectDiscovery({
  setup,
  disabled,
  testLimitReached,
  onBuild,
  onTest,
}: {
  setup: ReturnType<typeof useGraphProjectSetup>;
  disabled: boolean;
  testLimitReached: boolean;
  onBuild(candidate: GraphProjectCandidate, scope?: GraphDotnetPreset["sourceScope"]): void;
  onTest(candidate: GraphProjectCandidate, framework: string): void;
}) {
  const t = useGraphSetupText();
  const m = useGraphM4Text();
  const [page, setPage] = useState(0);
  const [requestId, setRequestId] = useState("");
  const [frameworks, setFrameworks] = useState<Record<string, string>>({});
  const state = setup.state("scan", requestId);
  const result =
    state.status === "ready" && state.result.kind === "discovery" ? state.result : undefined;
  const cancelled = state.status === "ready" && state.result.kind === "scan-cancelled";
  const status = result?.status ?? (cancelled ? "cancelled" : state.status);
  return (
    <section className="space-y-3" data-testid="graph-project-discovery" data-state={status}>
      <h3 className="text-ui-base font-medium">{t("discovery")}</h3>
      <p className="text-ui-sm text-foreground-subtle">{t("scanHelp")}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!setup.supported || state.status === "loading"}
          data-testid="graph-project-scan"
          onClick={() => {
            const id = crypto.randomUUID();
            setRequestId(id);
            setPage(0);
            void setup.invoke({ action: "scan", requestId: id }, id);
          }}
        >
          {t("scan")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={state.status !== "loading"}
          data-testid="graph-project-cancel-scan"
          onClick={() => void setup.invoke({ action: "cancel-scan", requestId }, requestId)}
        >
          {t("cancelScan")}
        </Button>
      </div>
      <p className="text-ui-sm" role="status">
        {state.status === "error"
          ? state.error
          : t(
              result
                ? result.status
                : cancelled
                  ? "cancelled"
                  : state.status === "loading"
                    ? "scanning"
                    : "notScanned",
            )}
      </p>
      {result?.issues.length ? (
        <details className="text-ui-sm text-warning">
          <summary>{result.issues[0]}</summary>
          {result.issues.slice(1, 21).map((issue) => (
            <p key={issue}>{issue}</p>
          ))}
        </details>
      ) : null}
      {result && !result.candidates.length ? (
        <p className="text-ui-sm">{t("noCandidates")}</p>
      ) : null}
      {result?.candidates.slice(page * 20, (page + 1) * 20).map((candidate) => (
        <article
          key={candidate.path}
          className="space-y-2 rounded-lg border border-border p-3 text-ui-sm"
          data-testid="graph-project-candidate"
          data-path={candidate.path}
        >
          <p className="break-all font-medium">{candidate.path}</p>
          <p>
            {candidate.kind} · {candidate.runner} · {candidate.coverage}
          </p>
          {candidate.evidence.map((value, index) => (
            <p key={index} className="text-foreground-subtle">
              {value}
            </p>
          ))}
          {candidate.issues.map((value, index) => (
            <p key={index} className="text-warning">
              {value}
            </p>
          ))}
          <div className="flex flex-wrap items-end gap-2">
            <Button
              size="sm"
              variant="outline"
              data-testid="graph-project-use-build"
              disabled={disabled || candidate.coverage === "unsupported"}
              onClick={async () => {
                const id = crypto.randomUUID();
                setRequestId(id);
                setPage(0);
                const prepared = await setup.invoke(
                  { action: "scan", requestId: id, selectedProject: candidate.path },
                  id,
                );
                if (prepared?.kind === "discovery" && prepared.prepared)
                  onBuild(candidate, prepared.prepared.scope);
              }}
            >
              {t("useBuild")}
            </Button>
            {candidate.frameworks.length ? (
              <GraphSelect
                label={t("framework")}
                value={frameworks[candidate.path] ?? "none"}
                disabled={disabled}
                options={[
                  { value: "none", label: "—" },
                  ...candidate.frameworks.map((framework) => ({
                    value: framework,
                    label: framework,
                  })),
                ]}
                onChange={(value) => setFrameworks((old) => ({ ...old, [candidate.path]: value }))}
              />
            ) : null}
            <Button
              size="sm"
              variant="outline"
              data-testid="graph-project-add-test"
              disabled={
                disabled ||
                result.status !== "complete" ||
                candidate.coverage === "unsupported" ||
                candidate.runner !== "vstest" ||
                testLimitReached ||
                !frameworks[candidate.path] ||
                frameworks[candidate.path] === "none"
              }
              onClick={() => onTest(candidate, frameworks[candidate.path]!)}
            >
              {t("addTest")}
            </Button>
          </div>
          {testLimitReached ? <p className="text-warning">{t("presetLimit")}</p> : null}
        </article>
      ))}
      {result && result.candidates.length > 20 ? (
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={!page}
            onClick={() => setPage((value) => value - 1)}
          >
            {m("quickPrevious")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={(page + 1) * 20 >= result.candidates.length}
            onClick={() => setPage((value) => value + 1)}
          >
            {m("quickNext")}
          </Button>
        </div>
      ) : null}
      {result ? (
        <details className="text-ui-sm">
          <summary>{t("metadata")}</summary>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-ui-xs">
            {JSON.stringify(
              {
                digest: result.digest,
                metadata: result.metadata,
                excluded: result.excluded,
                limits: result.limits,
              },
              null,
              2,
            )}
          </pre>
        </details>
      ) : null}
    </section>
  );
}
