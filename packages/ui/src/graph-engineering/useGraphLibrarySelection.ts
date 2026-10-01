import { useEffect } from "react";
import type { GraphLibraryEntry } from "@zcode/services";
import { useGraphDraftStore } from "@/store/graphDraftStore.js";
import { carryForward, pinStatus, type GraphPinStatus } from "./graphHistoricalPin.js";
import { resolveLibrarySelection } from "./graphLibraryView.js";

/**
 * The selected workflow and version of one workspace, resolved against the library the Host returned.
 * When the stored selection is not something the library offers (a historical pin from Run again),
 * `version` is undefined and `status` says why: nothing else is shown in its place (UX-M3.3).
 */
export function useGraphLibrarySelection(
  entries: readonly GraphLibraryEntry[],
  loaded: boolean,
  workspaceKey: string,
) {
  const selection = useGraphDraftStore((state) => state.workspaces[workspaceKey]?.librarySelection);
  const origin = useGraphDraftStore((state) =>
    selection
      ? state.workspaces[workspaceKey]?.templates[`${selection.id}:${selection.version}`]?.origin
      : undefined,
  );
  const choose = useGraphDraftStore((state) => state.selectLibrary);
  const resolved = resolveLibrarySelection(entries, selection);
  const status: GraphPinStatus = loaded
    ? pinStatus(entries, selection, origin)
    : { kind: "offered" };
  const entry = status.kind === "workflow-missing" ? undefined : resolved.entry;
  const version = status.kind === "offered" ? resolved.version : undefined;
  const { defaultId, defaultVersion } = resolved;
  useEffect(() => {
    // 默认选择只在新建意图首次读取后固定；刷新库不能让正在填写的表单自动漂移到新版本。
    if (!selection && defaultId && defaultVersion !== undefined)
      choose(workspaceKey, { id: defaultId, version: defaultVersion });
  }, [selection, defaultId, defaultVersion, choose, workspaceKey]);
  const carryReport = useGraphDraftStore((state) =>
    entry && version
      ? state.workspaces[workspaceKey]?.templates[`${entry.id}:${version.version}`]?.carryReport
      : undefined,
  );
  /** Explicit: seed the offered version's form from the historical one by stable identity, then select it. */
  const continueWithOffered = () => {
    if (!selection || !entry || status.kind === "offered" || status.kind === "workflow-missing")
      return;
    const target = entry.versions.find(
      (item) =>
        item.version === (status.kind === "content-changed" ? status.requested : status.offered),
    );
    const store = useGraphDraftStore.getState();
    const source =
      store.workspaces[workspaceKey]?.templates[`${selection.id}:${selection.version}`];
    if (!target || !source?.origin) return;
    const { form, report } = carryForward({ form: source, origin: source.origin }, target.template);
    store.setTemplateDraft(workspaceKey, `${entry.id}:${target.version}`, {
      ...form,
      carryReport: report,
    });
    store.selectLibrary(workspaceKey, { id: entry.id, version: target.version });
  };
  const dismissCarryReport = () => {
    if (!entry || !version) return;
    const store = useGraphDraftStore.getState();
    const key = `${entry.id}:${version.version}`;
    const current = store.workspaces[workspaceKey]?.templates[key];
    if (current) store.setTemplateDraft(workspaceKey, key, { ...current, carryReport: undefined });
  };
  return {
    selection,
    entry,
    version,
    status,
    carryReport,
    continueWithOffered,
    dismissCarryReport,
  };
}
