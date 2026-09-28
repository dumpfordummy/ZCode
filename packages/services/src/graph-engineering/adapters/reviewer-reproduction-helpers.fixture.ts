import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { GraphSequentialDefinition, GraphSequentialRun } from "../contract.js";
import type { ReproductionFixture } from "./reviewer-reproduction.fixture.js";
import { sha256, BUILD_JS, TEST_JS } from "./reviewer-reproduction-data.fixture.js";

export function extractPermittedIds(instructions: string): string[] {
  const match = instructions.match(
    /Permitted evidence artifact IDs for evidenceReferences: \[([^\]]*)\]/,
  );
  if (!match) return [];
  return match[1]!
    .split(",")
    .map((s) => s.trim().replace(/"/g, ""))
    .filter(Boolean);
}

// ─── Helper: run the generic template through the service ───────────────────

export async function runGeneric(f: ReproductionFixture, definition: GraphSequentialDefinition) {
  const preflightDigest = sha256("repro-preflight-" + definition.revision);
  await f.service.run({
    target: f.target,
    requestId: "repro-" + Math.random().toString(36).slice(2),
    revision: definition.revision,
    modelSelection: { providerId: "fixture", modelId: "test-only" },
    mode: "edit",
    planEnabled: false,
    action: "run",
    preflight: { digest: preflightDigest, acknowledgedUnknowns: true },
  } as any);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set([
  "Completed",
  "Failed",
  "Cancelled",
  "NeedsHuman",
  "BudgetExhausted",
  "NoProgress",
  "Rejected",
  "Interrupted",
  "Unknown",
  "StaleEvidence",
]);
export function isTerminal(run: GraphSequentialRun): boolean {
  return TERMINAL_STATUSES.has(run.status);
}
/** The run has reached the final human-review approval gate and is waiting for a decision. */
export function isAwaitingGate(run: GraphSequentialRun): boolean {
  return run.status === "WaitingForApproval";
}

export async function prepareWorkspace(root: string) {
  await writeFile(join(root, "zz-demo.txt"), "before");
  await writeFile(join(root, "build.js"), BUILD_JS);
  await writeFile(join(root, "test.js"), TEST_JS);
}
