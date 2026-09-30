import type {
  GraphLibraryEntry,
  GraphParameterValue,
  GraphPortableTemplate,
  GraphTemplateBindings,
} from "@zcode/services";
import type {
  GraphCarryReport,
  GraphFormOrigin,
  GraphTemplateFormDraft,
} from "@/store/graphDraftStore.js";
import { initialTemplateParameters, latestCompatibleTemplateVersion } from "./graphWorkflowView.js";

/**
 * UX-M3.3: historical workflow pins (Run again). A run keeps the workflow version it used inline; the
 * library only offers what the Host publishes. When the two disagree the UI says so and never
 * substitutes a different version on its own. See UX_M3_SPEC.md section 3.
 */

export type GraphPinStatus =
  | { kind: "offered" }
  | { kind: "version-missing"; requested: number; offered?: number }
  | { kind: "content-changed"; requested: number }
  | { kind: "workflow-missing" };

/**
 * Is the stored selection really offered? The selection is unavailable when its version number is not
 * offered, or (when the seeded form records the pinned digest) that number now has other content.
 * A selection naming a workflow the library no longer has is only reported when there is evidence it
 * came from a run (a recorded origin); otherwise the existing default fallback applies.
 */
export function pinStatus(
  entries: readonly GraphLibraryEntry[],
  selection: { id: string; version: number } | undefined,
  origin: Pick<GraphFormOrigin, "digest"> | undefined,
): GraphPinStatus {
  if (!selection) return { kind: "offered" };
  const entry = entries.find((item) => item.id === selection.id);
  if (!entry) return origin ? { kind: "workflow-missing" } : { kind: "offered" };
  const exact = entry.versions.find((item) => item.version === selection.version);
  if (!exact)
    return {
      kind: "version-missing",
      requested: selection.version,
      offered: latestCompatibleTemplateVersion(entry)?.version,
    };
  return origin && origin.digest !== exact.digest
    ? { kind: "content-changed", requested: selection.version }
    : { kind: "offered" };
}

/**
 * Carries a historical form onto another version of the same workflow by stable identity only:
 * parameter id + declared type, reference role id + accepted kind, tool node id (and its group and
 * Build mapping when the mapped node also exists), repair region id. Labels and positions are never
 * used and no node configuration is copied. Anything else is listed, with why.
 */
export function carryForward(
  source: { form: GraphTemplateFormDraft; origin: GraphFormOrigin },
  target: GraphPortableTemplate,
): { form: GraphTemplateFormDraft; report: GraphCarryReport } {
  const carried: GraphCarryReport["carried"] = [];
  const notCarried: GraphCarryReport["notCarried"] = [];
  const parameters: Record<string, GraphParameterValue> = initialTemplateParameters(target);
  for (const [id, value] of Object.entries(source.form.parameters)) {
    const declared = target.parameters.find((item) => item.id === id);
    if (!declared) notCarried.push({ kind: "parameter", id, reason: "absent" });
    else if (
      typeof value !== declared.type ||
      (typeof value === "number" && !Number.isFinite(value))
    )
      notCarried.push({ kind: "parameter", id, reason: "type" });
    else {
      parameters[id] = value;
      carried.push({ kind: "parameter", id });
    }
  }
  const bindings: GraphTemplateBindings = { references: {}, recipes: {}, sourcePaths: [] };
  const from = source.form.bindings;
  for (const [id, value] of Object.entries(from.references)) {
    if (!value?.trim()) continue;
    const role = target.references.find((item) => item.id === id);
    const was = source.origin.references.find((item) => item.id === id);
    if (!role) notCarried.push({ kind: "reference", id, reason: "absent" });
    else if (!was || was.kind !== role.kind)
      notCarried.push({ kind: "reference", id, reason: "kind" });
    else {
      bindings.references[id] = value;
      carried.push({ kind: "reference", id });
    }
  }
  if (carried.some((item) => item.kind === "reference") && from.referencePolicy)
    bindings.referencePolicy = from.referencePolicy;
  const tools = new Set(
    target.graph.nodes.filter((node) => node.type === "tool").map((node) => node.id),
  );
  for (const [nodeId, recipeId] of Object.entries(from.recipes)) {
    if (!recipeId) continue;
    if (!tools.has(nodeId)) {
      notCarried.push({ kind: "check", id: nodeId, reason: "node" });
      continue;
    }
    bindings.recipes[nodeId] = recipeId;
    const group = from.recipeGroups?.[nodeId];
    if (group) bindings.recipeGroups = { ...bindings.recipeGroups, [nodeId]: [...group] };
    const build = from.buildMappings?.[nodeId];
    if (build && tools.has(build))
      bindings.buildMappings = { ...bindings.buildMappings, [nodeId]: build };
    carried.push({ kind: "check", id: nodeId });
  }
  if (from.sourcePaths.some((path) => path.trim())) {
    const region = target.graph.routing?.region?.id;
    if (region && region === source.origin.regionId) {
      bindings.sourcePaths = [...from.sourcePaths];
      carried.push({ kind: "sourcePaths", id: region });
    } else
      notCarried.push({
        kind: "sourcePaths",
        id: source.origin.regionId ?? "sourcePaths",
        reason: region ? "node" : "absent",
      });
  }
  return {
    form: { parameters, bindings },
    report: { fromVersion: source.origin.version, carried, notCarried },
  };
}
