import { webProfileReadScope, type InspectionSelection } from "@zcode/shared";
import { useEffect, useRef, useState } from "react";
import type { GraphInspection, GraphInspectionSetupCommand } from "@zcode/services";
import type { useGraphProjectSetup } from "@/hooks/useGraphProjectSetup.js";
import { Button } from "@/components/ui/button.js";
import { GraphSelect } from "./GraphSelect.js";
import { useGraphM4Text } from "./GraphM4Text.js";

/** Observation only: intentionally has no proposal, Save or run callback. */
export function GraphProjectInspection({
  setup,
  project,
  configuration,
  disabled,
  onOpenConversation,
  fixedSelection,
  initialRecord,
  onRecord,
}: {
  fixedSelection?: InspectionSelection;
  initialRecord?: GraphInspection;
  onRecord?: (record: GraphInspection) => void;
  setup: ReturnType<typeof useGraphProjectSetup>;
  project: string;
  configuration: string;
  disabled: boolean;
  onOpenConversation?: (path: string, session: string, identity?: string) => void;
}) {
  const t = useGraphM4Text();
  const [sdk, setSdk] = useState(fixedSelection?.sdkVersion ?? "");
  const [framework, setFramework] = useState(fixedSelection?.framework ?? "");
  const [record, setRecord] = useState<GraphInspection>();
  const [busy, setBusy] = useState(false);
  const owned = useRef<string | undefined>(undefined);
  const generation = useRef(0);
  const key = JSON.stringify({ project, configuration, sdk, framework, fixedSelection });
  useEffect(() => {
    generation.current++;
    setRecord(initialRecord);
    owned.current =
      initialRecord?.reserved || initialRecord?.status === "review-ready"
        ? initialRecord.id
        : undefined;
    setBusy(false);
    return () => {
      generation.current++;
      // 仅明确进入原权限会话的导航可保留操作；普通卸载和根/选择变更仍取消。
      if (owned.current && setup.shouldCancelInspection(owned.current))
        void setup.cancelInspection(owned.current);
      owned.current = undefined;
    };
  }, [key, setup.cancelInspection]);
  useEffect(() => {
    if (initialRecord && !record) {
      setRecord(initialRecord);
      owned.current =
        initialRecord.reserved || initialRecord.status === "review-ready"
          ? initialRecord.id
          : undefined;
    }
  }, [initialRecord, record]);
  const invoke = async (command: GraphInspectionSetupCommand) => {
    const version = generation.current;
    setBusy(true);
    const result = await setup.invoke({ action: "inspection", command }, key);
    if (result?.kind === "project-inspection") {
      if (version !== generation.current) {
        void setup.cancelInspection(result.id);
      } else {
        owned.current = result.reserved || result.status === "review-ready" ? result.id : undefined;
        onRecord?.(result);
        setRecord(result);
      }
    }
    if (version === generation.current) setBusy(false);
  };
  useEffect(() => {
    if (!record?.reserved || busy || record.status === "executor-lost") return;
    const timer = setTimeout(() => void invoke({ action: "status", id: record.id }), 1000);
    return () => clearTimeout(timer);
  }, [record, busy]);
  const lane = setup.state("inspection", key);
  const options = (values: string[]) => values.map((value) => ({ value, label: value }));
  return (
    <section
      className="space-y-2"
      data-testid="graph-project-inspection"
      data-status={record?.status ?? "unsupported"}
    >
      <p className="text-ui-sm text-warning">{t("inspectionWarning")}</p>
      <p className="text-ui-sm text-foreground-subtle">{t("inspectionObservationOnly")}</p>
      <GraphSelect
        label={t("inspectionSdk")}
        value={sdk}
        onChange={setSdk}
        options={options(["8.0.425", "8.0.426", "10.0.401"])}
        disabled={!!fixedSelection || busy || record?.reserved || disabled}
      />
      <GraphSelect
        label={t("inspectionFramework")}
        value={framework}
        onChange={setFramework}
        options={options(["net8.0", "net10.0"])}
        disabled={!!fixedSelection || busy || record?.reserved || disabled}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={
          disabled ||
          busy ||
          record?.reserved ||
          !sdk ||
          !framework ||
          !["Debug", "Release"].includes(configuration)
        }
        onClick={() =>
          void invoke({
            action: "review",
            selection: fixedSelection ?? {
              project,
              configuration: configuration as "Debug" | "Release",
              framework,
              sdkVersion: sdk as "8.0.425" | "8.0.426" | "10.0.401",
            },
          })
        }
      >
        {t("inspectionReview")}
      </Button>
      {busy ? (
        <p role="status" className="text-ui-sm">
          {t(
            record && record.status !== "review-ready"
              ? "inspectionChecking"
              : "inspectionVerifying",
          )}
        </p>
      ) : null}
      {record ? (
        <>
          <p role="status" className="text-ui-sm">
            {t(`inspectionState.${record.status}`)}
          </p>
          {record.request ? (
            <details open={record.status === "review-ready"}>
              <summary className="text-ui-sm">{t("inspectionCommand")}</summary>
              <dl className="space-y-1 break-all text-ui-sm">
                <dt>{t("inspectionCommand")}</dt>
                <dd className="font-mono">{record.request.recipe.executable}</dd>
                <dd>
                  <ol>
                    {record.request.recipe.args.map((argument, index) => (
                      <li className="font-mono" key={index}>
                        {argument}
                      </li>
                    ))}
                  </ol>
                </dd>
                <dt>{t("inspectionScope")}</dt>
                <dd className="font-mono">
                  {record.target.workspacePath}
                  <br />
                  {record.request.inspection?.sdkDirectory}
                  {record.request.inspection?.runtimeProfile ? (
                    <details>
                      <summary>{t("webReadScope")}</summary>
                      <ul>
                        {webProfileReadScope(record.request.inspection.runtimeProfile).map(
                          (path) => (
                            <li key={path}>{path}</li>
                          ),
                        )}
                      </ul>
                    </details>
                  ) : null}
                </dd>
                <dd>
                  {record.request.inspection?.observedFiles} {t("inspectionFiles")}; 30s / 64KiB / 1
                  process; {t("inspectionExpiry")}{" "}
                  {new Date(record.request.inspection!.expiresAt).toISOString()}
                </dd>
              </dl>
            </details>
          ) : null}
          {record.status === "review-ready" ? (
            <Button
              size="sm"
              disabled={busy || disabled}
              onClick={() =>
                void invoke({
                  action: "start",
                  id: record.id,
                  requestDigest: record.requestDigest!,
                  selection: record.selection,
                })
              }
            >
              {t("inspectionStart")}
            </Button>
          ) : null}
          {record.status === "awaiting-permission" ? (
            <p className="text-ui-sm" data-testid="graph-inspection-permission-instruction">
              {t("inspectionPermission")} <span className="font-mono">{record.sessionId}</span>
            </p>
          ) : null}
          {record.sessionId && onOpenConversation ? (
            <Button
              size="sm"
              variant="outline"
              data-testid="graph-inspection-conversation"
              disabled={busy}
              onClick={() => {
                setup.preserveInspectionOnNavigation(record.id);
                onOpenConversation(
                  record.target.workspacePath,
                  record.sessionId!,
                  record.target.workspaceIdentity,
                );
              }}
            >
              {t("inspectionConversation")}
            </Button>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void invoke({ action: "status", id: record.id })}
            >
              {t("inspectionRefresh")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void invoke({ action: "cancel", id: record.id })}
            >
              {t("inspectionCancel")}
            </Button>
          </div>
          {record.projection ? (
            <details>
              <summary className="text-ui-sm">{t("inspectionObserved")}</summary>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all text-ui-sm">
                {JSON.stringify(record.projection, null, 2)}
              </pre>
            </details>
          ) : null}
        </>
      ) : null}
      {lane.status === "error" ? (
        <p role="alert" className="text-ui-sm text-destructive">
          {lane.error}
        </p>
      ) : null}
    </section>
  );
}
