# Publish ZCode Graph for Windows

Run from the repository root after reviewing and committing the intended release:

```powershell
pnpm graph:release --version 3.14.0-z2.1
```

The command pushes one annotated version tag to `dumpfordummy/ZCode`, waits for that exact tag/commit's Windows workflow, checks the published prerelease and required assets, and prints its GitHub Releases URL. The build runs on GitHub; this command does not build or launch the installed application on your PC. A successful run makes the installer visible in the repository's **Releases** section. The chosen version must be unused. Future Z2 releases can use `3.14.0-z2.2`, etc.; Z3 is not supported by this assignment.

## One-time setup

1. Use Git, Node **24.14.0**, pnpm **10.33.2**, and the [GitHub CLI](https://cli.github.com/). The source checkout can use the pinned toolchain described in [Z1_SETUP.md](Z1_SETUP.md). The publisher itself needs no extra npm dependencies.
2. Authenticate GitHub CLI yourself: `gh auth login --hostname github.com`. Your account must have push access to `dumpfordummy/ZCode`; normal Git pushes must also already work with your selected HTTPS/SSH transport. Do not put access tokens in source, a remote URL, command history or release notes. The publisher does not extract tokens or configure authentication.
3. In the fork's **Actions** page, ensure **ZCode Graph Windows prerelease** is enabled. Its workflow requests repository content-write permission for its ephemeral GitHub token. Repository/organization policy must permit the workflow and Git tag push. No separate release-token secret is required by this workflow.
4. Review and commit the intended Z2 code, release scripts, workflow and documentation together. Both origin fetch/push URLs must point to this fork. All uncommitted/untracked files block publication. Preserve unrelated work; use a separate clean release checkout if necessary. The command never runs `git add`, commits, stashes, merges or force-pushes.

For a read-only local preview, run:

```powershell
pnpm graph:release --version 3.14.0-z2.1 --dry-run
```

Dry-run checks local cleanliness, repository and commit/tag state, then prints the plan. It does **not** contact GitHub, read authentication, verify a remote version is free, run checks or publish. A dirty checkout is an expected refusal, not a failed release. `pnpm graph:release --help` is available without GitHub access.

## What happens on publish

1. Preflight validates canonical Z1/Z2 prerelease naming, the exact destination, clean committed HEAD, GitHub access, active workflow, and existing local/remote tag/release state.
2. It creates `graph-v<version>` at the captured commit and pushes only that tag, with no force or additional tags. Pushing the tag also transfers its committed source; it does not update `main` or another branch.
3. GitHub runs release/distribution tests, Graph service/adapter/UI regressions, root typecheck/lint and architecture checks. Supplemental CLI lint and full formatting diagnostics remain visible as known baseline exceptions, with logs in Actions artifacts. They do not masquerade as passing checks.
4. The existing Windows build creates the installer and SHA256 file. The detached packaged application must pass ordinary Chat, literal Z1, no-provider and Z2 sequential/interactions/recovery cases. These use actual native tools and controlled loopback responses in synthetic profiles. No paid/live provider task is run.
5. The workflow publishes an **unsigned prerelease**, with the exact versioned `.exe` and `SHA256SUMS.txt`. The command waits for successful CI and checks the non-draft prerelease plus nonempty required assets before reporting publication. Screenshots, summaries, failure logs and supplemental diagnostics remain in the Actions artifact.

The command uses the GitHub CLI's documented [run listing](https://cli.github.com/manual/gh_run_list) and [API requests](https://cli.github.com/manual/gh_api), correlating both tag and commit. It cannot turn unavailable manual checks into automated acceptance. See [PUBLISH_REPORT.md](PUBLISH_REPORT.md), [Z2_REPORT.md](Z2_REPORT.md), and each release's notes for actual evidence and NOT RUN checks.

## Waiting, interruption and failure

The default local wait is 80 minutes. To allow a longer Actions queue:

```powershell
pnpm graph:release --version 3.14.0-z2.1 --timeout-minutes 120
```

If the terminal disconnects, a push is rejected after the local tag is made, or the wait expires, inspect Actions and resume from the **same clean commit**:

```powershell
pnpm graph:release --version 3.14.0-z2.1 --resume
```

Resume pushes a matching local-only tag or observes an already-pushed matching tag. It never replaces a tag/release, reruns CI, edits release assets or rolls back remote work. A timeout does not cancel a remote build. Failed/cancelled CI remains a failure; inspect its linked logs. Fix source in a new reviewed commit and choose a new version. For an infrastructure-only transient failure, a maintainer can inspect and rerun the exact workflow in GitHub, then use resume to observe it. If the tag or HEAD points at different code, resume refuses.

The existing **Run workflow** button continues to build test artifacts only; it does not create a Release. This lets a maintainer test the installer before tagging. Running the publication command is the explicit instruction to tag/push and publish when CI passes.

## Other PCs and updates

Share the resulting GitHub Release URL. Users download the `.exe` and checksum file; they do not need Git or this script to install. GitHub normalizes the installer's filename from `ZCode Graph-<version>-win-x64.exe` to `ZCode.Graph-<version>-win-x64.exe`; the file bytes and hash remain the same.

Later releases retain the **ZCode Graph** application ID and private profile. Users download and run the newer installer; app auto-update remains disabled. Actual second-PC installation, upgrade/uninstall, code-signing reputation, and user-operated live-provider checks require separate evidence. This automation does not claim they have passed.
