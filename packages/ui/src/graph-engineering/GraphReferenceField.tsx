import { useState } from "react";
import type {
  GraphReferenceCatalog,
  GraphTemplateBindings,
  GraphWorkspaceTarget,
} from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { useGraphReferencePicker } from "@/hooks/useGraphReferencePicker.js";
import { GraphSelect } from "./GraphSelect.js";
import { useGraphEditorText } from "./GraphEditorMode.js";
import { useGraphTemplateText } from "./graphTemplateText.js";

export interface GraphReferenceRole {
  id: string;
  label?: string;
  kind: "document" | "instruction" | "skill";
  required?: boolean;
  nodeIds: string[];
}
export function GraphReferenceField({
  role,
  target,
  bindings,
  disabled,
  catalog,
  onChange,
  contextKey,
}: {
  role: GraphReferenceRole;
  target: GraphWorkspaceTarget;
  bindings: GraphTemplateBindings;
  disabled: boolean;
  catalog?: GraphReferenceCatalog;
  contextKey?: string;
  onChange(value: GraphTemplateBindings): void;
}) {
  const t = useGraphEditorText(),
    display = useGraphTemplateText(),
    [query, setQuery] = useState(""),
    [error, setError] = useState("");
  const picker = useGraphReferencePicker(
    target,
    JSON.stringify([contextKey ?? "", role, bindings]),
  );
  const selected = bindings.references[role.id] ?? "",
    id = role.id;
  const change = (value: string, guided: boolean) =>
    onChange({
      ...bindings,
      ...(guided && value !== selected ? { referencePolicy: "native-aware-v1" as const } : {}),
      references: { ...bindings.references, [id]: value },
    });
  const accept = async (read: () => ReturnType<typeof picker.select>) => {
    try {
      const result = await read();
      if (result?.isCurrent()) change(result.result.path, true);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  const skills = catalog?.skills ?? [];
  const search = picker.searchState.query === query ? picker.searchState : undefined;
  const validation = picker.validation;
  return (
    <div
      className="space-y-2 rounded-lg border border-border p-3"
      id={`graph-template-field-reference-${id}`}
      data-testid={`graph-reference-${id}`}
    >
      <p className="font-medium">
        {role.label ? display.reference(id, role.label) : id}
        {role.required ? " *" : ""} · {display.kind(role.kind)}
      </p>
      <p className="break-all">
        {t("selected")}: {selected || "—"}
      </p>
      <p className="text-foreground-subtle">{role.nodeIds.join(", ")}</p>
      {role.kind === "skill" ? (
        <>
          <GraphSelect
            label={t("chooseSkill")}
            testId={`graph-reference-skill-${id}`}
            value={selected || "none"}
            disabled={disabled || !catalog}
            options={[
              { value: "none", label: "—" },
              ...skills.map((skill) => ({
                value: skill.id,
                label: `${skill.name} (${skill.id} · ${skill.scope})${!skill.enabled || !skill.digest ? ` · ${t("unavailable")}` : ""}`,
                disabled: !skill.enabled || !skill.digest,
              })),
              ...(selected && !skills.some((skill) => skill.id === selected)
                ? [{ value: selected, label: `${selected} · ${t("unknown")}`, disabled: true }]
                : []),
            ]}
            onChange={(value) => change(value === "none" ? "" : value, true)}
          />
          <details>
            <summary>{t("technical")}</summary>
            <pre className="whitespace-pre-wrap break-all">{JSON.stringify(skills, null, 2)}</pre>
          </details>
        </>
      ) : (
        <>
          <label className="block space-y-1">
            <span>{t("query")}</span>
            <Input
              data-testid={`graph-reference-file-query-${id}`}
              value={query}
              disabled={disabled}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              data-testid={`graph-reference-file-search-${id}`}
              disabled={disabled || !picker.supported || !query.trim()}
              onClick={() => void picker.search(query)}
            >
              {t("search")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              data-testid={`graph-reference-native-picker-${id}`}
              disabled={disabled || !picker.supported || !picker.canSelectFile}
              onClick={() => void accept(picker.selectNative)}
            >
              {t("nativePicker")}
            </Button>
          </div>
          {search?.loading ? (
            <p>{t("loading")}</p>
          ) : search?.error ? (
            <p role="alert">{search.error}</p>
          ) : search && search.query && !search.files.length ? (
            <p>{t("noFiles")}</p>
          ) : null}
          {search?.files.map((file, index) => (
            <Button
              key={file.path}
              size="sm"
              variant="outline"
              className="h-auto max-w-full whitespace-normal break-all"
              data-testid={`graph-reference-file-result-${id}-${index}`}
              disabled={disabled}
              onClick={() => void accept(() => picker.select(async () => file.relativePath))}
            >
              {file.relativePath}
            </Button>
          ))}
          {role.kind === "instruction"
            ? catalog?.instructions.map((instruction, index) => (
                <Button
                  key={instruction.path}
                  size="sm"
                  variant="outline"
                  className="h-auto max-w-full whitespace-normal break-all"
                  data-testid={`graph-reference-native-instruction-${id}-${index}`}
                  disabled={disabled}
                  onClick={() => void accept(() => picker.select(async () => instruction.path))}
                >
                  {instruction.path} · {instruction.scope}
                </Button>
              ))
            : null}
        </>
      )}
      <div
        data-testid={`graph-reference-status-${id}`}
        data-state={validation.status}
        className="space-y-1 text-ui-xs"
      >
        {validation.status === "loading" ? (
          <p>{t("loading")}</p>
        ) : validation.status === "error" ? (
          <p role="alert" className="text-destructive">
            {validation.error}
          </p>
        ) : validation.status === "ready" && validation.result.kind === "reference-validation" ? (
          <>
            <p>
              {t(
                validation.result.delivery === "native-instructions"
                  ? "nativeInstructions"
                  : "explicitRead",
              )}
            </p>
            {validation.result.issues.map((issue) => (
              <p key={issue} role="alert">
                {issue}
              </p>
            ))}
          </>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      <details>
        <summary>{t("advanced")}</summary>
        <Input
          data-testid={`graph-template-reference-${id}`}
          disabled={disabled}
          value={selected}
          onChange={(event) => change(event.target.value, false)}
        />
      </details>
    </div>
  );
}
