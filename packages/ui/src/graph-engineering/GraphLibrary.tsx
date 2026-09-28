import { useEffect, useMemo, useRef, useState } from "react";
import type {
  GraphDefinition,
  GraphParameterValue,
  GraphSequentialDefinition,
  GraphTemplateBindings as TemplateBindings,
} from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog.js";
import { useGraphWorkflow } from "@/hooks/useGraphWorkflow.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useGraphDraftStore } from "@/store/graphDraftStore.js";
import { GraphSelect } from "./GraphSelect.js";
import { GraphTemplateBindings } from "./GraphTemplateBindings.js";
import { GraphLibraryManagement } from "./GraphLibraryManagement.js";
import { graphDefinitionContent } from "./graphEngineeringView.js";
import { latestCompatibleTemplateVersion } from "./graphWorkflowView.js";
import { replaceGraphFromTemplate } from "./graphTemplateReplacement.js";
import type { GraphRecipeReadState } from "./graphRecipeRead.js";

interface ReplacementIntent {
  parameters: Record<string, GraphParameterValue>;
  bindings: TemplateBindings;
  definition: GraphDefinition;
  entryId: string;
  version: number;
  digest: string;
  formFingerprint: string;
}

export function GraphLibrary({
  workspacePath,
  workspaceIdentity,
  definition,
  dirty,
  disabled,
  disabledReason,
  pending = false,
  error,
  recipeReadState,
  inline = false,
  onLoadRecipes,
  onOpenSetup,
  onSaveDesign,
  onInstantiated,
}: {
  workspacePath: string;
  workspaceIdentity?: string;
  definition: GraphDefinition;
  dirty: boolean;
  disabled: boolean;
  disabledReason?: string;
  pending?: boolean;
  error?: string | null;
  recipeReadState: GraphRecipeReadState;
  inline?: boolean;
  onLoadRecipes(): void;
  onOpenSetup(): void;
  onSaveDesign(definition: GraphDefinition): Promise<GraphDefinition | undefined>;
  onInstantiated(definition: GraphSequentialDefinition): void;
}) {
  const { intl } = useZCodeIntl();
  const t = (key: string) => intl.formatMessage({ id: `graph.z6.${key}` });
  const u = (key: string, values?: Record<string, string | number>) =>
    intl.formatMessage({ id: `graph.preZ8.${key}` }, values);
  const target = useMemo(
    () => ({ workspacePath, ...(workspaceIdentity ? { workspaceIdentity } : {}) }),
    [workspacePath, workspaceIdentity],
  );
  const workspaceKey = workspaceIdentity?.trim() || workspacePath;
  const workflow = useGraphWorkflow(target);
  const selection = useGraphDraftStore((state) => state.workspaces[workspaceKey]?.librarySelection);
  const choose = useGraphDraftStore((state) => state.selectLibrary);
  const [open, setOpen] = useState(false);
  const [replacement, setReplacement] = useState<ReplacementIntent | null>(null);
  const [replacementError, setReplacementError] = useState("");
  const entries = workflow.view?.entries ?? [];
  const defaultEntry =
    entries.find((item) => item.id === "agent-assisted" && latestCompatibleTemplateVersion(item)) ??
    entries.find((item) => latestCompatibleTemplateVersion(item));
  const entry = entries.find((item) => item.id === selection?.id) ?? defaultEntry;
  const version =
    entry?.versions.find(
      (item) => entry.id === selection?.id && item.version === selection.version,
    ) ?? (entry ? latestCompatibleTemplateVersion(entry) : undefined);
  const defaultId = defaultEntry?.id;
  const defaultVersion = defaultEntry
    ? latestCompatibleTemplateVersion(defaultEntry)?.version
    : undefined;
  useEffect(() => {
    // 默认选择只在新建意图首次读取后固定；刷新库不能让正在填写的表单自动漂移到新版本。
    if (!selection && defaultId && defaultVersion !== undefined)
      choose(workspaceKey, { id: defaultId, version: defaultVersion });
  }, [selection, defaultId, defaultVersion, choose, workspaceKey]);
  useEffect(() => {
    if (inline) void workflow.read();
  }, [inline, workflow.read]);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const latest = useRef({ workspaceKey, definition, entry, version });
  latest.current = { workspaceKey, definition, entry, version };
  const locked = disabled || workflow.pending;
  const operationPending = pending || workflow.pending;
  const formFingerprint = (id: string, versionNumber: number) =>
    JSON.stringify(
      useGraphDraftStore.getState().workspaces[workspaceKey]?.templates[`${id}:${versionNumber}`],
    );
  const apply = async (intent: ReplacementIntent, decision: "save" | "discard") => {
    setReplacementError("");
    const stillCurrent = () =>
      alive.current &&
      latest.current.workspaceKey === workspaceKey &&
      latest.current.entry?.id === intent.entryId &&
      latest.current.version?.digest === intent.digest &&
      graphDefinitionContent(latest.current.definition) ===
        graphDefinitionContent(intent.definition) &&
      formFingerprint(intent.entryId, intent.version) === intent.formFingerprint;
    if (!stillCurrent()) {
      setReplacementError(u("changedConsent"));
      return;
    }
    const saved = await replaceGraphFromTemplate({
      decision,
      expectedRevision: intent.definition.revision,
      stillCurrent,
      save: () => onSaveDesign(intent.definition),
      instantiate: (expectedRevision) =>
        workflow.instantiate({
          id: intent.entryId,
          version: intent.version,
          expectedRevision,
          parameters: intent.parameters,
          bindings: intent.bindings,
        }),
    });
    if (saved && alive.current) {
      onInstantiated(saved);
      setReplacement(null);
      setOpen(false);
    } else if (!stillCurrent() && alive.current) setReplacementError(u("changedConsent"));
  };
  const content = (
    <div className="space-y-4">
      <p
        className="break-all font-mono text-ui-sm text-foreground-subtle"
        data-testid="graph-library-workspace"
      >
        {workspacePath}
      </p>
      {workflow.error ? (
        <p role="alert" className="break-words text-ui-sm text-destructive">
          {workflow.error}
        </p>
      ) : null}
      <GraphSelect
        label={t("workflow")}
        testId="graph-library-entry"
        value={entry?.id ?? "none"}
        disabled={locked}
        options={[
          ...(!entry ? [{ value: "none", label: t("chooseWorkflow") }] : []),
          ...entries.map((item) => ({
            value: item.id,
            label: `${item.name}${item.archived ? ` · ${t("archived")}` : ""}`,
          })),
        ]}
        onChange={(id) => {
          const next = entries.find((item) => item.id === id);
          const chosen = next
            ? (latestCompatibleTemplateVersion(next) ?? next.versions.at(-1))
            : undefined;
          if (next && chosen) choose(workspaceKey, { id: next.id, version: chosen.version });
          setReplacement(null);
        }}
      />
      {version && entry ? (
        <>
          <p className="whitespace-pre-wrap text-ui-sm text-foreground-subtle">
            {version.template.description}
          </p>
          <GraphTemplateBindings
            key={`${entry.id}:${version.version}`}
            version={version}
            workspaceKey={workspaceKey}
            workspacePath={workspacePath}
            workspaceIdentity={workspaceIdentity}
            templateKey={`${entry.id}:${version.version}`}
            recipeReadState={recipeReadState}
            disabled={locked || entry.archived}
            disabledReason={entry.archived ? u("noCompatibleVersion") : disabledReason}
            onLoadRecipes={onLoadRecipes}
            onOpenSetup={() => {
              setOpen(false);
              onOpenSetup();
            }}
            onInstantiate={(parameters, bindings) => {
              const intent: ReplacementIntent = {
                parameters: structuredClone(parameters),
                bindings: structuredClone(bindings),
                definition: structuredClone(definition),
                entryId: entry.id,
                version: version.version,
                digest: version.digest,
                formFingerprint: formFingerprint(entry.id, version.version),
              };
              if (dirty) {
                setReplacementError("");
                setReplacement(intent);
              } else void apply(intent, "discard");
            }}
          />
        </>
      ) : workflow.view ? (
        <p role="status" className="text-ui-sm text-warning">
          {u("noCompatibleVersion")}
        </p>
      ) : (
        <p role="status" className="text-ui-sm">
          {intl.formatMessage({ id: "graph.loading" })}
        </p>
      )}
      <GraphLibraryManagement
        key={entry?.id ?? "new"}
        workflow={workflow}
        definition={definition}
        entry={entry}
        version={version}
        disabled={locked}
        target={target}
        onVersion={(nextVersion) => {
          if (entry) choose(workspaceKey, { id: entry.id, version: nextVersion });
          setReplacement(null);
        }}
      />
    </div>
  );
  return (
    <>
      {inline ? (
        <section className="space-y-4" data-testid="graph-library-dialog">
          <h3 className="text-ui-base font-medium">{u("useWorkflow")}</h3>
          <p className="text-ui-sm text-foreground-subtle">{u("workflowHelp")}</p>
          {content}
        </section>
      ) : (
        <>
          <Button
            size="sm"
            variant="outline"
            disabled={!workflow.supported}
            data-testid="graph-library-open"
            onClick={() => {
              setOpen(true);
              void workflow.read();
            }}
          >
            {t("library")}
          </Button>
          <Dialog
            open={open}
            onOpenChange={(value) => {
              if (!workflow.pending && !replacement) setOpen(value);
            }}
          >
            <DialogContent
              className="max-h-[90vh] overflow-auto sm:max-w-3xl"
              data-testid="graph-library-dialog"
            >
              <DialogHeader>
                <DialogTitle>{u("useWorkflow")}</DialogTitle>
                <DialogDescription>{u("workflowHelp")}</DialogDescription>
              </DialogHeader>
              {content}
            </DialogContent>
          </Dialog>
        </>
      )}
      <Dialog
        open={Boolean(replacement)}
        onOpenChange={(value) => {
          if (!value && !operationPending) setReplacement(null);
        }}
      >
        <DialogContent data-testid="graph-replace-dialog" showCloseButton={!operationPending}>
          <DialogHeader>
            <DialogTitle>{u("replaceTitle")}</DialogTitle>
            <DialogDescription>{u("replaceHelp")}</DialogDescription>
          </DialogHeader>
          {replacementError || workflow.error || error ? (
            <p role="alert" className="text-ui-sm text-destructive">
              {replacementError || workflow.error || error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={locked}
              data-testid="graph-replace-save"
              onClick={() => {
                if (replacement) void apply(replacement, "save");
              }}
            >
              {u("saveReplace")}
            </Button>
            <Button
              variant="outline"
              disabled={locked}
              data-testid="graph-replace-discard"
              onClick={() => {
                if (replacement) void apply(replacement, "discard");
              }}
            >
              {u("discardReplace")}
            </Button>
            <Button
              variant="ghost"
              disabled={operationPending}
              data-testid="graph-replace-cancel"
              onClick={() => setReplacement(null)}
            >
              {u("cancel")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
