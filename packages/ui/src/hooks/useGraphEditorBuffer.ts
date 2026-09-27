import { useGraphDraftStore } from "@/store/graphDraftStore.js";
import { projectGraphEditorBuffer } from "@/graph-engineering/graphEditorBuffer.js";

/** 未解析文本属于 Renderer 草稿；换节点、模式或外部刷新不能静默丢弃无效输入。 */
export function useGraphEditorBuffer(workspaceKey: string, field: string, canonical: string) {
  const retained = useGraphDraftStore(
    (state) => state.workspaces[workspaceKey]?.editorBuffers?.[field],
  );
  const buffer = projectGraphEditorBuffer(retained, canonical);
  const set = (text: string, error?: string) =>
    useGraphDraftStore.getState().setEditorBuffer(workspaceKey, field, { ...buffer, text, error });
  const accept = (text: string) =>
    useGraphDraftStore.getState().setEditorBuffer(workspaceKey, field, { base: text, text });
  return { ...buffer, conflict: buffer.base !== canonical, set, accept };
}
