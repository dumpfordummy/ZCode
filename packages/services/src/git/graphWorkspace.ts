import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, lstat, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { GitGraphBase, GitGraphWorkspace, GitGraphWorkspaceCommand } from "@zcode/shared";
import type { GitCommandProvider } from "./providers/gitCommandProvider.js";
import {
  assertGraphTreeHasNoLinks,
  graphOwnedPath,
  graphSourcePath,
  realGraphDirectory,
} from "./graphWorkspacePaths.js";

const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const credentialPath =
  /(^|\/)(\.env(?:\..*)?|\.npmrc|\.pypirc|credentials(?:\.json)?|id_(?:rsa|ed25519)|.*\.(?:pem|p12|pfx|key))$|(^|\/)\.(?:zcode|claude)\/(?:config\.json|settings\.local\.json)$/i;
export function createGitGraphWorkspaces(command: GitCommandProvider, directory?: string) {
  async function git(cwd: string, args: string[], controlled = false) {
    const result = await command.run({
      cwd,
      args: [
        "-c",
        "core.hooksPath=",
        "-c",
        "core.fsmonitor=false",
        "-c",
        "credential.helper=",
        "-c",
        "uploadpack.packObjectsHook=",
        ...args,
      ],
      maxOutputBytes: 4 * 1024 * 1024,
      timeoutMs: 120_000,
      env: controlled
        ? {
            GIT_CONFIG_GLOBAL: join(directory!, "empty-config"),
            GIT_CONFIG_NOSYSTEM: "1",
            GIT_TERMINAL_PROMPT: "0",
            GIT_LFS_SKIP_SMUDGE: "1",
          }
        : undefined,
    });
    if (result.exitCode !== 0 || result.outputTruncated || result.orphaned)
      throw new Error(`Native Git workspace operation failed: ${result.stderr.slice(0, 1000)}`);
    return result.stdout;
  }
  async function inspect(workspacePath: string): Promise<GitGraphBase> {
    const root = await realGraphDirectory(workspacePath);
    if (!(await lstat(join(root, ".git"))).isDirectory())
      throw new Error("Z7 requires a main repository with its own Git metadata.");
    if (resolve((await git(root, ["rev-parse", "--show-toplevel"])).trim()) !== root)
      throw new Error("Select the repository root for Fork/Join.");
    const head = (await git(root, ["rev-parse", "--verify", "HEAD"])).trim();
    if (!/^[a-f0-9]{40,64}$/.test(head)) throw new Error("A committed base is required.");
    const status = await git(root, [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
      "--ignore-submodules=none",
      "-z",
    ]);
    if (status)
      throw new Error("Fork/Join requires a clean reviewed base; no stash or reset is performed.");
    const index = await git(root, ["ls-files", "--stage", "-v", "-z"]);
    const trackedPaths = index
      .split("\0")
      .filter(Boolean)
      .map((line) => {
        const match = /^H (100644|100755) [a-f0-9]+ 0\t(.+)$/.exec(line);
        if (!match) throw new Error("Unsupported index, symlink, submodule or file mode in base.");
        const path = graphSourcePath(match[2]!);
        if (credentialPath.test(path))
          throw new Error(`Credential/local-configuration path cannot be cloned by Graph: ${path}`);
        return path;
      });
    if (!trackedPaths.length || trackedPaths.length > 20_000)
      throw new Error("Unsupported empty/oversized base manifest.");
    return {
      workspacePath: root,
      head,
      trackedPaths,
      digest: digest(JSON.stringify({ root, head, index })),
    };
  }
  async function owned(workspace: GitGraphWorkspace) {
    if (!directory) throw new Error("Graph workspace preparation is unavailable in this Host.");
    await realGraphDirectory(directory);
    const path = graphOwnedPath(directory, workspace.ownerId, workspace.slot);
    if (path !== workspace.workspacePath || path === workspace.base.workspacePath)
      throw new Error("Foreign owned workspace path.");
    const marker = JSON.parse(
      await readFile(join(directory, workspace.ownerId, `${workspace.slot}.owner.json`), "utf8"),
    ) as GitGraphWorkspace;
    // 持久化 schema 会重排 JSON 字段；按完整结构值比对，而不是把键顺序误当成所有权变化。
    if (!isDeepStrictEqual(marker, workspace) || marker.cleaned)
      throw new Error("Owned workspace marker mismatch or already cleaned.");
    await realGraphDirectory(join(directory, workspace.ownerId));
    await realGraphDirectory(path);
    if (
      !(await lstat(join(path, ".git"))).isDirectory() ||
      (await lstat(join(path, ".git"))).isSymbolicLink()
    )
      throw new Error("Owned Git metadata was replaced.");
    if ((await git(path, ["rev-parse", "HEAD"], true)).trim() !== workspace.base.head)
      throw new Error("A worker committed/switched away from the pinned base.");
    if (digest(await readFile(join(path, ".git", "config"))) !== workspace.configDigest)
      throw new Error("Owned Git configuration changed.");
    try {
      await lstat(join(path, ".git", "objects", "info", "alternates"));
      throw new Error("Shared Git object alternates are unsupported.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return path;
  }
  return {
    inspect,
    async execute(
      input: GitGraphWorkspaceCommand | { action: "cleanup"; workspace: GitGraphWorkspace },
    ): Promise<GitGraphWorkspace> {
      if (!["prepare", "validate", "cleanup"].includes(input.action))
        throw new Error("Unknown owned workspace action.");
      if (!directory) throw new Error("Graph workspace preparation is unavailable in this Host.");
      if (input.action !== "prepare") {
        const path = await owned(input.workspace);
        if (input.action === "validate") return input.workspace;
        await assertGraphTreeHasNoLinks(path);
        // 删除仅针对已核验的真实 app-owned 子目录；调用方还必须提供原生静止证明。
        await rm(path, { recursive: true, force: false });
        const result = { ...input.workspace, cleaned: true };
        await writeFile(
          join(directory, result.ownerId, `${result.slot}.owner.json`),
          JSON.stringify(result),
        );
        return result;
      }
      if (!/^[a-zA-Z0-9-]{1,100}$/.test(input.token)) throw new Error("Invalid ownership token.");
      const base = await inspect(input.base.workspacePath);
      if (!isDeepStrictEqual(base, input.base))
        throw new Error("Original base changed; review a new run.");
      await mkdir(directory, { recursive: true });
      await realGraphDirectory(directory);
      await mkdir(join(directory, "empty-template"), { recursive: true });
      await writeFile(join(directory, "empty-config"), "");
      const path = graphOwnedPath(directory, input.ownerId, input.slot);
      await mkdir(join(directory, input.ownerId), { recursive: true });
      await realGraphDirectory(join(directory, input.ownerId));
      const marker = join(directory, input.ownerId, `${input.slot}.owner.json`);
      await writeFile(marker, JSON.stringify({ ...input, phase: "preparing" }), { flag: "wx" });
      await git(
        directory,
        [
          "clone",
          "--no-local",
          "--no-hardlinks",
          "--no-checkout",
          "--depth=1",
          "--single-branch",
          "--no-tags",
          `--template=${join(directory, "empty-template")}`,
          "--",
          base.workspacePath,
          path,
        ],
        true,
      );
      await git(path, ["config", "core.autocrlf", "false"], true);
      await git(path, ["config", "core.hooksPath", join(directory, "empty-template")], true);
      await git(path, ["remote", "remove", "origin"], true);
      // 空模板不会创建 info 目录；显式创建后才写本地排除，保持原仓库模板/钩子未复制。
      await mkdir(join(path, ".git", "info"), { recursive: true });
      await writeFile(join(path, ".git", "info", "exclude"), "/.zcode/config.json\n", {
        flag: "a",
      });
      await git(path, ["checkout", "--detach", base.head], true);
      const configDigest = digest(await readFile(join(path, ".git", "config")));
      const workspace = {
        ownerId: input.ownerId,
        slot: input.slot,
        workspacePath: path,
        base,
        token: input.token,
        configDigest,
      };
      await writeFile(marker, JSON.stringify(workspace));
      await owned(workspace);
      if ((await inspect(base.workspacePath)).digest !== base.digest)
        throw new Error("Original source changed during preparation.");
      return workspace;
    },
  };
}
