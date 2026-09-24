import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import { parsePublishArgs, publishGraph } from "./publish-core.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const help = `Publish the committed ZCode Graph Windows prerelease through GitHub Actions.

Usage: pnpm graph:release --version 3.14.0-z7.1 [--dry-run] [--resume]
       pnpm graph:release --version 3.14.0-z7.1 --timeout-minutes 100

Requires a clean checkout, Git, and an authenticated GitHub CLI (gh) with
write access to dumpfordummy/ZCode. Build tools run on GitHub's Windows runner.
--dry-run is offline and read-only. --resume never replaces existing tags.
This command does not stage, commit, merge, configure authentication or update apps.
Documentation: docs/graph-engineering/PUBLISH.md`;

if (process.argv.includes("--help")) {
  process.stdout.write(`${help}\n`);
} else {
  try {
    const options = parsePublishArgs(process.argv.slice(2));
    await publishGraph(options, {
      now: Date.now,
      sleep,
      log: (message) => process.stdout.write(`${message}\n`),
      exec: async (command, args) => {
        try {
          const { stdout } = await promisify(execFile)(command, args, {
            cwd: root,
            windowsHide: true,
            encoding: "utf8",
            timeout: 120000,
            maxBuffer: 4 * 1024 * 1024,
            env: {
              ...process.env,
              GIT_OPTIONAL_LOCKS: "0",
              GIT_TERMINAL_PROMPT: "0",
              GH_PROMPT_DISABLED: "1",
            },
          });
          return stdout;
        } catch (error) {
          if (error.code === "ENOENT")
            throw new Error(
              `${command} is not on PATH. Install it before publishing; see docs/graph-engineering/PUBLISH.md.`,
            );
          throw error;
        }
      },
    });
  } catch (error) {
    process.stderr.write(
      `Graph publish failed: ${error.message}\nNo automatic rollback or retry was performed. If a tag was already created/pushed, inspect Actions and use --resume for the same committed version.\n`,
    );
    process.exitCode = 1;
  }
}
