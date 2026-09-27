import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  GraphRecipeSnapshot,
  GraphWorkspaceTarget,
  IGraphEngineeringService,
} from "@zcode/services";
import {
  readGraphRecipeSnapshot,
  type GraphRecipeReadScope,
  type GraphRecipeReadState,
} from "@/graph-engineering/graphRecipeRead.js";

const unloaded: GraphRecipeReadState = { status: "not-loaded", snapshot: null };

/** Independent read projection; read/configuration navigation never enters graph mutation admission. */
export function useGraphRecipes(
  service: IGraphEngineeringService | undefined,
  target: GraphWorkspaceTarget,
) {
  const scope = useMemo<GraphRecipeReadScope>(
    () => ({ sequence: 0, snapshot: null }),
    [service, target.workspacePath, target.workspaceIdentity],
  );
  const currentScope = useRef<GraphRecipeReadScope | null>(scope);
  currentScope.current = scope;
  const [stored, setStored] = useState<{
    scope: GraphRecipeReadScope;
    state: GraphRecipeReadState;
  }>();
  useEffect(() => {
    currentScope.current = scope;
    return () => {
      scope.sequence += 1;
      if (currentScope.current === scope) currentScope.current = null;
    };
  }, [scope]);
  const readRecipes = useCallback(async () => {
    if (!service) return;
    return readGraphRecipeSnapshot({
      scope,
      isCurrent: () => currentScope.current === scope,
      read: () => service.recipes({ target, action: "read" }),
      publish: (state) => setStored({ scope, state }),
    });
  }, [scope, service, target]);
  const acceptRecipes = useCallback(
    (snapshot: GraphRecipeSnapshot) => {
      if (currentScope.current !== scope) return;
      scope.sequence += 1;
      scope.snapshot = snapshot;
      setStored({ scope, state: { status: "ready", snapshot } });
    },
    [scope],
  );
  const recipeReadState = stored?.scope === scope ? stored.state : unloaded;
  return { recipes: recipeReadState.snapshot, recipeReadState, readRecipes, acceptRecipes };
}
