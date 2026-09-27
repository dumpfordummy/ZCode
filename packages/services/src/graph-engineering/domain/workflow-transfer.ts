/**
 * workflow-transfer —— 顺序模板文件导入的纯边界校验。从 React hook 抽出以便用
 * node:test 覆盖（UI 层无测试运行器，且本任务不新增依赖）。不执行任何 IO：调用方
 * 传入已读取的字节与两次 stat 快照，函数只做判定与致命 UTF-8 解码。
 *
 * 独立叶模块：不依赖 contract.ts 或 workflow-contract.ts，无循环风险，与
 * workflow-request.ts 等已发布叶模块同一模式。
 */

/** 现有传输上限：超过此字节数的模板被拒绝。 */
export const TRANSFER_BYTE_LIMIT = 256_000;
/** 有界读取长度：256,001 字节用于检测超过 256,000 传输上限的文件。 */
export const IMPORT_READ_BOUND = 256_001;

/** stat 快照的最小结构，与 IFileService 返回的 FileStat 结构兼容。 */
export interface TransferStatSnapshot {
  type: "file" | "directory";
  size?: number;
  mtimeMs?: number;
}

/**
 * 拒绝两次 stat 之间的 size/mtime/type 变化。外部同 size/同 mtime 重写仍由预览
 * 审阅兜底；此处只拦截读取窗口内可观测的元数据变化。before 应为已校验的有限整数
 * 快照，after 为读取后新快照——若 after 字段缺失（旧远端或文件被删），比较不等即抛出。
 */
export function assertStatUnchanged(
  before: TransferStatSnapshot,
  after: TransferStatSnapshot,
): void {
  if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.type !== before.type)
    throw new Error("Selected file changed during read; review the file and try again.");
}

/**
 * 拒绝超过传输上限的字节、非 UTF-8 字节序列、空白内容；返回致命解码后的 JSON 字符串。
 * fatal: true 保证无效字节序列抛出而非静默替换，避免损坏内容进入预览解析。
 */
export function decodeImportBytes(bytes: Uint8Array): string {
  if (bytes.length > TRANSFER_BYTE_LIMIT)
    throw new Error("Selected file exceeds the 256 KB transfer limit.");
  let json: string;
  try {
    json = new TextDecoder("utf8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Selected file is not valid UTF-8; review the encoding and try again.");
  }
  if (!json.trim()) throw new Error("Selected file is blank.");
  return json;
}
