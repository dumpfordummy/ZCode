import { z } from "zod";
import {
  webProfileSelectionSchema,
  webProfileRuntimeSchema,
  WEB_PROFILE_CONTROLS,
  WEB_PROFILE_INSPECTION_PURPOSE,
} from "./web-profile.js";

export const INSPECTION_PURPOSE = "project-configuration-inspection-v1" as const;
export const INSPECTION_TIMEOUT_MS = 30_000;
export const INSPECTION_REVIEW_MS = 300_000;
export const inspectionOutcomeSchema = z.enum([
  "succeeded",
  "denied",
  "cancelled",
  "expired",
  "source-changed",
  "invalid-output",
  "failed",
]);
export const inspectionSelectionSchema = z
  .object({
    project: z
      .string()
      .min(1)
      .max(4096)
      .regex(/^(?![\s@-])[^\r\n]*\.csproj$/i),
    configuration: z.enum(["Debug", "Release"]),
    framework: z.string().regex(/^net(?:8|10)\.0$/),
    sdkVersion: z.enum(["8.0.425", "8.0.426", "10.0.401"]),
    webProfile: webProfileSelectionSchema.optional(),
  })
  .strict();
export const inspectionBindingSchema = inspectionSelectionSchema
  .extend({
    purpose: z.enum([INSPECTION_PURPOSE, WEB_PROFILE_INSPECTION_PURPOSE]),
    runtimeProfile: webProfileRuntimeSchema.optional(),
    sdkDirectory: z.string().min(1).max(4096),
    observationDigest: z.string().regex(/^[a-f0-9]{64}$/),
    expiresAt: z.number().int().positive(),
    observedFiles: z.number().int().min(1).max(20_000),
    observedBytes: z.number().int().nonnegative().max(536_870_912),
  })
  .strict()
  .superRefine((value, ctx) => {
    const profile = !!value.webProfile;
    if (
      profile !== !!value.runtimeProfile ||
      value.purpose !== (profile ? WEB_PROFILE_INSPECTION_PURPOSE : INSPECTION_PURPOSE) ||
      (profile &&
        (value.sdkVersion !== "8.0.426" ||
          value.framework !== "net8.0" ||
          ![value.webProfile!.webProject, value.webProfile!.testProject].includes(value.project)))
    )
      ctx.addIssue({
        code: "custom",
        message: "Profile inspection purpose, selection and runtime binding must agree.",
      });
  });
export const inspectionReviewParamsSchema = inspectionSelectionSchema
  .extend({
    sessionId: z.string().min(1),
    operationId: z.string().uuid(),
    executable: z.string().min(1).max(4096),
    expiresAt: z.number().int().positive().optional(),
  })
  .strict();
export type InspectionSelection = z.infer<typeof inspectionSelectionSchema>;
export type InspectionBinding = z.infer<typeof inspectionBindingSchema>;

export const INSPECTION_PROPERTIES = [
  "NETCoreSdkVersion",
  "MSBuildVersion",
  "TargetPath",
  "TargetFramework",
  "Configuration",
  "UsingMicrosoftNETSdkWeb",
  "StaticWebAssetsEnabled",
  "RazorCompileOnBuild",
  "UseRazorSourceGenerator",
  "MSBuildAllProjects",
  "ProjectAssetsFile",
] as const;
export const WEB_INSPECTION_PROPERTIES = [
  ...INSPECTION_PROPERTIES,
  "AssemblyName",
  "BaseOutputPath",
  "BaseIntermediateOutputPath",
  "MSBuildRuntimeVersion",
] as const;
export const INSPECTION_ITEMS = [
  "Content",
  "ProjectReference",
  "PackageReference",
  "FrameworkReference",
  "StaticWebAsset",
] as const;
/** Fixed evaluation query; never accepts caller-supplied targets or switches. */
export function inspectionArguments(
  binding: Pick<
    InspectionBinding,
    "sdkDirectory" | "project" | "configuration" | "framework" | "webProfile"
  >,
): string[] {
  return [
    `${binding.sdkDirectory.replaceAll("\\", "/")}/MSBuild.dll`,
    binding.project,
    "-nologo",
    "-noAutoResponse",
    "-maxCpuCount:1",
    "-nodeReuse:false",
    `-p:Configuration=${binding.configuration}`,
    `-p:TargetFramework=${binding.framework}`,
    ...(binding.webProfile ? WEB_PROFILE_CONTROLS : []),
    `-getProperty:${(binding.webProfile ? WEB_INSPECTION_PROPERTIES : INSPECTION_PROPERTIES).join(",")}`,
    `-getItem:${INSPECTION_ITEMS.join(",")}`,
  ];
}
const text = z.string().max(8192);
const properties = z
  .object(Object.fromEntries(INSPECTION_PROPERTIES.map((key) => [key, text])))
  .strict();
const profileProperties = z
  .object(Object.fromEntries(WEB_INSPECTION_PROPERTIES.map((key) => [key, text])))
  .strict();
const item = z
  .object({
    Identity: text,
    FullPath: text.optional(),
    RootDir: text.optional(),
    Filename: text.optional(),
    Extension: text.optional(),
    RelativeDir: text.optional(),
    Directory: text.optional(),
    RecursiveDir: text.optional(),
    ModifiedTime: text.optional(),
    CreatedTime: text.optional(),
    AccessedTime: text.optional(),
    DefiningProjectFullPath: text.optional(),
    DefiningProjectDirectory: text.optional(),
    DefiningProjectName: text.optional(),
    DefiningProjectExtension: text.optional(),
    CopyToOutputDirectory: text.optional(),
    CopyToPublishDirectory: text.optional(),
    ExcludeFromSingleFile: text.optional(),
    Pack: text.optional(),
    IsImplicitlyDefined: text.optional(),
    PrivateAssets: text.optional(),
    Version: text.optional(),
  })
  .strict();
const rawProjection = z
  .object({
    Properties: properties,
    Items: z
      .object(Object.fromEntries(INSPECTION_ITEMS.map((key) => [key, z.array(item).max(256)])))
      .strict(),
  })
  .strict();
// Installed 17.11.69 ProjectReference evaluation metadata: only the observed empty target overrides.
const profileReference = item
  .extend({
    OutputItemType: z.literal(""),
    ReferenceSourceTarget: z.literal("ProjectReference"),
    Targets: z.literal(""),
  })
  .strict();
const rawProfileProjection = rawProjection
  .extend({
    Properties: profileProperties,
    Items: z
      .object(
        Object.fromEntries(
          INSPECTION_ITEMS.map((key) => [
            key,
            z.array(key === "ProjectReference" ? profileReference : item).max(256),
          ]),
        ),
      )
      .strict(),
  })
  .strict();
export const inspectionProjectionSchema = z
  .object({
    properties: z.union([properties, profileProperties]),
    items: z
      .array(
        z
          .object({
            kind: z.enum(INSPECTION_ITEMS),
            identity: text,
            definingProject: text.optional(),
            copyToOutput: text.optional(),
          })
          .strict(),
      )
      .max(512),
    scopeComplete: z.literal(false),
  })
  .strict();
export type InspectionProjection = z.infer<typeof inspectionProjectionSchema>;
/** A small allowlisted observation, never a complete input manifest or test evidence. */
export function projectInspectionOutput(value: string, webProfile = false): InspectionProjection {
  if (value.length > 65_536) throw Error("Inspection output limit exceeded.");
  const parsed = (webProfile ? rawProfileProjection : rawProjection).parse(JSON.parse(value));
  return inspectionProjectionSchema.parse({
    properties: parsed.Properties,
    items: Object.entries(parsed.Items).flatMap(([kind, entries]) =>
      (entries as z.infer<typeof item>[]).map((entry) => ({
        kind,
        identity: entry.Identity,
        definingProject: entry.DefiningProjectFullPath,
        copyToOutput: entry.CopyToOutputDirectory,
      })),
    ),
    scopeComplete: false,
  });
}
