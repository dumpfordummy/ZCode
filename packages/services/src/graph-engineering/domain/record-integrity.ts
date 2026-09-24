import type { GraphDefinition, GraphRun } from "../contract.js";
import { releaseAuditErrors } from "./release-validation.js";
import { validateDefinition, workspaceKey } from "./definition.js";

export function recordIntegrityErrors(record: {
  version: number;
  workspaceKey: string;
  definition: GraphDefinition;
  runs: GraphRun[];
}): string[] {
  const errors: string[] = [];
  if (
    record.version < 5 &&
    (record.definition.version === 5 || record.runs.some((r) => r.version === 5))
  )
    errors.push("Version-5 data requires a version-5 envelope.");
  if (
    record.version < 4 &&
    (record.definition.version === 4 || record.runs.some((r) => r.version === 4))
  )
    errors.push("Version-4 data requires a version-4 envelope.");
  if (
    record.version < 3 &&
    (record.definition.version === 3 || record.runs.some((r) => r.version === 3))
  )
    errors.push("Version-3 data requires a version-3 envelope.");
  if (
    record.version === 1 &&
    (record.definition.version !== undefined || record.runs.some((r) => r.version !== undefined))
  )
    errors.push("Version-2 data requires a version-2 envelope.");
  const unique = (ids: string[], label: string) => {
    if (new Set(ids).size !== ids.length) errors.push(`Duplicate graph ${label}.`);
  };
  unique(
    record.runs.map((r) => r.id),
    "id",
  );
  unique(
    record.runs.map((r) => r.requestId),
    "requestId",
  );
  const approvals = record.runs.flatMap((r) =>
    r.version !== undefined && r.version >= 3 ? (r.approvalAttempts ?? []) : [],
  );
  for (const key of ["request", "decision", "successorIntent"] as const)
    unique(
      approvals.flatMap((a) => (a[key] ? [a[key]!.id] : [])),
      `approval ${key} id`,
    );
  const attempts = record.runs.flatMap<{
    attemptId: string;
    commandId: string;
    sessionId?: string;
  }>((r) => (r.version !== undefined ? r.nodeAttempts : [r]));
  for (const key of ["attemptId", "commandId", "sessionId"] as const)
    unique(
      attempts.flatMap((a) => (a[key] ? [a[key]!] : [])),
      key,
    );
  unique(
    [
      ...attempts.map((a) => a.attemptId),
      ...approvals.map((a) => a.attemptId),
      ...record.runs.flatMap((r) =>
        r.version !== undefined && r.version >= 4
          ? (r.toolAttempts ?? []).map((a) => a.attemptId)
          : [],
      ),
      ...record.runs.flatMap((r) =>
        r.version === 5 ? (r.routing?.conditionAttempts ?? []).map((a) => a.attemptId) : [],
      ),
    ],
    "control/native attemptId",
  );
  const tools = record.runs.flatMap((r) =>
    r.version !== undefined && r.version >= 4 ? (r.toolAttempts ?? []) : [],
  );
  const routes = record.runs.flatMap((r) => (r.version === 5 && r.routing ? [r.routing] : []));
  unique(
    routes.flatMap((r) => r.iterations.map((i) => i.id)),
    "iteration id",
  );
  unique(
    routes.flatMap((r) => r.conditionAttempts.flatMap((a) => (a.decisionId ? [a.decisionId] : []))),
    "route decision id",
  );
  unique(
    routes.flatMap((r) => r.checkpoints.map((c) => c.id)),
    "route checkpoint id",
  );
  unique(
    routes.flatMap((r) => r.continuations.map((c) => c.requestId)),
    "route continuation id",
  );
  unique(
    [
      ...attempts.flatMap((a) => (a.sessionId ? [a.sessionId] : [])),
      ...tools.flatMap((a) => (a.sessionId ? [a.sessionId] : [])),
    ],
    "native/tool sessionId",
  );
  unique(
    [...attempts.map((a) => a.commandId), ...tools.map((a) => a.operationId)],
    "input/operation id",
  );
  for (const run of record.runs) {
    for (const message of releaseAuditErrors(run)) errors.push(message);
    if (
      workspaceKey(run.target) !== record.workspaceKey ||
      run.definition.revision > record.definition.revision
    )
      errors.push("Graph attempt workspace or revision is invalid.");
    try {
      validateDefinition(run.definition);
    } catch {
      errors.push("Invalid historical definition.");
    }
  }
  return errors;
}
