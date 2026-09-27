import { useEffect, useMemo, useRef, useState } from "react";
import {
  readGraphInspection,
  type GraphInspectionState,
} from "@/graph-engineering/graphInspectionRead.js";

export function useGraphInspectionRead<T>(scopeKey: string, readOwner: unknown) {
  const scope = useMemo(() => ({ sequence: 0 }), [scopeKey, readOwner]);
  const current = useRef<object>(scope);
  current.current = scope;
  const [stored, setStored] = useState<{ scope: object; state: GraphInspectionState<T> }>();
  useEffect(() => {
    current.current = scope;
    return () => {
      scope.sequence++;
      if (current.current === scope) current.current = {};
    };
  }, [scope]);
  const state: GraphInspectionState<T> =
    stored?.scope === scope ? stored.state : { status: "idle" };
  const load = (key: string, read: () => Promise<T | undefined>, missingMessage: string) =>
    readGraphInspection({
      scope,
      key,
      read,
      missingMessage,
      isCurrent: () => current.current === scope,
      publish: (state) => setStored({ scope, state }),
    });
  return { state, load };
}
