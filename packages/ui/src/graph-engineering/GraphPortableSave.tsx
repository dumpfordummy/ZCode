import type { GraphLibraryEntry, GraphLibraryView } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import type { useGraphWorkflow } from "@/hooks/useGraphWorkflow.js";
import { GraphSelect } from "./GraphSelect.js";
import { useGraphM3Text } from "./GraphM3Text.js";
import {
  type GraphMutationResult,
  type GraphSaveTarget,
  mutationResult,
  parseTargetValue,
  renameDisclosure,
  targetValue,
  versionTargets,
} from "./graphLibrarySave.js";
import type { PortableFlow } from "./usePortableFlow.js";

/**
 * UX-M3.2: the explicit save step of a reviewed portable template. The target is chosen here and
 * nowhere else; the disclosures (what will be created, any rename, unsaved design edits) are shown
 * before the confirm button; the result is read from the list the service returns.
 */
export function GraphPortableSave({
  prefix,
  workflow,
  flow,
  entries,
  view,
  target,
  onTarget,
  mutationBlocked,
  blockedId,
  disclosure,
  onSaved,
}: {
  prefix: string;
  workflow: ReturnType<typeof useGraphWorkflow>;
  flow: PortableFlow;
  entries: readonly GraphLibraryEntry[];
  view: GraphLibraryView;
  /** The effective target (see `useSaveTarget`). */
  target: GraphSaveTarget;
  onTarget(target: GraphSaveTarget): void;
  mutationBlocked?: string;
  /** The id of the paragraph that states `mutationBlocked`, for aria-describedby. */
  blockedId: string;
  /** Extra text that must be read before confirming (unsaved design edits). */
  disclosure?: (target: GraphSaveTarget) => string | undefined;
  onSaved(
    result: GraphMutationResult | undefined,
    before: GraphLibraryView,
    after: GraphLibraryView,
  ): void;
}) {
  const m3 = useGraphM3Text();
  const candidates = versionTargets(entries);
  const targetEntry =
    target.kind === "version" ? candidates.find((item) => item.id === target.entryId) : undefined;
  const { template } = flow;
  const rename = template ? renameDisclosure(target, entries, template.name) : undefined;
  const extra = disclosure?.(target);
  const save = () => {
    if (mutationBlocked || !template || workflow.pending) return;
    const before = view;
    void workflow
      .mutate(
        targetEntry
          ? { action: "version", id: targetEntry.id, template }
          : { action: "create", template },
        before.revision,
      )
      .then((after) => {
        if (!after) return;
        flow.setReviewed(false);
        onSaved(mutationResult(before, after), before, after);
      });
  };
  return (
    <div className="space-y-2" data-testid={`${prefix}-save`}>
      <GraphSelect
        label={m3("saveTarget")}
        testId={`${prefix}-target`}
        value={targetValue(target)}
        disabled={workflow.pending}
        options={[
          { value: "new", label: m3("targetNew") },
          ...candidates.map((item) => ({
            value: targetValue({ kind: "version", entryId: item.id }),
            label: m3("targetVersion", { name: item.name }),
          })),
        ]}
        onChange={(value) => {
          // 目标只决定保存到哪里，不改变已预览并已审阅的模板；需要重新预览的是 Save current design（见调用方）。
          onTarget(parseTargetValue(value));
        }}
      />
      {extra ? (
        <p role="status" className="text-warning" data-testid={`${prefix}-unsaved`}>
          {extra}
        </p>
      ) : null}
      {template ? (
        <div className="space-y-1" data-testid={`${prefix}-summary`}>
          <p className="text-foreground-subtle">
            {targetEntry
              ? m3("willAddVersion", { name: targetEntry.name })
              : m3("willCreate", { name: template.name })}
          </p>
          {rename ? (
            <p role="status" className="text-warning" data-testid={`${prefix}-rename`}>
              {m3("renameNotice", { from: rename.from, to: rename.to })}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-foreground-subtle">{m3("reviewFirst")}</p>
      )}
      <Button
        size="sm"
        disabled={Boolean(mutationBlocked) || !template || workflow.pending}
        aria-describedby={mutationBlocked ? blockedId : undefined}
        data-testid={`${prefix}-confirm`}
        data-target={targetValue(target)}
        onClick={save}
      >
        {targetEntry ? m3("confirmVersion", { name: targetEntry.name }) : m3("confirmNew")}
      </Button>
    </div>
  );
}
