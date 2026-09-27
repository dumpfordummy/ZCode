import type { GraphEditorBuffer } from "@/store/graphDraftStore.js";

export function projectGraphEditorBuffer(
  retained: GraphEditorBuffer | undefined,
  canonical: string,
): GraphEditorBuffer {
  // Apply 也可能因图的其他部分拒绝；即使文本未变，也必须保留并展示错误。
  return retained &&
    (retained.text !== retained.base || (retained.error && retained.base === canonical))
    ? retained
    : { base: canonical, text: canonical };
}
