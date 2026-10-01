import type { ReactNode } from "react";

export interface GraphFact {
  label: ReactNode;
  value: ReactNode;
  /** Identities, digests and ids read as code. */
  mono?: boolean;
}

/** UX-M4: known structured facts as aligned label/value rows instead of stacked prose. */
export function GraphFacts({ facts, testId }: { facts: readonly GraphFact[]; testId?: string }) {
  return (
    <dl
      className="grid grid-cols-[minmax(7rem,11rem)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-ui-sm"
      data-testid={testId}
    >
      {facts.map((fact, index) => (
        <div key={index} className="contents">
          <dt className="text-foreground-subtle">{fact.label}</dt>
          <dd className={`break-all ${fact.mono ? "font-mono" : ""}`}>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
