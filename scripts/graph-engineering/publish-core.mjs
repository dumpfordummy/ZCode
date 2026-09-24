import { resolveGraphDistributionVersion } from "../../packages/desktop/scripts/desktop-product-identity.mjs";

export const repository = "dumpfordummy/ZCode";
export const workflow = "graph-windows-release.yml";

export function parsePublishArgs(args) {
  const options = { dryRun: false, resume: false, timeoutMinutes: 80 };
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (seen.has(arg)) throw new Error(`Duplicate option: ${arg}`);
    seen.add(arg);
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--resume") options.resume = true;
    else if (arg === "--version") options.version = args[++index];
    else if (arg === "--timeout-minutes") options.timeoutMinutes = Number(args[++index]);
    else throw new Error(`Unknown option: ${arg}`);
  }
  resolveGraphDistributionVersion(
    { ZCODE_GRAPH_DISTRIBUTION: "1", ZCODE_GRAPH_VERSION: options.version },
    "",
  );
  if (
    !Number.isInteger(options.timeoutMinutes) ||
    options.timeoutMinutes < 1 ||
    options.timeoutMinutes > 180
  )
    throw new Error("--timeout-minutes must be an integer between 1 and 180.");
  return options;
}

export function repositoryFromUrl(value) {
  const match =
    /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w-]+\/[\w.-]+?)(?:\.git)?\/?$/i.exec(
      value,
    );
  if (!match)
    throw new Error("origin must be a GitHub HTTPS or SSH URL without embedded credentials.");
  return match[1];
}

export async function inspectLocalRelease(exec, tag) {
  const status = await exec("git", ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status.trim())
    throw new Error(
      "The worktree has uncommitted or untracked files. Review and commit the intended release first; this command never stages or commits.",
    );
  for (const args of [
    ["remote", "get-url", "--all", "origin"],
    ["remote", "get-url", "--push", "--all", "origin"],
  ]) {
    const destinations = (await exec("git", args)).trim().split(/\r?\n/);
    if (
      destinations.length !== 1 ||
      repositoryFromUrl(destinations[0]).toLowerCase() !== repository.toLowerCase()
    )
      throw new Error(`origin must have one fetch and one push destination, both ${repository}.`);
  }
  const commit = (await exec("git", ["rev-parse", "HEAD^{commit}"])).trim();
  if (!/^[a-f0-9]{40,64}$/.test(commit)) throw new Error("HEAD did not resolve to a commit.");
  const localTag = (await exec("git", ["tag", "--list", tag])).trim();
  const localCommit = localTag
    ? (await exec("git", ["rev-parse", `refs/tags/${tag}^{commit}`])).trim()
    : undefined;
  return { commit, localCommit };
}

async function remoteCommit(exec, tag) {
  const ref = `refs/tags/${tag}`;
  const lines = (await exec("git", ["ls-remote", "--tags", "origin", ref, `${ref}^{}`])).trim();
  const refs = new Map(
    lines
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [sha, name] = line.split(/\s+/);
        if (!/^[a-f0-9]{40,64}$/.test(sha) || ![ref, `${ref}^{}`].includes(name))
          throw new Error("Unexpected remote tag response.");
        return [name, sha];
      }),
  );
  return refs.get(`${ref}^{}`) ?? refs.get(ref);
}

async function getRelease(exec, tag, allowMissing = false) {
  try {
    return JSON.parse(
      await exec("gh", [
        "api",
        "--hostname",
        "github.com",
        `repos/${repository}/releases/tags/${tag}`,
      ]),
    );
  } catch (error) {
    if (allowMissing && /HTTP 404/.test(error.stderr ?? "")) return undefined;
    throw error;
  }
}

function validateRelease(release, tag, version) {
  const url = `https://github.com/${repository}/releases/tag/${tag}`;
  if (
    release.tag_name !== tag ||
    release.draft !== false ||
    release.prerelease !== true ||
    release.html_url !== url
  )
    throw new Error("Release metadata does not describe the expected published prerelease.");
  for (const names of [
    [`ZCode.Graph-${version}-win-x64.exe`, `ZCode Graph-${version}-win-x64.exe`],
    ["SHA256SUMS.txt"],
  ]) {
    const assets = release.assets?.filter((asset) => names.includes(asset.name)) ?? [];
    if (assets.length !== 1 || !(assets[0].size > 0))
      throw new Error(`Release is missing a unique nonempty asset: ${names[0]}`);
  }
  return url;
}

async function waitForRelease(options, commit, tag, deps) {
  const deadline = deps.now() + options.timeoutMinutes * 60000;
  let previous;
  while (deps.now() < deadline) {
    const runs = JSON.parse(
      await deps.exec("gh", [
        "run",
        "list",
        "--repo",
        `github.com/${repository}`,
        "--workflow",
        workflow,
        "--branch",
        tag,
        "--commit",
        commit,
        "--event",
        "push",
        "--limit",
        "100",
        "--json",
        "databaseId,headSha,headBranch,event,status,conclusion,url",
      ]),
    );
    // 原因：同一个提交可有多个 tag 或手动构建；不能把别的绿色运行当成本次发布成功。
    const matching = runs.filter(
      (run) => run.headSha === commit && run.headBranch === tag && run.event === "push",
    );
    if (matching.length > 1)
      throw new Error("Found multiple matching workflow runs; inspect Actions before resuming.");
    const run = matching[0];
    const message = run
      ? `Workflow ${run.status}${run.conclusion ? ` (${run.conclusion})` : ""}: ${run.url}`
      : `Waiting for GitHub to schedule ${tag}...`;
    if (message !== previous) deps.log(message);
    previous = message;
    if (run?.status === "completed") {
      if (run.conclusion !== "success") throw new Error(message);
      const url = validateRelease(await getRelease(deps.exec, tag), tag, options.version);
      deps.log(`Published ZCode Graph ${options.version}\n${url}`);
      return { url, commit, tag, runId: run.databaseId };
    }
    await deps.sleep(15000);
  }
  throw new Error(
    `Timed out waiting for ${tag}. The remote job was not cancelled. Inspect https://github.com/${repository}/actions and use --resume after checking its state.`,
  );
}

export async function publishGraph(options, deps) {
  const tag = `graph-v${options.version}`;
  const { commit, localCommit } = await inspectLocalRelease(deps.exec, tag);
  if (localCommit && !options.resume)
    throw new Error(`Local tag ${tag} already exists. Use --resume only for this same commit.`);
  if (localCommit && localCommit !== commit)
    throw new Error("Local tag belongs to a different commit; refusing to retag.");
  deps.log(`${options.dryRun ? "DRY RUN: " : ""}${repository}\nCommit: ${commit}\nTag: ${tag}`);
  if (options.dryRun) {
    deps.log(
      "Local checks passed. No network, tag or push performed; remote availability/authentication and CI are not verified.",
    );
    return { commit, tag, dryRun: true };
  }
  await deps.exec("gh", ["--version"]);
  const info = JSON.parse(
    await deps.exec("gh", ["api", "--hostname", "github.com", `repos/${repository}`]),
  );
  if (info.archived || !info.permissions?.push)
    throw new Error(`GitHub write access to ${repository} is required.`);
  const config = JSON.parse(
    await deps.exec("gh", [
      "api",
      "--hostname",
      "github.com",
      `repos/${repository}/actions/workflows/${workflow}`,
    ]),
  );
  if (config.state !== "active")
    throw new Error("The Graph Windows workflow must be active in GitHub Actions.");
  const remote = await remoteCommit(deps.exec, tag);
  const existing = await getRelease(deps.exec, tag, true);
  if (!options.resume && (remote || existing))
    throw new Error(
      `Remote tag/release ${tag} already exists. Use a new version, or --resume for the same commit.`,
    );
  if (remote && remote !== commit)
    throw new Error("Remote tag belongs to a different commit; refusing to replace it.");
  if (options.resume && !remote && !localCommit)
    throw new Error("--resume requires an existing tag at this commit.");
  if (existing && !remote)
    throw new Error(
      "A release exists without its remote tag; inspect it manually before publishing.",
    );
  if (!remote) {
    const current = await inspectLocalRelease(deps.exec, tag);
    if (current.commit !== commit || current.localCommit !== localCommit)
      throw new Error("Local commit/tag changed during preflight; run the command again.");
    if (!localCommit)
      await deps.exec("git", [
        "tag",
        "-a",
        tag,
        commit,
        "-m",
        `ZCode Graph ${options.version} prerelease`,
      ]);
    // 只推送已捕获的 tag；禁用 followTags，防止用户配置连带发布其他本地 tag。
    await deps.exec("git", [
      "push",
      "--no-follow-tags",
      "origin",
      `refs/tags/${tag}:refs/tags/${tag}`,
    ]);
    if ((await remoteCommit(deps.exec, tag)) !== commit)
      throw new Error(
        "Pushed tag could not be verified at the captured commit. Inspect the remote before --resume.",
      );
  }
  return waitForRelease(options, commit, tag, deps);
}
