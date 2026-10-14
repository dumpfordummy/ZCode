import { useEffect, useState } from "react";
import type { GraphInspection } from "@zcode/services";
import type { useGraphProjectSetup } from "@/hooks/useGraphProjectSetup.js";
import { Button } from "@/components/ui/button.js";
import { useGraphM4Text } from "./GraphM4Text.js";

/** Read-only receipt discovery. Reconciliation/cancel act only on the retained original identity. */
export function GraphInspectionRecovery({
  setup,
  onOpenConversation,
}: {
  setup: ReturnType<typeof useGraphProjectSetup>;
  onOpenConversation?: (path: string, session: string, identity?: string) => void;
}) {
  const t = useGraphM4Text();
  const [records, setRecords] = useState<GraphInspection[]>([]);
  const [busy, setBusy] = useState(false);
  const read = async () => {
    setBusy(true);
    const result = await setup.invoke({ action: "inspection-history" }, "history");
    if (result?.kind === "inspection-history") setRecords(result.records);
    setBusy(false);
  };
  useEffect(() => {
    let disposed = false;
    queueMicrotask(() => {
      if (!disposed) void read();
    });
    return () => {
      disposed = true;
    };
  }, [setup.invoke]);
  const reconcile = async (row: GraphInspection, action: "status" | "cancel") => {
    setBusy(true);
    const result = await setup.invoke(
      { action: "inspection", command: { action, id: row.id } },
      `recovery:${row.id}`,
    );
    if (result?.kind === "project-inspection")
      setRecords((old) => old.map((item) => (item.id === result.id ? result : item)));
    setBusy(false);
  };
  return (
    <details data-testid="graph-inspection-recovery" className="space-y-2 text-ui-sm">
      <summary>{t("inspectionHistory")}</summary>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void read()}>
        {t("inspectionRefresh")}
      </Button>
      {records
        .slice()
        .reverse()
        .map((row) => (
          <div
            key={row.id}
            data-operation-id={row.id}
            data-status={row.status}
            className="space-y-2 rounded-md border border-border p-2"
          >
            <p>
              {row.selection.project} / {row.selection.configuration} / {row.selection.framework}
            </p>
            <p role="status">{t(`inspectionState.${row.status}`)}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void reconcile(row, "status")}
              >
                {t("inspectionRefresh")}
              </Button>
              {row.reserved ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void reconcile(row, "cancel")}
                >
                  {t("inspectionCancel")}
                </Button>
              ) : null}
              {row.sessionId && onOpenConversation ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setup.preserveInspectionOnNavigation(row.id);
                    onOpenConversation(
                      row.target.workspacePath,
                      row.sessionId!,
                      row.target.workspaceIdentity,
                    );
                  }}
                >
                  {t("inspectionConversation")}
                </Button>
              ) : null}
            </div>
          </div>
        ))}
    </details>
  );
}
