import { useState } from "react";
import type { GraphLibraryEntry } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import type { useGraphWorkflow } from "@/hooks/useGraphWorkflow.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useGraphM3Text } from "./GraphM3Text.js";

/**
 * Duplicate the selected version into a new workflow of your own, and archive or restore one.
 * Both are library mutations: refused (with the reason) while the workspace is occupied, and for
 * built-ins the supported path is "Duplicate to edit", not archiving.
 */
export function GraphLibraryManage({
  workflow,
  entry,
  version,
  mutationBlocked,
  blockedId,
}: {
  workflow: ReturnType<typeof useGraphWorkflow>;
  entry: GraphLibraryEntry;
  version?: number;
  mutationBlocked?: string;
  /** The id of the paragraph that states `mutationBlocked`, for aria-describedby. */
  blockedId: string;
}) {
  const { intl } = useZCodeIntl();
  const t = (key: string) => intl.formatMessage({ id: `graph.z6.${key}` });
  const m3 = useGraphM3Text();
  const [name, setName] = useState("");
  const revision = workflow.view?.revision;
  const blockedBy = mutationBlocked ? blockedId : undefined;
  const duplicate = () => {
    if (mutationBlocked || version === undefined || revision === undefined || !name.trim()) return;
    void workflow.mutate({ action: "duplicate", id: entry.id, version, name }, revision);
  };
  const archive = () => {
    if (mutationBlocked || entry.builtin || revision === undefined) return;
    void workflow.mutate({ action: "archive", id: entry.id, archived: !entry.archived }, revision);
  };
  return (
    <div className="space-y-2" data-testid="graph-library-manage-actions">
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label={t("duplicateName")}
          placeholder={t("duplicateName")}
          data-testid="graph-library-duplicate-name"
          className="min-w-40 flex-1"
          value={name}
          disabled={Boolean(mutationBlocked)}
          onChange={(event) => setName(event.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={Boolean(mutationBlocked) || version === undefined || !name.trim()}
          aria-describedby={blockedBy}
          data-testid="graph-library-duplicate"
          onClick={duplicate}
        >
          {entry.builtin ? m3("duplicateToEdit") : t("duplicate")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={Boolean(mutationBlocked) || entry.builtin}
          aria-describedby={entry.builtin ? "graph-library-builtin-note" : blockedBy}
          data-testid="graph-library-archive"
          onClick={archive}
        >
          {t(entry.archived ? "restore" : "archive")}
        </Button>
      </div>
      {entry.builtin ? (
        <p
          id="graph-library-builtin-note"
          className="text-ui-xs text-foreground-subtle"
          data-testid="graph-library-builtin-note"
        >
          {m3("builtinNoArchive")}
        </p>
      ) : null}
    </div>
  );
}
