import { Button } from "@/components/ui/button.js";
import type { GraphCarryReport as Report } from "@/store/graphDraftStore.js";
import { useGraphM3Text } from "./GraphM3Text.js";

const KIND = {
  parameter: "kindParameter",
  reference: "kindReference",
  check: "kindCheck",
  sourcePaths: "kindSourcePaths",
} as const;
const REASON = {
  absent: "reasonAbsent",
  type: "reasonType",
  kind: "reasonKind",
  node: "reasonNode",
} as const;

/** What Continue with the offered version carried over from the historical form, and what it could not. */
export function GraphCarryReport({ report, onDismiss }: { report: Report; onDismiss(): void }) {
  const m3 = useGraphM3Text();
  return (
    <div
      className="space-y-2 rounded-lg border border-border bg-surface p-3 text-ui-sm"
      data-testid="graph-carry-report"
    >
      <p className="font-medium">{m3("carryTitle", { from: report.fromVersion })}</p>
      <p data-testid="graph-carry-carried">
        {report.carried.length
          ? m3("carryCarried", {
              items: report.carried.map((item) => `${m3(KIND[item.kind])} ${item.id}`).join(", "),
            })
          : m3("carryNone")}
      </p>
      {report.notCarried.length ? (
        <div data-testid="graph-carry-not-carried">
          <p className="font-medium">{m3("carryNotCarried")}</p>
          <ul className="list-disc pl-5">
            {report.notCarried.map((item) => (
              <li key={`${item.kind}:${item.id}`}>
                {m3(KIND[item.kind])} <span className="font-mono">{item.id}</span> —{" "}
                {m3(REASON[item.reason])}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-foreground-subtle">{m3("carryStillRequired")}</p>
      <Button
        size="sm"
        variant="outline"
        data-testid="graph-carry-report-dismiss"
        onClick={onDismiss}
      >
        {m3("carryDismiss")}
      </Button>
    </div>
  );
}
