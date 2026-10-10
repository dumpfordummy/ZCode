import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import type { GraphTemplateBindings, GraphWorkspaceTarget } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover.js";
import { useGraphProjectSetup } from "@/hooks/useGraphProjectSetup.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useGraphEditorText } from "./GraphEditorMode.js";
import { GraphContextChip } from "./GraphContextChip.js";
import { GraphDisclosure } from "./GraphDisclosure.js";
import {
  GraphContextPicker,
  type GraphContextApply,
  type GraphContextCatalogState,
} from "./GraphContextPicker.js";
import { useGraphContextText } from "./GraphContextText.js";
import {
  graphContextRemove,
  graphContextSelect,
  graphContextSetRaw,
  graphContextView,
  type GraphContextChip as Chip,
  type GraphContextRole,
  type GraphContextValidationRecord,
} from "./graphContextChips.js";
import { graphFocusClass } from "./graphFocus.js";
import { useGraphTemplateText } from "./graphTemplateText.js";

const CATALOG_KEY = "references";

/**
 * New run 的 Context 区（规格：CONTEXT_PICKER_SPEC.md）：摘要 + 每个已选引用一个 chip + 「添加上下文」
 * 搜索选择器 + Advanced 原始字段。bindings 的唯一所有者是草稿 store：本组件只通过 onChange(update)
 * 发送「基于最新 bindings 的更新函数」，异步回执因此不会用过期快照覆盖并发修改。
 */
export function GraphContextSection({
  target,
  contextKey,
  roles,
  bindings,
  disabled,
  nodeNames,
  onChange,
}: {
  target: GraphWorkspaceTarget;
  /** workspaceKey + templateKey：变化即视为另一个上下文，选择器关闭、验证记录失效。 */
  contextKey: string;
  roles: GraphContextRole[];
  bindings: GraphTemplateBindings;
  disabled: boolean;
  nodeNames: Readonly<Record<string, string>>;
  onChange(update: (current: GraphTemplateBindings) => GraphTemplateBindings): void;
}) {
  const { intl } = useZCodeIntl();
  const t = useGraphContextText();
  const editor = useGraphEditorText();
  const display = useGraphTemplateText();
  const setup = useGraphProjectSetup(target);
  const catalogRead = setup.state("reference-catalog", CATALOG_KEY);
  const catalogState: GraphContextCatalogState =
    catalogRead.status === "ready" && catalogRead.result.kind === "reference-catalog"
      ? { status: "ready", catalog: catalogRead.result }
      : catalogRead.status === "error"
        ? { status: "error", error: catalogRead.error }
        : catalogRead.status === "loading"
          ? { status: "loading" }
          : { status: "idle" };
  const catalog = catalogState.status === "ready" ? catalogState.catalog : undefined;
  const loadCatalog = () => void setup.invoke({ action: "reference-catalog" }, CATALOG_KEY);

  const [picker, setPicker] = useState<{ open: boolean; roleId?: string }>({ open: false });
  const [announcement, setAnnouncement] = useState("");
  const [records, setRecords] = useState<{
    contextKey: string;
    byRole: Record<string, GraphContextValidationRecord>;
  }>({ contextKey, byRole: {} });
  const validations = records.contextKey === contextKey ? records.byRole : {};
  const addRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  // 工作区或模板切换：关闭选择器（其卸载会使迟到的搜索/验证回执失效），并清除播报。
  useEffect(() => {
    setPicker({ open: false });
    setAnnouncement("");
  }, [contextKey]);
  // 打开选择器即读取一次目录（只读预览，与每次 validate-reference 所做的读取同类；不启动模型或进程）。
  useEffect(() => {
    if (picker.open && catalogState.status === "idle" && setup.supported) loadCatalog();
    // loadCatalog 只依赖稳定的 setup.invoke；这里按状态变化触发一次。
  }, [picker.open, catalogState.status, setup.supported]);

  const view = useMemo(
    () => graphContextView({ roles, bindings, catalog, validations }),
    [roles, bindings, catalog, validations],
  );
  const roleLabel = (role: Pick<GraphContextRole, "id" | "label">) =>
    role.label ? display.reference(role.id, role.label) : role.id;
  const kindLabel = (kind: GraphContextRole["kind"]) => display.kind(kind);
  const usedBy = (nodeIds: readonly string[]) =>
    nodeIds.length
      ? t("usedBy", { nodes: nodeIds.map((id) => nodeNames[id] ?? id).join(", ") })
      : "";
  const roleById = (id: string) => roles.find((role) => role.id === id);

  const open = (roleId: string | undefined, trigger: HTMLElement | null) => {
    returnFocus.current = trigger;
    setPicker({ open: true, roleId });
  };
  const apply = ({ roleId, value, validation }: GraphContextApply) => {
    const role = roleById(roleId);
    const previous = bindings.references[roleId]?.trim();
    onChange((current) => graphContextSelect(current, roleId, value));
    if (validation)
      setRecords((old) => ({
        contextKey,
        byRole: {
          ...(old.contextKey === contextKey ? old.byRole : {}),
          [roleId]: { path: value, validation },
        },
      }));
    const label = role ? roleLabel(role) : roleId;
    setAnnouncement(
      previous && previous !== value
        ? t("announceReplaced", { value, previous, role: label })
        : t("announceAdded", { value, role: label }),
    );
    setPicker({ open: false });
  };
  const remove = (chip: Chip) => {
    onChange((current) => graphContextRemove(current, chip.roleId));
    const role = roleById(chip.roleId);
    setAnnouncement(
      t(role?.required ? "announceRemovedRequired" : "announceRemoved", {
        value: chip.value,
        role: role ? roleLabel(role) : chip.roleLabel,
      }),
    );
    addRef.current?.focus();
  };

  const summary =
    view.selected === 0 && view.missing.length === 0
      ? t("summaryNone")
      : [
          t("summarySet", { selected: view.selected, slots: view.slots }),
          view.missing.length ? t("summaryMissing", { count: view.missing.length }) : "",
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <section
      className="space-y-3 border-t border-border pt-5 text-ui-base"
      data-testid="graph-reference-bindings"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-ui-base font-semibold">
          {intl.formatMessage({ id: "graph.preZ8.contextLabel" })}
        </h4>
        <p className="text-foreground-subtle" data-testid="graph-context-summary">
          {summary}
        </p>
      </div>
      <p className="text-foreground-subtle">{t("help")}</p>
      {view.chips.length || view.missing.length ? (
        <ul className="space-y-2" aria-label={t("listLabel")} data-testid="graph-context-chips">
          {view.chips.map((chip) => {
            const role = roleById(chip.roleId);
            return (
              <GraphContextChip
                key={chip.roleId}
                chip={chip}
                roleLabel={role ? roleLabel(role) : chip.roleLabel}
                kindLabel={kindLabel(chip.kind)}
                usedBy={usedBy(chip.nodeIds)}
                disabled={disabled}
                onReplace={(trigger) => open(chip.roleId, trigger)}
                onRemove={() => remove(chip)}
              />
            );
          })}
          {view.missing.map((role) => (
            <li
              key={role.id}
              id={`graph-template-field-reference-${role.id}`}
              data-testid={`graph-context-missing-${role.id}`}
              className="flex items-start gap-2 rounded-lg border border-dashed border-warning/60 bg-warning/10 p-2"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-ui-xs text-foreground-subtle">
                  {roleLabel(role)} * · {kindLabel(role.kind)}
                </p>
                <p>{t("requiredMissing", { role: roleLabel(role) })}</p>
                <p className="text-ui-xs text-foreground-subtle">{usedBy(role.nodeIds)}</p>
              </div>
              <Button
                variant="outline"
                disabled={disabled || !setup.supported}
                data-testid={`graph-context-choose-${role.id}`}
                onClick={(event) => open(role.id, event.currentTarget)}
              >
                {t("choose")}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <Popover
        open={picker.open}
        onOpenChange={(next) => (next ? setPicker({ open: true }) : setPicker({ open: false }))}
      >
        <PopoverAnchor asChild>
          <div className="flex flex-wrap items-center gap-2">
            <PopoverTrigger asChild>
              <Button
                ref={addRef}
                variant="outline"
                disabled={disabled || !setup.supported}
                data-testid="graph-context-add"
                onClick={(event) => {
                  returnFocus.current = event.currentTarget;
                }}
              >
                <Plus aria-hidden="true" />
                {t("add")}
              </Button>
            </PopoverTrigger>
          </div>
        </PopoverAnchor>
        <PopoverContent
          ref={contentRef}
          align="start"
          aria-label={t("pickerTitle")}
          className={`${graphFocusClass} graph-ui w-[min(34rem,calc(100vw-2rem))] gap-2`}
          data-testid="graph-context-popover"
          onOpenAutoFocus={(event) => {
            // 焦点进入搜索框，而不是弹层里第一个可聚焦元素。
            event.preventDefault();
            contentRef.current?.querySelector<HTMLElement>('[role="combobox"]')?.focus();
          }}
          onCloseAutoFocus={(event) => {
            // Escape/取消/选择后把焦点还给打开它的控件；控件已不存在时回到「添加上下文」。
            event.preventDefault();
            const target = returnFocus.current;
            (target?.isConnected ? target : addRef.current)?.focus();
          }}
        >
          {roles.length ? (
            <GraphContextPicker
              key={contextKey}
              target={target}
              contextKey={contextKey}
              roles={roles}
              values={bindings.references}
              presetRoleId={picker.roleId}
              catalogState={catalogState}
              roleLabel={roleLabel}
              kindLabel={kindLabel}
              onRetryCatalog={loadCatalog}
              onApply={apply}
            />
          ) : null}
        </PopoverContent>
      </Popover>
      <p className="sr-only" role="status" aria-live="polite" data-testid="graph-context-live">
        {announcement}
      </p>
      {/* U3：后续工作流区域已有顶边，只保留 Advanced 顶边，避免叠加分隔线。 */}
      <GraphDisclosure
        testId="graph-context-advanced"
        title={editor("advanced")}
        className="border-t border-border"
      >
        <div className="space-y-2">
          <p className="text-foreground-subtle">{t("advancedHelp")}</p>
          {roles.map((role) => (
            <label key={role.id} className="block space-y-1">
              <span>
                {roleLabel(role)}
                {role.required ? " *" : ""} · {kindLabel(role.kind)}
              </span>
              <Input
                data-testid={`graph-template-reference-${role.id}`}
                disabled={disabled}
                value={bindings.references[role.id] ?? ""}
                onChange={(event) =>
                  onChange((current) => graphContextSetRaw(current, role.id, event.target.value))
                }
              />
            </label>
          ))}
        </div>
      </GraphDisclosure>
    </section>
  );
}
