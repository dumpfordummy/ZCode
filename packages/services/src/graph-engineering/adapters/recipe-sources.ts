import { revalidateWebProfileScope } from "./web-profile-scope.js";
import { createHash } from "node:crypto";
import type { GraphRecipeStore } from "../artifact-types.js";
import { fingerprintDeclaredFiles, fingerprintDeclaredFilesWithin } from "./artifact-files.js";
import { revalidateProjectScope } from "./project-scope.js";
import { PROJECT_SCOPE_BUDGET } from "../domain/project-budgets.js";

/** Existing fingerprint owner, with additive membership validation for new versioned scopes. */
export function createRecipeSourceFingerprint(directory?: string): GraphRecipeStore["fingerprint"] {
  return async (target, paths, scopes = [], diagnosticPhase) => {
    const mark = (phase: string) => {
      try {
        diagnosticPhase?.(phase);
      } catch {
        /* Observation only. */
      }
    };
    if (!scopes.length) return fingerprintDeclaredFiles(target, paths);
    mark("membership-before-start");
    if (scopes.length > 32) throw Error("Too many selected scopes.");
    const unique = [...new Map(scopes.map((scope) => [JSON.stringify(scope), scope])).entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, scope]) => scope);
    const deadline = Date.now() + PROJECT_SCOPE_BUDGET.elapsedMs;
    const revalidate = (scope: (typeof unique)[number]) =>
      scope.version === 3
        ? revalidateWebProfileScope(directory, target, scope, deadline)
        : revalidateProjectScope(target, scope, deadline);
    const inventory = new Set<string>();
    for (const scope of unique)
      for (const path of await revalidate(scope)) {
        inventory.add(path);
        if (inventory.size > PROJECT_SCOPE_BUDGET.sourceFiles)
          throw Error("Combined selected source count exceeds 20000.");
      }
    if (paths.some((path) => !inventory.has(path)))
      throw Error("Declared Build/Test input is outside the prepared selected scope.");
    mark("membership-before-end");
    mark("content-fingerprint-start");
    const result = await fingerprintDeclaredFilesWithin(target, [...inventory], deadline);
    // 哈希期间新增/删除输入也必须使证据失效，不能只验证已知文件的字节。
    mark("content-fingerprint-end");
    mark("membership-after-start");
    for (const scope of unique) await revalidate(scope);
    mark("membership-after-end");
    return {
      ...result,
      digest: createHash("sha256")
        .update(JSON.stringify({ version: 1, scopes: unique, content: result.digest }))
        .digest("hex"),
    };
  };
}
export const fingerprintRecipeSources = createRecipeSourceFingerprint();
