import type {
  GraphChecksPreview,
  GraphChecksSelection,
  GraphRunChecksCommand,
  GraphWorkspaceTarget,
  GraphRecipe,
} from "@zcode/services";
import { graphToolOnlySettings } from "./graphEditing.js";
import { GRAPH_CHECKS_ADMISSION_REJECTED } from "@zcode/services";

export interface GraphChecksRequest {
  scope: object;
  command: GraphRunChecksCommand;
}
export function graphChecksRequestAfterProjection(
  retained: GraphChecksRequest | undefined,
  scope: object,
  runs: readonly { requestId: string }[],
): GraphChecksRequest | undefined {
  return retained?.scope === scope &&
    runs.some((run) => run.requestId === retained.command.requestId)
    ? undefined
    : retained;
}
export function graphChecksRequestAfterError(
  retained: GraphChecksRequest | undefined,
  scope: object,
  currentScope: object,
  command: GraphRunChecksCommand,
  error: unknown,
): GraphChecksRequest | undefined {
  // 仅已明确发生在持久化前的拒绝可释放意图；网络、写入和旧作用域回执都不能证明未执行。
  return currentScope === scope &&
    retained?.scope === scope &&
    retained.command === command &&
    error instanceof Error &&
    error.name === GRAPH_CHECKS_ADMISSION_REJECTED
    ? undefined
    : retained;
}

export function graphChecksSelectionIssue(
  selection: GraphChecksSelection,
  recipes: GraphRecipe[],
): "selectFirst" | "checkLimit" | undefined {
  if (selection.kind === "dotnet-probe")
    return selection.executable.trim() && selection.cwd.trim() ? undefined : "selectFirst";
  if (selection.recipeIds.length > 8) return "checkLimit";
  if (
    !selection.recipeIds.length ||
    new Set(selection.recipeIds).size !== selection.recipeIds.length ||
    !selection.recipeIds.every((id, index) => {
      const recipe = recipes.find((item) => item.id === id);
      if (!recipe) return false;
      if (recipe.verifier.kind !== "test") return true;
      const build = selection.buildMappings[id];
      return (
        build &&
        selection.recipeIds.indexOf(build) >= 0 &&
        selection.recipeIds.indexOf(build) < index &&
        recipes.some((item) => item.id === build && item.verifier.kind === "build")
      );
    })
  )
    return "selectFirst";
}

export function graphChecksReviewKey(value: {
  text: string;
  digest: string;
  revision: number;
  selection: GraphChecksSelection;
}): string {
  return JSON.stringify(value);
}
export function captureGraphChecksCommand(
  target: GraphWorkspaceTarget,
  preview: GraphChecksPreview,
  acknowledged: boolean,
  requestId: string,
  retained?: GraphRunChecksCommand | null,
): GraphRunChecksCommand {
  if (!acknowledged) throw Error("Review and acknowledge the exact checks before starting.");
  const command: GraphRunChecksCommand = {
    ...graphToolOnlySettings(),
    action: "checks",
    target,
    requestId,
    revision: preview.revision,
    checks: {
      selection: structuredClone(preview.selection),
      expectedDigest: preview.recipeDigest,
      digest: preview.digest,
      acknowledgedUnknowns: true,
    },
  };
  if (retained) {
    if (
      JSON.stringify({ ...retained, requestId: "" }) !==
      JSON.stringify({ ...command, requestId: "" })
    )
      throw Error(
        "The previous checks request is unresolved. Inspect its run before changing the reviewed checks.",
      );
    return retained;
  }
  return command;
}
export async function recheckGraphChecksPreview(
  preview: GraphChecksPreview,
  refresh: () => Promise<GraphChecksPreview | undefined>,
  isCurrent: () => boolean,
): Promise<GraphChecksPreview | undefined> {
  const fresh = await refresh();
  return isCurrent() && fresh?.digest === preview.digest ? fresh : undefined;
}
