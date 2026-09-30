import type { GraphDefinition, GraphLibraryEntry, GraphTemplateVersion } from "@zcode/services";
import {
  isCompatibleTemplateVersion,
  latestCompatibleTemplateVersion,
} from "./graphWorkflowView.js";

/**
 * UX-M3.1: what the library dialog and the New-run pane show about workflows and versions.
 * Everything here is derived from the Host's `list()` projection and from facts stored on the
 * current design; nothing is invented and nothing is written (spec: UX_M3_SPEC.md section 1).
 */

export type GraphLibraryKind = "builtin" | "yours";
export const libraryKind = (entry: Pick<GraphLibraryEntry, "builtin">): GraphLibraryKind =>
  entry.builtin ? "builtin" : "yours";

/** The workflow instance a design was created from, exactly as stored on the design. */
export interface GraphDesignPin {
  id: string;
  name: string;
  version: number;
  digest: string;
}

/** Present only when the saved design really is an instance of a library workflow. */
export function designPin(definition: GraphDefinition): GraphDesignPin | undefined {
  if (definition.version !== 5 || !definition.template) return undefined;
  const { id, name, version, digest } = definition.template;
  return { id, name, version, digest };
}

export interface GraphVersionRow {
  version: number;
  digest: string;
  /** Milliseconds since the epoch, only for user-created versions with a real time (built-ins store 0). */
  createdAt?: number;
  /** The app can instantiate this version. */
  compatible: boolean;
  /** The highest compatible version of a workflow that offers more than one; never a "current version". */
  latest: boolean;
  /** The current design's pin names this workflow, version and digest. */
  usedByDesign: boolean;
}

/** Version rows, newest first, exactly the versions the Host returned. */
export function versionRows(entry: GraphLibraryEntry, pin?: GraphDesignPin): GraphVersionRow[] {
  const latest = latestCompatibleTemplateVersion(entry)?.version;
  const meaningfulLatest = entry.versions.length > 1;
  return [...entry.versions]
    .sort((a, b) => b.version - a.version)
    .map((item) => ({
      version: item.version,
      digest: item.digest,
      ...(!entry.builtin && Number.isFinite(item.createdAt) && item.createdAt > 0
        ? { createdAt: item.createdAt }
        : {}),
      compatible: isCompatibleTemplateVersion(item),
      latest: meaningfulLatest && item.version === latest,
      usedByDesign:
        pin !== undefined &&
        pin.id === entry.id &&
        pin.version === item.version &&
        pin.digest === item.digest,
    }));
}

export interface GraphLibrarySelection {
  entry?: GraphLibraryEntry;
  version?: GraphTemplateVersion;
  /** The default (new-intent) choice, used to fix the stored selection once. */
  defaultId?: string;
  defaultVersion?: number;
  /**
   * The stored selection names a version this workflow does not offer (for example a historical
   * pin). The result then still falls back to the latest offered version; UX-M3.3 owns saying so.
   */
  requestedVersionMissing?: number;
}

/**
 * Resolves the stored `{id, version}` against the current library. The default entry is the
 * built-in agent-assisted workflow when it has a compatible version, else the first workflow that does.
 */
export function resolveLibrarySelection(
  entries: readonly GraphLibraryEntry[],
  selection?: { id: string; version: number },
): GraphLibrarySelection {
  const defaultEntry =
    entries.find((item) => item.id === "agent-assisted" && latestCompatibleTemplateVersion(item)) ??
    entries.find((item) => latestCompatibleTemplateVersion(item));
  const entry = entries.find((item) => item.id === selection?.id) ?? defaultEntry;
  const exact = entry?.versions.find(
    (item) => entry.id === selection?.id && item.version === selection.version,
  );
  const version = exact ?? (entry ? latestCompatibleTemplateVersion(entry) : undefined);
  return {
    entry,
    version,
    defaultId: defaultEntry?.id,
    defaultVersion: defaultEntry
      ? latestCompatibleTemplateVersion(defaultEntry)?.version
      : undefined,
    ...(entry && selection && entry.id === selection.id && !exact
      ? { requestedVersionMissing: selection.version }
      : {}),
  };
}

/** Why each kind of library action is unavailable right now; `undefined` means available. */
export interface GraphLibraryGates {
  /** Reason every library mutation is blocked (occupied workspace, read-only Host, busy). */
  mutation?: string;
  /** Extra reason exporting to disk is blocked. */
  exportToDisk?: string;
}

export function libraryGates({
  occupiedReason,
  hostReadOnlyReason,
  busyReason,
  exportOccupiedReason,
}: {
  occupiedReason?: string;
  hostReadOnlyReason?: string;
  busyReason?: string;
  exportOccupiedReason: string;
}): GraphLibraryGates {
  const mutation = occupiedReason ?? hostReadOnlyReason ?? busyReason;
  return {
    mutation,
    // The OS save dialog cannot be constrained away from the occupied workspace, so it stays blocked.
    exportToDisk: occupiedReason ? exportOccupiedReason : mutation,
  };
}
