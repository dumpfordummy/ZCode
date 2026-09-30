import { useEffect, useRef, useState } from "react";
import type {
  GraphDefinition,
  GraphLibraryEntry,
  GraphParameterValue,
  GraphSequentialDefinition,
  GraphTemplateBindings as TemplateBindings,
  GraphTemplateVersion,
} from "@zcode/services";
import type { useGraphWorkflow } from "@/hooks/useGraphWorkflow.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useGraphDraftStore } from "@/store/graphDraftStore.js";
import { graphDefinitionContent } from "./graphEngineeringView.js";
import { replaceGraphFromTemplate } from "./graphTemplateReplacement.js";
import {
  graphInstantiationFingerprint,
  isRememberedGraphInstantiation,
  rememberGraphInstantiation,
} from "./graphInstantiationMemo.js";

export interface ReplacementIntent {
  parameters: Record<string, GraphParameterValue>;
  bindings: TemplateBindings;
  definition: GraphDefinition;
  entryId: string;
  version: number;
  digest: string;
  formFingerprint: string;
  /** "review" continues into the inline Review after the workflow is saved. */
  continuation: "review" | "save";
  instantiation: string;
}

/**
 * The explicit replace-the-design flow behind "Load into design" / "Save as workflow only" (unchanged
 * by UX-M3, moved out of GraphLibrary). Every path that instantiates or saves a replacement goes
 * through `apply`, which refuses while admission is locked and re-checks that nothing changed.
 */
export function useGraphLibraryReplacement({
  workspaceKey,
  definition,
  dirty,
  entry,
  version,
  actionsLocked,
  workflow,
  onSaveDesign,
  onInstantiated,
  onReview,
  onDone,
}: {
  workspaceKey: string;
  definition: GraphDefinition;
  dirty: boolean;
  entry?: GraphLibraryEntry;
  version?: GraphTemplateVersion;
  actionsLocked: boolean;
  workflow: ReturnType<typeof useGraphWorkflow>;
  onSaveDesign(definition: GraphDefinition): Promise<GraphDefinition | undefined>;
  onInstantiated(definition: GraphSequentialDefinition, continuation: "review" | "save"): void;
  /** Called with the unchanged saved design when Review and run needs no new instantiation. */
  onReview?(definition: GraphDefinition): void;
  onDone(): void;
}) {
  const { intl } = useZCodeIntl();
  const u = (key: string) => intl.formatMessage({ id: `graph.preZ8.${key}` });
  const [replacement, setReplacement] = useState<ReplacementIntent | null>(null);
  const [replacementError, setReplacementError] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const latest = useRef({ workspaceKey, definition, entry, version, actionsLocked });
  latest.current = { workspaceKey, definition, entry, version, actionsLocked };
  const formFingerprint = (id: string, versionNumber: number) =>
    JSON.stringify(
      useGraphDraftStore.getState().workspaces[workspaceKey]?.templates[`${id}:${versionNumber}`],
    );
  const apply = async (intent: ReplacementIntent, decision: "save" | "discard") => {
    // 所有到达实例化/保存替换的路径（按钮、替换对话框、异步续接）都经过这里：占用时一律拒绝。
    if (latest.current.actionsLocked) return;
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
      rememberGraphInstantiation(workspaceKey, intent.instantiation, graphDefinitionContent(saved));
      onInstantiated(saved, intent.continuation);
      setReplacement(null);
      onDone();
    } else if (!stillCurrent() && alive.current) setReplacementError(u("changedConsent"));
  };
  const requestInstantiate = (
    parameters: Record<string, GraphParameterValue>,
    bindingValues: TemplateBindings,
    continuation: "review" | "save",
  ) => {
    if (actionsLocked || !entry || !version) return;
    const instantiation = graphInstantiationFingerprint({
      id: entry.id,
      version: version.version,
      digest: version.digest,
      parameters,
      bindings: bindingValues,
    });
    // 表单与已保存设计没有变化：直接进入审阅，不再次创建定义，也不因重复点击产生新修订。
    if (
      continuation === "review" &&
      !dirty &&
      definition.version === 5 &&
      isRememberedGraphInstantiation(
        workspaceKey,
        instantiation,
        graphDefinitionContent(definition),
      )
    ) {
      onReview?.(definition);
      return;
    }
    const intent: ReplacementIntent = {
      continuation,
      instantiation,
      parameters: structuredClone(parameters),
      bindings: structuredClone(bindingValues),
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
  };
  return { replacement, setReplacement, replacementError, apply, requestInstantiate };
}
