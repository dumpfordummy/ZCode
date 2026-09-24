import type {
  GraphParameterValue,
  GraphPortableTemplate,
  GraphTemplateBindings,
  GraphTemplatePreview,
} from "@zcode/services";

export function initialTemplateParameters(
  template: GraphPortableTemplate,
): Record<string, GraphParameterValue> {
  return Object.fromEntries(
    template.parameters.flatMap((parameter) =>
      parameter.default === undefined ? [] : [[parameter.id, parameter.default]],
    ),
  );
}

/** Editing a transfer invalidates its reviewed preview before any import can be accepted. */
export function reviewedTemplate(
  preview: GraphTemplatePreview | undefined,
  reviewed: boolean,
): GraphPortableTemplate | undefined {
  return reviewed && preview?.errors.length === 0 ? preview.template : undefined;
}

export function templateBindingErrors(
  template: GraphPortableTemplate,
  parameters: Record<string, GraphParameterValue>,
  bindings: GraphTemplateBindings,
): string[] {
  const missing = template.parameters
    .filter((item) => {
      const value = parameters[item.id];
      return (
        (item.required && (value === undefined || value === "")) ||
        (value !== undefined &&
          (typeof value !== item.type || (typeof value === "number" && !Number.isFinite(value))))
      );
    })
    .map((item) => item.label);
  missing.push(
    ...template.references
      .filter((item) => item.required && !bindings.references[item.id]?.trim())
      .map((item) => item.label),
  );
  missing.push(
    ...template.graph.nodes
      .filter((node) => node.type === "tool" && !bindings.recipes[node.id])
      .map((node) => node.id),
  );
  if (template.graph.routing?.region && !bindings.sourcePaths.some((path) => path.trim()))
    missing.push("sourcePaths");
  return missing;
}
