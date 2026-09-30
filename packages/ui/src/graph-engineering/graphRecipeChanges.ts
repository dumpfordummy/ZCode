import type { GraphRecipeFormDraft } from "@/store/graphDraftStore.js";

export interface GraphRecipeChange {
  id: string;
  /** The check's name when it is a string (draft for added/modified, saved base for removed). */
  name?: string;
}

/**
 * UX-M2.2: what the existing Save would change, compared with the saved list the draft started from
 * (`baseText`, the snapshot at `digest`). Derived only; never stored and never used to save.
 * "unsummarizable" means the list cannot be complete, so the UI must not present one.
 */
export type GraphRecipeChanges =
  | { kind: "clean" }
  | { kind: "unsummarizable"; reason: "invalid-json" | "missing-id" | "duplicate-id" }
  | {
      kind: "changes";
      added: GraphRecipeChange[];
      modified: GraphRecipeChange[];
      removed: GraphRecipeChange[];
      reordered: boolean;
      /** The text differs only in formatting: saving writes the same checks. */
      formattingOnly: boolean;
    };

type Parsed =
  | { kind: "ok"; recipes: { id: string; name?: string; canonical: string }[] }
  | { kind: "bad"; reason: "invalid-json" | "missing-id" | "duplicate-id" };

// 与键顺序无关的规范化文本：只比较内容，不因为编辑器重新排列字段而报告“已修改”。
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

function parse(text: string): Parsed {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { kind: "bad", reason: "invalid-json" };
  }
  if (!Array.isArray(value)) return { kind: "bad", reason: "invalid-json" };
  const recipes: { id: string; name?: string; canonical: string }[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item))
      return { kind: "bad", reason: "invalid-json" };
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || !record.id.trim())
      return { kind: "bad", reason: "missing-id" };
    if (seen.has(record.id)) return { kind: "bad", reason: "duplicate-id" };
    seen.add(record.id);
    recipes.push({
      id: record.id,
      ...(typeof record.name === "string" ? { name: record.name } : {}),
      canonical: canonical(record),
    });
  }
  return { kind: "ok", recipes };
}

const change = (recipe: { id: string; name?: string }): GraphRecipeChange =>
  recipe.name === undefined ? { id: recipe.id } : { id: recipe.id, name: recipe.name };

export function graphRecipeChanges(
  form: Pick<GraphRecipeFormDraft, "text" | "baseText"> | undefined,
): GraphRecipeChanges {
  if (!form || form.text === form.baseText) return { kind: "clean" };
  const base = parse(form.baseText);
  const draft = parse(form.text);
  // baseText 来自 Host 快照，正常总能解析；若不能，同样不声称清单完整。
  if (base.kind === "bad") return { kind: "unsummarizable", reason: base.reason };
  if (draft.kind === "bad") return { kind: "unsummarizable", reason: draft.reason };
  const saved = new Map(base.recipes.map((recipe) => [recipe.id, recipe]));
  const edited = new Map(draft.recipes.map((recipe) => [recipe.id, recipe]));
  const added = draft.recipes.filter((recipe) => !saved.has(recipe.id)).map(change);
  const removed = base.recipes.filter((recipe) => !edited.has(recipe.id)).map(change);
  const modified = draft.recipes
    .filter(
      (recipe) => saved.has(recipe.id) && saved.get(recipe.id)!.canonical !== recipe.canonical,
    )
    .map(change);
  const common = (list: { id: string }[], other: Map<string, unknown>) =>
    list.filter((recipe) => other.has(recipe.id)).map((recipe) => recipe.id);
  const reordered =
    common(base.recipes, edited).join("\n") !== common(draft.recipes, saved).join("\n");
  return {
    kind: "changes",
    added,
    modified,
    removed,
    reordered,
    formattingOnly: !added.length && !modified.length && !removed.length && !reordered,
  };
}

/** Stable ids a New-run row may mark; empty when the list cannot be complete. */
export function graphRecipeChangeOf(
  changes: GraphRecipeChanges,
  id: string,
): "modified" | "removed" | undefined {
  if (changes.kind !== "changes") return undefined;
  if (changes.modified.some((item) => item.id === id)) return "modified";
  if (changes.removed.some((item) => item.id === id)) return "removed";
  return undefined;
}
