import { useEffect, useState } from "react";
import { useGraphDraftStore } from "@/store/graphDraftStore.js";

/** Persist choices only; prepared scope and execution authority must always be re-established. */
export function useGraphQuickDraft(workspaceKey: string) {
  const draft = useGraphDraftStore.getState().workspaces[workspaceKey]?.setup?.quick;
  const [scanRoot, setScanRoot] = useState(draft?.scanRoot ?? "");
  const [build, setBuild] = useState(draft?.build ?? "");
  const [configuration, setConfiguration] = useState(draft?.configuration ?? "Debug");
  const [scopes, setScopes] = useState<string[]>(draft?.scopes ?? []);
  useEffect(() => {
    const previous = useGraphDraftStore.getState().workspaces[workspaceKey]?.setup?.quick;
    useGraphDraftStore.getState().updateSetup(workspaceKey, {
      quick: { ...previous, build, configuration, scopes, scanRoot },
    });
  }, [workspaceKey, build, configuration, scopes, scanRoot]);
  return {
    scanRoot,
    setScanRoot,
    build,
    setBuild,
    configuration,
    setConfiguration,
    scopes,
    setScopes,
  };
}
