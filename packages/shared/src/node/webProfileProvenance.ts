import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import policy from "../web-profile-policy.json" with { type: "json" };
import {
  WEB_PROFILE_POLICY,
  webProfileRuntimeSchema,
  type WebProfileRuntime,
} from "../web-profile.js";
import { fingerprintBoundedTrees } from "./boundedTreeFingerprint.js";

const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const parents = [
  "host/fxr",
  "shared/Microsoft.NETCore.App",
  "shared/Microsoft.AspNetCore.App",
  "packs/Microsoft.NETCore.App.Ref",
  "packs/Microsoft.AspNetCore.App.Ref",
  "packs/Microsoft.NETCore.App.Host.win-x64",
];
/** Exact fixed effective environment. No ambient environment values are exposed or inherited. */
export function webProfileEnvironment(
  workspace: string,
  binding: Pick<WebProfileRuntime, "executable" | "packageRoot" | "systemRoot">,
): Record<string, string> {
  const state = join(resolve(workspace), ".zcode", "web-profile-v1");
  return {
    SystemRoot: binding.systemRoot,
    WINDIR: binding.systemRoot,
    ComSpec: join(binding.systemRoot, "System32", "cmd.exe"),
    PATH: dirname(binding.executable) + ";" + join(binding.systemRoot, "System32"),
    PATHEXT: ".COM;.EXE;.BAT;.CMD",
    PROCESSOR_ARCHITECTURE: "AMD64",
    NUMBER_OF_PROCESSORS: "1",
    HOME: join(state, "home"),
    USERPROFILE: join(state, "home"),
    APPDATA: join(state, "home", "AppData", "Roaming"),
    LOCALAPPDATA: join(state, "home", "AppData", "Local"),
    TEMP: join(state, "temp"),
    TMP: join(state, "temp"),
    DOTNET_ROOT: dirname(binding.executable),
    DOTNET_CLI_HOME: join(state, "dotnet-home"),
    NUGET_PACKAGES: binding.packageRoot,
    MSBuildUserExtensionsPath: join(state, "msbuild-user"),
    PROGRAMFILES: join(state, "program-files"),
    "PROGRAMFILES(X86)": join(state, "program-files"),
    PROGRAMDATA: join(state, "program-data"),
    DOTNET_SKIP_FIRST_TIME_EXPERIENCE: "1",
    DOTNET_CLI_TELEMETRY_OPTOUT: "1",
    DOTNET_NOLOGO: "1",
    DOTNET_GENERATE_ASPNET_CERTIFICATE: "false",
    DOTNET_ADD_GLOBAL_TOOLS_TO_PATH: "false",
    DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE: "true",
    DOTNET_CLI_USE_MSBUILD_SERVER: "0",
    DOTNET_CLI_UI_LANGUAGE: "en-US",
    VSTEST_TELEMETRY_OPTEDIN: "1",
    MSBuildEnableWorkloadResolver: "false",
  };
}
/** Exact tested installed bytes and known public package closure, with a single aggregate budget. */
export async function captureWebProfileRuntime(input: {
  workspace: string;
  executable: string;
  packageRoot: string;
  systemRoot: string;
  signal?: AbortSignal;
  deadline?: number;
}): Promise<WebProfileRuntime> {
  if (!same(input.systemRoot, process.env.SystemRoot ?? ""))
    throw Error("Windows system identity changed.");
  if (process.platform !== "win32" || process.arch !== "x64")
    throw Error("This Web profile requires the tested Windows x64 runtime.");
  for (const root of [input.workspace, input.executable, input.packageRoot, input.systemRoot]) {
    if (
      !isAbsolute(root) ||
      !same(await realpath(root), resolve(root)) ||
      (await lstat(root)).isSymbolicLink()
    )
      throw Error("Web profile roots must be canonical absolute paths without links.");
  }
  if (!/[/\\]dotnet\.exe$/i.test(input.executable))
    throw Error("Resolved dotnet executable required.");
  const dotnet = dirname(input.executable),
    deadline =
      performance.now() + Math.min(120000, (input.deadline ?? Date.now() + 120000) - Date.now());
  let files = 0,
    bytes = 0;
  const commitments = [];
  for (const entry of [
    ...policy.roots.map((r) => ({
      label: r.label,
      path: join(dotnet, r.relativePath),
      expected: r,
    })),
    ...policy.packages.map((p) => ({
      label: p.id,
      path: join(input.packageRoot, p.path),
      expected: p,
    })),
  ]) {
    input.signal?.throwIfAborted();
    const elapsedMs = Math.floor(deadline - performance.now());
    if (elapsedMs <= 0) throw Error("Web profile provenance expired.");
    const observed = await fingerprintBoundedTrees({
      roots: [{ path: entry.path, label: "$ROOT" }],
      limits: {
        files: 50000 - files,
        bytes: 2 * 1024 * 1024 * 1024 - bytes,
        fileBytes: 256 * 1024 * 1024,
        depth: 32,
        elapsedMs,
      },
      signal: input.signal,
    });
    if (
      observed.digest !== entry.expected.digest ||
      observed.files !== entry.expected.files ||
      observed.bytes !== entry.expected.bytes
    )
      throw Error(
        `Installed Web profile provenance differs from the tested policy: ${entry.label}.`,
      );
    files += observed.files;
    bytes += observed.bytes;
    commitments.push([entry.label, observed.digest]);
  }
  const membership: Record<string, string[]> = {};
  for (const parent of parents) {
    input.signal?.throwIfAborted();
    if (performance.now() > deadline) throw Error("Web profile provenance expired.");
    const names = (await readdir(join(dotnet, parent))).sort();
    if (names.length > 64 || names.some((name) => !/^\d+\.\d+\.\d+$/.test(name)))
      throw Error("Unknown installed resolver directory membership.");
    // The profile's actual selected host/runtime are pinned; unrelated older versions are recorded.
    const versions = names.map((name) => name.split(".").map(Number));
    const selected = parent === "host/fxr" ? versions : versions.filter((v) => v[0] === 8);
    selected.sort((a, b) => b[0]! - a[0]! || b[1]! - a[1]! || b[2]! - a[2]!);
    if (selected[0]?.join(".") !== (parent === "host/fxr" ? "10.0.12" : "8.0.32"))
      throw Error("Installed resolver selection changed; this Web profile must be reviewed again.");
    membership[parent] = names;
  }
  const fields = {
    policy: WEB_PROFILE_POLICY,
    executable: resolve(input.executable),
    packageRoot: resolve(input.packageRoot),
    systemRoot: resolve(input.systemRoot),
  };
  return webProfileRuntimeSchema.parse({
    ...fields,
    toolchainDigest: sha(commitments),
    resolverDigest: sha(membership),
    environmentDigest: sha(webProfileEnvironment(input.workspace, fields)),
    observedFiles: files,
    observedBytes: bytes,
  });
}
export async function revalidateWebProfileRuntime(
  workspace: string,
  expected: WebProfileRuntime,
  signal?: AbortSignal,
  deadline?: number,
) {
  const fresh = await captureWebProfileRuntime({ workspace, ...expected, signal, deadline });
  if (JSON.stringify(fresh) !== JSON.stringify(expected))
    throw Error("Web profile toolchain or effective environment changed.");
  return fresh;
}

/** Called only by the existing recipe handler after ordinary native permission. */
export async function ensureWebProfileState(workspace: string, binding: WebProfileRuntime) {
  const root = resolve(workspace);
  if (!same(await realpath(root), root) || (await lstat(root)).isSymbolicLink())
    throw Error("Workspace identity changed before profile execution.");
  const paths = [
    ".zcode",
    ".zcode/web-profile-v1",
    ...[
      "home",
      "home/AppData",
      "home/AppData/Roaming",
      "home/AppData/Local",
      "temp",
      "dotnet-home",
      "msbuild-user",
      "program-files",
      "program-data",
    ].map((p) => `.zcode/web-profile-v1/${p}`),
  ];
  for (const relative of paths) {
    const directory = join(root, relative);
    await mkdir(directory, { mode: 0o700 }).catch((e) => {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    });
    const stat = await lstat(directory);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      !same(await realpath(directory), resolve(directory))
    )
      throw Error("Unsafe profile state directory.");
  }
  return webProfileEnvironment(root, binding);
}
