import type { GraphRun } from "@zcode/services";
import type { GraphTemplateFormDraft } from "@/store/graphDraftStore.js";

export interface GraphRunAgainDraft {
  selection: { id: string; version: number };
  templateKey: string;
  form: GraphTemplateFormDraft;
}

/**
 * Seeds a new-run form from the frozen template instance of an earlier run. It only reads the
 * captured parameters and bindings; it starts nothing, and the existing binding validation still
 * checks them against the current saved checks and references before any run can be reviewed.
 */
export function graphRunAgainDraft(run: GraphRun): GraphRunAgainDraft | undefined {
  if (run.version !== 5) return undefined;
  const template = run.definition.template;
  if (!template) return undefined;
  const regionId = (run.definition as { routing?: { region?: { id?: string } } }).routing?.region
    ?.id;
  return {
    selection: { id: template.id, version: template.version },
    templateKey: `${template.id}:${template.version}`,
    form: {
      parameters: structuredClone(template.parameters),
      bindings: structuredClone(template.bindings),
      // UX-M3.3：记录这个表单来自哪个固定版本，供“版本已不再提供”的说明和按稳定标识带过来使用。
      origin: {
        version: template.version,
        digest: template.digest,
        references: template.references.map(({ id, kind }) => ({ id, kind })),
        ...(regionId ? { regionId } : {}),
      },
    },
  };
}
