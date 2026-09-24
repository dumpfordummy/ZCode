# ZCode Graph on another Windows PC

ZCode Graph is this fork's Windows x64 distribution of native Graph Engineering. Z1 supports Start → Agent Task → End; Z2 adds editable sequential tasks, explicit bindings and a fresh native session per node. It bundles the existing Electron application, ZCode agent runtime and native search tools. The installer does not contain model credentials, test workspaces, development profiles, or a second agent engine.

## Install and use

1. Open [this fork's Releases](https://github.com/dumpfordummy/ZCode/releases), choose the intended version and download its Windows x64 `.exe` plus `SHA256SUMS.txt`. The existing [Z1 1.2 prerelease](https://github.com/dumpfordummy/ZCode/releases/tag/graph-v3.14.0-z1.2) does not include Z2; these source instructions do not establish that a Z2 release has been published.
2. In PowerShell, run `Get-FileHash -Algorithm SHA256 '.\ZCode.Graph-3.14.0-z1.2-win-x64.exe'` (substitute the downloaded version) and compare its hash with `SHA256SUMS.txt`. GitHub normalizes the space in the original build filename to a dot; the checksum file's original filename contains a space, but the hash applies to the downloaded `.exe`.
3. Run the installer and launch **ZCode Graph**. This prerelease is unsigned; Windows may show an unknown-publisher warning. Verify the source and checksum before choosing to run it. Code-signing/SmartScreen reputation is not certified.
4. Use **Use API key** and configure your own supported provider/model through ordinary ZCode settings. No account or model balance is included. Account OAuth callbacks using the shared `zcode:` URL protocol are outside this distribution's acceptance scope.
5. Open a local test workspace. Select a model in ordinary Chat, then open **Graph Engineering** in the workspace sidebar. Set the graph/task name and instructions, **Save**, then **Run**.
6. Use **Open conversation** to approve native tool requests or answer questions. It opens the attempt's existing session. Return to Graph to see its native completion/cancellation state.

Git cloning is unnecessary for installation. The application includes the Node runtime used by its agent; it does not bundle all tools your projects need. Install Git for repository operations, and any compiler, Node/Python SDK, package manager or other tool your task invokes. Windows shell selection follows existing ZCode behavior (including Git Bash detection); this is not a promise that every project can build on a bare Windows installation.

Profiles are private to this distribution: `%USERPROFILE%\.zcode-graph-engineering\` using the original Windows home. Business configuration and sessions live under `home\.zcode`; Electron data is under `electron`. The app and its child tools receive this private HOME/USERPROFILE and APPDATA/LOCALAPPDATA, so existing per-user tool configuration may need to be configured again for Graph. PATH and explicitly selected workspace paths are preserved. Nothing is copied from an installed ZCode/Codex profile. Graph does not register the upstream `zcode:` URI or overwrite ZCode's Explorer menu. Upstream automatic and manual updates are disabled; install a newer Graph release explicitly.

## Clone and build instead

Use Windows x64, Git, Node **24.14.0**, and pnpm **10.33.2**. Run these PowerShell commands in a directory you own:

```powershell
git clone https://github.com/dumpfordummy/ZCode.git
Set-Location ZCode
$env:HUSKY = '0'
$env:PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN = 'false'
pnpm install --frozen-lockfile --ignore-scripts
node node_modules/electron/install.js
node --test scripts/graph-engineering/distribution.test.mjs
pnpm typecheck
pnpm lint
pnpm architecture:check --changed
node scripts/graph-engineering/build-windows.mjs 3.14.0-z2.1
node scripts/graph-engineering/packaged-smoke.mjs 3.14.0-z2.1
```

Stop if a command fails. Packaging downloads public native/runtime assets. Output is `packages/desktop/dist-graph/`: the NSIS `.exe`, checksum file, and `win-unpacked/`. To run unpacked, keep the **entire** `win-unpacked` directory together and launch `ZCode Graph.exe`; copying that single executable is insufficient. `git pull --ff-only` updates source, after which dependencies and the build must be refreshed; Git does not install an executable automatically. Do not run typecheck concurrently with packaging because its emitted Host output shares the build directory.

The repeatable CI workflow is `.github/workflows/graph-windows-release.yml`. After reviewing and committing the intended release, `pnpm graph:release --version 3.14.0-z2.1` pushes its version tag, waits for the checked build, and prints the confirmed Release URL. See [PUBLISH.md](PUBLISH.md) for prerequisites, offline dry-run and explicit resume. A manual workflow run produces downloadable Actions artifacts without creating a Release. Release tags are immutable. Binaries, caches and private test profiles are ignored by Git.

## No-cost automated acceptance

`packaged-smoke.mjs <version>` copies the complete packaged app to a fresh OS temporary directory outside this repository, launches its real entry point without the development bootstrap, and uses fresh synthetic workspaces/homes. Its Z2 matrix covers sequential native sessions, explicit bindings, frozen settings, exact-session navigation, real Read/Edit/Bash execution, questions, cancellation and completed/interrupted restarts; it retains literal Z1, ordinary Chat and no-provider regression cases. A labelled persistence-failure scenario covers inactive-only release. The model responses come from loopback fixtures; agent tools and persistence are real. No live provider or paid task is used. Screenshots, summaries and logs are copied to `dist-graph/smoke-evidence/`. A configured gate is not evidence it has already passed: see [PUBLISH_REPORT.md](PUBLISH_REPORT.md).

For a manual functional check on another PC, create a new empty folder with `fixture.txt` containing `before`. Configure your own provider, open that folder, then run a graph with instructions: **Read fixture.txt and replace its entire content with after. Work only in this folder.** Approve the native edit in Open conversation; verify the actual file, return to Graph and check completion, then restart the app and verify the saved attempt/session remains. A real-provider check can incur that provider's costs; none was run during implementation. For the more extensive isolated development checks, see [Z1_SETUP.md](Z1_SETUP.md).

See [WINDOWS_DISTRIBUTION_REPORT.md](WINDOWS_DISTRIBUTION_REPORT.md) for historical Z1 packaging evidence, [Z2_MANUAL_CHECK.md](Z2_MANUAL_CHECK.md) for the Z2 user-operated recipe, and [PUBLISH_REPORT.md](PUBLISH_REPORT.md) for publishing changes and checks marked NOT RUN. A successful packaged smoke is not a clean-VM installer test.
