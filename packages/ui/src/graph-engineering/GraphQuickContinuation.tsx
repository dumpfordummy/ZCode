import { useState } from "react";
import { Button } from "@/components/ui/button.js";
import { Textarea } from "@/components/ui/textarea.js";
import { useGraphM4Text } from "./GraphM4Text.js";
import { useGraphDraftStore } from "@/store/graphDraftStore.js";

/** Incomplete setup stays an editable local draft; no recipe or execution authority is created. */
export function GraphQuickContinuation({
  workspaceKey,
  build,
  configuration,
  scopes,
  blocker,
}: {
  workspaceKey: string;
  build: string;
  configuration: string;
  scopes: string[];
  blocker: string;
}) {
  const t = useGraphM4Text();
  const [open, setOpen] = useState(false);
  const notes =
    useGraphDraftStore((state) => state.workspaces[workspaceKey]?.setup?.quick?.notes) ?? "";
  const setNotes = (value: string) => {
    const draft = useGraphDraftStore.getState().workspaces[workspaceKey]?.setup?.quick;
    if (draft)
      useGraphDraftStore
        .getState()
        .updateSetup(workspaceKey, { quick: { ...draft, notes: value } });
  };
  return (
    <div className="space-y-2" data-testid="graph-quick-continuation">
      <Button variant="outline" size="sm" onClick={() => setOpen(!open)} aria-expanded={open}>
        {t(open ? "quickCloseGuided" : "quickContinue")}
      </Button>
      {open ? (
        <section
          className="space-y-2 border-l-2 border-border pl-3"
          aria-label={t("quickContinue")}
        >
          <p role="status" className="text-ui-sm text-warning">
            {t("quickDraftOnly")}
          </p>
          <dl className="text-ui-sm break-words">
            <dt>{t("quickBuild")}</dt>
            <dd>{build}</dd>
            <dt>{t("quickConfiguration")}</dt>
            <dd>{configuration} · AnyCPU</dd>
            <dt>{t("quickTests")}</dt>
            <dd>{scopes.join(", ") || t("quickTestsIncomplete")}</dd>
          </dl>
          <p className="text-ui-sm">{blocker}</p>
          <p className="text-ui-sm text-foreground-subtle">{t("quickGuidedAction")}</p>
          <label className="block space-y-1 text-ui-sm">
            <span>{t("quickUnresolvedNotes")}</span>
            <Textarea
              value={notes}
              maxLength={2000}
              rows={3}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          <p className="text-ui-sm text-foreground-subtle">{t("quickInspectionUnavailable")}</p>
        </section>
      ) : null}
    </div>
  );
}
