import type {
  GraphReferenceCatalog,
  GraphReferenceValidation,
  GraphTemplateBindings,
} from "@zcode/services";

/**
 * Context picker model (spec: docs/graph-engineering/ux-audit/CONTEXT_PICKER_SPEC.md).
 *
 * 纯函数，无 React：schema 每个 role 只存一个字符串（`references[roleId]`），所以一个 role 最多一个
 * chip，替换是显式操作，不能在展示层伪造多选。选择、移除都只返回新的 bindings，交给唯一所有者
 * （草稿 store）写入；这里不保存第二份状态。
 */
export type GraphContextKind = "document" | "instruction" | "skill";

export interface GraphContextRole {
  id: string;
  label?: string;
  kind: GraphContextKind;
  required?: boolean;
  nodeIds: string[];
}

/** Host 对某个「确切取值」的验证回执；只在取值仍相同时才用于展示。 */
export interface GraphContextValidationRecord {
  path: string;
  validation: Pick<GraphReferenceValidation, "delivery" | "issues" | "digest" | "bytes">;
}
export type GraphContextValidations = Readonly<Record<string, GraphContextValidationRecord>>;

export type GraphContextStatus =
  /** Host 验证过：delivery 与 issues 都来自 validate-reference，绝不由 UI 推断。 */
  | {
      kind: "delivery";
      delivery: GraphReferenceValidation["delivery"];
      issues: string[];
    }
  /** 没有针对该确切取值的验证记录（恢复的草稿、Run again、Advanced 输入）：评审时才验证。 */
  | { kind: "not-checked" }
  | { kind: "skill"; state: "available" | "unavailable" | "unknown" | "catalog-missing" }
  /** 当前工作流版本没有声明这个 role；Host 仍会拒绝，UI 只负责如实展示，不静默丢弃。 */
  | { kind: "orphan" };

export interface GraphContextChip {
  roleId: string;
  roleLabel: string;
  kind: GraphContextKind;
  required: boolean;
  nodeIds: string[];
  value: string;
  title: string;
  detail?: string;
  status: GraphContextStatus;
}

export interface GraphContextView {
  /** 已选 role 的 chip（按 role 声明顺序），随后是未声明 role 的孤儿 chip。 */
  chips: GraphContextChip[];
  /** 必填但未选的 role；移除必填引用后回到这里，绝不会变成可选。 */
  missing: GraphContextRole[];
  slots: number;
  selected: number;
}

export type GraphContextOptionGroup = "instruction" | "file" | "skill";
export interface GraphContextOption {
  key: string;
  group: GraphContextOptionGroup;
  /** 写入 / 验证的取值：文件与指令为路径，技能为 skill id。 */
  value: string;
  title: string;
  detail?: string;
  /** 存在时该项可见但不可选，原因由 UI 翻译。 */
  disabled?: "skill-unavailable";
}

export const GRAPH_CONTEXT_OPTION_LIMIT = 50;

const isSet = (value: string | undefined): value is string => Boolean(value?.trim());
const normalize = (path: string) => path.replaceAll("\\", "/");
const basename = (path: string) => normalize(path).split("/").filter(Boolean).at(-1) ?? path;

function skillStatus(
  id: string,
  catalog: GraphReferenceCatalog | undefined,
): { status: GraphContextStatus; title: string; detail?: string } {
  const skill = catalog?.skills.find((item) => item.id === id);
  if (skill)
    return {
      status: {
        kind: "skill",
        state: skill.enabled && skill.digest ? "available" : "unavailable",
      },
      title: skill.name,
      detail: `${skill.id} · ${skill.scope}`,
    };
  // catalog 为 unknown 时 skills 必为空：这是「没有目录」，不能说成「目录里没有这个技能」。
  return {
    status: {
      kind: "skill",
      state: catalog?.status === "available" ? "unknown" : "catalog-missing",
    },
    title: id,
  };
}

export function graphContextView({
  roles,
  bindings,
  catalog,
  validations = {},
}: {
  roles: readonly GraphContextRole[];
  bindings: Pick<GraphTemplateBindings, "references">;
  catalog?: GraphReferenceCatalog;
  validations?: GraphContextValidations;
}): GraphContextView {
  const chips: GraphContextChip[] = [];
  const missing: GraphContextRole[] = [];
  for (const role of roles) {
    const raw = bindings.references[role.id];
    if (!isSet(raw)) {
      if (role.required) missing.push(role);
      continue;
    }
    const value = raw.trim();
    const skill = role.kind === "skill" ? skillStatus(value, catalog) : undefined;
    const record = validations[role.id];
    const title = skill?.title ?? basename(value);
    const detail = skill ? skill.detail : title !== value ? value : undefined;
    chips.push({
      roleId: role.id,
      roleLabel: role.label ?? role.id,
      kind: role.kind,
      required: Boolean(role.required),
      nodeIds: role.nodeIds,
      value,
      title,
      ...(detail ? { detail } : {}),
      status:
        skill?.status ??
        (record && record.path === value
          ? {
              kind: "delivery",
              delivery: record.validation.delivery,
              issues: [...record.validation.issues],
            }
          : { kind: "not-checked" }),
    });
  }
  const declared = new Set(roles.map((role) => role.id));
  for (const [id, raw] of Object.entries(bindings.references))
    if (!declared.has(id) && isSet(raw))
      chips.push({
        roleId: id,
        roleLabel: id,
        kind: "document",
        required: false,
        nodeIds: [],
        value: raw.trim(),
        title: raw.trim(),
        status: { kind: "orphan" },
      });
  return {
    chips,
    missing,
    slots: roles.length,
    selected: chips.filter((chip) => chip.status.kind !== "orphan").length,
  };
}

const matches = (query: string, ...fields: Array<string | undefined>) => {
  const needle = query.trim().toLowerCase();
  return !needle || fields.some((field) => field?.toLowerCase().includes(needle));
};

/**
 * 选项来源随 role.kind：document 只用工作区文件搜索；instruction 先列原生指令条目再列文件；
 * skill 只列目录中的技能（禁用/不可验证的技能可见但不可选）。
 */
export function graphContextOptions({
  role,
  query,
  files,
  catalog,
}: {
  role: Pick<GraphContextRole, "kind">;
  query: string;
  files: ReadonlyArray<{ name: string; relativePath: string }>;
  catalog?: GraphReferenceCatalog;
}): GraphContextOption[] {
  if (role.kind === "skill")
    return (catalog?.skills ?? [])
      .filter((skill) => matches(query, skill.name, skill.id))
      .slice(0, GRAPH_CONTEXT_OPTION_LIMIT)
      .map((skill) => ({
        key: `skill:${skill.id}`,
        group: "skill" as const,
        value: skill.id,
        title: skill.name,
        detail: `${skill.id} · ${skill.scope}`,
        ...(skill.enabled && skill.digest ? {} : { disabled: "skill-unavailable" as const }),
      }));
  const instructions =
    role.kind === "instruction"
      ? (catalog?.instructions ?? [])
          .filter((instruction) => matches(query, instruction.path))
          .map((instruction) => ({
            key: `instruction:${instruction.path}`,
            group: "instruction" as const,
            value: instruction.path,
            title: basename(instruction.path),
            detail: `${instruction.path} · ${instruction.scope}`,
          }))
      : [];
  const known = new Set(instructions.map((item) => normalize(item.value)));
  const found = files
    .filter((file) => !known.has(normalize(file.relativePath)))
    .map((file) => ({
      key: `file:${file.relativePath}`,
      group: "file" as const,
      value: file.relativePath,
      title: file.name || basename(file.relativePath),
      detail: file.relativePath,
    }));
  return [...instructions, ...found].slice(0, GRAPH_CONTEXT_OPTION_LIMIT);
}

/**
 * 引导式选择/替换。语义与原 GraphReferenceField.change(value, guided=true) 相同：取值变化时
 * 标记 native-aware 策略；取值相同则原样返回（引用相等，调用方可据此跳过写入）。
 */
export function graphContextSelect(
  bindings: GraphTemplateBindings,
  roleId: string,
  value: string,
): GraphTemplateBindings {
  if (bindings.references[roleId] === value) return bindings;
  return {
    ...bindings,
    referencePolicy: "native-aware-v1",
    references: { ...bindings.references, [roleId]: value },
  };
}

/** 移除只删除该 role 的键：不改 referencePolicy 与其他任何字段；必填项因此重新缺失。 */
export function graphContextRemove(
  bindings: GraphTemplateBindings,
  roleId: string,
): GraphTemplateBindings {
  if (!(roleId in bindings.references)) return bindings;
  return {
    ...bindings,
    references: Object.fromEntries(
      Object.entries(bindings.references).filter(([id]) => id !== roleId),
    ),
  };
}

/** Advanced 原始输入：与原来一致，不改 referencePolicy；空白等同于未设置，写入前删除键。 */
export function graphContextSetRaw(
  bindings: GraphTemplateBindings,
  roleId: string,
  text: string,
): GraphTemplateBindings {
  if (!isSet(text)) return graphContextRemove(bindings, roleId);
  if (bindings.references[roleId] === text) return bindings;
  return { ...bindings, references: { ...bindings.references, [roleId]: text } };
}
