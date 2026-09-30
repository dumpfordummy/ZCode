import type { GraphDefinition, GraphLibraryEntry, GraphLibraryView } from "@zcode/services";
import { designPin } from "./graphLibraryView.js";
import { latestCompatibleTemplateVersion } from "./graphWorkflowView.js";

/**
 * UX-M3.2: pure rules for saving a portable template into the library. The mutation itself, the
 * revision lock and the name the service derives stay with the service; this only decides what the
 * user is offered, what must be disclosed before confirming, and how to find the result afterwards.
 */

export type GraphSaveTarget = { kind: "new" } | { kind: "version"; entryId: string };

export const targetValue = (target: GraphSaveTarget): string =>
  target.kind === "new" ? "new" : `version:${target.entryId}`;
export const parseTargetValue = (value: string): GraphSaveTarget =>
  value.startsWith("version:") ? { kind: "version", entryId: value.slice(8) } : { kind: "new" };

/** Workflows that can receive a new version: yours, not archived, with an offered version. */
export const versionTargets = (entries: readonly GraphLibraryEntry[]): GraphLibraryEntry[] =>
  entries.filter((entry) => !entry.builtin && !entry.archived && entry.versions.length > 0);

/** A chosen version target that can no longer take a version (archived, removed) falls back to a new workflow. */
export function effectiveTarget(
  chosen: GraphSaveTarget,
  entries: readonly GraphLibraryEntry[],
): GraphSaveTarget {
  return chosen.kind === "version" &&
    !versionTargets(entries).some((entry) => entry.id === chosen.entryId)
    ? { kind: "new" }
    : chosen;
}

/**
 * The default target. The workflow the design originated from when it can take a version; otherwise a
 * new workflow. Never the dropdown selection of another section.
 */
export function defaultSaveTarget(
  entries: readonly GraphLibraryEntry[],
  definition: GraphDefinition,
): GraphSaveTarget {
  const origin = designPin(definition)?.id;
  const usable = versionTargets(entries).find((entry) => entry.id === origin);
  return usable ? { kind: "version", entryId: usable.id } : { kind: "new" };
}

/** The origin is a built-in: it cannot get a version, so the task explains that saving creates your own workflow. */
export function originIsBuiltin(
  entries: readonly GraphLibraryEntry[],
  definition: GraphDefinition,
): boolean {
  const origin = designPin(definition)?.id;
  return Boolean(origin && entries.find((entry) => entry.id === origin)?.builtin);
}

/** Name and description an untouched form saves, so nothing is renamed or dropped by accident. */
export function saveDefaults(
  target: GraphSaveTarget,
  entries: readonly GraphLibraryEntry[],
  definition: GraphDefinition,
): { name: string; description: string } {
  if (target.kind === "version") {
    const entry = entries.find((item) => item.id === target.entryId);
    const latest = entry ? latestCompatibleTemplateVersion(entry) : undefined;
    if (entry) return { name: entry.name, description: latest?.template.description ?? "" };
  }
  return { name: definition.name, description: "" };
}

/** The rename the service will apply when a version is saved (`entry.name = template.name`), if any. */
export function renameDisclosure(
  target: GraphSaveTarget,
  entries: readonly GraphLibraryEntry[],
  templateName: string,
): { from: string; to: string } | undefined {
  if (target.kind !== "version") return undefined;
  const entry = entries.find((item) => item.id === target.entryId);
  return entry && entry.name !== templateName ? { from: entry.name, to: templateName } : undefined;
}

export interface GraphMutationResult {
  entryId: string;
  version: number;
  /** The workflow's name in the returned list. */
  name: string;
}

/**
 * Finds what a mutation created by comparing the list before the call with the list the service
 * returned: exactly one new workflow (its highest version), or exactly one new version of one
 * workflow. Anything else is not guessed.
 */
export function mutationResult(
  before: GraphLibraryView,
  after: GraphLibraryView,
): GraphMutationResult | undefined {
  const known = new Map(before.entries.map((entry) => [entry.id, entry]));
  const created = after.entries.filter((entry) => !known.has(entry.id));
  const added = after.entries.flatMap((entry) => {
    const previous = known.get(entry.id);
    if (!previous) return [];
    const had = new Set(previous.versions.map((item) => item.version));
    return entry.versions
      .filter((item) => !had.has(item.version))
      .map((item) => ({ entry, version: item.version }));
  });
  if (created.length === 1 && added.length === 0) {
    const entry = created[0]!;
    const version = Math.max(...entry.versions.map((item) => item.version));
    return Number.isFinite(version) ? { entryId: entry.id, version, name: entry.name } : undefined;
  }
  if (created.length === 0 && added.length === 1)
    return { entryId: added[0]!.entry.id, version: added[0]!.version, name: added[0]!.entry.name };
  return undefined;
}
