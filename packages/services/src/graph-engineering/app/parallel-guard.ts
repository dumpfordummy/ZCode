import type { GraphWorkspaceTarget, GraphNativeSettings } from "../contract.js";
import { runFingerprint } from "./attempts.js";
import type { GraphRecord } from "./ports.js";
import type { GraphState } from "./state.js";
import { parallelChildren, parallelUnresolved } from "../domain/parallel.js";
import { workspaceKey, isConfirmedTerminal } from "../domain/definition.js";

async function parent(state: GraphState, record: GraphRecord) {
  if (!record.parallelParent) return undefined;
  const link = record.parallelParent;
  const owner =
    state.records.get(workspaceKey(link.target)) ??
    (await state.options.repository.read(link.target));
  return owner?.parallel?.runs.find((run) => run.id === link.runId);
}
export async function assertParallelAdmission(
  state: GraphState,
  record: GraphRecord,
  target: GraphWorkspaceTarget,
  request: { requestId: string; revision: number; settings: GraphNativeSettings },
  live: Set<string>,
) {
  if (record.parallel?.runs.some(parallelUnresolved))
    throw new Error("An unresolved Fork/Join run owns this original workspace's Graph admission.");
  if (!record.parallelParent) return;
  const owned = await parent(state, record);
  if (
    !owned ||
    (parallelUnresolved(owned) &&
      !parallelChildren(owned).some(
        (child) =>
          child.requestId === request.requestId &&
          child.admission === "reserved" &&
          child.definitionRevision === request.revision &&
          runFingerprint(request.settings) === runFingerprint(owned.settings) &&
          child.workspace?.workspacePath === target.workspacePath &&
          live.has(owned.id),
      ))
  )
    throw new Error(
      "This owned workspace only admits the parent's exact live reserved child request.",
    );
}
export async function parallelGuardedRuns(state: GraphState, target: GraphWorkspaceTarget) {
  // 不能等待本 workspace 的 serial：原生准入会从当前 dispatch 回调此 guard。
  const record =
    state.records.get(workspaceKey(target)) ?? (await state.options.repository.read(target));
  if (!record) return [];
  const owned = await parent(state, record);
  // 所有者元数据缺失时也保持保护，不能将丢失记录当作解锁许可。
  if (record.parallelParent && (!owned || parallelUnresolved(owned))) return record.runs;
  return record.runs.filter((run) => !isConfirmedTerminal(run));
}
