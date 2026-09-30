import { useState } from "react";
import type {
  GraphDefinition,
  GraphLibraryEntry,
  GraphLibraryView,
  GraphSequentialDefinition,
} from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import type { useGraphWorkflow } from "@/hooks/useGraphWorkflow.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { GraphPortableReview } from "./GraphPortableReview.js";
import { GraphPortableSave } from "./GraphPortableSave.js";
import { useGraphM3Text } from "./GraphM3Text.js";
import {
  type GraphMutationResult,
  defaultSaveTarget,
  originIsBuiltin,
  saveDefaults,
} from "./graphLibrarySave.js";
import { usePortableFlow, useSaveTarget } from "./usePortableFlow.js";

/**
 * Save current design: capture the design shown in Workflows (unsaved edits included, and said so),
 * review the portable JSON, then save it as a new workflow or as a new version of one of yours.
 */
export function GraphShareSave({
  workflow,
  view,
  definition,
  dirty,
  mutationBlocked,
  blockedId,
  onSaved,
}: {
  workflow: ReturnType<typeof useGraphWorkflow>;
  view: GraphLibraryView;
  definition: GraphDefinition;
  dirty: boolean;
  mutationBlocked?: string;
  blockedId: string;
  onSaved(
    result: GraphMutationResult | undefined,
    before: GraphLibraryView,
    after: GraphLibraryView,
  ): void;
}) {
  const { intl } = useZCodeIntl();
  const t = (key: string) => intl.formatMessage({ id: `graph.z6.${key}` });
  const m3 = useGraphM3Text();
  const entries: readonly GraphLibraryEntry[] = view.entries;
  const [target, setTarget] = useSaveTarget(entries, defaultSaveTarget(entries, definition));
  const defaults = saveDefaults(target, entries, definition);
  // 名称与描述默认取目标已有的值；只有用户改过才不同，未改动的表单不会重命名工作流或丢描述。
  const [edit, setEdit] = useState<{ name?: string; description?: string }>({});
  const name = edit.name ?? defaults.name;
  const description = edit.description ?? defaults.description;
  const flow = usePortableFlow();
  const capturable = definition.version === 5;
  const change = (patch: { name?: string; description?: string }) => {
    setEdit((old) => ({ ...old, ...patch }));
    flow.invalidate();
  };
  return (
    <div className="space-y-2" data-testid="graph-share-save-design">
      <h4 className="font-medium">{m3("shareSaveTitle")}</h4>
      <p className="text-foreground-subtle">{m3("saveHelp")}</p>
      {originIsBuiltin(entries, definition) ? (
        <p role="status" className="text-foreground-subtle" data-testid="graph-save-builtin-origin">
          {m3("builtinOrigin")}
        </p>
      ) : null}
      <label className="block space-y-1">
        <span>{t("name")}</span>
        <Input
          value={name}
          disabled={workflow.pending}
          data-testid="graph-library-name"
          onChange={(event) => change({ name: event.target.value })}
        />
      </label>
      <label className="block space-y-1">
        <span>{t("description")}</span>
        <Input
          value={description}
          disabled={workflow.pending}
          data-testid="graph-library-description"
          onChange={(event) => change({ description: event.target.value })}
        />
      </label>
      <Button
        size="sm"
        variant="outline"
        disabled={workflow.pending || !capturable}
        data-testid="graph-library-capture"
        onClick={() =>
          void workflow
            .preview({
              action: "capture",
              definition: definition as GraphSequentialDefinition,
              name,
              description,
            })
            .then(flow.accept)
        }
      >
        {t("capture")}
      </Button>
      {capturable ? null : (
        <p role="status" className="text-warning" data-testid="graph-save-needs-v5">
          {m3("saveNeedsV5")}
        </p>
      )}
      <GraphPortableReview prefix="graph-save" flow={flow} disabled={workflow.pending} />
      <GraphPortableSave
        prefix="graph-save"
        workflow={workflow}
        flow={flow}
        entries={entries}
        view={view}
        target={target}
        onTarget={(next) => {
          setTarget(next);
          setEdit({});
        }}
        mutationBlocked={mutationBlocked}
        blockedId={blockedId}
        disclosure={(target) =>
          dirty ? m3(target.kind === "version" ? "unsavedVersion" : "unsavedWorkflow") : undefined
        }
        onSaved={(...args) => {
          setEdit({});
          onSaved(...args);
        }}
      />
    </div>
  );
}
