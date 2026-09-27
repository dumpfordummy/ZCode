import { useCallback, useEffect, useMemo, useRef } from "react";
import type { GraphWorkspaceTarget } from "@zcode/services";
import {
  IMPORT_READ_BOUND,
  TRANSFER_BYTE_LIMIT,
  assertStatUnchanged,
  decodeImportBytes,
} from "@zcode/services";
import type { SaveFileResult } from "@zcode/shared";
import { useOptionalPlatform } from "./usePlatform.js";
import { useWorkspaceServicesResolution } from "./useWorkspaceServices.js";
import { isLocalGraphTarget } from "@/graph-engineering/graphEngineeringView.js";

/**
 * useGraphTemplateFiles —— 顺序模板文件的导入/导出。复用现有平台文件能力
 * （selectFile/saveFile）与 IFileService 有界读取，不新增 host 协议或命令执行。
 *
 * 导入：selectFile → stat（类型/有限 size/mtime）→ 有界 readFileRange → 二次 stat
 *   → 致命 UTF-8 解码 → 返回 {path, json}；取消或 scope 失效返回 undefined。
 * 导出：将已审阅 JSON 编码为 UTF-8 ArrayBuffer → saveFile → 返回 SaveFileResult。
 *
 * 导入/导出/预览阶段不触发任何 model/command/plugin/MCP/worker 调度。
 */
export function useGraphTemplateFiles(target: GraphWorkspaceTarget) {
  const platform = useOptionalPlatform();
  const resolution = useWorkspaceServicesResolution(
    target.workspacePath,
    undefined,
    target.workspaceIdentity,
  );
  const fileService =
    isLocalGraphTarget(target) && !resolution.isRemoteTarget
      ? resolution.services.fileService
      : undefined;
  const canImportFile = Boolean(platform?.canSelectFilePath && fileService);
  const canExportFile = Boolean(platform?.saveFile);

  const scope = useMemo(
    () => ({}),
    [fileService, platform, target.workspacePath, target.workspaceIdentity],
  );
  const currentScope = useRef(scope);
  currentScope.current = scope;
  useEffect(() => {
    currentScope.current = scope;
    return () => {
      // 关闭或切换工作区后，旧异步结果不能回填已卸载的传输视图。
      if (currentScope.current === scope) currentScope.current = {};
    };
  }, [scope]);

  const importFile = useCallback(
    async (isCurrent: () => boolean): Promise<{ path: string; json: string } | undefined> => {
      if (!platform?.canSelectFilePath || !fileService) return undefined;
      const selected = await platform.selectFile();
      if (!selected || !isCurrent() || currentScope.current !== scope) return undefined;

      // 第一次 stat：检查类型为文件，size 为有限整数、mtime 为有限数。Number.isFinite
      // 接收 unknown 不会收窄类型，故先用 typeof 把 optional 字段收窄为 number 再做校验。
      // mtimeMs 在 Windows NTFS 上是亚毫秒精度的浮点（如 1695830400123.4567），
      // 不能用 Number.isInteger 校验，否则正常文件会被误判为非法而静默放弃导入。
      const before = await fileService.stat({ path: selected });
      if (!isCurrent() || currentScope.current !== scope) return undefined;
      if (before.type !== "file") return undefined;
      const sizeBefore = before.size;
      const mtimeBefore = before.mtimeMs;
      if (
        typeof sizeBefore !== "number" ||
        !Number.isFinite(sizeBefore) ||
        !Number.isInteger(sizeBefore)
      )
        return undefined;
      if (typeof mtimeBefore !== "number" || !Number.isFinite(mtimeBefore)) return undefined;
      // 超过传输上限的文件在读前拒绝，避免无谓 IO。
      if (sizeBefore > TRANSFER_BYTE_LIMIT)
        throw new Error("Selected file exceeds the 256 KB transfer limit.");

      // 一次有界读取。
      const bytes = await fileService.readFileRange({
        path: selected,
        offset: 0,
        length: IMPORT_READ_BOUND,
      });
      if (!isCurrent() || currentScope.current !== scope) return undefined;

      // 第二次 stat：拒绝 size/mtime/type 变化（外部同 size/同 mtime 重写仍由预览审阅兜底）。
      const after = await fileService.stat({ path: selected });
      if (!isCurrent() || currentScope.current !== scope) return undefined;
      assertStatUnchanged({ type: before.type, size: sizeBefore, mtimeMs: mtimeBefore }, after);

      // 致命 UTF-8 解码 + 字节上限 + 空白判定（纯边界校验，抽至 workflow-transfer 叶模块）。
      const json = decodeImportBytes(bytes);
      return { path: selected, json };
    },
    [platform, fileService, scope],
  );

  const exportFile = useCallback(
    async (json: string, isCurrent: () => boolean): Promise<SaveFileResult | undefined> => {
      if (!platform?.saveFile) return undefined;
      const encoded = new TextEncoder().encode(json);
      const data = new ArrayBuffer(encoded.byteLength);
      new Uint8Array(data).set(encoded);
      const result = await platform.saveFile({
        data,
        suggestedName: "workflow.zcode-workflow.json",
      });
      if (!isCurrent() || currentScope.current !== scope) return undefined;
      return result;
    },
    [platform, scope],
  );

  return { canImportFile, canExportFile, importFile, exportFile };
}
