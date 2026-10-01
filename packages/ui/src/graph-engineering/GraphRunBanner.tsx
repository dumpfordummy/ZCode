import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert, XCircle } from "lucide-react";

export type GraphBannerTone = "warning" | "danger" | "success" | "progress" | "neutral";
export type GraphBannerIcon = "shield" | "alert" | "failure" | "done" | "progress" | "none";

const tones: Record<GraphBannerTone, { box: string; bar: string; icon: string }> = {
  warning: { box: "border-warning/40 bg-warning/10", bar: "bg-warning", icon: "text-warning" },
  danger: {
    box: "border-destructive/40 bg-destructive/10",
    bar: "bg-destructive",
    icon: "text-destructive",
  },
  success: { box: "border-border bg-card", bar: "bg-success", icon: "text-success" },
  progress: { box: "border-border bg-card", bar: "bg-brand", icon: "text-brand" },
  neutral: { box: "border-border bg-card", bar: "bg-border-hover", icon: "text-foreground-subtle" },
};

function BannerIcon({ icon, className }: { icon: GraphBannerIcon; className: string }) {
  const shared = `mt-0.5 size-5 shrink-0 ${className}`;
  if (icon === "shield") return <ShieldAlert className={shared} aria-hidden="true" />;
  if (icon === "alert") return <AlertTriangle className={shared} aria-hidden="true" />;
  if (icon === "failure") return <XCircle className={shared} aria-hidden="true" />;
  if (icon === "done") return <CheckCircle2 className={shared} aria-hidden="true" />;
  if (icon === "progress")
    return <Loader2 className={`${shared} animate-spin`} aria-hidden="true" />;
  return null;
}

/**
 * UX-M4: the focal element of a selected run. It owns the one explanation of the state and the
 * next action; nothing else on the page restates it. Warning (needs you, uncertain) and danger (a
 * real failure) are separate treatments and always carry an icon and words.
 */
export function GraphRunBanner({
  tone,
  icon,
  children,
  actions,
}: {
  tone: GraphBannerTone;
  icon: GraphBannerIcon;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const style = tones[tone];
  return (
    <div
      className={`relative space-y-3 overflow-hidden rounded-lg border py-4 pl-5 pr-4 ${style.box}`}
      data-testid="graph-run-banner"
      data-tone={tone}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${style.bar}`} aria-hidden="true" />
      <div className="flex gap-3">
        <BannerIcon icon={icon} className={style.icon} />
        <div className="min-w-0 flex-1 space-y-2 text-ui-base">{children}</div>
      </div>
      {actions}
    </div>
  );
}
