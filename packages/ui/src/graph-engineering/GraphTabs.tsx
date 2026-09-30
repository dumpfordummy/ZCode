import type { ComponentProps } from "react";
import { Tabs as TabsPrimitive } from "radix-ui";

/**
 * UX-M4: the single-level tab pattern used for secondary detail (run detail, library). Radix
 * supplies the roving tabindex and arrow-key behaviour; the look is an accent underline under the
 * active tab. Inactive panels are unmounted, so nothing a decision depends on may live in a panel.
 */
export const GraphTabs = TabsPrimitive.Root;

export function GraphTabList({ className = "", ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={`flex flex-wrap items-end gap-1 border-b border-border ${className}`}
      {...props}
    />
  );
}

export function GraphTab({ className = "", ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={`-mb-px inline-flex h-8 items-center border-b-2 border-transparent px-3 text-ui-base whitespace-nowrap text-foreground-subtle transition-colors hover:text-foreground data-[state=active]:border-brand data-[state=active]:font-medium data-[state=active]:text-foreground ${className}`}
      {...props}
    />
  );
}

export function GraphTabPanel({ className = "", ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={`pt-4 outline-none data-[state=inactive]:hidden ${className}`} {...props} />;
}
