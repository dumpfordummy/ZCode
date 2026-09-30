import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * UX-M2: an attention note that needs the user (unsaved edits, an incomplete summary). DESIGN.md:
 * the label stays in the foreground colour and only the icon is tinted, because the warning colour
 * does not reach 4.5:1 as text in Zai Light. Status is icon plus text, never colour alone.
 */
export function GraphWarningNote({
  children,
  as = "p",
  className = "",
  ...data
}: {
  children: ReactNode;
  as?: "p" | "span";
  className?: string;
  role?: "status";
  [key: `data-${string}`]: string | undefined;
}) {
  const Tag = as;
  return (
    <Tag className={`inline-flex min-w-0 items-start gap-1 ${className}`} {...data}>
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
      <span className="min-w-0 break-words">{children}</span>
    </Tag>
  );
}
