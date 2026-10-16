import type { GraphState } from "./state.js";
import type { GraphWorkspaceTarget } from "../approval-types.js";
import type { GraphInspection } from "../inspection-types.js";
import { isConfirmedTerminal } from "../domain/definition.js";
import { parallelUnresolved } from "../domain/parallel.js";
export async function currentWebInspections(
  state: GraphState,
  target: GraphWorkspaceTarget,
  ids: [string, string],
  prepared = false,
): Promise<[GraphInspection, GraphInspection]> {
  if (!Array.isArray(ids) || ids.length !== 2 || ids[0] === ids[1])
    throw Error("Select the two distinct owned inspection receipts.");
  const port = state.options.inspection;
  if (!port) throw Error("Inspection owner unavailable.");
  const history = await state.inspections.history(target),
    rows: GraphInspection[] = [];
  for (const id of ids) {
    const row = history.find((item) => item.id === id);
    if (
      !row ||
      row.status !== "succeeded" ||
      row.reserved ||
      !row.request?.inspection?.webProfile ||
      (!prepared && state.options.now() >= row.request.inspection.expiresAt)
    )
      throw Error(
        "Web inspection is unavailable, incomplete or expired; inspect explicitly again.",
      );
    if ((await port.fresh(row)) !== "current")
      throw Error("Web inspection source/runtime identity changed.");
    rows.push(structuredClone(row));
  }
  return rows as [GraphInspection, GraphInspection];
}
export async function prepareOwnedWebProfile(
  state: GraphState,
  target: GraphWorkspaceTarget,
  ids: [string, string],
) {
  const record = await state.load(target);
  await state.inspections.assertIdle(target);
  if (
    record.runs.some((r) => !isConfirmedTerminal(r)) ||
    record.parallel?.runs.some(parallelUnresolved)
  )
    throw Error("Active or unresolved Graph work blocks Web preparation.");
  if (!state.options.webProfile)
    throw Error("Web profile preparation is unavailable on this Host.");
  return state.options.webProfile.prepare(target, await currentWebInspections(state, target, ids));
}

export async function findOwnedWebChoices(
  state: GraphState,
  value: {
    target: GraphWorkspaceTarget;
    webProject: string;
    configuration: "Debug" | "Release";
    candidates: string[];
  },
) {
  const { target } = value;
  const record = await state.load(target);
  await state.inspections.assertIdle(target);
  if (
    record.runs.some((r) => !isConfirmedTerminal(r)) ||
    record.parallel?.runs.some(parallelUnresolved)
  )
    throw Error("Active or unresolved work blocks profile preparation.");
  if (!state.options.webProfile) throw Error("Web profile preparation unavailable.");
  return state.options.webProfile.choices(
    target,
    value.webProject,
    value.configuration,
    value.candidates,
  );
}
