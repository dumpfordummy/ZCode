# graph-cloud-required: Linux PR gate and owner bootstrap (CLOUD-BOOTSTRAP-1)

Status: bootstrap proposal, awaiting owner review. Nothing here is enforced until the owner applies the settings in
[Owner bootstrap](#owner-bootstrap).

Scope: the development integration branch `claude/zcde-graph-ux-audit-be80d8` only. `main`, upstream, the Windows
release workflow (`.github/workflows/graph-windows-release.yml`) and every Z8.3 security proposal are out of scope.
Windows and manual acceptance remain deferred; this gate does not replace them.

## Product rules

1. A single stable check named `graph-cloud-required` is the only check the integration rule requires.
2. It passes only when every mandatory job succeeded: `typecheck`, `static-checks`, `graph-tests`. A mandatory job that
   is missing, failed, cancelled or skipped fails the gate. A job in `needs` that the gate does not list also fails it,
   so adding a job without classifying it cannot slip through.
3. `graph-tests` must record real counts (`ok`, `tests > 0`, `fail = 0`, `cancelled = 0`). The expected skip count per
   group is fixed in `scripts/ci/graph-cloud-suite.json`; any other skip count fails.
4. The workflow uses `pull_request` only, read-only `contents`, no secrets and no persisted credentials. It uses no
   third-party Actions, so there is nothing to SHA-pin (checkout is a plain `git fetch` of the merge commit, the
   toolchain is installed from the exact npm versions pinned by the repository). Any Action added later must be pinned
   to a verified full commit SHA and gets owner review.
5. No step uses `continue-on-error`. Later steps in a job use `if: !cancelled()` so all failures are reported, and each
   failing step still fails its job.

State owners: the workflow owns job results; `graph-cloud-gate.mjs` owns the verdict; `graph-cloud-suite.json` owns test
selection and exclusions; the repository owner owns the ruleset and the auto-merge opt-in. No bot or write-token
workflow takes part.

## What runs

Tested identity: the PR merge commit (`GITHUB_SHA`). `cloud-setup.sh` asserts the checkout is that commit and that
`HEAD^2` is the PR head, then records merge commit, PR head, integration tip (`HEAD^1`), tree, `pnpm-lock.yaml` sha256,
node, pnpm and runner image in the job summary.

Toolchain: Node and pnpm versions are read from `mise.toml` (24.14.0, 10.33.2) and cross-checked against
`package.json#packageManager`. Dependencies install from the repository root with
`pnpm install --frozen-lockfile --ignore-scripts`. **Native postinstall scripts (electron, node-pty, koffi, ...) do
not run, so native setup is incomplete by design**; nothing in the selected suite needs it.

| Job                    | Steps (serial)                                                                                     | Notes                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `typecheck`            | `pnpm typecheck`                                                                                   | the only emitting step; tsbuildinfo/dist are git-ignored |
| `static-checks`        | `pnpm lint`; `architecture-changed.mjs`; `format-changed.mjs`; `node --test scripts/ci/*.test.mjs` | lint warnings are the existing baseline, errors fail     |
| `graph-tests`          | `graph-cloud-suite.mjs`                                                                            | groups `scripts`, `services`, `ui`                       |
| `graph-cloud-required` | `graph-cloud-gate.mjs`                                                                             | `if: always()`; the required check                       |

- Architecture: `pnpm architecture:check --changed` only inspects the working tree against `HEAD`, which is empty in a clean
  CI checkout. `architecture-changed.mjs` runs the same checker scoped to `git diff HEAD^1 HEAD` (the PR's changes).
  The full-repository check is not mandatory because it fails on an existing violation at the integration tip
  (`packages/services/src/graph-engineering/app/sequencer.ts` is 403 lines, limit 400).
- Format: `format-changed.mjs` runs `oxfmt --check` (read-only) on changed files only and never formats the repository.
  Byte-preserved evidence and fixtures are excluded by path prefix: `docs/graph-engineering/z8/evidence/`,
  `docs/graph-engineering/evidence/`, `docs/graph-engineering/z8/fixtures/`. `.oxfmtrc.json` is unchanged.
- Tests (Node test runner, `--import tsx`, spec + TAP reporters; counts parsed from TAP):
  - `scripts`: `scripts/graph-engineering/*.test.mjs` minus the exclusions below.
  - `services`: `packages/services/src/graph-engineering/{app,adapters}`, `packages/services/src/{zcode-agent,git}`,
    `packages/services/test`, and the CLI protocol `interaction-registry.test.ts`. Expected skips: 4 (two Windows-only,
    two requiring `PRE_Z8_TRX_FIXTURE_MANIFEST`; all self-skip by design).
  - `ui`: `packages/ui/test/*.test.ts` with `TSX_TSCONFIG_PATH=packages/ui/tsconfig.json`.
  - Every tracked `*.test.*` file must be selected, excluded with a reason, or covered by `notSelected`; an
    unclassified or stale entry fails the suite.

Exact environment exclusions (all fail on Linux without a .NET SDK or Edge, verified by running them; none is
silenced, loosened or edited):

| File                                                         | Reason                               |
| ------------------------------------------------------------ | ------------------------------------ |
| `scripts/graph-engineering/pre-z8-dotnet-fixture.test.mjs`   | needs the .NET SDK (dotnet/vstest)   |
| `scripts/graph-engineering/pre-z8-u4-manifest-wait.test.mjs` | launches the Edge (`msedge`) channel |
| `scripts/graph-engineering/z4-fixture.test.mjs`              | spawns `dotnet`                      |
| `scripts/graph-engineering/z5-fixture.test.mjs`              | spawns `dotnet`                      |
| `scripts/graph-engineering/z6-fixture.test.mjs`              | spawns `dotnet` (2 of 3 tests)       |

## Acceptance scenarios

- A PR with all jobs green: `graph-cloud-required` succeeds.
- A failing, cancelled or skipped mandatory job, a missing job, an unclassified extra job, or recorded counts that are
  empty/failing: `graph-cloud-required` fails. Proven by `scripts/ci/graph-cloud-gate.test.mjs`, which runs the real gate
  script in a subprocess with synthetic `needs` input (run in `static-checks`, so a regression in the gate fails the PR).
- A new test file outside the classified directories, or an exclusion pointing at a missing file: the suite fails.

## Owner bootstrap

Claude does not apply these settings and does not arm auto-merge. The repository was observed read-only on
2026-10-01; verify each item in the GitHub UI because some settings are not readable from the Cloud session.

1. Merge this bootstrap PR manually after review (a rule and the check do not exist yet, and gate changes are never
   eligible for unattended merge). The workflow runs from the PR's merge commit, so the PR itself produces the first
   `graph-cloud-required` check run. The required-check source is the app shown on that run: expected
   **GitHub Actions** (app id 15368). Confirm it in the PR's check list before pinning it in the rule.
2. Settings > Rules > Rulesets. A disabled ruleset named `123` already targets this branch with only `deletion` and
   `non_fast_forward`; edit it or replace it rather than creating a duplicate. Final state:
   - Enforcement status: **Active**
   - Target: branches, include `refs/heads/claude/zcde-graph-ux-audit-be80d8` only (no `main`, no default branch)
   - Bypass list: **empty** (no roles, teams or apps)
   - Restrict deletions: on
   - Block force pushes: on
   - Require a pull request before merging: on. Required approvals: see note below. Do not enable "Require review from
     Code Owners" (no CODEOWNERS file exists).
   - Require status checks to pass: on; add `graph-cloud-required`, source **GitHub Actions**;
     **Require branches to be up to date before merging**: on
3. Settings > General > Pull Requests: **Allow auto-merge** must be on (observed `true`). Recommended: **Always suggest
   updating pull request branches** (observed `false`) so the up-to-date requirement is a one-click update.
4. Settings > Actions > General: workflow permissions "Read repository contents permission", and keep approval required
   for outside collaborators' runs. (Not readable from the Cloud session.)
5. Per-PR auto-merge opt-in, performed by the owner only: open the PR, choose **Enable auto-merge** and the merge
   method in the GitHub UI, or run `gh pr merge <number> --auto --merge` with the owner's own authentication. Disarm
   with **Disable auto-merge**. Auto-merge then completes only after `graph-cloud-required` passes on the up-to-date head.

Approvals note: with a single owner account the owner cannot approve their own PR, so "required approvals" greater than
0 would block every PR from that account. Set the number deliberately. A label, a comment, or any message from the same
account that opened the PR is **not** independent approval and the gate does not treat it as one.

Ineligible for unattended self-merge (owner review required, never arm auto-merge): changes to
`.github/workflows/**`, `.github/actions/**`, `scripts/ci/**`, `docs/graph-engineering/ci/**`, the test-selection manifest,
automation permissions, or the ruleset/settings above. Weakening any of these weakens the gate, because the gate's code
travels with the PR it checks; that is exactly why the owner reviews it.

## Known baseline

- `pnpm lint`: 75 warnings, 0 errors (exit 0) at the integration tip plus the probe cleanup; warnings do not fail CI.
- Full `pnpm architecture:check`: 1 existing violation (`sequencer.ts` 403 > 400 lines), unrelated to this task.
- Whole-repository `pnpm fmt:check` is intentionally not run (existing formatting drift; Windows release workflow
  already records it as a supplemental baseline).
- Windows, installer, native (.NET, Edge) and manual acceptance: deferred.
