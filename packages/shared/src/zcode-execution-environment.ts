import { z } from "zod";

const label = z.string().min(1).max(4096);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const zcodeExecutionEnvironmentPreviewSchema = z
  .object({
    version: z.literal(1),
    status: z.enum(["available", "unknown"]),
    configDigest: digest,
    executables: z
      .array(
        z
          .object({
            executable: label,
            status: z.enum(["available", "missing", "unknown"]),
            path: label.optional(),
          })
          .strict(),
      )
      .max(32),
    instructions: z.array(
      z
        .object({
          scope: z.enum(["user", "workspace"]),
          path: label,
          digest,
          bytes: z.number().int().nonnegative(),
          truncated: z.boolean(),
        })
        .strict(),
    ),
    skills: z.array(
      z
        .object({
          id: label,
          name: label,
          path: label,
          scope: z.enum(["user", "workspace", "plugin"]),
          enabled: z.boolean(),
          plugin: label.optional(),
          version: label.optional(),
          digest: digest.optional(),
        })
        .strict(),
    ),
    plugins: z.array(
      z
        .object({
          id: label,
          name: label,
          enabled: z.boolean(),
          source: label,
          version: label.optional(),
        })
        .strict(),
    ),
    hooks: z.array(
      z
        .object({
          event: label,
          enabled: z.boolean(),
          source: label,
          trust: z.literal("unknown"),
          digest,
        })
        .strict(),
    ),
    mcp: z.array(
      z
        .object({
          name: label,
          transport: z.enum(["stdio", "http", "sse"]),
          destination: label,
          enabled: z.boolean(),
          status: z.literal("unknown"),
          digest,
        })
        .strict(),
    ),
    unknowns: z.array(label),
  })
  .strict();

export type ZCodeExecutionEnvironmentPreview = z.infer<
  typeof zcodeExecutionEnvironmentPreviewSchema
>;

export function unknownExecutionEnvironment(reason: string): ZCodeExecutionEnvironmentPreview {
  return {
    version: 1,
    status: "unknown",
    configDigest: "0".repeat(64),
    executables: [],
    instructions: [],
    skills: [],
    plugins: [],
    hooks: [],
    mcp: [],
    unknowns: [reason],
  };
}
