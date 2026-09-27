# TASK_006 — Complete current-build genuine pass/fail and shared-harness regression

## Scope

TASK_005 accepted as a staged checkpoint (concurrent Chat, source-drift, manifest-wait
strengthening). U4 still incomplete: the genuine test pass/fail journey is BLOCKED for a
current-build rerun (SDK 8.0.425 not installed). TASK_006 closes that gap under a **narrow,
explicit** exception to the dependency-install ban, then runs the regression owed by TASK_005's
shared provider/native-driver changes. No U5/U6/Z8. No new node:test report wrapper, no new product
verification format.

Checkout: `main` @ `6f41ad53a1fef2a02af004cdfc89a5c5cf91a4dd` (unchanged baseline).

## Part 1 — Baseline (actual)

Confirm checkout, HEAD, working tree, toolchain, fixtures. `mise.toml` pins node 24.14.0 /
pnpm 10.33.2; actual shell has node 24.11.1, no `mise` on PATH, `pnpm` via `corepack`. Record the
discrepancy accurately; do not write "precise match". System .NET SDKs: 3.1.426 / 6.0.428 /
9.0.304 / 10.0.401 — **8.0.425 absent**. Preserve all existing modifications and failure evidence.

## Part 2 — Limited dependency-preparation authorization (narrow exception)

Install **only** .NET SDK 8.0.425 (the version the existing fixture hard-requires) into a
project-internal `.tmp/dotnet-toolchain/` dir, from the official Microsoft source.

- Prefer existing repo toolchain dirs / fixture cache first.
- Download via the official `dotnet-install` script from `https://dot.net/v1/dotnet-install.ps1`
  (official docs cited by the assignment).
- `-InstallDir .tmp/dotnet-toolchain/sdk-8.0.425 -Version 8.0.425 -Architecture x64 -NoPath` —
  no system PATH, no registry, no global SDK, no admin.
- Record download source, version, install-script SHA-256, and SDK version verification.
- Isolated CLI home, temp dir, package cache (`configureDotnetEnvironment` already sets
  `DOTNET_CLI_HOME`, `NUGET_PACKAGES`, etc.).
- No private NuGet config/credentials/private sources; the fixture's `NuGet.Config` is
  `<clear/>` (no package sources). No packages are installed.
- This is the **only** exception to the dependency ban; all other constraints hold.

## Part 3 — Connect the existing VSTest/TRX fixture (minimal harness-only)

The fixture invokes bare `dotnet` and selects 8.0.425 via `global.json` (`rollForward:"disable"`).
`configureDotnetEnvironment` (`z4-fixture.mjs`) is the single shared chokepoint for both the U2
native harness and the dotnet-fixture unit test. It does not point at a local SDK root.

Minimal additive change: when `PRE_Z8_DOTNET_ROOT` is set, set `DOTNET_ROOT` and prepend the local
SDK dir to `PATH` in the isolated env. When unset, behavior is identical. **Do not** delete the
`--version === 8.0.425` / `sdkPath basename === 8.0.425` assertions, **do not** relax `rollForward`,
**do not** silently swap to 9/10. The existing version assertions remain the targeted check that the
local SDK really is 8.0.425.

No production SDK detection, execution whitelist, or validation contract changes.

## Part 4 — Current-build genuine pass/fail verification

Entry points confirmed from source: `node scripts/graph-engineering/pre-z8-u2-native.mjs
--scenario=pass` and `--scenario=fail`. The U4 native spec explicitly anticipates this: "Extend the
genuine U2 proof helper with current-UI evidence-axis assertions … a small serial current-build
subset may cover … valid passing tests, genuine failed tests … the complete eight-scenario native
matrix remains the combined U6 regression." `verifyU2Result`/`verifyU2CurrentSummary`
(`pre-z8-u2-proof.mjs`) already assert the U4 evidence-axis projection via `assertU4Summary`
(`tests-passed` / `tests-failed` / `invalid`, per-check state, `human: not-required`) and genuine TRX
facts (`observeFixtureTrx`, `parserVersion: dotnet-vstest-trx-v1`, normalization receipts).

Two independent synthetic workspaces (each `createIsolation()` makes a fresh profile):

A. **Genuine pass** — real `dotnet build` + `dotnet test` (VSTest) on GOOD_SOURCE; fresh TRX;
   `tests-passed` from valid machine evidence (3 passed, 1 skipped); execution `Completed`;
   current invocation/source/build identity verified; UI shows execution/evidence/human separately.

B. **Genuine failure** — BAD_SOURCE (`MathOps.Add = left+right+1`); real failing assertions; fresh
   TRX; `tests-failed` (3 failed, exit 1); UI keeps `tests-failed`, not upgradable by agent text or
   human decision; `run.status = Failed`.

Distinguish: "fixture tests fail as expected" (acceptance PASS) vs "acceptance harness itself fails".
The tested project's test result is FAIL; the scenario's acceptance verdict is PASS. Invalid evidence
stays distinct from genuine failure (covered by U2 `zero`/`skipped`/`missing-required`/`source-drift`/
`build-drift`, not re-run here — full eight-scenario matrix is U6).

## Part 5 — Necessary regression and completion boundary

TASK_005 changed the shared provider (`pre-z8-u4-provider.mjs`) and native driver
(`pre-z8-u4-native.mjs`); TASK_006 changes `configureDotnetEnvironment` (`z4-fixture.mjs`).

- Run provider/proof/artifact/manifest/U2-fixture focus suites.
- Run `pre-z8-dotnet-fixture.test.mjs` (real VSTest, current SDK) — confirms the SDK + harness change.
- Final regression on affected default cancel/complete paths if deps changed (the
  `configureDotnetEnvironment` change is additive and guarded, so cancel/complete — which do not use
  dotnet — are unaffected; the TASK_005 16-test suite already passed).
- Run typecheck / lint / architecture / format (serial emitting checks via `corepack pnpm`).
- Local harness defects: minimal fix + targeted regression + rerun. No skipped assertions, swallowed
  exceptions, fixed sleeps, blind timeout extension.
- Production/contract defects: preserve evidence, read-only diagnosis, report, pause.

## Part 6 — Delivery

Write `TASK_006.md`, `TASK_006_REPORT.md`; update `EXECUTION_PLAN.md`. Concise; cite actual receipts;
do not copy historical reports. Report: toolchain source/version/isolation/integrity; actual scenarios/
build identity/commands/process results/TRX/UI evidence; this-execution vs historical vs FAIL/BLOCKED/
NOT RUN; whether all U4 automated checkpoints are satisfied. Only mark U4 complete when all required
checks have current-build evidence. Not human/paid-model/company-project/release acceptance.

## Constraints

No accessing existing credentials; no live paid models; no company projects. No reset/stage/commit/
push/publication. No U5/U6/Z8. No new node:test report wrapper, no new product verification format.
Per-scenario attempt evidence dirs; failures not overwritten.
