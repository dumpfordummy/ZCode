// Render the recorded integration without switching or changing the user's checkout.
// Same fixture Host and current scenario driver; only UI source comes from the base commit.
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { repoRoot } from "./browser-harness-common.mjs";

export const U1_BASE = "1df2770c9d01e66df627d752a5b1fc6df92e3a96";
const exec = promisify(execFile);
export async function baselineSource() {
  const root = path.join(repoRoot, ".tmp", "u1-baseline");
  const scratch = path.join(root, "packages/ui/src");
  await fs.mkdir(path.dirname(scratch), { recursive: true });
  for (const folder of ["node_modules", "packages/ui/node_modules"]) {
    const link = path.join(root, folder);
    try {
      await fs.symlink(
        path.join(repoRoot, folder),
        link,
        process.platform === "win32" ? "junction" : "dir",
      );
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  await fs.cp(path.join(repoRoot, "packages/ui/src"), scratch, { recursive: true });
  const { stdout } = await exec("git", ["diff", "--name-only", U1_BASE, "--", "packages/ui/src"], {
    cwd: repoRoot,
  });
  for (const file of stdout.trim().split(/\r?\n/).filter(Boolean)) {
    // A file introduced by this candidate has no original; it is not imported by the baseline.
    try {
      const { stdout: content } = await exec("git", ["show", `${U1_BASE}:${file}`], {
        cwd: repoRoot,
        encoding: "buffer",
        maxBuffer: 8 * 1024 * 1024,
      });
      const target = path.join(scratch, path.relative("packages/ui/src", file));
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content);
    } catch (error) {
      if (!String(error.stderr).includes("does not exist")) throw error;
    }
  }
  return scratch;
}
