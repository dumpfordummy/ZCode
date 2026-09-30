import type { ReactNode } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  CircleDashed,
  FileText,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useGraphEditorText } from "./GraphEditorMode.js";
import { useGraphContextText } from "./GraphContextText.js";
import type { GraphContextChip as Chip, GraphContextKind } from "./graphContextChips.js";

const kindIcon: Record<GraphContextKind, typeof FileText> = {
  document: FileText,
  instruction: BookOpen,
  skill: Sparkles,
};

/** 状态 = 图标 + 文字；只有 Host 验证过的取值才会声称交付方式，绝不出现「继承」。 */
function useStatus(chip: Chip): {
  key: string;
  icon: ReactNode;
  text: string;
  notes: string[];
} {
  const editor = useGraphEditorText();
  const t = useGraphContextText();
  const ok = <CheckCircle2 className="size-3.5 shrink-0 text-success" aria-hidden="true" />;
  const warn = <AlertTriangle className="size-3.5 shrink-0 text-warning" aria-hidden="true" />;
  const status = chip.status;
  switch (status.kind) {
    case "delivery":
      return {
        key: status.delivery,
        icon: ok,
        text: editor(
          status.delivery === "native-instructions" ? "nativeInstructions" : "explicitRead",
        ),
        notes: status.issues,
      };
    case "not-checked":
      return {
        key: "not-checked",
        icon: (
          <CircleDashed className="size-3.5 shrink-0 text-foreground-subtle" aria-hidden="true" />
        ),
        text: t("statusNotChecked"),
        notes: [],
      };
    case "orphan":
      return {
        key: "orphan",
        icon: <AlertTriangle className="size-3.5 shrink-0 text-destructive" aria-hidden="true" />,
        text: t("orphan"),
        notes: [],
      };
    case "skill":
      return {
        key: `skill-${status.state}`,
        icon: status.state === "available" ? ok : warn,
        text:
          status.state === "available"
            ? editor("nativeSkill")
            : status.state === "unavailable"
              ? editor("unavailable")
              : status.state === "unknown"
                ? t("skillUnknown")
                : t("skillCatalogMissing"),
        notes: [],
      };
  }
}

export function GraphContextChip({
  chip,
  roleLabel,
  kindLabel,
  usedBy,
  disabled,
  onReplace,
  onRemove,
}: {
  chip: Chip;
  roleLabel: string;
  kindLabel: string;
  usedBy: string;
  disabled: boolean;
  onReplace(trigger: HTMLElement): void;
  onRemove(): void;
}) {
  const t = useGraphContextText();
  const status = useStatus(chip);
  const Icon = kindIcon[chip.kind];
  const orphan = chip.status.kind === "orphan";
  return (
    <li
      id={`graph-template-field-reference-${chip.roleId}`}
      data-testid={`graph-context-chip-${chip.roleId}`}
      data-role={chip.roleId}
      data-status={status.key}
      className="flex items-start gap-2 rounded-lg border border-border bg-surface p-2"
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-foreground-subtle" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-ui-xs text-foreground-subtle">
          {roleLabel}
          {chip.required ? " *" : ""} · {kindLabel}
        </p>
        <p
          className="break-all font-medium"
          title={chip.value}
          data-testid={`graph-context-value-${chip.roleId}`}
        >
          {chip.title}
        </p>
        {chip.detail ? (
          <p className="break-all text-ui-xs text-foreground-subtle">{chip.detail}</p>
        ) : null}
        <p
          className="flex items-start gap-1 text-ui-xs"
          data-testid={`graph-context-status-${chip.roleId}`}
        >
          {status.icon}
          <span>{status.text}</span>
        </p>
        {status.notes.map((note) => (
          <p key={note} className="text-ui-xs text-foreground-subtle">
            {note}
          </p>
        ))}
        {usedBy ? <p className="text-ui-xs text-foreground-subtle">{usedBy}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {orphan ? null : (
          <Button
            variant="ghost"
            disabled={disabled}
            data-testid={`graph-context-replace-${chip.roleId}`}
            aria-label={t("replaceLabel", { role: roleLabel, value: chip.value })}
            onClick={(event) => onReplace(event.currentTarget)}
          >
            {t("replace")}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          data-testid={`graph-context-remove-${chip.roleId}`}
          aria-label={t("removeLabel", { role: roleLabel, value: chip.value })}
          title={t("remove")}
          onClick={onRemove}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}
