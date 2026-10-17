import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button.js";
import { GraphDisclosure } from "./GraphDisclosure.js";
import { useGraphM4Text } from "./GraphM4Text.js";

/** Bounded disclosure presentation; selected-target failures stay in the parent primary view. */
export function GraphQuickDiagnostics({
  diagnostics,
  affected,
  notes = [],
}: {
  diagnostics: string[];
  affected: number;
  /** General explanations (inventory, test selection, default inputs): on demand, never the blocker. */
  notes?: string[];
}) {
  const t = useGraphM4Text();
  const [page, setPage] = useState(0);
  const identity = JSON.stringify(diagnostics);
  useEffect(() => setPage(0), [identity]);
  if (!diagnostics.length && !notes.length) return null;
  return (
    <GraphDisclosure
      testId="graph-quick-details"
      title={diagnostics.length ? t("quickDetails", { count: affected }) : t("quickDetailsGeneral")}
    >
      {notes.map((note) => (
        <p key={note} className="py-0.5 text-foreground-subtle">
          {note}
        </p>
      ))}
      <ul className="max-h-64 overflow-auto break-words">
        {diagnostics.slice(page * 20, (page + 1) * 20).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {diagnostics.length > 20 ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={!page}
            onClick={() => setPage((value) => value - 1)}
          >
            {t("quickPrevious")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={(page + 1) * 20 >= diagnostics.length}
            onClick={() => setPage((value) => value + 1)}
          >
            {t("quickNext")}
          </Button>
        </div>
      ) : null}
    </GraphDisclosure>
  );
}
