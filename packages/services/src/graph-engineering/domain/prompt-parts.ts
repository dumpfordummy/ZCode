import type { GraphSequentialDefinition } from "../contract.js";
import type {
  GraphInstructionPart,
  GraphPromptPreview,
  GraphPromptReferenceMetadata,
} from "../editor-types.js";

/** Scan original bytes once; inserted values are never scanned or recursively interpolated. */
export function graphInstructionParts(instructions: string): GraphInstructionPart[] {
  const parts: GraphInstructionPart[] = [];
  const pattern = /\{\{inputs\.([A-Za-z][A-Za-z0-9_]*)\}\}/g;
  let offset = 0;
  for (const match of instructions.matchAll(pattern)) {
    if (match.index > offset)
      parts.push({ kind: "text", text: instructions.slice(offset, match.index) });
    parts.push({ kind: "token", alias: match[1]!, token: match[0] });
    offset = match.index + match[0].length;
  }
  if (offset < instructions.length) parts.push({ kind: "text", text: instructions.slice(offset) });
  return parts;
}

export function graphPromptReferences(
  graph: GraphSequentialDefinition,
  nodeId: string,
  metadata?: GraphPromptReferenceMetadata,
): GraphPromptPreview["references"] {
  return (
    graph.template?.references
      .filter((reference) => reference.nodeIds.includes(nodeId))
      .map((reference) => {
        const captured = metadata?.find(
          (item) => item.id === reference.id && item.kind === reference.kind,
        );
        const delivery =
          reference.kind === "skill"
            ? captured?.delivery === "native-skill"
              ? captured.delivery
              : undefined
            : captured?.delivery === "native-instructions" || captured?.delivery === "explicit-read"
              ? captured.delivery
              : undefined;
        return {
          id: reference.id,
          kind: reference.kind,
          selected: graph.template!.bindings.references[reference.id],
          ...(reference.kind === "skill" ? { nativeName: captured?.nativeName } : {}),
          ...(graph.template!.bindings.referencePolicy === "native-aware-v1" && delivery
            ? { delivery }
            : {}),
        };
      }) ?? []
  );
}

export function graphReferenceSuffix(
  references: GraphPromptPreview["references"],
  nativeAware = false,
): string {
  if (!references.length) return "";
  // 旧记录没有显式 delivery 时必须保持原提示字节，不能因新 UI 上线改变历史摘要。
  nativeAware ||= references.some((reference) => reference.delivery !== undefined);
  const data = references.map((reference) => ({
    id: reference.id,
    kind: reference.kind,
    selected: reference.selected,
    ...(reference.kind === "skill" ? { nativeSkillName: reference.nativeName } : {}),
    ...(nativeAware ? { delivery: reference.delivery } : {}),
  }));
  return `\n\nExplicit native references (data): ${JSON.stringify(data)}\n${
    nativeAware
      ? "References marked native-instructions are already supplied by native project guidance; do not read or inject them again. Read only explicit-read references through native Read. Load native-skill references using nativeSkillName through the existing native Skill tool; the selected catalog ID is provenance, not the Skill tool argument. References without a delivery marker remain unresolved until preparation. Cite reference IDs; missing source is a question, never an invented rule."
      : "Read document/instruction references through native Read. Load nativeSkillName through the existing native Skill tool; the selected catalog ID is provenance, not the Skill tool argument. Cite reference IDs; missing source is a question, never an invented rule."
  }`;
}
