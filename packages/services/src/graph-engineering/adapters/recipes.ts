import { readWebProfileProof } from "./web-profile-proof.js";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { acquireFileLock } from "@zcode/shared/node";
import type { GraphWorkspaceTarget } from "../contract.js";
import type { GraphRecipeStore } from "../artifact-types.js";
import { validateGraphRecipes } from "../domain/artifact-schemas.js";
import { parseBoundedGraphJson } from "../domain/artifacts.js";
import {
  RECIPE_CONFIGURATION_BYTES,
  RECIPE_CONFIGURATION_MEMBERS,
} from "../domain/project-budgets.js";
import { createRecipeSourceFingerprint } from "./recipe-sources.js";
import {
  assertWorkspaceFilePath,
  observeDeclaredFiles,
  readDeclaredFile,
} from "./artifact-files.js";

export { fingerprintDeclaredFiles } from "./artifact-files.js";
const SOURCE_PATH = ".zcode/config.json" as const;
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
async function readConfig(target: GraphWorkspaceTarget, directory?: string) {
  const checked = await assertWorkspaceFilePath(target, SOURCE_PATH, true);
  if (!checked.exists)
    return { raw: {} as Record<string, unknown>, digest: digest("missing"), recipes: [] };
  const bytes = await readDeclaredFile(target, SOURCE_PATH, RECIPE_CONFIGURATION_BYTES);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    raw = parseBoundedGraphJson(text, {
      bytes: RECIPE_CONFIGURATION_BYTES,
      members: RECIPE_CONFIGURATION_MEMBERS,
    });
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Project configuration must be a JSON object.");
  const recipes = validateGraphRecipes(raw.graphRecipes ?? []);
  for (const recipe of recipes)
    if (recipe.sourceScope?.version === 3) {
      const proof = await readWebProfileProof(directory, target, recipe.sourceScope);
      if (!proof.recipes.some((item) => JSON.stringify(item) === JSON.stringify(recipe)))
        throw Error("Saved Web recipe differs from its private preparation receipt.");
    }
  return { raw: raw as Record<string, unknown>, digest: digest(bytes.toString("utf8")), recipes };
}
export function createGraphRecipeStore(directory?: string): GraphRecipeStore {
  const fingerprint = createRecipeSourceFingerprint(directory);
  return {
    async read(target) {
      const result = await readConfig(target, directory);
      return { recipes: result.recipes, digest: result.digest, sourcePath: SOURCE_PATH };
    },
    async save(target, recipes, expectedDigest) {
      const validated = validateGraphRecipes(recipes),
        path = (await assertWorkspaceFilePath(target, SOURCE_PATH, true)).absolutePath;
      await mkdir(dirname(path), { recursive: true });
      await assertWorkspaceFilePath(target, SOURCE_PATH, true);
      const release = await acquireFileLock(path, [10, 25, 50], 1000, 50);
      try {
        const current = await readConfig(target, directory);
        if (current.digest !== expectedDigest)
          throw new Error("Project recipe configuration changed; reload before saving.");
        const scopes = [
          ...new Map(
            validated.flatMap((recipe) =>
              recipe.sourceScope?.version === 3
                ? [[recipe.sourceScope.preparationId, recipe.sourceScope] as const]
                : [],
            ),
          ).values(),
        ];
        for (const scope of scopes) {
          const proof = await readWebProfileProof(directory, target, scope);
          if (Date.now() >= proof.expiresAt)
            throw Error("Web proposal review expired; prepare again before Save.");
          const selected = validated.filter(
            (recipe) =>
              recipe.sourceScope?.version === 3 &&
              recipe.sourceScope.preparationId === scope.preparationId,
          );
          if (JSON.stringify(selected) !== JSON.stringify(proof.recipes))
            throw Error("Web proposal recipes changed after preparation.");
          const fresh = await fingerprint(target, [scope.project], [scope]);
          if (
            fresh.digest !==
            digest(JSON.stringify({ version: 1, scopes: [scope], content: proof.preparedDigest }))
          )
            throw Error("Web source bytes changed after preparation; prepare again before Save.");
        }
        for (const scope of scopes)
          if (Date.now() >= (await readWebProfileProof(directory, target, scope)).expiresAt)
            throw Error("Web proposal expired during Save verification.");
        const value = { ...current.raw, graphRecipes: validated },
          text = `${JSON.stringify(value, null, 2)}\n`;
        if (Buffer.byteLength(text) > RECIPE_CONFIGURATION_BYTES)
          throw new Error("Project configuration exceeds the 32 MiB limit.");
        parseBoundedGraphJson(text, {
          bytes: RECIPE_CONFIGURATION_BYTES,
          members: RECIPE_CONFIGURATION_MEMBERS,
        });
        const temporary = `${path}.${randomUUID()}.tmp`;
        let handle: Awaited<ReturnType<typeof open>> | undefined;
        try {
          handle = await open(temporary, "wx", 0o600);
          await handle.writeFile(text, "utf8");
          await handle.sync();
          await handle.close();
          handle = undefined;
          // 配方审阅后文件可能被其他编辑器替换；提交前核验原文摘要与路径，不能覆盖已知新配置。
          await assertWorkspaceFilePath(target, SOURCE_PATH, true);
          if ((await readConfig(target, directory)).digest !== expectedDigest)
            throw new Error("Project recipe configuration changed before write.");
          await rename(temporary, path);
        } finally {
          await handle?.close();
          await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") throw error;
          });
        }
        return { recipes: validated, digest: digest(text), sourcePath: SOURCE_PATH };
      } finally {
        await release();
      }
    },
    fingerprint,
    observeFiles: observeDeclaredFiles,
  };
}
