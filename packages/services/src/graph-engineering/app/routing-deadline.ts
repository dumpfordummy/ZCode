import type { GraphRun, GraphWorkspaceTarget } from "../contract.js";
import { isConfirmedTerminal } from "../domain/definition.js";
import { GraphState } from "./state.js";

/** Host-owned deadline observer; expiry is persisted before exact native cancellation. */
export function armRoutingDeadline(
  state: GraphState,
  run: GraphRun,
  cancel: (target: GraphWorkspaceTarget, runId: string) => Promise<GraphRun>,
): void {
  if (run.version !== 5 || !run.routing) return;
  const key = `deadline:${run.id}`;
  state.observers.get(key)?.dispose();
  const timer = setTimeout(
    () => {
      void state
        .serial(run.target, async () => {
          const current = structuredClone(await state.get(run.target, run.id));
          if (
            current.version !== 5 ||
            isConfirmedTerminal(current) ||
            current.cancelRequestedAt !== undefined
          )
            return;
          current.routing!.stopReason = {
            kind: "BudgetExhausted",
            at: state.options.now(),
            message: "The frozen wall-clock deadline expired.",
          };
          current.cancelRequestedAt = state.options.now();
          current.status = "CancelRequested";
          await state.put(current);
          state.liveRuns.delete(current.id);
          await cancel(current.target, current.id);
        })
        .catch(() =>
          state.interrupt(
            run.target,
            run.id,
            "Deadline cancellation is uncertain; no successor is authorized.",
          ),
        );
    },
    Math.max(0, run.routing.deadlineAt - state.options.now()),
  );
  timer.unref?.();
  state.observers.set(key, { dispose: () => clearTimeout(timer) });
}
