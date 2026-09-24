import { useState } from "react";
import { useWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { useDraftConfigControl } from "@/v4/composer/useDraftConfigControl.js";
import { V4ComposerModelControls, V4ComposerModeSwitch } from "@/v4/composer/V4ComposerToolbar.js";
import type { V4ComposerConfigPicker } from "@/v4/composer/configPickerState.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

export function useGraphConfiguration(
  workspacePath: string,
  workspaceIdentity?: string,
): ReturnType<typeof useDraftConfigControl> {
  const { modelSelectionService } = useWorkspaceServices(workspacePath, null, workspaceIdentity);
  // 与普通新任务共享同一草稿选择 owner；图页面只编辑配置，不预热或启动 Agent。
  return useDraftConfigControl({
    workspacePath,
    workspaceIdentity,
    sessionId: null,
    modelSelectionService,
    agentStartupAllowed: false,
  });
}

export function GraphConfiguration({
  workspacePath,
  workspaceIdentity,
  config,
  disabled,
}: {
  workspacePath: string;
  workspaceIdentity?: string;
  config: ReturnType<typeof useGraphConfiguration>;
  disabled: boolean;
}) {
  const { intl } = useZCodeIntl();
  const [picker, setPicker] = useState<V4ComposerConfigPicker | null>(null);
  // 原生验证中选择器可显示“管理模型”；直接展示同一提交草稿选型，避免运行配置不可见。
  const selection = config.draftConfig.modelSelection;
  const common = {
    workspacePath,
    workspaceIdentity,
    draftConfig: config.draftConfig,
    disabled,
    activeConfigPicker: picker,
    onConfigPickerOpenChange: (next: V4ComposerConfigPicker, open: boolean) =>
      setPicker(open ? next : null),
    onSwitchMode: config.handleDraftSwitchMode,
  };
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="graph-configuration">
      <V4ComposerModeSwitch {...common} />
      <V4ComposerModelControls
        {...common}
        sessionId={null}
        phase={null}
        usage={null}
        draftMode
        modelSelectionView={
          config.modelSelectionRead.state.status === "ready"
            ? config.modelSelectionRead.state.view
            : null
        }
        modelSelectionState={config.modelSelectionRead.state}
        modelSelectionReload={config.modelSelectionRead.reload}
        onSelectModel={config.handleDraftSelectModel}
        onSelectThought={config.handleDraftSelectThought}
      />
      {selection ? (
        <p
          className="w-full break-all text-ui-sm text-foreground-subtle"
          data-testid="graph-effective-model"
          data-provider={selection.providerId}
          data-model={selection.modelId}
        >
          {intl.formatMessage({ id: "graph.selectedModel" })}: {selection.providerId} /{" "}
          {selection.modelId}
          {selection.options?.reasoningLevel ? (
            <>
              {" "}
              · {intl.formatMessage({ id: "graph.reasoning" })}: {selection.options.reasoningLevel}
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
