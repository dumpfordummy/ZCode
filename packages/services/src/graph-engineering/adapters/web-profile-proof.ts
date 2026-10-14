import { createHash } from "node:crypto";
import { mkdir, open, readdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { GraphWorkspaceTarget } from "../approval-types.js";
import type { GraphRecipe } from "../artifact-types.js";
import type { GraphWebProfileScope } from "../domain/project-budgets.js";
import { webProfileScopeSchema, graphRecipeSchema } from "../domain/artifact-schemas.js";
import { workspaceKey } from "../domain/definition.js";
const schema = z
  .object({
    version: z.literal(1),
    workspace: z.string(),
    scope: webProfileScopeSchema,
    recipes: z.array(graphRecipeSchema).length(2),
    expiresAt: z.number().int().positive(),
    preparedDigest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type WebProfileProof = z.infer<typeof schema>;
function folder(directory: string | undefined, target: GraphWorkspaceTarget) {
  if (!directory)
    throw Error("Private Web preparation owner is unavailable; v3 cannot execute on this Host.");
  return join(
    directory,
    "graph-web-profile-v1",
    createHash("sha256").update(workspaceKey(target)).digest("hex"),
  );
}
export async function writeWebProfileProof(
  directory: string,
  target: GraphWorkspaceTarget,
  scope: GraphWebProfileScope,
  recipes: GraphRecipe[],
  preparedDigest: string,
) {
  const value = schema.parse({
    version: 1,
    workspace: workspaceKey(target),
    scope,
    recipes,
    preparedDigest,
    expiresAt: Date.now() + 300000,
  });
  const dir = folder(directory, target);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  if ((await readdir(dir)).length >= 32)
    throw Error(
      "Private Web preparation receipt limit reached (32); no existing receipt was removed.",
    );
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text) > 1024 * 1024) throw Error("Web preparation receipt exceeds 1 MiB.");
  const handle = await open(join(dir, scope.preparationId + ".json"), "wx", 0o600);
  try {
    await handle.writeFile(text);
    await handle.sync();
  } finally {
    await handle.close();
  }
}
export async function readWebProfileProof(
  directory: string | undefined,
  target: GraphWorkspaceTarget,
  scope: GraphWebProfileScope,
): Promise<WebProfileProof> {
  webProfileScopeSchema.parse(scope);
  const handle = await open(join(folder(directory, target), scope.preparationId + ".json"), "r");
  try {
    const before = await handle.stat();
    if (before.size > 1024 * 1024) throw Error("Private Web receipt exceeds its bound.");
    const bytes = Buffer.alloc(before.size + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    const after = await handle.stat();
    if (bytesRead !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs)
      throw Error("Private Web receipt changed while reading.");
    const value = schema.parse(JSON.parse(bytes.subarray(0, bytesRead).toString("utf8")));
    if (
      value.workspace !== workspaceKey(target) ||
      JSON.stringify(value.scope) !== JSON.stringify(scope)
    )
      throw Error("Web preparation receipt identity mismatch.");
    return value;
  } finally {
    await handle.close();
  }
}
