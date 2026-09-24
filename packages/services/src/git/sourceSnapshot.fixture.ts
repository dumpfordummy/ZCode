import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import type { TestContext } from "node:test";
import { createFileService } from "../file/fileService.js";
import { getGitCommandEnv } from "./config.js";
import { createGitService } from "./gitService.js";
import { createGitCommandProvider } from "./providers/gitCommandProvider.js";

export async function sourceFixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "zcode-source-fixture-"));
  t.after(async () => {
    const owned = relative(tmpdir(), root);
    if (isAbsolute(owned) || !owned.startsWith("zcode-source-fixture-") || owned.includes(".."))
      throw new Error("Refusing cleanup outside the owned synthetic fixture.");
    await rm(root, { recursive: true, force: true });
  });
  const workspacePath = join(root, "workspace");
  const home = join(root, "home");
  await Promise.all([mkdir(workspacePath), mkdir(home)]);
  const globalConfig = join(home, "empty-git-config");
  await writeFile(globalConfig, "");
  const env = {
    ...getGitCommandEnv(),
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: home,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: globalConfig,
    GIT_TERMINAL_PROMPT: "0",
    GIT_AUTHOR_NAME: "Source Fixture",
    GIT_AUTHOR_EMAIL: "fixture@example.invalid",
    GIT_COMMITTER_NAME: "Source Fixture",
    GIT_COMMITTER_EMAIL: "fixture@example.invalid",
  };
  const commandProvider = createGitCommandProvider({
    environmentProvider: {
      resolveGitBinary: async () => "git",
      createCommandEnv: () => env,
    },
  });
  async function git(...args: string[]) {
    const result = await commandProvider.run({ cwd: workspacePath, args });
    if (result.exitCode !== 0) throw new Error(result.stderr);
    return result.stdout;
  }
  await git("init", "--quiet");
  await git("config", "core.autocrlf", "false");
  await git("config", "core.hooksPath", join(home, "no-hooks"));
  await git("config", "commit.gpgsign", "false");
  await writeFile(join(workspacePath, "tracked.txt"), "original\n");
  await git("add", "--", "tracked.txt");
  await git("commit", "--quiet", "-m", "synthetic initial fixture");
  const fileService = createFileService();
  const service = createGitService({ commandProvider, fileService });
  return { root, workspacePath, fileService, commandProvider, service, git };
}
