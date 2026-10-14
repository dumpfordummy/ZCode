import type { GraphProjectDiscovery } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { GraphQuickDiagnostics } from "./GraphQuickDiagnostics.js";
import { useGraphM4Text } from "./GraphM4Text.js";

/** Bounded inventory disclosure; selected blockers always stay outside Details. */
export function GraphQuickSummary({
  discovery,
  prepared,
  issue,
  build,
  visible,
  hasCopies,
  groupCopies,
  toggleCopies,
}: {
  discovery: GraphProjectDiscovery;
  prepared?: GraphProjectDiscovery;
  issue: string;
  build: string;
  visible: number;
  hasCopies: boolean;
  groupCopies: boolean;
  toggleCopies(): void;
}) {
  const t = useGraphM4Text();
  const diagnostics = [
    ...new Set([
      ...(prepared?.issues ?? []),
      ...discovery.issues,
      ...[...(prepared?.candidates ?? []), ...discovery.candidates].flatMap((item) =>
        [...(item.quickIssues ?? []), ...item.issues].map((message) =>
          message.startsWith(`${item.path}:`) ? message : `${item.path}: ${message}`,
        ),
      ),
    ]),
  ].slice(0, 128);
  return (
    <>
      <p className="text-ui-base font-medium">
        {t(
          discovery.status !== "complete"
            ? "quickPartial"
            : discovery.candidates.length
              ? "quickDetected"
              : "quickNoRunner",
        )}
        {discovery.status !== "complete" && discovery.issues[0] ? (
          <span className="mt-1 block break-words text-ui-sm font-normal">
            {discovery.issues[0].slice(0, 240)}
          </span>
        ) : null}
      </p>
      {prepared?.prepared ? (
        <p className="text-ui-sm">
          {t("quickPrepared", { count: prepared.prepared.scope.sourceCount })}
        </p>
      ) : null}
      {issue ? (
        <p role="status" className="text-ui-sm text-warning break-words">
          {!build ? (
            t("quickChooseTargets")
          ) : (
            <>
              {t("quickUnavailable")} {issue.slice(0, 1000)}
            </>
          )}
        </p>
      ) : null}
      <GraphQuickDiagnostics
        diagnostics={diagnostics}
        affected={
          discovery.candidates.filter(
            (item) => item.coverage === "unsupported" || item.quickIssues?.length,
          ).length
        }
      />
      <p className="text-ui-sm">
        {t("quickInventoryCount", { count: discovery.candidates.length, visible })}
      </p>
      {hasCopies ? (
        <div className="space-y-1">
          <Button
            size="sm"
            variant="ghost"
            aria-pressed={groupCopies}
            onClick={toggleCopies}
            data-testid="graph-quick-group-copies"
          >
            {t(groupCopies ? "quickShowCopies" : "quickGroupCopies")}
          </Button>
          <p className="text-ui-sm text-foreground-subtle">{t("quickCopyHelp")}</p>
        </div>
      ) : null}
    </>
  );
}
