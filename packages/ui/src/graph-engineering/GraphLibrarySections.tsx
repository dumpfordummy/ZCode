import type { ReactNode } from "react";

/** One labelled section of the library dialog (Workflow, Versions, Use, Share, Advanced). */
export function GraphLibrarySection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2" aria-labelledby={`graph-library-${id}-title`} data-section={id}>
      <h3 id={`graph-library-${id}-title`} className="text-ui-sm font-medium">
        {title}
      </h3>
      {children}
    </section>
  );
}
