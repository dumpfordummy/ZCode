import type { GraphRecipeSnapshot, GraphToolNode } from "@zcode/services";
import { Input } from "@/components/ui/input.js";
import { GraphSelect } from "./GraphSelect.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

export function GraphToolEditor({
  node,
  recipes,
  disabled,
  onChange,
}: {
  node: GraphToolNode;
  recipes: GraphRecipeSnapshot | null;
  disabled: boolean;
  onChange: (node: GraphToolNode) => void;
}) {
  const { intl } = useZCodeIntl(),
    t = (id: string) => intl.formatMessage({ id: `graph.z4.${id}` });
  const selected = recipes?.recipes.find((recipe) => recipe.id === node.recipeId);
  return (
    <div className="space-y-3">
      <label className="block space-y-1 text-ui-sm">
        <span>{t("toolName")}</span>
        <Input
          data-testid="graph-tool-name"
          value={node.name}
          disabled={disabled}
          onChange={(event) => onChange({ ...node, name: event.target.value })}
        />
      </label>
      <label className="block space-y-1 text-ui-sm">
        <span>{t("nodeIdentity")}</span>
        <Input
          data-testid="graph-tool-node-id"
          value={node.id}
          readOnly
          onFocus={(event) => event.currentTarget.select()}
        />
        <span className="block text-foreground-subtle">{t("nodeIdentityHelp")}</span>
      </label>
      <GraphSelect
        label={t("recipe")}
        testId="graph-tool-recipe"
        disabled={disabled}
        value={node.recipeId || "none"}
        options={[
          { value: "none", label: t("selectRecipe") },
          ...(recipes?.recipes.map((recipe) => ({ value: recipe.id, label: recipe.name })) ?? []),
          ...(node.recipeId && !selected ? [{ value: node.recipeId, label: node.recipeId }] : []),
        ]}
        onChange={(value) => onChange({ ...node, recipeId: value === "none" ? "" : value })}
      />
      <p className="text-ui-sm text-foreground-subtle">{t("toolHelp")}</p>
      {selected ? (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-ui-sm">
          {JSON.stringify(selected, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
