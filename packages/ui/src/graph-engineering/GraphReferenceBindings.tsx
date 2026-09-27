import type {
  GraphReferenceCatalog,
  GraphTemplateBindings,
  GraphWorkspaceTarget,
} from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { useGraphProjectSetup } from "@/hooks/useGraphProjectSetup.js";
import { useGraphEditorText } from "./GraphEditorMode.js";
import { GraphReferenceField, type GraphReferenceRole } from "./GraphReferenceField.js";

export function GraphReferenceBindings({
  target,
  roles,
  bindings,
  disabled,
  onChange,
  contextKey,
}: {
  target: GraphWorkspaceTarget;
  roles: GraphReferenceRole[];
  bindings: GraphTemplateBindings;
  disabled: boolean;
  contextKey?: string;
  onChange(value: GraphTemplateBindings): void;
}) {
  const setup = useGraphProjectSetup(target),
    t = useGraphEditorText(),
    key = "references";
  const state = setup.state("reference-catalog", key);
  const catalog: GraphReferenceCatalog | undefined =
    state.status === "ready" && state.result.kind === "reference-catalog"
      ? state.result
      : undefined;
  if (!roles.length) return null;
  return (
    <details
      className="space-y-3 text-ui-sm"
      data-testid="graph-reference-bindings"
      open={roles.some((role) => role.required)}
    >
      <summary>{t("references")}</summary>
      <p>{t("referenceHelp")}</p>
      <p>{t("catalogHelp")}</p>
      <Button
        size="sm"
        variant="outline"
        data-testid="graph-reference-catalog-load"
        disabled={disabled || !setup.supported || state.status === "loading"}
        onClick={() => void setup.invoke({ action: "reference-catalog" }, key)}
      >
        {t(state.status === "loading" ? "loading" : "catalogLoad")}
      </Button>
      {state.status === "error" ? (
        <p role="alert" className="text-destructive">
          {state.error}
        </p>
      ) : null}
      {catalog ? (
        <div data-testid="graph-reference-catalog" data-status={catalog.status}>
          <p>{catalog.status === "unknown" ? t("unknown") : t("selected")}</p>
          {catalog.unknowns.map((reason) => (
            <p key={reason}>{reason}</p>
          ))}
        </div>
      ) : null}
      {roles.map((role) => (
        <GraphReferenceField
          key={role.id}
          {...{ role, target, bindings, disabled, catalog, onChange, contextKey }}
        />
      ))}
    </details>
  );
}
