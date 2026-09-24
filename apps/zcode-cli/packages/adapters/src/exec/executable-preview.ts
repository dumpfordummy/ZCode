import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { delimiter, isAbsolute, resolve } from "node:path";
import { getWindowsEnvValue, windowsExecutableCandidates } from "./windows-executable.js";

/** Inspect native argv executable candidates without starting a process or shell. */
export async function previewExecutable(
  executable: string,
  options: { cwd: string; env: NodeJS.ProcessEnv; platform?: NodeJS.Platform },
): Promise<{ executable: string; status: "available" | "missing" | "unknown"; path?: string }> {
  const platform = options.platform ?? process.platform;
  const path = platform === "win32" ? getWindowsEnvValue(options.env, "PATH") : options.env.PATH;
  const explicit = isAbsolute(executable) || executable.includes("/") || executable.includes("\\");
  if (!explicit && path === undefined) return { executable, status: "unknown" };
  const candidates =
    platform === "win32"
      ? windowsExecutableCandidates(executable, options.env, options.cwd)
      : explicit
        ? [resolve(options.cwd, executable)]
        : (path ?? "")
            .split(delimiter)
            .map((entry) => resolve(options.cwd, entry || ".", executable));
  let uncertain = false;
  for (const candidate of candidates) {
    try {
      if (!(await stat(candidate)).isFile()) continue;
      await access(candidate, platform === "win32" ? constants.F_OK : constants.X_OK);
      return { executable, status: "available", path: resolve(options.cwd, candidate) };
    } catch (error) {
      if (!["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? ""))
        uncertain = true;
    }
  }
  return { executable, status: uncertain ? "unknown" : "missing" };
}
