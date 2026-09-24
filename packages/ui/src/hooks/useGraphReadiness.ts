import { useEffect, useState } from "react";
import type { GraphDefinition, GraphReadiness } from "@zcode/services";

/** Validation reads are disposable projections; a stale reply cannot enable a newer draft. */
export function useGraphReadiness(
  definition: GraphDefinition,
  validate: (definition: GraphDefinition) => Promise<GraphReadiness>,
) {
  const [result, setResult] = useState<{
    definition: GraphDefinition;
    value: GraphReadiness;
  } | null>(null);
  useEffect(() => {
    let live = true;
    void validate(definition).then(
      (value) => {
        if (live) setResult({ definition, value });
      },
      (error: unknown) => {
        if (live)
          setResult({
            definition,
            value: {
              path: [],
              errors: [error instanceof Error ? error.message : String(error)],
            },
          });
      },
    );
    return () => {
      live = false;
    };
  }, [definition, validate]);
  return result?.definition === definition ? result.value : null;
}
