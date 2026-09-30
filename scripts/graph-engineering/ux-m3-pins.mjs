// Run records for the UX-M3.3 historical-pin scenarios. FIXTURE: a settled run record (the UI tests'
// unit-only `summaryRun()`) whose captured definition carries a workflow `template` pin. It is a run
// record, never a library version: the library only ever offers what the real service publishes.
import { completedRun } from "./ux-m1-runs.mjs";

/** A digest that is not any offered version's (a historical definition that is no longer published). */
export const HISTORICAL_DIGEST = "e".repeat(64);

export function pinnedRun(
  id,
  {
    templateId = "agent-assisted",
    name = "Agent-assisted task",
    version = 1,
    digest = HISTORICAL_DIGEST,
    parameters = { request: "Historical request from the captured run" },
    bindings = { references: {}, recipes: {}, sourcePaths: [] },
    references = [],
    regionId,
  } = {},
) {
  const run = completedRun(id);
  run.definition.template = {
    id: templateId,
    name,
    version,
    digest,
    parameters: structuredClone(parameters),
    bindings: structuredClone(bindings),
    references: structuredClone(references),
    excluded: [],
  };
  if (regionId) run.definition.routing = { region: { id: regionId } };
  run.createdAt = Date.UTC(2026, 8, 1, 8, 0, 0);
  return run;
}
