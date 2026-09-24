import { z } from "zod";
import { zcodeExecutionEnvironmentPreviewSchema } from "@zcode/shared";

const id = z.string().min(1).max(200);
const text = z.string().max(4096);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const kind = z.enum(["document", "instruction", "skill"]);
export const parameterValueSchema = z.union([
  z.string().max(12000),
  z.number().finite(),
  z.boolean(),
]);
export const templateBindingsSchema = z
  .object({
    references: z.record(id, text),
    recipes: z.record(id, id),
    sourcePaths: z.array(text).max(64),
  })
  .strict();
export const templateInstanceSchema = z
  .object({
    id,
    name: id,
    version: z.number().int().positive(),
    digest,
    parameters: z.record(id, parameterValueSchema),
    bindings: templateBindingsSchema,
    references: z.array(z.object({ id, kind, nodeIds: z.array(id).max(32) }).strict()).max(32),
    excluded: z.array(z.object({ nodeId: id, reason: text }).strict()).max(32),
  })
  .strict();
export const runProvenanceSchema = z
  .object({
    operationalDecision: z
      .object({ acknowledgedUnknowns: z.boolean(), acceptedAt: z.number().finite().nonnegative() })
      .strict()
      .optional(),
    digest,
    template: templateInstanceSchema,
    environment: zcodeExecutionEnvironmentPreviewSchema,
    models: z
      .array(
        z
          .object({
            nodeId: id,
            providerId: id,
            modelId: id,
            type: text,
            destination: text,
            configurationDigest: digest,
          })
          .strict(),
      )
      .max(32),
    auxiliary: z.array(text).max(32),
    references: z
      .array(
        z
          .object({ id, kind, path: text, digest, origin: text, nativeName: text.optional() })
          .strict(),
      )
      .max(32),
    recipes: z
      .array(
        z.object({ nodeId: id, id, digest, command: z.string().max(32000), cwd: text }).strict(),
      )
      .max(32),
    permissions: z
      .array(z.object({ nodeId: id, mode: text, planEnabled: z.boolean() }).strict())
      .max(32),
    unknowns: z.array(text).max(256),
  })
  .strict();
