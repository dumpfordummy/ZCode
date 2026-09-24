import { z } from "zod";
import { sequentialDefinitionSchema } from "./sequential.js";
import { parameterValueSchema } from "./workflow-provenance-schema.js";

const id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,127}$/);
export const portableTemplateSchema = z
  .object({
    format: z.literal("zcode-workflow"),
    version: z.literal(1),
    name: z.string().trim().min(1).max(200),
    description: z.string().max(12000),
    graph: sequentialDefinitionSchema,
    parameters: z
      .array(
        z
          .object({
            id,
            label: z.string().min(1).max(200),
            type: z.enum(["string", "boolean", "number"]),
            required: z.boolean(),
            default: parameterValueSchema.optional(),
          })
          .strict(),
      )
      .max(32),
    references: z
      .array(
        z
          .object({
            id,
            label: z.string().min(1).max(200),
            kind: z.enum(["document", "instruction", "skill"]),
            required: z.boolean(),
            nodeIds: z.array(id).max(32),
          })
          .strict(),
      )
      .max(32),
    optionalNodes: z.array(z.object({ nodeId: id, parameterId: id }).strict()).max(8),
  })
  .strict()
  .superRefine((value, ctx) => {
    const graph = value.graph;
    if (
      graph.version !== 5 ||
      graph.template ||
      graph.revision !== 0 ||
      graph.nodes.some(
        (n) =>
          (n.type === "start" && n.request !== "") ||
          (n.type === "task" && n.configuration.kind !== "inherit") ||
          (n.type === "tool" && n.recipeId !== n.id),
      )
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Portable graph requires version 5, revision 0, empty Start, inherited models and symbolic recipe slots; no local template binding.",
      });
    for (const list of [value.parameters, value.references])
      if (new Set(list.map((p) => p.id)).size !== list.length)
        ctx.addIssue({
          code: "custom",
          message: "Parameter/reference identifiers must be unique.",
        });
    for (const param of value.parameters)
      if (param.default !== undefined && typeof param.default !== param.type)
        ctx.addIssue({ code: "custom", message: `Invalid default for ${param.id}.` });
    for (const ref of value.references)
      if (ref.nodeIds.some((id) => !graph.nodes.some((n) => n.id === id && n.type === "task")))
        ctx.addIssue({ code: "custom", message: `Reference ${ref.id} must select Agent Tasks.` });
    for (const optional of value.optionalNodes) {
      if (
        !value.parameters.some((p) => p.id === optional.parameterId && p.type === "boolean") ||
        !graph.nodes.some((n) => n.id === optional.nodeId && n.type === "task") ||
        graph.routing?.region ||
        graph.nodes.some((n) => n.type === "condition")
      )
        ctx.addIssue({
          code: "custom",
          message: "Optional nodes require a boolean parameter and a sequential non-region task.",
        });
    }
  });
export const libraryStoreSchema = z
  .object({
    version: z.literal(1),
    revision: z.number().int().nonnegative(),
    entries: z
      .array(
        z
          .object({
            id: z.string().min(1).max(200),
            name: z.string().min(1).max(200),
            archived: z.boolean(),
            builtin: z.literal(false),
            versions: z
              .array(
                z
                  .object({
                    version: z.number().int().positive(),
                    digest: z.string().regex(/^[a-f0-9]{64}$/),
                    createdAt: z.number().finite().nonnegative(),
                    template: portableTemplateSchema,
                  })
                  .strict(),
              )
              .min(1)
              .max(100),
          })
          .strict(),
      )
      .max(200),
  })
  .strict();
