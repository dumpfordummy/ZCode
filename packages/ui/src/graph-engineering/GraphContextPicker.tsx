import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type {
  GraphReferenceCatalog,
  GraphReferenceValidation,
  GraphWorkspaceTarget,
} from "@zcode/services";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { useGraphReferencePicker } from "@/hooks/useGraphReferencePicker.js";
import { useGraphEditorText } from "./GraphEditorMode.js";
import { useGraphContextText } from "./GraphContextText.js";
import { GraphContextFailure, graphFileName } from "./GraphContextFailure.js";
import {
  graphContextOptions,
  type GraphContextKind,
  type GraphContextOption,
  type GraphContextRole,
} from "./graphContextChips.js";

const SEARCH_DEBOUNCE_MS = 200;

export type GraphContextCatalogState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; catalog: GraphReferenceCatalog }
  | { status: "error"; error: string };

export interface GraphContextApply {
  roleId: string;
  /** 写入 bindings 的取值：文件/指令为 Host 验证后的规范路径，技能为 skill id。 */
  value: string;
  validation?: GraphReferenceValidation;
}

/**
 * 搜索式选择器（只在弹层打开时挂载）。
 *
 * 所有权：搜索结果与进行中的验证属于 useGraphReferencePicker 的 scope；本组件卸载（关闭、切换
 * 工作区/模板）即令所有迟到回执失效。选择意图的指纹 = 上下文 + 槽位 + 该槽位当前取值，因此在验证
 * 期间移除或替换该槽位，旧回执不再是当前意图。选择结果只通过 onApply 交给唯一所有者写入。
 */
export function GraphContextPicker({
  target,
  contextKey,
  roles,
  values,
  presetRoleId,
  catalogState,
  roleLabel,
  kindLabel,
  onRetryCatalog,
  onApply,
}: {
  target: GraphWorkspaceTarget;
  contextKey: string;
  roles: GraphContextRole[];
  values: Readonly<Record<string, string | undefined>>;
  presetRoleId?: string;
  catalogState: GraphContextCatalogState;
  roleLabel(role: GraphContextRole): string;
  kindLabel(kind: GraphContextKind): string;
  onRetryCatalog(): void;
  onApply(selection: GraphContextApply): void;
}) {
  const t = useGraphContextText();
  const editor = useGraphEditorText();
  const listId = useId();
  const has = (id: string) => Boolean(values[id]?.trim());
  const [slotId, setSlotId] = useState(
    presetRoleId ??
      roles.find((role) => role.required && !has(role.id))?.id ??
      roles.find((role) => !has(role.id))?.id ??
      roles[0]!.id,
  );
  const role = roles.find((item) => item.id === slotId) ?? roles[0]!;
  const current = values[role.id]?.trim() ?? "";
  const [query, setQuery] = useState("");
  const trimmed = query.trim();
  // 选择意图的指纹：上下文、槽位、该槽位当前取值。任何一项变化都让进行中的验证失效。
  const picker = useGraphReferencePicker(target, JSON.stringify([contextKey, role.id, current]));
  const search = picker.searchState.query === trimmed ? picker.searchState : undefined;
  const catalog = catalogState.status === "ready" ? catalogState.catalog : undefined;
  const files = role.kind !== "skill";

  const searchRef = useRef(picker.search);
  searchRef.current = picker.search;
  useEffect(() => {
    if (!files || !trimmed || !picker.supported) return;
    const timer = setTimeout(() => void searchRef.current(trimmed), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [files, trimmed, picker.supported]);

  const options = useMemo(
    () =>
      graphContextOptions({
        role,
        query: trimmed,
        files: search?.files ?? [],
        catalog,
      }),
    [role, trimmed, search?.files, catalog],
  );
  // 结果集一变，活动项即失效：Enter 只能选用户亲自移动到的项，晚到的结果不会让它悄悄换人。
  const optionKeys = options.map((option) => option.key).join("\n");
  const [cursor, setCursor] = useState({ keys: "", index: -1 });
  const active = cursor.keys === optionKeys ? cursor.index : -1;
  const move = (delta: number) => {
    if (!options.length) return;
    const next =
      active < 0
        ? delta > 0
          ? 0
          : options.length - 1
        : (active + delta + options.length) % options.length;
    setCursor({ keys: optionKeys, index: next });
  };
  useEffect(() => {
    if (active >= 0)
      document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [active, listId]);

  // UX-M2.3：一次尝试 = 用户选中的值（搜索结果，或原生选择器返回路径的文件名；完整路径放在 title）。
  // 修复原因：原先原生选择器的尝试值为空，失败时不说明是哪个文件、原选择是否保留；取消会让旧的失败继续显示；
  // 选择器本身抛错时是未处理的拒绝，界面什么也不显示。依据：只有属于本次尝试路径的校验才显示为失败。
  const [attempt, setAttempt] = useState<{ roleId: string; value: string; path?: string } | null>(
    null,
  );
  const [chooserError, setChooserError] = useState<{ roleId: string; message: string } | null>(
    null,
  );
  const validation =
    attempt &&
    attempt.roleId === role.id &&
    attempt.value &&
    picker.validationPath === (attempt.path ?? attempt.value)
      ? picker.validation
      : undefined;
  const chooserFailure = chooserError?.roleId === role.id ? chooserError.message : undefined;
  const busy = validation?.status === "loading";
  const finish = (outcome: Awaited<ReturnType<typeof picker.select>>) => {
    // 只有仍是当前意图的回执才写入；否则（换槽位/换工作区/已关闭）静默丢弃。
    if (outcome?.isCurrent())
      onApply({ roleId: role.id, value: outcome.result.path, validation: outcome.result });
  };
  const choose = async (option: GraphContextOption) => {
    if (option.disabled || busy) return;
    if (option.group === "skill") {
      onApply({ roleId: role.id, value: option.value });
      return;
    }
    setChooserError(null);
    setAttempt({ roleId: role.id, value: option.value });
    finish(await picker.select(async () => option.value));
  };
  const chooseNative = async () => {
    setChooserError(null);
    setAttempt({ roleId: role.id, value: "" });
    try {
      const outcome = await picker.selectNative((path) =>
        // 取消不是失败：清除本槽位的尝试（连同旧的失败说明）。选中则记下文件名与完整路径。
        setAttempt(path ? { roleId: role.id, value: graphFileName(path), path } : null),
      );
      finish(outcome);
    } catch (cause) {
      setAttempt(null);
      setChooserError({
        roleId: role.id,
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }
  };

  const groups = options.reduce<
    Array<{ group: string; items: Array<[GraphContextOption, number]> }>
  >((all, option, index) => {
    const last = all.at(-1);
    if (last?.group === option.group) last.items.push([option, index]);
    else all.push({ group: option.group, items: [[option, index]] });
    return all;
  }, []);
  const groupLabel = (group: string) =>
    t(
      group === "skill" ? "groupSkill" : group === "instruction" ? "groupInstruction" : "groupFile",
    );

  const catalogNeeded = role.kind !== "document";
  const catalogNote =
    catalogState.status === "idle" || catalogState.status === "loading" ? (
      <p role="status" data-testid="graph-context-catalog-loading">
        {t("catalogLoading")}
      </p>
    ) : catalogState.status === "error" ? (
      <div role="alert" className="space-y-1" data-testid="graph-context-catalog-error">
        <p>{t("catalogError")}</p>
        <p className="break-all text-ui-xs">{catalogState.error}</p>
        <Button variant="outline" onClick={onRetryCatalog}>
          {t("retry")}
        </Button>
      </div>
    ) : catalogState.catalog.status === "unknown" ? (
      <div className="space-y-1" data-testid="graph-context-catalog-unknown">
        <p className="flex gap-1">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
          {t("catalogUnknown")}
        </p>
        {catalogState.catalog.unknowns.map((reason) => (
          <p key={reason} className="text-ui-xs text-foreground-subtle">
            {reason}
          </p>
        ))}
        <Button variant="outline" onClick={onRetryCatalog}>
          {t("retry")}
        </Button>
      </div>
    ) : null;

  const empty =
    role.kind === "skill"
      ? catalogState.status === "ready" && catalogState.catalog.status !== "unknown"
        ? t("noMatches")
        : null
      : !picker.supported
        ? t("unsupported")
        : !trimmed && !options.length
          ? t("typeToSearch")
          : search && !search.loading && !search.error && !options.length
            ? t("noMatches")
            : null;
  // 原生选择器返回路径之前还不知道取值：此时用通用的“读取中…”，不显示空白取值。
  const checking = attempt?.value ? t("checking", { value: attempt.value }) : editor("loading");
  const live = busy
    ? checking
    : search?.loading
      ? editor("loading")
      : options.length || (search && !search.error)
        ? t("resultCount", { count: options.length })
        : "";

  return (
    <div
      className="flex flex-col gap-2 text-ui-sm"
      data-testid="graph-context-picker"
      data-slot-id={role.id}
    >
      {roles.length > 1 ? (
        <fieldset className="space-y-1" data-testid="graph-context-slots">
          <legend className="text-ui-xs text-foreground-subtle">{t("slot")}</legend>
          {roles.map((item) => (
            <label key={item.id} className="flex items-start gap-2">
              <input
                type="radio"
                name={`${listId}-slot`}
                className="mt-0.5 size-4 shrink-0 accent-primary"
                checked={item.id === role.id}
                data-testid={`graph-context-slot-${item.id}`}
                onChange={() => {
                  setSlotId(item.id);
                  setAttempt(null);
                  setChooserError(null);
                }}
              />
              <span className="min-w-0 break-all">
                {roleLabel(item)}
                {item.required ? " *" : ""} · {kindLabel(item.kind)}
                {has(item.id) ? (
                  <span className="text-foreground-subtle">
                    {" "}
                    ({t("slotCurrent", { value: values[item.id]!.trim() })})
                  </span>
                ) : null}
              </span>
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="text-ui-xs text-foreground-subtle">
          {t("slot")}: {roleLabel(role)}
        </p>
      )}
      {current ? (
        <p
          className="flex gap-1 rounded-md bg-warning/10 px-2 py-1"
          data-testid="graph-context-replace-notice"
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
          <span className="break-all">{t("replaceNotice", { value: current })}</span>
        </p>
      ) : null}
      <Input
        role="combobox"
        aria-expanded={options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        aria-label={t(role.kind === "skill" ? "searchSkills" : "searchFiles")}
        placeholder={t(role.kind === "skill" ? "searchSkills" : "searchFiles")}
        autoComplete="off"
        spellCheck={false}
        value={query}
        data-testid="graph-context-search"
        onChange={(event) => {
          setQuery(event.target.value);
          setAttempt(null);
          setChooserError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            move(event.key === "ArrowDown" ? 1 : -1);
          } else if (event.key === "Enter") {
            // Enter 只属于选择器：不提交、不冒泡，且只选用户已移动到的可用项。
            event.preventDefault();
            event.stopPropagation();
            const option = active >= 0 ? options[active] : undefined;
            if (option) void choose(option);
          }
        }}
      />
      <p className="text-ui-xs text-foreground-subtle">{t("searchHint")}</p>
      {catalogNeeded ? catalogNote : null}
      {search?.loading ? <p role="status">{editor("loading")}</p> : null}
      {search?.error ? (
        <p
          role="alert"
          className="break-all text-destructive"
          data-testid="graph-context-search-error"
        >
          {search.error}
        </p>
      ) : null}
      {empty ? (
        <p className="text-foreground-subtle" data-testid="graph-context-empty">
          {empty}
        </p>
      ) : null}
      <div
        id={listId}
        role="listbox"
        aria-label={t("results")}
        className={cn("max-h-64 space-y-1 overflow-auto", options.length ? "" : "hidden")}
        data-testid="graph-context-results"
      >
        {groups.map(({ group, items }) => (
          <div key={group} role="group" aria-label={groupLabel(group)} className="space-y-0.5">
            <p className="px-2 pt-1 text-ui-xs text-foreground-subtle" aria-hidden="true">
              {groupLabel(group)}
            </p>
            {items.map(([option, index]) => (
              <div
                key={option.key}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                aria-disabled={option.disabled ? true : undefined}
                data-testid={`graph-context-option-${index}`}
                data-value={option.value}
                data-group={option.group}
                className={cn(
                  "flex cursor-pointer flex-col rounded-md px-2 py-1",
                  index === active && "bg-menu-hover",
                  option.disabled && "cursor-not-allowed text-foreground-subtle",
                )}
                onMouseMove={() => index === active || setCursor({ keys: optionKeys, index })}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void choose(option)}
              >
                <span className="break-all">{option.title}</span>
                {option.detail && option.detail !== option.title ? (
                  <span className="break-all text-ui-xs text-foreground-subtle">
                    {option.detail}
                  </span>
                ) : null}
                {option.disabled ? (
                  <span className="text-ui-xs text-warning">{editor("unavailable")}</span>
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </div>
      {validation?.status === "loading" ? (
        <p role="status" data-testid="graph-context-validating">
          {checking}
        </p>
      ) : null}
      <GraphContextFailure
        attempt={validation?.status === "error" ? attempt : null}
        diagnostic={validation?.status === "error" ? validation.error : undefined}
        chooserFailure={chooserFailure}
        previous={current}
      />
      {files && picker.canSelectFile ? (
        <Button
          variant="outline"
          className="self-start"
          disabled={busy}
          data-testid="graph-context-native-picker"
          onClick={() => void chooseNative()}
        >
          {editor("nativePicker")}
        </Button>
      ) : null}
      <p
        className="sr-only"
        role="status"
        aria-live="polite"
        data-testid="graph-context-picker-live"
      >
        {live}
      </p>
    </div>
  );
}
