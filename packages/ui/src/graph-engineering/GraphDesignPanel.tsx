import type { GraphDefinition } from "@zcode/services";
import { Play, Save, Settings } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { GraphAddNodes } from "./GraphAddNodes.js";
import { GraphConfiguration, useGraphConfiguration } from "./GraphConfiguration.js";
import { GraphDesignReadiness } from "./GraphDesignReadiness.js";
import { GraphDesignSections } from "./GraphDesignSections.js";
import { GraphDisclosure, GraphDisclosureStack } from "./GraphDisclosure.js";

type GraphConfig = ReturnType<typeof useGraphConfiguration>;

/**
 * 设计视图的工具栏与状态提示。
 * 从 GraphEditor 抽取以控制单文件行数，保持所有 testid 与原有行为一致。
 */
export function GraphDesignPanel({
  displayed,
  disabled,
  dirty,
  conflicted,
  canRun,
  runReason,
  pending,
  modelReady,
  availability,
  showGeneralSettingsButton,
  readinessErrors,
  activeRunId,
  workspacePath,
  workspaceIdentity,
  config,
  workspaceKey,
  onChange,
  onSelectNode,
  onRun,
  onSave,
  onOpenSettings,
  onReload,
  onOpenRun,
}: {
  displayed: GraphDefinition;
  disabled: boolean;
  dirty: boolean;
  conflicted: boolean;
  canRun: boolean;
  runReason?: string;
  pending: boolean;
  modelReady: boolean;
  availability: { available: boolean; reason?: string };
  showGeneralSettingsButton: boolean;
  readinessErrors: string[];
  activeRunId?: string;
  workspacePath: string;
  workspaceIdentity?: string;
  config: GraphConfig;
  workspaceKey: string;
  onChange: (draft: GraphDefinition) => void;
  onSelectNode: (nodeId: string) => void;
  onRun: () => void;
  onSave: () => void;
  onOpenSettings: (section: "general" | "modelProvider") => void;
  onReload: () => void;
  onOpenRun: (runId: string) => void;
}) {
  const { intl } = useZCodeIntl();
  const t = (id: string) => intl.formatMessage({ id: `graph.${id}` });
  const u = (id: string) => intl.formatMessage({ id: `graph.preZ8.${id}` });

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="min-w-40 flex-1"
          aria-label={t("name")}
          data-testid="graph-name"
          value={displayed.name}
          disabled={disabled}
          onChange={(event) => onChange({ ...displayed, name: event.target.value })}
        />
        <GraphAddNodes
          definition={displayed}
          disabled={disabled}
          onChange={onChange}
          onSelect={onSelectNode}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || !dirty || conflicted}
          title={u("saveBlocked")}
          data-testid="graph-save"
          onClick={onSave}
        >
          <Save className="size-4" />
          {t("save")}
        </Button>
        <Button
          size="sm"
          disabled={!canRun}
          aria-describedby={runReason ? "graph-run-reason" : undefined}
          data-testid="graph-run-button"
          onClick={onRun}
        >
          <Play className="size-4" />
          {t("run")}
        </Button>
        <span role="status" className="text-ui-sm text-foreground-subtle">
          {pending ? t("saving") : dirty ? t("unsaved") : t("saved")}
        </span>
      </div>
      <GraphDesignReadiness
        reason={runReason}
        errors={readinessErrors}
        activeRunId={activeRunId}
        onOpenRun={onOpenRun}
      />
      <GraphDisclosureStack className="shrink-0">
        <GraphDisclosure testId="graph-default-configuration" title={t("workspaceDefaults")}>
          <GraphConfiguration {...{ workspacePath, workspaceIdentity, config, disabled }} />
          <p className="text-foreground-subtle">{t("sharedConfiguration")}</p>
        </GraphDisclosure>
      </GraphDisclosureStack>
      {!modelReady ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-ui-sm text-foreground-subtle">{t("noModel")}</p>
          <Button variant="outline" size="sm" onClick={() => onOpenSettings("modelProvider")}>
            <Settings className="size-4" />
            {t("modelSettings")}
          </Button>
        </div>
      ) : null}
      {!availability.available ? (
        <div className="flex flex-wrap items-center gap-2 text-ui-sm">
          <p role="status" className="text-warning">
            {availability.reason || t("prerequisite")}
          </p>
          {showGeneralSettingsButton ? (
            <Button variant="outline" size="sm" onClick={() => onOpenSettings("general")}>
              {t("generalSettings")}
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={onReload}>
            {t("refresh")}
          </Button>
        </div>
      ) : null}
      {displayed.version === 5 ? (
        <GraphDesignSections
          definition={displayed}
          disabled={disabled}
          onChange={onChange}
          workspaceKey={workspaceKey}
        />
      ) : null}
    </>
  );
}
