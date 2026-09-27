import { useState } from "react";
import {
  addGraphContextBinding,
  graphContextCandidates,
  previewGraphTaskPrompt,
} from "@zcode/services";
import type {
  GraphTaskNode,
  GraphSequentialDefinition,
  GraphRecipeSnapshot,
} from "@zcode/services";
import { Input } from "@/components/ui/input.js";
import { Textarea } from "@/components/ui/textarea.js";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useGraphDraftStore } from "@/store/graphDraftStore.js";
import { GraphOpenAdvanced, useGraphEditorText } from "./GraphEditorMode.js";
import {
  graphTaskGuidance,
  editGraphInstructionPart,
  removeGraphContext,
} from "./graphEditorGuidance.js";
import { updateGraphNode } from "./graphEditing.js";

export function GraphGuidedTask({
  definition,
  node,
  disabled,
  recipes,
  workspaceKey,
  onChange,
}: {
  definition: GraphSequentialDefinition;
  node: GraphTaskNode;
  disabled: boolean;
  recipes: GraphRecipeSnapshot | null;
  workspaceKey: string;
  onChange(value: GraphSequentialDefinition): void;
}) {
  const t = useGraphEditorText(),
    { intl } = useZCodeIntl(),
    [error, setError] = useState("");
  const projection = graphTaskGuidance(node),
    context = graphContextCandidates(definition, node.id, recipes ?? undefined);
  const pendingSchema = useGraphDraftStore((state) => {
    const buffer = state.workspaces[workspaceKey]?.editorBuffers?.[`${node.id}:schema`];
    return Boolean(buffer && buffer.text !== buffer.base);
  });
  const apply = (action: () => GraphSequentialDefinition) => {
    try {
      onChange(action());
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  const update = (value: GraphTaskNode) => onChange(updateGraphNode(definition, value));
  const prompt = previewGraphTaskPrompt(definition, node.id);
  return (
    <div className="space-y-4">
      <label className="block space-y-1 text-ui-sm">
        <span>{intl.formatMessage({ id: "graph.taskName" })}</span>
        <Input
          data-testid="graph-node-name"
          value={node.name}
          disabled={disabled}
          onChange={(event) => update({ ...node, name: event.target.value })}
        />
      </label>
      {!projection.supported ? (
        <div className="space-y-2 text-ui-sm" data-testid="graph-guided-unsupported">
          <p>{t("advancedOnly")}</p>
          <p>{t(projection.reason!)}</p>
          <pre className="whitespace-pre-wrap break-all rounded-lg border border-border p-2">
            {node.instructions}
          </pre>
          <GraphOpenAdvanced workspaceKey={workspaceKey} />
        </div>
      ) : (
        <div className="space-y-2">
          {projection.parts.map((part, index) =>
            part.kind === "text" ? (
              <label key={index} className="block space-y-1 text-ui-sm">
                <span>
                  {t("textSegment")} {index + 1}
                </span>
                <Textarea
                  data-testid={
                    node.instructionMode === "literal"
                      ? "graph-instructions"
                      : `graph-guided-instructions-${index}`
                  }
                  rows={Math.max(2, Math.min(8, part.text.split("\n").length))}
                  disabled={disabled}
                  value={part.text}
                  onChange={(event) =>
                    apply(() =>
                      updateGraphNode(
                        definition,
                        editGraphInstructionPart(node, index, event.target.value),
                      ),
                    )
                  }
                />
              </label>
            ) : (
              <div
                key={index}
                data-testid={`graph-context-chip-${part.alias}`}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-2 text-ui-sm"
              >
                <span>
                  {context.candidates.find((candidate) => candidate.aliases.includes(part.alias))
                    ?.label ?? part.alias}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  data-testid={`graph-context-remove-${part.alias}`}
                  onClick={() =>
                    apply(() => updateGraphNode(definition, removeGraphContext(node, part.alias)))
                  }
                >
                  {t("remove")}
                </Button>
              </div>
            ),
          )}
        </div>
      )}
      <details className="space-y-2 text-ui-sm" data-testid="graph-context-candidates">
        <summary>{t("context")}</summary>
        <p>{t("contextHelp")}</p>
        {context.candidates.map((candidate, index) => (
          <div
            key={JSON.stringify(candidate.source)}
            className="space-y-1 rounded-lg border border-border p-2"
          >
            <p>
              {candidate.label} · {t(`kind.${candidate.outputKind}`)} ·{" "}
              {t(`scope.${candidate.scope}`)}
            </p>
            {candidate.reason ? <p className="text-foreground-subtle">{candidate.reason}</p> : null}
            <Button
              size="sm"
              variant="outline"
              data-source={JSON.stringify(candidate.source)}
              data-testid={`graph-context-add-${index}`}
              disabled={disabled || !projection.supported || !candidate.selectable}
              onClick={() =>
                apply(
                  () =>
                    addGraphContextBinding(
                      definition,
                      node.id,
                      candidate.source,
                      recipes ?? undefined,
                    ).definition,
                )
              }
            >
              {t(candidate.aliases.length ? "selected" : "addContext")}
            </Button>
          </div>
        ))}
        {context.issues.map((issue) => (
          <p key={issue} className="text-warning">
            {issue}
          </p>
        ))}
      </details>
      {node.output || pendingSchema ? (
        <div className="space-y-2 text-ui-sm">
          <p className="font-medium">{t("output")}</p>
          <p>{t(pendingSchema ? "bufferPending" : "schemaAdvanced")}</p>
          {node.output ? (
            <pre className="whitespace-pre-wrap break-all" data-testid="graph-guided-output-schema">
              {JSON.stringify(node.output.schema, null, 2)}
            </pre>
          ) : null}
          <GraphOpenAdvanced workspaceKey={workspaceKey} />
        </div>
      ) : null}
      <details data-testid="graph-prompt-draft-preview" className="space-y-2 text-ui-sm">
        <summary>{t("draftPreview")}</summary>
        <p>{t("draftHelp")}</p>
        <div className="whitespace-pre-wrap break-all rounded-lg border border-border p-2">
          {prompt.segments.map((segment, index) =>
            segment.kind === "text" ? (
              <span key={index}>{segment.text}</span>
            ) : (
              <span
                key={index}
                className="rounded bg-surface px-1 text-warning"
                title={segment.reason}
              >
                [{segment.alias}: {t("unknown")}]
              </span>
            ),
          )}
        </div>
        {prompt.issues.map((issue) => (
          <p key={issue} className="text-warning">
            {issue}
          </p>
        ))}
        <details>
          <summary>{t("technical")}</summary>
          <pre data-testid="graph-prompt-draft-json" className="whitespace-pre-wrap break-all">
            {JSON.stringify(prompt, null, 2)}
          </pre>
        </details>
      </details>
      {error ? (
        <p role="alert" className="text-ui-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
