import { useEffect, useMemo, useRef, useState } from "react";
import type { WorkspaceFileEntry } from "@zcode/shared";
import type { GraphWorkspaceTarget } from "@zcode/services";
import { usePlatform } from "./usePlatform.js";
import { useGraphProjectSetup } from "./useGraphProjectSetup.js";
import { useWorkspaceServicesResolution } from "./useWorkspaceServices.js";
import {
  selectGraphReference,
  beginGraphReferenceIntent,
  beginGraphReferenceSearch,
  invalidateGraphReferenceReads,
} from "@/graph-engineering/graphReferenceSelection.js";
interface GraphReferenceSearchState {
  query: string;
  files: WorkspaceFileEntry[];
  error?: string;
  loading?: boolean;
}

export function useGraphReferencePicker(target: GraphWorkspaceTarget, fingerprint: string) {
  const setup = useGraphProjectSetup(target),
    platform = usePlatform();
  const resolution = useWorkspaceServicesResolution(
    target.workspacePath,
    undefined,
    target.workspaceIdentity,
  );
  const service = resolution.services.fileService;
  const scope = useMemo(
    () => ({ generation: 0, searchSequence: 0 }),
    [service, platform, target.workspacePath, target.workspaceIdentity],
  );
  const current = useRef({ scope, fingerprint });
  current.current = { scope, fingerprint };
  const [validationKey, setValidationKey] = useState("");
  // UX-M2.3：当前校验属于哪个路径。组件据此只在校验确实属于本次尝试时显示失败，不把上一次的失败挂到新文件上。
  const [validationPath, setValidationPath] = useState("");
  const [stored, setStored] = useState<{
    scope: object;
    query: string;
    files: WorkspaceFileEntry[];
    error?: string;
    loading?: boolean;
  }>({ scope, query: "", files: [] });
  useEffect(() => {
    current.current.scope = scope;
    return () => {
      invalidateGraphReferenceReads(scope);
      if (current.current.scope === scope)
        current.current.scope = { generation: 0, searchSequence: 0 };
    };
  }, [scope]);
  const select = async (pick: () => Promise<string | null>) => {
    const intentCurrent = beginGraphReferenceIntent(scope),
      captured = fingerprint;
    const owns = () =>
      current.current.scope === scope &&
      intentCurrent() &&
      current.current.fingerprint === captured;
    const result = await selectGraphReference({
      pick,
      isCurrent: owns,
      validate: async (path) => {
        const key = `${captured}:${path}`;
        setValidationKey(key);
        setValidationPath(path);
        const result = await setup.invoke({ action: "validate-reference", path }, key, owns);
        return result?.kind === "reference-validation" ? result : undefined;
      },
    });
    // Promise 逐层恢复后仍可能换工作区；调用方在实际写草稿前还需检查同一 intent。
    return result && owns() ? { result, isCurrent: owns } : undefined;
  };
  const search = async (query: string) => {
    if (current.current.scope !== scope) return;
    // 搜索与选择共享生命周期，但不能共享请求序号；否则取消选择器会令搜索一直停留在 Loading。
    const searchCurrent = beginGraphReferenceSearch(scope);
    setStored({ scope, query, files: [], loading: true });
    try {
      const files = await service.searchWorkspaceFiles({
        rootPath: target.workspacePath,
        workspaceIdentity: target.workspaceIdentity,
        query,
        limit: 30,
      });
      if (current.current.scope === scope && searchCurrent())
        setStored({ scope, query, files: files.filter((file) => file.type === "file") });
    } catch (cause) {
      if (current.current.scope === scope && searchCurrent())
        setStored({
          scope,
          query,
          files: [],
          error: cause instanceof Error ? cause.message : String(cause),
        });
    }
  };
  const searchState: GraphReferenceSearchState =
    stored.scope === scope ? stored : { query: "", files: [] };
  return {
    supported: setup.supported,
    canSelectFile: platform.canSelectFilePath === true && !resolution.isRemoteTarget,
    select,
    /**
     * UX-M2.3: `onPicked` receives what the native chooser returned (a path, or null when cancelled)
     * before validation starts, so the UI can name the attempted file. A chooser error still rejects.
     */
    selectNative: (onPicked?: (path: string | null) => void) =>
      select(async () => {
        const path = await platform.selectFile();
        onPicked?.(path || null);
        return path;
      }),
    search,
    searchState,
    validation: setup.state("validate-reference", validationKey),
    validationPath,
  };
}
