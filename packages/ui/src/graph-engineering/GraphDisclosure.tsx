import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

/**
 * UX-M4: the one Graph disclosure. A semantic `details`/`summary` (native Enter/Space, expanded
 * state and focus), drawn with M4 tokens instead of the browser's default triangle. The summary
 * stays the direct child of the `details` element, so `data-testid` on the disclosure and drivers
 * that open `:scope > summary` keep working. Group rows in a GraphDisclosureStack.
 */
export function GraphDisclosure({
  title,
  meta,
  defaultOpen = false,
  testId,
  className = "",
  onToggle,
  children,
}: {
  title: ReactNode;
  /** Optional one-line secondary summary shown under the title. */
  meta?: ReactNode;
  defaultOpen?: boolean;
  testId?: string;
  className?: string;
  onToggle?(open: boolean): void;
  children: ReactNode;
}) {
  return (
    <details
      className={`group/disclosure ${className}`}
      data-testid={testId}
      open={defaultOpen || undefined}
      onToggle={onToggle ? (event) => onToggle(event.currentTarget.open) : undefined}
    >
      <summary className="flex min-h-9 cursor-pointer list-none items-start gap-2 border-l-2 border-transparent px-2 py-2 text-ui-base transition-colors select-none hover:bg-surface-hover focus-visible:border-brand focus-visible:bg-accent [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="mt-0.5 size-4 shrink-0 text-foreground-subtle transition-transform [details[open]>summary_&]:rotate-90"
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="block font-medium [overflow-wrap:anywhere]">{title}</span>
          {meta ? (
            <span className="mt-0.5 block text-ui-sm [overflow-wrap:anywhere] text-foreground-subtle">
              {meta}
            </span>
          ) : null}
        </span>
      </summary>
      <div className="space-y-3 pb-3 pl-8 pr-2 pt-1 text-ui-sm">{children}</div>
    </details>
  );
}

/** A run of disclosures separated by hairlines: no cards, no boxes inside boxes. */
export function GraphDisclosureStack({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`divide-y divide-border border-y border-border ${className}`}>{children}</div>
  );
}
