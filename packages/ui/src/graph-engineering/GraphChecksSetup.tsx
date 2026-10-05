import { useEffect, useRef, useState } from "react";
import type {
  GraphChecksPreview,
  GraphChecksSelection as Selection,
  GraphRecipeSnapshot,
} from "@zcode/services";
import type { useGraphEngineering } from "@/hooks/useGraphEngineering.js";
import type { useGraphProjectSetup } from "@/hooks/useGraphProjectSetup.js";
import { useGraphDraftStore } from "@/store/graphDraftStore.js";
import { Button } from "@/components/ui/button.js";
import { GraphSelect } from "./GraphSelect.js";
import { GraphChecksSelection } from "./GraphChecksSelection.js";
import { GraphCheckCalibrationReview } from "./GraphCheckCalibrationReview.js";
import { useGraphSetupText } from "./GraphSetupFields.js";
import {
  graphChecksReviewKey,
  graphChecksSelectionIssue,
  recheckGraphChecksPreview,
} from "./graphChecksView.js";
import { graphRunIsUnresolved } from "./graphEditing.js";
import { associatedQuickChecks } from "./graphQuickDotnetModel.js";
import { useGraphM4Text } from "./GraphM4Text.js";

const empty: Extract<Selection, { kind: "recipes" }> = {
  kind: "recipes",
  recipeIds: [],
  buildMappings: {},
};
const probe: Extract<Selection, { kind: "dotnet-probe" }> = {
  kind: "dotnet-probe",
  executable: "dotnet",
  cwd: ".",
};
export function GraphChecksSetup({
  workspaceKey,
  workspacePath,
  graph,
  setup,
  snapshot,
  text,
  clean,
  disabled,
  onRun,
  advanced = true,
  requestedReview,
  onReviewRequested,
}: {
  workspaceKey: string;
  workspacePath: string;
  graph: ReturnType<typeof useGraphEngineering>;
  setup: ReturnType<typeof useGraphProjectSetup>;
  snapshot: GraphRecipeSnapshot | null;
  text: string;
  clean: boolean;
  disabled: boolean;
  onRun(runId: string): void;
  advanced?: boolean;
  requestedReview?: string;
  onReviewRequested?(): void;
}) {
  const t = useGraphSetupText();
  const m4 = useGraphM4Text();
  const draft = useGraphDraftStore((state) => state.workspaces[workspaceKey]?.setup);
  const mode = draft?.checksMode ?? "recipes";
  const selection =
    mode === "recipes"
      ? (draft?.checks ?? associatedQuickChecks(snapshot?.recipes ?? []) ?? empty)
      : (draft?.probe ?? probe);
  const update = useGraphDraftStore((state) => state.updateSetup);
  const revision = graph.view?.definition.revision ?? 0;
  const key = graphChecksReviewKey({ text, digest: snapshot?.digest ?? "", revision, selection });
  const current = useRef(key);
  current.current = key;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [review, setReview] = useState<{ key: string; preview: GraphChecksPreview }>();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [invalidated, setInvalidated] = useState(false);
  const availability = setup.state("availability", key);
  const preparing = setup.state("prepare-checks", key);
  const active = graph.view?.runs.some(graphRunIsUnresolved);
  const selectionIssue = graphChecksSelectionIssue(selection, snapshot?.recipes ?? []);
  const chosen = !selectionIssue;
  const configurationReady = selection.kind === "dotnet-probe" || clean;
  const canPrepare =
    setup.supported &&
    !disabled &&
    !active &&
    configurationReady &&
    chosen &&
    preparing.status !== "loading";
  const prepare = async () => {
    const result = await setup.invoke(
      {
        action: "prepare-checks",
        revision,
        expectedDigest: selection.kind === "dotnet-probe" ? "" : (snapshot?.digest ?? ""),
        selection,
      },
      key,
      () => current.current === key && alive.current,
    );
    return result?.kind === "checks-preview" ? result : undefined;
  };
  useEffect(() => {
    // 保存回执和草稿接受先完成，再消费一次性审阅意图；不触发运行或权限。
    if (!requestedReview || snapshot?.digest !== requestedReview) return;
    onReviewRequested?.();
    if (!canPrepare) {
      setError(t("saveFirst"));
      return;
    }
    setError("");
    void prepare().then((preview) => {
      if (preview) {
        setInvalidated(false);
        setReview({ key, preview });
      }
    });
  }, [requestedReview, snapshot?.digest, clean]);
  return (
    <section className="space-y-3" data-testid="graph-checks-setup">
      <div hidden={!advanced} className="space-y-3">
        <h3 className="text-ui-base font-medium">{t("checks")}</h3>
        <GraphSelect
          label={t("checks")}
          value={mode}
          disabled={disabled}
          testId="graph-check-mode"
          options={[
            { value: "recipes", label: t("recipes") },
            { value: "dotnet-probe", label: t("probe") },
          ]}
          onChange={(value) => update(workspaceKey, { checksMode: value as Selection["kind"] })}
        />
        <GraphChecksSelection
          selection={selection}
          recipes={snapshot?.recipes ?? []}
          disabled={disabled}
          onChange={(value) =>
            update(workspaceKey, value.kind === "recipes" ? { checks: value } : { probe: value })
          }
        />
        <p className="text-ui-sm text-foreground-subtle">{t("availabilityHelp")}</p>
        <Button
          size="sm"
          variant="outline"
          disabled={!setup.supported || !chosen || availability.status === "loading"}
          data-testid="graph-check-availability"
          onClick={() =>
            void setup.invoke(
              { action: "availability", selection },
              key,
              () => current.current === key,
            )
          }
        >
          {t("availability")}
        </Button>
        <div
          className="text-ui-sm"
          data-testid="graph-check-availability-state"
          data-state={availability.status}
        >
          {availability.status === "ready" && availability.result.kind === "availability" ? (
            <>
              {availability.result.environment.executables.map((item) => (
                <p key={item.executable} className="break-all">
                  {item.executable}: {item.status}
                  {item.path ? ` · ${item.path}` : ""}
                </p>
              ))}
              {availability.result.unknowns.map((item, index) => (
                <p key={index} className="text-warning">
                  {item}
                </p>
              ))}
            </>
          ) : availability.status === "error" ? (
            <p role="alert">{availability.error}</p>
          ) : (
            <p>{t(availability.status === "loading" ? "loading" : "idle")}</p>
          )}
        </div>
      </div>
      {advanced || snapshot?.recipes.length ? (
        <Button
          size="sm"
          data-testid="graph-check-prepare"
          disabled={!canPrepare}
          onClick={() => {
            setError("");
            void prepare().then((preview) => {
              if (preview) {
                setInvalidated(false);
                setReview({ key, preview });
              }
            });
          }}
        >
          {advanced ? t("prepare") : m4("quickRun")}
        </Button>
      ) : null}
      {!canPrepare && (advanced || Boolean(snapshot?.recipes.length)) ? (
        <p className="text-ui-sm text-warning" role="status">
          {!setup.supported
            ? t("unavailable")
            : !configurationReady
              ? t("saveFirst")
              : selectionIssue
                ? t(selectionIssue)
                : active
                  ? t("unresolvedRun")
                  : t("busy")}
        </p>
      ) : null}
      {error && !review ? (
        <p role="alert" className="text-ui-sm text-destructive">
          {error}
        </p>
      ) : null}
      {preparing.status === "error" ? (
        <p role="alert" className="text-ui-sm text-destructive">
          {preparing.error}
        </p>
      ) : null}
      {review ? (
        <GraphCheckCalibrationReview
          key={review.preview.digest}
          preview={review.preview}
          workspacePath={workspacePath}
          pending={confirming || graph.pending}
          current={!invalidated && review.key === key && configurationReady && !active && !disabled}
          error={error || graph.error || ""}
          onClose={() => setReview(undefined)}
          onConfirm={() => {
            if (review.key !== current.current) return;
            setConfirming(true);
            setError("");
            void (async () => {
              try {
                const valid = await recheckGraphChecksPreview(
                  review.preview,
                  prepare,
                  () => alive.current && current.current === review.key,
                );
                // 复检发现源码或环境变化后不可复用旧确认；关闭并重新准备才会解除失效状态。
                if (!valid) {
                  if (alive.current) {
                    setInvalidated(true);
                    setError(t("stalePreview"));
                  }
                  return;
                }
                const runId = await graph.runChecks(valid, true);
                if (runId && alive.current && current.current === review.key) {
                  setReview(undefined);
                  onRun(runId);
                }
              } finally {
                if (alive.current) setConfirming(false);
              }
            })();
          }}
        />
      ) : null}
    </section>
  );
}
