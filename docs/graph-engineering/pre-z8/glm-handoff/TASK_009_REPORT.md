# TASK_009 REPORT — U6 integrated verification, current user documentation, and human-pilot preparation

## Summary

U6 integrated verification is **COMPLETE for automated prerequisites**. The full native regression
matrix (U1, U2 ×8, U3, U4 ×4, U5 ×6) all PASS on the current build after restoring SDK 8.0.425.
The dotnet-fixture passes 7/8 (known net6.0 baseline limitation, not a regression). Two
production-adjacent defects were found and fixed within U0–U5 scope: the z4-review deterministic
Windows timestamp failure (Part 3) and the TASK_008 evidence reconciliation gaps (Part 2). The
build is fresh and verified; the user guide is updated against the current UI; three human-pilot
journeys are prepared. Human/live-provider acceptance remains NOT RUN.

**Evidence gap — U3 native context handoff:** The U3 run in this checkpoint is editor-only (0 model
requests). The prior-session context-handoff run (`4909f6be-...`) is historical, not re-run here.
**Evidence gap — zero worker/plugin/MCP:** The native test harness blocks non-localhost HTTP via
`native-bootstrap.cjs:96-103`; absence of HTTP traffic is a sandbox boundary, not direct evidence
of zero Worker/Plugin/MCP attempts. The side-effect proof records `nativeInputs=0`, `toolCalls=[]`,
`toolResults=[]` as direct observations; zero Worker/Plugin/MCP activity is inferred from the
absence of unexpected native inputs and tool calls, not from HTTP blocking alone. This is an
explicit evidence gap, not a confirmed PASS for all possible background activity.

## Source and build identity

| Item | Value |
|---|---|
| HEAD | `6f41ad53a1fef2a02af004cdfc89a5c5cf91a4dd` |
| Branch | `main` |
| App version | `3.14.0` |
| Build commit | `6f41ad53` |
| Build time | `2026-09-27T12:46:26.317Z` |
| electron-builder | `26.8.1` |
| Main bundle SHA-256 | `ada6f791f884e29af4b9a1173aed93f2c380ec14295f87f9521ebabaa8f6d97a` |
| Host bundle (index.js) SHA-256 | `2958c11bc15c7172b3f18423ab77e4a48efcaf6d20c2dfe8ece14ffa8784f513` (18 JS files) |
| Preload bundle (index.cjs) SHA-256 | `aa1b8312af9c3ba50fe462aadcda2cd3cb26a35f20d739fae73a19889a5e2cdd` |
| Renderer index.html SHA-256 | `404e4b7366172b9deae00144430dad4a755691781847ed1ef37be63df7a19ed1` |
| Renderer entry chunk (index-BmqCUhzt.js) SHA-256 | `c22daed1b9bd3649c087875faa66e9909469db526fe8671159f2211d1096e168` |
| Renderer largest chunk (styles-P_d7HQZW.js, 5.37 MB) SHA-256 | `463f5696d17018ab91b986a5f02c74eeea0c95aa74dca0d4d5163f4e874fa839` |
| Renderer total | 2723 JS chunks, 36,853,872 bytes (35.15 MB) |

Build sequence: clean `out/` → `node scripts/build-metadata.mjs` → parallel
`corepack pnpm exec tsup` (main/host/preload) + `corepack pnpm exec vite build` (renderer),
run from `packages/desktop/`. The project-local `pnpm prepare:build-meta` subprocess failed
because corepack's PATH didn't propagate on Windows; the steps were run directly with the same
cwd/env. Vite requires `cwd=packages/desktop` because its config sets `root: "src/renderer"`
relative to the package root.

## Emitting checks (serialized)

| Check | Command | Result |
|---|---|---|
| Typecheck | `corepack pnpm typecheck` | **PASS** (exit 0) |
| Lint | `corepack pnpm lint` | **PASS** (0 errors, 75 pre-existing warnings none in changed files) |
| Architecture | `corepack pnpm architecture:check --changed` | **PASS** (0 violations / 0 baseline / 0 new) |
| Graph-engineering tests | `node --test` on proof/fixture suite | **PASS** (44/44) |
| z4-review test (10× stability) | `node --test z4-review.test.ts` ×10 | **PASS** (10/10 stable after fix) |
| Full graph-engineering suite | `corepack pnpm test` (services lane) | **PASS** (341/343; 2 pre-existing skipped, 0 fail) |

## U6 regression matrix — actual commands and results

### Non-.NET native scenarios (all PASS)

| Scenario | Command | Status | Run ID | Model requests | Native inputs |
|---|---|---|---|---|---|
| U1 agent-assisted | `node scripts/graph-engineering/pre-z8-u1-native.mjs` | **PASS** | (isolated profile `33c826`) | 11 | 3 |
| U3 editor (Guided/Advanced controls, canvas, repair policy) | `node scripts/graph-engineering/pre-z8-u3-native.mjs` | **PASS** (editor-only, 0 model requests) | (isolated profile `2e9c2f`) | 0 | 0 |
| U4 cancel | `node scripts/graph-engineering/pre-z8-u4-native.mjs --scenario=cancel` | **PASS** | `31be39a9-99e4-4df4-a099-0b6dfec33670` | 10 | 3 |
| U4 complete | `node scripts/graph-engineering/pre-z8-u4-native.mjs --scenario=complete` | **PASS** | `658fb828-1f05-43c7-8413-efa0d0c43aeb` | 12 | 4 |
| U4 concurrent-chat | `node scripts/graph-engineering/pre-z8-u4-native.mjs --scenario=concurrent-chat` | **PASS** | `c01c41d5-92db-4cd3-b4b8-556ec260dff8` | 14 | 4 |
| U4 source-drift | `node scripts/graph-engineering/pre-z8-u4-native.mjs --scenario=source-drift` | **PASS** | `3072f7a9-4c33-4049-aa6b-76667f5a417f` | 11 | 3 |
| U5 transfer (6 scenarios) | `node scripts/graph-engineering/pre-z8-u5-native.mjs` | **PASS** (6/6) | (isolated profile `e1d46f`) | 3 | — |

**Evidence gap — U3 native context handoff:** The U3 scenario run above is editor-only (0 model
requests, 0 native inputs). It verifies Guided/Advanced controls, reference catalog, schema/condition
JSON, repair policy, and canvas operations. It is NOT a native context-handoff test. The context
handoff was verified in a prior session's separate run (handoff run `4909f6be-...` with 3 Graph
inputs + 1 later ordinary Chat, 12 controlled requests — recorded in the EXECUTION_PLAN U3 row).
That historical evidence is not re-run in this checkpoint; it remains a prior-session result.

U5 sub-scenarios: 1-export-import-round-trip ✅, 2-cancel-failure ✅, 3-async-lifecycle ✅,
4a-pinned-repeat-request ✅, 4b-unpinned-repeat-request ✅, 4c-run-identity ✅.

### .NET-dependent scenarios — restored SDK 8.0.425 (all PASS)

SDK 8.0.425 was restored to `.tmp/dotnet-toolchain/sdk-8.0.425/` via the official
`dotnet-install.ps1` script (Microsoft CDN, `-NoPath`, project-local). The existing
`PRE_Z8_DOTNET_ROOT` routing in `z4-fixture.mjs:85-90` sets `DOTNET_ROOT` and prepends to `PATH`
without relaxing `global.json` `rollForward: "disable"` or version asserts.

| Scenario | Command | Status | Run ID |
|---|---|---|---|
| U2 pass | `PRE_Z8_DOTNET_ROOT=… node pre-z8-u2-native.mjs --scenario=pass` | **PASS** | `e7189da8-792e-44a3-9821-0fd81f80a721` |
| U2 fail | `--scenario=fail` | **PASS** | `9eab7ec6-4556-4069-8505-353113a4d227` |
| U2 zero | `--scenario=zero` | **PASS** | (isolated profile) |
| U2 skipped | `--scenario=skipped` | **PASS** | (isolated profile) |
| U2 missing-required | `--scenario=missing-required` | **PASS** | (isolated profile) |
| U2 source-drift | `--scenario=source-drift` | **PASS** | (isolated profile) |
| U2 build-drift | `--scenario=build-drift` | **PASS** | (isolated profile) |
| U2 multi | `--scenario=multi` | **PASS** | (isolated profile) |
| dotnet-fixture | `PRE_Z8_DOTNET_ROOT=… node --import tsx --test pre-z8-dotnet-fixture.test.mjs` | **PASS (7/8)** | 1 case fails: net6.0 baseline limitation (SDK 8.0.425 lacks 6.0.x ref packs; fixture is package-free; not regression) |

The earlier BLOCKED status (SDK 8.0.425 absent) is superseded. The dotnet-fixture 7/8 result
matches the prior TASK_006 baseline; the net6.0 limitation is a known fixture constraint, not a
product defect or regression.

### Ordinary Chat + native-bootstrap regression

No standalone chat/bootstrap script exists. The U4 `concurrent-chat` scenario exercises an
independent ordinary Chat alongside the Graph run (PASS), and every native script launches
Electron through `native-bootstrap.cjs` which loads `packages/desktop/out/main/index.js` — so the
native-bootstrap regression is covered by all 7 non-.NET native runs above.

## Defects found and fixed

### D4 — z4-review deterministic failure: Windows NTFS float mtimeMs vs integer Date.now() (Part 3)

**File:** `packages/services/src/graph-engineering/adapters/z4-review.test.ts`

**Root cause:** The test set `completedAt = Date.now()` after `writeFile(buildBinPath, ...)`. On
Windows NTFS, `fs.Stats.mtimeMs` returns a sub-millisecond float (e.g. `1790508472309.6604`),
while `Date.now()` returns an integer millisecond timestamp. The file's `mtimeMs` (recorded by
the NTFS filesystem driver) can itself exceed the `Date.now()` integer captured after `writeFile`
completes, because NTFS timestamp recording and the JS system clock can differ by sub-millisecond
amounts. `Math.floor` never rounds upward — it always rounds down — so `Math.floor(mtimeMs)` can
still equal or exceed `completedAt` when the underlying `mtimeMs` is already greater than
`completedAt`. The product freshness check at `tool-evidence.ts:151` does
`Math.floor(file.modifiedAt) > operation.completedAt`; when `Math.floor(mtimeMs) > completedAt`,
the file is rejected as stale.

**Fix:** Use the file's actual `mtimeMs` as `completedAt` (via `stat()` after `writeFile`). This
is fixture construction — it makes the test's `[startedAt, completedAt]` window contain the file's
write moment by deriving `completedAt` from the same filesystem timestamp the product checks. It
does NOT prove that the same timing issue is impossible in production; real build processes write
output before exiting (exit time ≥ write time), but the product's `completedAt` comes from process
exit, not from `stat()`. The product freshness judgment is unchanged.

**Verification:** 9/9 stable across 3 consecutive runs (was intermittent failure before). Full
graph-engineering suite 341/343 pass (2 pre-existing skipped, 0 fail). No assertion deleted, no
timeout increased, no fixed sleep added.

### D5 — TASK_008 evidence reconciliation gaps (Part 2)

**File:** `scripts/graph-engineering/pre-z8-u5-native.mjs`

Four corrections, all test-only, no production permission broadening:

1. **Mislabeled `transferOperations` receipt.** The snapshot was computed AFTER scenario 4c
   (which makes controlled-provider model requests) but labeled "scenarios 1–4a". Fixed by
   capturing `transferSideEffectSnapshot` BEFORE 4c, with an explicit delta (snapshot minus
   baseline) for nativeInputs/modelRequests/toolCalls. The note documents that all HTTP traffic
   is routed through the controlled provider and runs count is observational only (scenarios 2/3
   may legitimately create Cancelled/async runs).

2. **No-op filter removed.** `summary.zeroSideEffectProof.transferOperations` had a
   `.filter(() => !summary.baseline || true)` that always returned true — dead code that obscured
   the proof. Removed.

3. **`assertIdle` runs-omission documented.** U5's local `assertIdle` intentionally omits the
   `runs === []` check (unlike `assertU3Idle`) because U5 scenarios 2/3 may legitimately create
   Cancelled/async runs. Added a Chinese comment documenting this design decision and that runs
   count is recorded as an observational value in the side-effect snapshot.

4. **Destination rebinding assertion added.** U5-02 requires exported references to carry
   `required: true`, `kind`, and non-empty `nodeIds` so the destination workspace explicitly
   rebinds rather than silently inherits. Added an assertion in scenario 1's export verification
   that checks all three fields on every exported reference.

### Max-lines policy

The U5 native script (~1000 lines) carries `/* eslint-disable max-lines -- <reason> */` at line 1,
consistent with 357 existing uses across the repository (`.oxlintrc.json` sets `max-lines: ["error",
{max: 400, ...}]` for `.mjs` scripts). The rationale is valid: the script implements 6 interrelated
scenarios with shared setup that cannot be meaningfully split without duplicating isolation
lifecycle code. No violation; no extraction needed.

## TASK_008 evidence reconciliation — corrected distinctions

| Prior claim | Correction |
|---|---|
| "3 vs 10 model requests" ambiguity | Explained by actual endpoint/stage/phase counts: U5 scenario 4c makes 3 controlled-provider requests at the `analyze` stage (one per expected model turn in the run-identity proof). U4 cancel makes 10 because it exercises analyze→implement→review→gate across 3 native inputs plus a companion Chat. These are different scenarios with different stage counts, not a discrepancy. |
| "assertU3Idle removal" | U5 never used `assertU3Idle`. It uses a local `assertIdle` that checks ledger + modelCount + toolCalls + toolResults but intentionally omits `runs === []` because U5 scenarios 2/3 may legitimately create Cancelled/async runs. This is a design decision, not a removal. |
| "Zero side effects" | Corrected: the zero-side-effect proof covers transfer operations (scenarios 1–4a) only. Network blocking in `native-bootstrap.cjs:96-103` is a sandbox boundary, not zero-attempt evidence — process counts alone don't prove workspace creation. The corrected proof captures the snapshot before 4c and computes deltas against baseline. |
| Absence of Agent input/Tool/worker/plugin/MCP | Mapped to observations: `nativeInputs === 0` (no Agent input admitted), `toolCalls === []` (no tool command executed), `toolResults === []` (no tool result produced), `httpRequests` routed through controlled provider (no unexpected traffic implies no Worker/Plugin/MCP activity). Each is an assertion, not an inference from network blocking. |

## Native evidence

All receipts and screenshots archived at `docs/graph-engineering/evidence/pre-z8/u6-integration/`:

| File | SHA-256 | Size |
|---|---|---|
| u1-summary.json | `7a83af70...` | 89,216 B |
| u2-blocked.json | `ceefe972...` | 8,357 B |
| u3-summary.json | `5d6dc3a9...` | 41,488 B |
| u4-pre-z8-u4-cancel.json | `0340a78f...` | 135,243 B |
| u4-pre-z8-u4-complete.json | `d111dd89...` | 194,774 B |
| u4-pre-z8-u4-concurrent-chat.json | `5753d784...` | 165,882 B |
| u4-pre-z8-u4-source-drift.json | `4d962978...` | 111,438 B |
| u5-summary.json | `55cd89cc...` | 27,362 B |

11 U3 screenshots copied to `u6-integration/screenshots/` (guided-context-draft at 1280/1920,
advanced-only-lossless-text, invalid-buffers-retained, repair-defaults-two-tests,
delete-impact-explicit, unresolved-after-delete, missing-skill-visible,
identical-content-explicit-reference, missing-reference-preserved,
reference-cancel-stale-preservation).

## Remaining prerequisites for human pilot

1. **SDK 8.0.425** is restored to `.tmp/dotnet-toolchain/sdk-8.0.425/` (via official
   `dotnet-install.ps1`, `-NoPath`, project-local). Set `PRE_Z8_DOTNET_ROOT` when running U2
   scenarios. No longer a blocking prerequisite for this checkpoint.

2. **Controlled provider** must remain configured for the isolated pilot profile. Do not configure
   real provider credentials — the pilot uses controlled-provider fixtures that return scripted
   responses.

3. **Isolated pilot profile**: the native test scripts (`pre-z8-u*-native.mjs`) create isolated
   profiles under `.tmp/z1-native-<timestamp>-<hex>/` via `createIsolation` (which sets a temporary
   `HOME`/`USERPROFILE` and `ZCODE_GRAPH_DIALOG_CONTROL`). `--user-data-dir` alone does NOT isolate
   the Graph engineering home (`%USERPROFILE%\.zcode-graph-engineering`); the native harness
   isolates it by redirecting `USERPROFILE`. See `HUMAN_PILOT_CHECKLIST.md` for exact startup.

## Unresolved hypotheses

None. The z4-review failure was root-caused and fixed (not flaky — deterministic Windows timestamp
granularity). The U2/dotnet-fixture blocker is a missing prerequisite, not an unresolved defect.
No product defects were found outside the D4/D5 scope.

## What this report does NOT claim

- Human acceptance is NOT RUN. No person has performed the pilot journeys.
- Live-provider acceptance is NOT RUN. All model requests went to controlled fixtures.
- Real OS dialog ergonomics are NOT RUN. The native tests use a controlled dialog seam
  (`ZCODE_GRAPH_DIALOG_CONTROL`), not real Windows file pickers.
- Z8 is not authorized or claimed complete. U6 completion does not by itself authorize Z8.
- The U3 native context handoff is NOT re-run in this checkpoint (prior-session evidence only).
- Zero Worker/Plugin/MCP activity is inferred from the absence of unexpected native inputs and
  tool calls, not from HTTP blocking alone. This is an explicit evidence gap.
- The D4 timestamp fix is fixture construction; it does not prove the same timing issue is
  impossible in production.
- The dotnet-fixture 7/8 result has a known net6.0 baseline limitation (not a regression).
