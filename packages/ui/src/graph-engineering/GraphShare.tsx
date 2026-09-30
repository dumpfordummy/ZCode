import type {
  GraphDefinition,
  GraphLibraryEntry,
  GraphLibraryView,
  GraphWorkspaceTarget,
} from "@zcode/services";
import type { useGraphWorkflow } from "@/hooks/useGraphWorkflow.js";
import { GraphShareExport } from "./GraphShareExport.js";
import { GraphShareImport } from "./GraphShareImport.js";
import { GraphShareSave } from "./GraphShareSave.js";
import { useGraphM3Text } from "./GraphM3Text.js";
import type { GraphMutationResult } from "./graphLibrarySave.js";

/** The Share section: save the current design, export a version, import a file. Three separate tasks. */
export function GraphShare({
  workflow,
  view,
  definition,
  dirty,
  entry,
  version,
  mutationBlocked,
  exportBlocked,
  blockedId,
  target,
  onSaved,
}: {
  workflow: ReturnType<typeof useGraphWorkflow>;
  view: GraphLibraryView;
  definition: GraphDefinition;
  dirty: boolean;
  entry?: GraphLibraryEntry;
  version?: number;
  mutationBlocked?: string;
  exportBlocked?: string;
  blockedId: string;
  target: GraphWorkspaceTarget;
  onSaved(
    result: GraphMutationResult | undefined,
    before: GraphLibraryView,
    after: GraphLibraryView,
  ): void;
}) {
  const m3 = useGraphM3Text();
  return (
    <div className="space-y-5 text-ui-sm" data-testid="graph-share-tasks">
      <p className="text-foreground-subtle">{m3("shareIntro")}</p>
      <GraphShareSave
        workflow={workflow}
        view={view}
        definition={definition}
        dirty={dirty}
        mutationBlocked={mutationBlocked}
        blockedId={blockedId}
        onSaved={onSaved}
      />
      <GraphShareExport
        key={`${entry?.id ?? "none"}:${version ?? "none"}`}
        workflow={workflow}
        entry={entry}
        version={version}
        disabled={workflow.pending}
        exportBlocked={exportBlocked}
        target={target}
      />
      <GraphShareImport
        manual={false}
        workflow={workflow}
        view={view}
        mutationBlocked={mutationBlocked}
        blockedId={blockedId}
        target={target}
        onSaved={onSaved}
      />
    </div>
  );
}
