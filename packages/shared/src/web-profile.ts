import { z } from "zod";
import policy from "./web-profile-policy.json" with { type: "json" };
export const webProfilePackagePolicy = policy.packages;

export const WEB_PROFILE_POLICY = "web-static-net8-win-x64-v1" as const;
export const WEB_PROFILE_INSPECTION_PURPOSE = "project-web-profile-inspection-v1" as const;
export const WEB_PROFILE_CONTROLS = [
  "-p:EnableSourceControlManagerQueries=false",
  "-p:EnableSourceLink=false",
  "-p:ImportUserLocationsByWildcardBeforeMicrosoftCommonProps=false",
  "-p:ImportUserLocationsByWildcardAfterMicrosoftCommonProps=false",
  "-p:ImportUserLocationsByWildcardBeforeMicrosoftCommonTargets=false",
  "-p:ImportUserLocationsByWildcardAfterMicrosoftCommonTargets=false",
  "-p:MSBuildEnableWorkloadResolver=false",
] as const;
const absolute = z
  .string()
  .min(3)
  .max(4096)
  .regex(/^[A-Za-z]:[\\/][^\r\n]*$/)
  .refine((value) => !value.includes(String.fromCharCode(0)));
const digest = z.string().regex(/^[a-f0-9]{64}$/);
/** Locally private, exact roots and identity; no command switches or arbitrary property map. */
export const webProfileRuntimeSchema = z
  .object({
    policy: z.literal(WEB_PROFILE_POLICY),
    executable: absolute,
    packageRoot: absolute,
    systemRoot: absolute,
    toolchainDigest: digest,
    resolverDigest: digest,
    environmentDigest: digest,
    observedFiles: z.number().int().positive().max(50000),
    observedBytes: z
      .number()
      .int()
      .positive()
      .max(2 * 1024 * 1024 * 1024),
  })
  .strict();
export type WebProfileRuntime = z.infer<typeof webProfileRuntimeSchema>;

const projectPath = z
  .string()
  .min(1)
  .max(1024)
  .regex(/^(?![\s@-])[^\\:\r\n]*\.csproj$/i)
  .refine(
    (value) =>
      !value.includes(String.fromCharCode(0)) &&
      value
        .split("/")
        .every((part) => part && part !== "." && part !== ".." && !/[ .]$/.test(part)),
    "Literal workspace-relative project required.",
  );
export const webProfileSelectionSchema = z
  .object({
    policy: z.literal(WEB_PROFILE_POLICY),
    webProject: projectPath,
    testProject: projectPath,
  })
  .strict();
export function webProfileReadScope(binding: WebProfileRuntime): string[] {
  const executable = binding.executable.replaceAll("\\", "/");
  const dotnet = executable.slice(0, executable.lastIndexOf("/"));
  return [
    ...policy.roots.map((root) => `${dotnet}/${root.relativePath}`),
    ...policy.packages.map((p) => `${binding.packageRoot.replaceAll("\\", "/")}/${p.path}`),
  ];
}

export const webProfileExecutionSchema = webProfileSelectionSchema
  .extend({
    configuration: z.enum(["Debug", "Release"]),
    kind: z.enum(["build", "test"]),
    runtimeProfile: webProfileRuntimeSchema,
  })
  .strict();
export type WebProfileExecution = z.infer<typeof webProfileExecutionSchema>;
/** Fixed Build/Test commands; this function is never used for inspection. */
export function webProfileExecutionArguments(
  profile: Pick<WebProfileExecution, "testProject" | "configuration" | "kind">,
  operationId = "{operationId}",
): string[] {
  const common = [
    profile.testProject,
    "--configuration",
    profile.configuration,
    "--framework",
    "net8.0",
  ];
  return profile.kind === "build"
    ? [
        "build",
        ...common,
        "--no-restore",
        "--no-incremental",
        "-t:Rebuild",
        "--disable-build-servers",
        "-p:UseSharedCompilation=false",
        "-noAutoResponse",
        "-maxCpuCount:1",
        "-nodeReuse:false",
        ...WEB_PROFILE_CONTROLS,
      ]
    : [
        "test",
        ...common,
        "--no-build",
        "--no-restore",
        "--logger",
        "trx;LogFileName=results.trx",
        "--results-directory",
        `.zcode/graph-results/${operationId}`,
        "-noAutoResponse",
        "-maxCpuCount:1",
        "-nodeReuse:false",
        ...WEB_PROFILE_CONTROLS,
      ];
}
