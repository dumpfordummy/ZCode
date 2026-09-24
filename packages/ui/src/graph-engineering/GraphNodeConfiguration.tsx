import { useState } from "react";
import type { GraphNativeSettings, GraphTaskNode } from "@zcode/services";
import { submissionModeSchema } from "@zcode/shared/zcode-protocol-v4";
import { completeNewModelSelection } from "@zcode/provider";
import { useModelSelectionView } from "@/hooks/useModelSelectionView.js";
import { V4ComposerModelControls, V4ComposerModeSwitch } from "@/v4/composer/V4ComposerToolbar.js";
import type { V4ComposerConfigPicker } from "@/v4/composer/configPickerState.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { GraphSelect } from "./GraphSelect.js";

export function GraphNodeConfiguration({
  workspacePath,
  workspaceIdentity,
  node,
  defaults,
  disabled,
  onChange,
}: {
  workspacePath: string;
  workspaceIdentity?: string;
  node: GraphTaskNode;
  defaults: GraphNativeSettings | null;
  disabled: boolean;
  onChange: (node: GraphTaskNode) => void;
}) {
  const { intl } = useZCodeIntl();
  const t = (id: string) => intl.formatMessage({ id: `graph.${id}` });
  const settings = node.configuration.kind === "override" ? node.configuration : defaults;
  const read = useModelSelectionView(workspacePath, null, workspaceIdentity, undefined, {
    selection: settings?.modelSelection ?? null,
  });
  const view = read.state.status === "ready" ? read.state.view : null;
  const [picker, setPicker] = useState<V4ComposerConfigPicker | null>(null);
  const update = (next: GraphNativeSettings) => {
    if (!disabled && node.configuration.kind === "override")
      onChange({ ...node, configuration: { ...next, kind: "override" } });
  };
  const common = {
    workspacePath,
    workspaceIdentity,
    draftConfig: settings
      ? {
          ...settings,
          provider: settings.modelSelection.providerId,
          model: settings.modelSelection.modelId,
          thought: settings.modelSelection.options?.reasoningLevel ?? "",
        }
      : {},
    disabled: disabled || node.configuration.kind === "inherit" || !settings,
    activeConfigPicker: picker,
    onConfigPickerOpenChange: (next: V4ComposerConfigPicker, open: boolean) =>
      setPicker(open ? next : null),
    onSwitchMode: (mode: string) => {
      if (!settings) return;
      if (mode === "plan" || mode === "plan-off")
        update({ ...settings, planEnabled: mode === "plan" });
      else {
        const parsed = submissionModeSchema.safeParse(mode);
        if (parsed.success) update({ ...settings, mode: parsed.data });
      }
    },
  };
  return (
    <section className="space-y-2" data-testid="graph-node-configuration">
      <GraphSelect
        label={t("configurationSource")}
        testId="graph-configuration-source"
        value={node.configuration.kind}
        disabled={disabled || !settings}
        options={[
          { value: "inherit", label: t("inheritSettings") },
          { value: "override", label: t("overrideSettings") },
        ]}
        onChange={(value) => {
          if (disabled) return;
          if (value === "inherit") onChange({ ...node, configuration: { kind: "inherit" } });
          else if (settings)
            onChange({
              ...node,
              configuration: { ...structuredClone(settings), kind: "override" },
            });
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <V4ComposerModeSwitch {...common} />
        <V4ComposerModelControls
          {...common}
          sessionId={null}
          phase={null}
          usage={null}
          draftMode
          modelSelectionView={view}
          modelSelectionState={read.state}
          modelSelectionReload={read.reload}
          onSelectModel={(providerId, modelId) => {
            if (!settings) return;
            const selected = { providerId, modelId };
            update({
              ...settings,
              modelSelection: view
                ? (completeNewModelSelection(view, selected) ?? selected)
                : selected,
            });
          }}
          onSelectThought={(reasoningLevel) => {
            if (settings)
              update({
                ...settings,
                modelSelection: {
                  ...settings.modelSelection,
                  options: { ...settings.modelSelection.options, reasoningLevel },
                },
              });
          }}
        />
      </div>
      {settings ? (
        <p
          className="break-all text-ui-sm text-foreground-subtle"
          data-testid="graph-node-effective-model"
        >
          {settings.modelSelection.providerId} / {settings.modelSelection.modelId} · {settings.mode}
          {settings.modelSelection.options?.reasoningLevel
            ? ` · ${settings.modelSelection.options.reasoningLevel}`
            : ""}
          {settings.planEnabled ? ` · ${t("planEnabled")}` : ""}
        </p>
      ) : (
        <p className="text-ui-sm text-warning">{t("noModel")}</p>
      )}
      <p className="text-ui-sm text-foreground-subtle">{t("settingsFreeze")}</p>
    </section>
  );
}
