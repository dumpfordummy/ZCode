import { z } from "zod";
import type { GraphRecipe } from "../artifact-types.js";
import { GRAPH_ARTIFACT_BYTES } from "./artifacts.js";

const hasControl = (value: string) => Array.from(value).some((char) => char.charCodeAt(0) < 32);

export function validateGraphRelativePath(path: string, allowRoot = false): string {
  if (allowRoot && path === ".") return path;
  if (
    typeof path !== "string" ||
    !path ||
    path.length > 1024 ||
    path.includes("\\") ||
    path.startsWith("/") ||
    path.includes(":") ||
    hasControl(path)
  )
    throw new Error("A safe workspace-relative path using forward slashes is required.");
  if (
    path
      .split("/")
      .some(
        (part) =>
          !part ||
          part === "." ||
          part === ".." ||
          /[ .]$/.test(part) ||
          /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
      )
  )
    throw new Error("Unsafe workspace-relative path segment.");
  return path;
}
const identity = z.string().min(1).max(200);
const relativePath = z.string().superRefine((value, ctx) => {
  try {
    validateGraphRelativePath(value);
  } catch (error) {
    ctx.addIssue({ code: "custom", message: (error as Error).message });
  }
});
const cwd = z.string().superRefine((value, ctx) => {
  try {
    validateGraphRelativePath(value, true);
  } catch (error) {
    ctx.addIssue({ code: "custom", message: (error as Error).message });
  }
});
const paths = z
  .array(relativePath)
  .max(32)
  .refine((value) => new Set(value).size === value.length, "Duplicate declared paths.");
const testVerifier = z
  .object({
    kind: z.literal("test"),
    format: z.literal("zcode-json-v1"),
    reportPath: relativePath,
    minimumTests: z.number().int().min(1).max(1000),
    expectedTests: z.number().int().min(1).max(1000).optional(),
    requiredTests: z.array(z.string().min(1).max(200)).max(256),
    buildNodeId: identity,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      (value.expectedTests !== undefined && value.expectedTests < value.minimumTests) ||
      new Set(value.requiredTests).size !== value.requiredTests.length
    )
      ctx.addIssue({ code: "custom", message: "Invalid required/expected test counts." });
  });
export const graphRecipeSchema = z
  .object({
    id: z.string().min(1).max(128),
    name: z.string().trim().min(1).max(120),
    executable: z
      .string()
      .min(1)
      .max(1024)
      .refine(
        (value) =>
          !hasControl(value) &&
          !/[{}]/.test(value) &&
          !/^(?:cmd|powershell|pwsh|sh|bash|zsh|fish|csh|wscript|cscript)(?:\.exe)?$/i.test(
            value.split(/[\\/]/).at(-1)!,
          ) &&
          !/\.(?:bat|cmd|ps1|sh)$/i.test(value),
        "Script-shell recipes are unsupported.",
      ),
    args: z
      .array(
        z
          .string()
          .max(4096)
          .refine(
            (value) =>
              !value.includes("\0") &&
              Array.from(value.matchAll(/\{([^{}]+)\}/g)).every((match) =>
                ["operationId", "sourceDigest", "buildDigest", "reportPath"].includes(match[1]!),
              ),
            "Only declared Host placeholders are supported.",
          ),
      )
      .max(64),
    cwd,
    timeoutMs: z.number().int().min(100).max(600000),
    sourcePaths: paths,
    expectedOutputs: paths,
    redactEnvironmentVariables: z
      .array(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,127}$/))
      .max(32)
      .optional(),
    verifier: z.union([
      z.object({ kind: z.literal("command") }).strict(),
      z.object({ kind: z.literal("build") }).strict(),
      testVerifier,
    ]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.expectedOutputs.some((path) => ["command", "test"].includes(path)) ||
      (value.verifier.kind === "test" &&
        (["command", "test"].includes(value.verifier.reportPath) ||
          value.expectedOutputs.includes(value.verifier.reportPath)))
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Declared output/report selectors cannot duplicate reserved command/test or the separately captured report.",
      });
    if (
      value.verifier.kind !== "command" &&
      (!value.sourcePaths.length ||
        (value.verifier.kind === "build" && !value.expectedOutputs.length))
    )
      ctx.addIssue({
        code: "custom",
        message: "Build/Test require declared sources; Build requires expected outputs.",
      });
  });
export function validateGraphRecipes(value: unknown): GraphRecipe[] {
  return z
    .array(graphRecipeSchema)
    .max(32)
    .refine(
      (recipes) => new Set(recipes.map((recipe) => recipe.id)).size === recipes.length,
      "Duplicate recipe IDs.",
    )
    .parse(value);
}
export const graphArtifactSchema = z
  .object({
    id: identity,
    runId: identity,
    nodeId: identity,
    attemptId: identity,
    workspaceKey: z.string().min(1).max(4096),
    type: z.enum(["text", "json", "file", "diff", "command", "test"]),
    provenance: z.enum(["native-agent-final", "workspace-file", "native-command", "native-test"]),
    bytes: z.number().int().min(0).max(GRAPH_ARTIFACT_BYTES),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    capturedAt: z.number().int().nonnegative(),
    validation: z.enum(["valid", "invalid", "incomplete"]),
    issue: z.string().max(1000).optional(),
    redacted: z.boolean().optional(),
    sourceBaseline: z.string().max(8192).optional(),
    sourcePath: z.string().max(1024).optional(),
    sessionId: identity.optional(),
    inputId: identity.optional(),
    commandId: identity.optional(),
    operationId: identity.optional(),
  })
  .strict();
