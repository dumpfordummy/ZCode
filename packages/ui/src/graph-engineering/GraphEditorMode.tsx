import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useGraphEngineeringViewStore } from "@/store/graphEngineeringViewStore.js";

export const useGraphEditorText = () => {
  const { intl } = useZCodeIntl();
  return (key: string) => intl.formatMessage({ id: `graph.editor.${key}` });
};
export function useGraphEditorMode(workspaceKey: string) {
  return useGraphEngineeringViewStore(
    (state) => state.selections[workspaceKey]?.editorMode ?? "guided",
  );
}
export function GraphEditorMode({ workspaceKey }: { workspaceKey: string }) {
  const mode = useGraphEditorMode(workspaceKey),
    t = useGraphEditorText();
  return (
    <div className="space-y-2">
      <div className="flex gap-2" role="group" aria-label={t("modeHelp")}>
        {(["guided", "advanced"] as const).map((value) => (
          <Button
            key={value}
            data-testid={`graph-editor-${value}`}
            size="sm"
            variant={mode === value ? "secondary" : "outline"}
            aria-pressed={mode === value}
            onClick={() =>
              useGraphEngineeringViewStore.getState().select(workspaceKey, { editorMode: value })
            }
          >
            {t(value)}
          </Button>
        ))}
      </div>
      <p className="text-ui-xs text-foreground-subtle">{t("modeHelp")}</p>
    </div>
  );
}
export function GraphOpenAdvanced({ workspaceKey }: { workspaceKey: string }) {
  const t = useGraphEditorText();
  return (
    <Button
      size="sm"
      variant="outline"
      data-testid="graph-editor-open-advanced"
      onClick={() =>
        useGraphEngineeringViewStore.getState().select(workspaceKey, { editorMode: "advanced" })
      }
    >
      {t("advanced")}
    </Button>
  );
}
