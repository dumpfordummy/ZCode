import { useCallback, useEffect, useMemo, useRef } from "react";
import type { GraphWorkspaceTarget, IGraphEngineeringService } from "@zcode/services";
import { readGraphEvidence } from "@/graph-engineering/graphEvidenceRead.js";

/** 只读证据不占执行动作锁、不刷新运行状态；检查器单独拥有读取进度与错误。 */
export function useGraphEvidence(
  service: IGraphEngineeringService | undefined,
  target: GraphWorkspaceTarget,
) {
  const scope = useMemo(() => ({ generation: 0 }), [service, target]);
  const current = useRef<typeof scope | null>(scope);
  current.current = scope;
  useEffect(() => {
    current.current = scope;
    return () => {
      // StrictMode 重建 effect 时旧读取仍须失效，不能因复用 scope 重新取得所有权。
      scope.generation++;
      if (current.current === scope) current.current = null;
    };
  }, [scope]);
  const read = useCallback(
    <T>(operation: () => Promise<T>) => {
      const generation = scope.generation;
      return readGraphEvidence({
        read: operation,
        isCurrent: () => current.current === scope && scope.generation === generation,
      });
    },
    [scope],
  );
  return {
    readArtifact: useCallback(
      (runId: string, artifactId: string) =>
        read(async () => {
          if (!service) throw new Error("Graph evidence service is unavailable.");
          const value = await service.artifact({ target, runId, artifactId, action: "read" });
          if (value.kind !== "content") throw new Error("Graph artifact content is unavailable.");
          return value;
        }),
      [read, service, target],
    ),
    exportManifest: useCallback(
      (runId: string) =>
        read(async () => {
          if (!service) throw new Error("Graph evidence service is unavailable.");
          const value = await service.artifact({ target, runId, action: "manifest" });
          if (value.kind !== "manifest") throw new Error("Graph evidence manifest is unavailable.");
          return value.text;
        }),
      [read, service, target],
    ),
  };
}
