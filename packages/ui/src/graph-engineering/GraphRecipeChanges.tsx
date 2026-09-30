import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button.js";
import { useGraphDraftStore } from "@/store/graphDraftStore.js";
import { useGraphM2Text } from "./GraphM2Text.js";
import {
  graphRecipeChanges,
  type GraphRecipeChange,
  type GraphRecipeChanges,
} from "./graphRecipeChanges.js";

/** UX-M2.2: the unsaved check edits of one workspace, derived from the draft store (never stored). */
export function useGraphRecipeChanges(workspaceKey: string): GraphRecipeChanges {
  const recipes = useGraphDraftStore((state) => state.workspaces[workspaceKey]?.recipes);
  return graphRecipeChanges(recipes);
}

/** A check as the user knows it: its name (verbatim) and its stable id. Never translated. */
const label = (item: GraphRecipeChange) => (item.name ? `${item.name} (${item.id})` : item.id);

function ChangeList({ changes }: { changes: GraphRecipeChanges }) {
  const m2 = useGraphM2Text();
  if (changes.kind === "unsummarizable")
    return (
      <p className="text-warning" data-testid="graph-recipe-changes-unlisted">
        {m2(`unsummarizable.${changes.reason}`)}
      </p>
    );
  if (changes.kind !== "changes") return null;
  if (changes.formattingOnly) return <p>{m2("changeFormattingOnly")}</p>;
  const groups = [
    ["added", "changeAdded", changes.added],
    ["modified", "changeModified", changes.modified],
    ["removed", "changeRemoved", changes.removed],
  ] as const;
  return (
    <ul className="space-y-0.5">
      {groups.flatMap(([kind, title, items]) =>
        items.map((item) => (
          <li
            key={`${kind}:${item.id}`}
            className="break-words"
            data-testid="graph-recipe-change"
            data-change={kind}
            data-check-id={item.id}
          >
            <span className="font-medium">{m2(title)}</span>: {label(item)}
          </li>
        )),
      )}
      {changes.reordered ? (
        <li data-testid="graph-recipe-change-order">{m2("changeReordered")}</li>
      ) : null}
    </ul>
  );
}

/**
 * The Save summary (spec 3.3 rule 3): which checks change, that the next run does not use them, and
 * that Save writes the whole list, including edits retained from earlier visits.
 */
export function GraphRecipeChangeSummary({
  id,
  changes,
  loaded,
  conflict,
}: {
  id: string;
  changes: GraphRecipeChanges;
  /** The saved checks are currently loaded (`ready`). */
  loaded: boolean;
  conflict: boolean;
}) {
  const m2 = useGraphM2Text();
  if (changes.kind === "clean") return null;
  return (
    <section
      id={id}
      role="status"
      className="space-y-1 rounded-lg border border-border bg-surface px-3 py-2 text-ui-sm"
      data-testid="graph-recipe-changes"
      data-kind={changes.kind}
    >
      <p className="font-medium">{m2("unsavedTitle")}</p>
      <ChangeList changes={changes} />
      <p className="text-foreground-subtle">{m2("unsavedNotUsed")}</p>
      <p className="text-foreground-subtle">{m2("saveScope")}</p>
      {conflict ? (
        <p className="text-foreground-subtle">{m2("comparedStarted")}</p>
      ) : !loaded ? (
        <p className="text-foreground-subtle">{m2("comparedEarlier")}</p>
      ) : null}
    </section>
  );
}

/**
 * Discard names its real scope (the whole check list) and is confirmed inline (spec 3.3 rules 5-6).
 * Only the confirm button changes anything, through `onDiscard`, which callers wire to the existing
 * `acceptRecipes` with a ready, non-conflicting snapshot.
 */
export function GraphRecipeDiscard({
  changes,
  loaded,
  disabled,
  onDiscard,
}: {
  changes: GraphRecipeChanges;
  loaded: boolean;
  disabled: boolean;
  onDiscard(): void;
}) {
  const m2 = useGraphM2Text();
  const [confirming, setConfirming] = useState(false);
  const [discarded, setDiscarded] = useState(false);
  // “继续编辑”关闭确认后，焦点回到打开确认的按钮，而不是丢到页面开头。
  const [refocus, setRefocus] = useState(false);
  const openButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!refocus) return;
    openButton.current?.focus();
    setRefocus(false);
  }, [refocus]);
  if (changes.kind === "clean")
    return discarded ? (
      <p role="status" data-testid="graph-recipe-discarded">
        {m2("discarded")}
      </p>
    ) : null;
  if (!confirming)
    return (
      <div className="space-y-1">
        <Button
          ref={openButton}
          size="sm"
          variant="outline"
          disabled={disabled || !loaded}
          aria-describedby={!loaded ? "graph-recipe-discard-reason" : undefined}
          data-testid="graph-recipe-discard"
          onClick={() => {
            if (disabled || !loaded) return;
            setDiscarded(false);
            setConfirming(true);
          }}
        >
          {m2("discardOpen")}
        </Button>
        {!loaded ? (
          <p id="graph-recipe-discard-reason" className="text-ui-sm text-foreground-subtle">
            {m2("discardNeedsSaved")}
          </p>
        ) : null}
      </div>
    );
  return (
    <div
      role="group"
      aria-labelledby="graph-recipe-discard-question"
      className="space-y-2 rounded-lg border border-border px-3 py-2 text-ui-sm"
      data-testid="graph-recipe-discard-confirmation"
    >
      <p id="graph-recipe-discard-question" className="font-medium">
        {m2("discardQuestion")}
      </p>
      <ChangeList changes={changes} />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="destructive"
          disabled={disabled || !loaded}
          data-testid="graph-recipe-discard-confirm"
          onClick={() => {
            // 处理函数自身也检查：快照未加载（可能过期）时不能把旧基线当作当前已保存的检查。
            if (disabled || !loaded) return;
            onDiscard();
            setConfirming(false);
            setDiscarded(true);
          }}
        >
          {m2("discardConfirm")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          autoFocus
          data-testid="graph-recipe-discard-cancel"
          onClick={() => {
            setConfirming(false);
            setRefocus(true);
          }}
        >
          {m2("keepEditing")}
        </Button>
      </div>
    </div>
  );
}
