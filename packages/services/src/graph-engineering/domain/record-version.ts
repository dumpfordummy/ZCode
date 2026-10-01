/**
 * Z8.2：工作区记录的版本边界。
 * `MAX_SUPPORTED_RECORD_VERSION` 必须与 record.ts 里 `recordSchema.version` 的联合保持一致
 * （record-version.test.ts 用真实 schema 校验这一点）。比它新的整数版本是「已知形状但本构建不支持的更新版本」，
 * 与普通损坏数据分开报告；不放宽 .strict()，也不降级或改写文件。
 */
export const MAX_SUPPORTED_RECORD_VERSION = 5;

/** Z8.2：指令解析契约的最高受支持值（与 bindings.ts 的 GRAPH_INSTRUCTION_CONTRACT_CURRENT 一致）。 */
export const MAX_SUPPORTED_INSTRUCTION_CONTRACT = 2;

export interface NewerVersionFinding {
  /** 版本号出现的位置，例如 `version`、`definition.version`、`runs[2].version`。 */
  location: string;
  version: number;
  /** 该位置上本构建支持的最高值（记录版本为 5，指令契约为 2）。 */
  supported: number;
}

const isNewer = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > MAX_SUPPORTED_RECORD_VERSION;

/** 在已解析的 JSON 中查找比支持范围更新的版本；只看这三类位置，不遍历任意字段。 */
export function findNewerRecordVersion(json: unknown): NewerVersionFinding | undefined {
  if (!json || typeof json !== "object") return undefined;
  const record = json as { version?: unknown; definition?: unknown; runs?: unknown };
  if (isNewer(record.version))
    return {
      location: "version",
      version: record.version,
      supported: MAX_SUPPORTED_RECORD_VERSION,
    };
  const definition = record.definition as { version?: unknown } | null | undefined;
  if (definition && typeof definition === "object" && isNewer(definition.version))
    return {
      location: "definition.version",
      version: definition.version,
      supported: MAX_SUPPORTED_RECORD_VERSION,
    };
  if (Array.isArray(record.runs))
    for (const [index, run] of record.runs.entries()) {
      const version = (run as { version?: unknown } | null)?.version;
      if (isNewer(version))
        return {
          location: `runs[${index}].version`,
          version,
          supported: MAX_SUPPORTED_RECORD_VERSION,
        };
      const attempts = (run as { nodeAttempts?: unknown } | null)?.nodeAttempts;
      if (Array.isArray(attempts))
        for (const [at, attempt] of attempts.entries()) {
          const contract = (attempt as { instructionContract?: unknown } | null)
            ?.instructionContract;
          if (
            typeof contract === "number" &&
            Number.isInteger(contract) &&
            contract > MAX_SUPPORTED_INSTRUCTION_CONTRACT
          )
            return {
              location: `runs[${index}].nodeAttempts[${at}].instructionContract`,
              version: contract,
              supported: MAX_SUPPORTED_INSTRUCTION_CONTRACT,
            };
        }
    }
  return undefined;
}

export const RECORD_RESTORE_GUIDANCE = "docs/graph-engineering/z8/GRAPH_DATA_OPERATIONS.md";

/**
 * 用户可读、有界的失败：不改写文件，也不派发任何工作。
 * `diagnostic` 保留权威的 schema 校验信息（截断），供排查使用；原始错误在 `cause`。
 */
export class GraphRecordUnsupportedVersionError extends Error {
  readonly code = "GRAPH_RECORD_UNSUPPORTED_VERSION";
  constructor(
    readonly finding: NewerVersionFinding,
    readonly diagnostic: string,
    cause?: unknown,
  ) {
    super(
      `This Graph record uses version ${finding.version} (${finding.location}), which is newer than this ZCode Graph build supports (up to ${finding.supported}). It appears to come from a newer, unsupported ZCode Graph version. Nothing was changed or started. Do not edit the file; see the Graph data backup and restore guidance in ${RECORD_RESTORE_GUIDANCE}.`,
      { cause },
    );
    this.name = "GraphRecordUnsupportedVersionError";
  }
}

/**
 * Z8.2：受支持格式的记录，其冻结的指令无法通过校验（与“更新版本”和“数据损坏”分开）。
 * 不改写文件、不启动任何工作；完整的原始校验问题保留在 `diagnostic`（有界）和 `cause`。
 * 消息不把它说成升级问题：可能是文件被编辑/损坏，也可能来自本构建不认识的写入方。
 */
export class GraphRecordIntegrityError extends Error {
  readonly code = "GRAPH_RECORD_INTEGRITY";
  constructor(
    readonly detail: string,
    readonly diagnostic: string,
    cause?: unknown,
  ) {
    super(
      `This Graph record could not be verified: ${detail} The recorded instructions no longer match the inputs recorded with them. The data may have been edited or damaged, or written by a build whose instruction format this build does not recognize. Nothing was changed or started, and the file was left as it is. The full validation diagnostic is attached to this error; see ${RECORD_RESTORE_GUIDANCE} for the backup and restore guidance.`,
      { cause },
    );
    this.name = "GraphRecordIntegrityError";
  }
}

/** 把校验问题压缩成有界文本（最多 8 条、2000 字符）。 */
export function boundedDiagnostic(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
): string {
  const lines = issues
    .slice(0, 8)
    .map((issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`);
  if (issues.length > 8) lines.push(`… and ${issues.length - 8} more`);
  return lines.join("\n").slice(0, 2000);
}
