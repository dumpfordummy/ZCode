# ZCode Graph pre-Z8 implementation handoff for GLM-5.2

Prepared on 27 September 2026 from the actual working tree. Evidence snapshot: `2026-09-27T05:20:48.244Z`. This handoff was prepared without product changes or a new product test/build run. The receiving model is the coding agent; do not configure a live GLM provider to run the acceptance fixtures.

**Start with [TASK_001.md](TASK_001.md): repair the U4 cancellation acceptance driver's return to Design, then complete its isolated cancellation/independent-Chat/restart proof.** U0 is not the next implementation task. U4 is not complete. U5 has a specification and investigation, but its new implementation is absent.

## Authority and reading order

The programme assignment authorized U0–U6 and superseded the planning pack's U0-only and stop-after-each-phase restrictions. Safety, architecture, preservation and verification rules still apply. The latest assignment was documentation only; this preparation did not authorize or perform product changes. Use the accompanying execution prompt to assign TASK_001; the backlog is sequencing context, not an instruction to implement every later task in that bounded assignment.

The user waived separate reports for every stage. Keep compact progress, decisions, command receipts and exact next actions; the final consolidated readiness report is still required at U6. Do not create missing U2/U3/U4 report files merely to match the original delivery table.

Read in this order:

1. Root `AGENTS.md`, then this handoff and TASK_001. All repository-relative paths below are rooted at `C:\Users\USER\Desktop\Personal\ZCode` in this checkout.
2. `.agents/skills/architecture-governance/SKILL.md`; run its changed-module check and read the generated `graph-engineering` context before code changes. Read `DESIGN.md` before UI changes. `apps/zcode-cli/AGENTS.md` applies if work enters the CLI; TASK_001 should not.
3. `docs/graph-engineering/pre-z8/MASTER_PLAN.md`, `BACKLOG_AND_ACCEPTANCE.md`, `DELIVERY_PLAN.md`, and `IMPLEMENTATION_SPEC.md`. `SOURCE_REGISTER.md` records the planning references; current source and actual receipts decide implementation status.
4. `U4_RUN_SPEC.md` and `pre-z8-u4-native-spec.md` in that directory, then the exact source/tests listed in TASK_001.
5. `EXECUTION_PLAN.md`, `U0_BASELINE.md`, `U1_REPORT.md`, and the durable evidence indexes listed below. Read their dated claims with the corrections here.
6. [BACKLOG.md](BACKLOG.md), followed by `U5_REUSE_SPEC.md` only when planning the next dependency. `HUMAN_PILOT.md` is a prepared, entirely NOT RUN operator worksheet.

`IMPLEMENTATION_HANDOFF.md` is an earlier planning-only handoff. Its statements that U0/source implementation have not started are superseded by this working tree. `EXECUTION_PLAN.md` is much newer, but its last next-action paragraph still mentions unfinished source review/build and an active native lane. Those review/build checks finished, and the native cancellation attempt subsequently failed as described below. `.tmp/pre-z8-current/u4-native-lane.json` also has stale READY/NOT RUN status. Actual command logs, receipts and source take precedence over those status strings.

## Checkout and preservation

| Fact                            | Observed value                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| Branch                          | `main`                                                                                     |
| HEAD                            | `7e5f02d76abf20d567df1a9e6ddb868ab3421205`                                                 |
| Root / CLI package versions     | `3.14.0` / `0.16.9`                                                                        |
| Required tools from `mise.toml` | Node `24.14.0`, pnpm `10.33.2`                                                             |
| Staging area at capture         | Empty                                                                                      |
| Tracked modifications           | 72 files; many additional untracked implementation, test, specification and evidence files |
| Freshness during handoff        | `--no-fetch` PASS, cached ahead 0 / behind 0; no current remote-fetch claim                |

[checkout-snapshot.json](evidence/checkout-snapshot.json) records status, tracked line deltas, per-file SHA-256 preservation inventory and built-artifact hashes. The substantial programme implementation is **uncommitted**, and much is **untracked**. A clean checkout of HEAD does not contain it. Transfer/preserve the actual working tree and durable evidence; do not reconstruct the programme from HEAD or apply a reset/clean/stash-pop over these files.

Relevant changes already present:

- Services: `packages/services/src/graph-engineering/` public contracts, workflow/preflight/routing, project setup and compatibility, genuine TRX capture/normalization, context/reference and editor projections, and tests. `packages/services/src/index.ts` exports the added public surface.
- UI: `packages/ui/src/graph-engineering/`, Graph hooks, `graphDraftStore.ts`, navigation store, locales and `packages/ui/test/graph*.test.ts`. These contain U1–U4 work; preserve shared ownership and the existing fixes.
- Harnesses: new `scripts/graph-engineering/pre-z8-*` fixtures and drivers. Existing `z4-native-editor.mjs`, `z5-native-editor.mjs`, `z6-native-library.mjs`, and `z6-native-ui.mjs` were adapted for the new navigation. Their final combined native regression is still pending.
- Documentation/data: the pre-Z8 planning/specification pack, durable `docs/graph-engineering/evidence/pre-z8/`, `docs/graph-engineering/templates/agent-assisted.v1.json`, and `docs/graph-engineering/LLM_USER_GUIDE.md`.
- `README.md` has an unrelated/pre-existing 13-line addition and 216-line removal. Preserve it; it was not rewritten for this handoff.
- Ignored `.tmp/` contains the pinned toolchain helper, owned fixture profiles, genuine .NET reports and command logs. Keep existing material. Do not read installed profiles/auth stores to recreate it.

There is no known running implementation agent/build owned by the preceding phase. The last cancellation driver produced a completed FAIL receipt and its code closes isolation in `finally`; the old command session no longer exists. A bounded `Get-Process` check found no Electron/Node/Edge executable under this checkout. Broader CIM command-line enumeration was denied, so this is not a claim that all machine processes are absent. Before the next emitting command, recheck owned sessions/processes through available normal tools; never globally kill Node/Electron/browser processes.

## Implemented, unfinished and uncertain

“Automated checkpoint” below describes retained evidence, not a fresh rerun during handoff and not live/pilot acceptance.

| Phase | Actual state                                                               | Evidence and limits                                                                                                                                                                                                                                                                                                                                                            |
| ----- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| U0    | Bounded automated baseline established                                     | Actual checkout, architecture, baseline tests and isolated native Build-permission reproduction recorded. Company-project compatibility, installed-app state and live usability remain unknown. Do not repeat U0 wholesale.                                                                                                                                                    |
| U1    | Implemented; automated checkpoint retained                                 | New `agent-assisted` v1 using graph v5 and native Analyze/Implement/Review/final gate; no recipe requirement or false test claim. Distinct setup states and retained drafts. Native receipt: 3 admissions, 11 controlled requests, restart without replay; malformed unrelated recipes do not block the no-Tool path.                                                          |
| U2    | Implemented for bounded standard VSTest/TRX; automated checkpoint retained | Guided checks, explicit native calibration, local Test-to-Build mapping and genuine immutable report evidence. Eight native cases passed: pass/probe/restart, multi-target, real failure, source drift, Build drift, zero, all skipped, missing required identity. MTP/private/game/RTP/shell harness support is excluded, not secretly completed.                             |
| U3    | Implemented; automated checkpoint retained                                 | Guided/Advanced canonical editing, explicit context, safe reference/native-guidance selection and routing controls. Final native editor and context/later-Chat journeys passed. A real duplicate React-key defect and driver failures were fixed and their failed attempts retained.                                                                                           |
| U4    | Product source and focused tests present; checkpoint OPEN                  | Three independent axes, captured-only summary/changes, exact native actions, scoped evidence reads and bounded history. Latest full UI 115 and Graph/Git services 336 passed. Actual 500-history UI fixture passed with limits. Native cancellation attempt FAILED before Graph Run due to driver navigation. Remaining native journeys are NOT RUN on this final U4 artifact. |
| U5    | Prepared specification/investigation only                                  | New file-transfer hook and repeat-request transform do not exist. Current capture loses selected semantic reference roles. Existing raw JSON transfer/library APIs remain the foundation, not proof that U5 file transfer is complete.                                                                                                                                         |
| U6    | Combined gate not started; pilot worksheet prepared                        | Final integrated regression and readiness report are absent. Human/live/company/OS acceptance remains NOT RUN.                                                                                                                                                                                                                                                                 |

Current U4 defect chain: `startU4Companion()` returns through `showGraph()`, which intentionally opens **Runs**. The next line tries `graph-run-button`, rendered only in **Design**. The screenshot shows Runs with “No runs yet.” The receipt records zero Graph runs, one unrelated Chat input, one controlled-provider request, no recorded native tool calls, no holds and no fixture errors. Cancellation, native Edit and restart proof were **not reached**. This is a driver failure, not a product cancellation pass or failure.

The original attempt is `.tmp/z1-native-1790461139054-5cede5/pre-z8-u4-summary.json`. Exact copied receipt, failure/companion screenshots and command log are included under [evidence/u4-cancel-attempt-1](evidence/u4-cancel-attempt-1/pre-z8-u4-summary.json) and [retained-checks/u4-native-cancel-1.log](evidence/retained-checks/u4-native-cancel-1.log). Failed attempts must survive subsequent retries.

## Architecture and state ownership already decided

| Owner                         | Source anchors and responsibility                                                                                                                                                                                                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Graph Host/service            | `packages/services/src/graph-engineering/contract.ts`, `CONTRACT.md`, `app/service.ts`, `app/state.ts`, `app/attempts.ts`, `app/tool-evidence.ts`: saved definition, immutable run snapshots/attempts/evidence, lease, persisted intent, serialized admission and conservative recovery. `node.ts` is Node composition. |
| Native agent/session services | Existing native runtime owns session creation, accepted input ledger/CommandInbox, tools, permissions/questions and terminal facts. Graph correlates exact native identities; it does not create a replacement engine. Main handles process/window/message routing, not task business state.                            |
| Workflow library              | `workflow-contract.ts`, `domain/workflow.ts`, `app/workflow-service.ts`: immutable versions, dry preview, explicit instantiation and revision-checked library mutations. It does not own execution.                                                                                                                     |
| Renderer draft/view           | `packages/ui/src/store/graphDraftStore.ts` owns canonical unsaved definitions and retained local buffers. `graphEngineeringViewStore.ts` owns navigation/selection only. Guided and Advanced share one definition.                                                                                                      |
| Renderer reads/actions        | `useGraphEngineering.ts`, `useGraphEvidence.ts`, `useGraphInspectionRead.ts` use existing public services. `graphRunSummary.ts`, `graphRunEvidence.ts`, `graphRunPresentation.ts` derive display facts, not authoritative status.                                                                                       |
| Platform/files                | Existing `IPlatformService` in `packages/shared/src/platform.ts` and public file service perform platform IO through hooks. UI does not access the repository/filesystem directly or call `window.zcode`.                                                                                                               |

```mermaid
sequenceDiagram
  participant UI as Draft / navigation / projections
  participant Graph as Existing Graph Host owner
  participant Native as Existing native session owner
  participant Provider as Isolated controlled provider
  UI->>Graph: Explicit Run with freshly reviewed preflight
  Graph->>Graph: Persist request/attempt before admission
  Graph->>Native: Admit exact native session/input
  Native->>Provider: Request / actual tool result
  UI->>Native: Navigate to exact session; human response through native UI
  UI->>Graph: Cancel selected run
  Graph->>Graph: Persist cancel intent
  Graph->>Native: Cancel matched owned input
  Native-->>Graph: Correlated authoritative terminal proof
  Graph-->>UI: Captured facts; no replay or forbidden successor
```

Keep identity key `workspaceIdentity?.trim() || workspacePath`; paths remain for filesystem/cwd/display. Preserve remote identity/attachment, owner/lease and stale-run guards even though supported Graph execution is local. Desktop continuous and mobile replayable delivery semantics must remain distinct; TASK_001 changes neither.

Decisions to retain:

- Supported release scope is local Windows sequential, supervised execution. Parallel stays explicitly experimental; **Z7-A12 FAIL remains open**. Conditional U5-P01–P03 are not required for this chosen supported scope and cannot be claimed complete.
- Agent-led, command-only, accepted test pass/fail, invalid evidence and human decision are different facts. Human approval or agent prose cannot manufacture test success. Existing verified `generic`, `bugfix` and `slot` v1 definitions must not be weakened.
- U2 uses genuine standard VSTest/TRX, SDK 8.0.425/VSTest 17.11.1 in the recorded package-free fixture. Preserve the 256 KiB TRX and 1,000-test bounds, strict source/Build/invocation linkage, original-byte evidence and conservative failures. U5 portable JSON has a different 256,000-byte bound.
- Reads/scans/preview/save/navigation do not execute work. Edits invalidate affected preflight consent. Historical run instructions/settings/identities/evidence never change with later Chat or current Design.
- Cancellation is intent until authoritative inactivity/terminal proof. Written files remain. Unknown work is not replayed; release remains explicit, owned, inactive and audited.

No product architecture decision is needed to fix TASK_001. Approval would be needed for company projects, installed credentials, live paid-model checks, dependency/tool installation, relaxing sandbox/permission policy, supported parallel promotion or Z8. None is authorized by this handoff. An environment-required process launch approval must use the receiving agent's legitimate tool approval mechanism.

One U5 implementation choice is intentionally unresolved: how replacement handles unapplied editor text. `U5_REUSE_SPEC.md` permits explicit resolution through existing Apply/discard controls, or an exact reviewed Discard of unchanged covered buffers after successful replacement. Do not silently claim Save persists unapplied text. Choose and record the concrete interaction before implementing that path; seek user alignment if it changes an established product rule. Broader private harness/runner/project requirements remain unknown and need real authorized evidence.

## Actual evidence and baseline failures

The following logs were executed during preceding implementation, then inspected/copied during this handoff. **They were not rerun here.** Copies are under [evidence/retained-checks](evidence/retained-checks/u4-driver-unit-tests.log); [copied-evidence-manifest.json](evidence/copied-evidence-manifest.json) records source paths and SHA-256.

| Last actual check                               | Result                                                                | Receipt/log                                                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Full Graph/Git service tests                    | 336 PASS, 0 skipped                                                   | `u4-services.log`                                                                                        |
| Full Graph UI tests                             | 115 PASS, 0 skipped                                                   | `u4-ui-tests.log`                                                                                        |
| U4 fixture/proof/artifact-fault tests           | 10 PASS, 0 skipped                                                    | `u4-driver-unit-tests.log`; not native cancellation evidence                                             |
| Root typecheck                                  | PASS, exit 0                                                          | `u4-final-typecheck.log`                                                                                 |
| Root lint                                       | 70 existing warnings, 0 errors                                        | `u4-final-lint.log`                                                                                      |
| Architecture changed check                      | 0 violations, 0 baseline, 0 new                                       | `u4-final-architecture.log`                                                                              |
| Serialized Desktop build without runtime assets | PASS, exit 0                                                          | `u4-final-desktop-build.log`                                                                             |
| CLI lint baseline                               | FAIL: 85 errors, 53 warnings across packages                          | `baseline-cli-lint.log`; separate from root lint                                                         |
| Whole-repository format baseline                | FAIL: 2,874 of 3,600 files                                            | `baseline-format.log`; no blanket formatting authorized                                                  |
| U4 independent review                           | Three concrete presentation/selection issues fixed before final build | `u4-independent-review.json`; no-test wording, prior-attempt artifact fallback, fail-vs-invalid guidance |
| U4 native cancellation, attempt 1               | FAIL before Graph Run                                                 | `u4-native-cancel-1.log` and copied JSON/screenshot                                                      |
| Final combined U0–U6 regression                 | NOT RUN                                                               | Requires U5 implementation and final artifact                                                            |

CLI typecheck/build last passed in the earlier baseline (27 / 16 tasks), not as a new U4 check. Original logs remain `.tmp/pre-z8-current/baseline-cli-typecheck.log` and `baseline-cli-build.log`. Do not equate root typecheck with the separate CLI check.

Durable evidence already in the working tree:

| Location under `docs/graph-engineering/evidence/pre-z8/`                    | Meaning                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `u1/native-evidence-receipt.json`                                           | U1 manifest is its `files` array, not a nonexistent `u1/manifest.json`. 28 files; includes native pass, recipe independence, restoration and failed attempts.                                                                                                       |
| `u2/native-matrix.json`, `u2/verified-outcomes.json`, `u2/manifest.json`    | Eight genuine native cases plus two retained earlier driver failures; 253 files / 7,679,914 bytes.                                                                                                                                                                  |
| `u3/native-matrix.json`, `u3/manifest.json`                                 | Six editor/handoff attempts, final editor and handoff passes; 50 files / 2,801,144 bytes. Later ordinary Chat did not change the completed Graph record.                                                                                                            |
| `u4/history/index.json`, `u4/history/manifest.json`, `u4/history/verified/` | Actual `GraphRunHistory` mounted with synthetic immutable props; 500 summaries, max 25 visible controls, 19 keyboard page transitions, actual light/dark themes and focus at 1280×720 and 1920×1080. 12 files / 452,862 bytes, including earlier rejected attempts. |

During handoff, all **343 manifest-listed files** above were read and matched their SHA-256 (and declared lengths where present). This is a new **evidence-integrity check**, not a rerun of their tests. Results are in `checkout-snapshot.json`.

History performance receipt: initial visible 231 ms, maximum page 15.88 ms, maximum React render about 12.2 ms on Windows build 10.0.26200, Ryzen 9800X3D, Edge 153. This is a development fixture/Profiler measurement, not a pilot, installed-app benchmark, scaling or accessibility certification. Initial sandbox GPU failure and incomplete-theme coverage are retained separately.

The four artifact fingerprints recorded by the failed native attempt still matched disk during handoff:

| Artifact                                     | SHA-256                                                            |
| -------------------------------------------- | ------------------------------------------------------------------ |
| `apps/zcode-cli/packages/cli/dist/zcode.cjs` | `a60c0ba495bd8b6a3d7b871e5a8eb67d0637f7705e79761e07336a62c8e366ee` |
| `packages/desktop/out/main/index.js`         | `53c527d827cdc6e4aee2dc77d09a4339865ba22de9d0ad42afd59e98f2d68dd9` |
| `packages/desktop/out/host/index.js`         | `6acd77cfce5effde3ec3d0c17928728e20b9d738134cd249613f6269dec2ea85` |
| `packages/desktop/out/renderer/index.html`   | `2ebec8bc00e90a621a72b209cdb5ab2c119cef1c13ffc23105aee943d7d0160f` |

These four fingerprints do not constitute a complete installer/package manifest or prove every renderer asset is present. Recheck source/output consistency before reuse; retain a new build receipt when rebuilding.

## Commands and required execution order

All commands below use repository root as working directory unless `--dir` selects the CLI. They are **instructions for the receiving run, NOT RUN as part of this documentation task**, except the explicitly recorded freshness/integrity checks. Do not infer a unified test command from an old report; current package scripts are authoritative.

This Windows checkout has an inspected existing helper. If it is still present, read it before dot-sourcing:

```powershell
Get-Content .tmp/z1-env.ps1
. .\.tmp\z1-env.ps1
$env:PATH = "$PWD\node_modules\.bin;$env:PATH"
node --version
pnpm --version
node scripts/check-workspace-freshness.mjs --no-fetch
git status --short
git diff --cached --stat
pnpm architecture:check --changed
pnpm architecture:context graph-engineering
```

The helper selects existing project-local Node/pnpm and caches; it disables automatic dependency verification and Git hooks for fixtures. Default PATH previously yielded Node 24.11.1 and pnpm 11, which are not the pinned versions. If the helper/toolchain is missing, use already-installed pinned tools through `mise` as configured in `mise.toml`; do not install them implicitly. Normal freshness performs a metadata fetch; `--no-fetch` must be labelled cached-only when a fetch is not permitted. The handoff used cached-only.

For TASK_001, use its focused command sequence. For phase/combined integration, these are verified existing entry points:

```powershell
# Confirm this genuine owned fixture manifest exists and is valid first.
$env:PRE_Z8_TRX_FIXTURE_MANIFEST = "$PWD\.tmp\pre-z8-dotnet-jPnICP\evidence.json"
$graphServiceTests = Get-ChildItem packages/services/src/graph-engineering,packages/services/src/git -Recurse -Filter '*.test.ts' | ForEach-Object { $_.FullName }
node --import tsx --test @graphServiceTests
node --import tsx --test packages/ui/test/graph*.test.ts
node --test scripts/graph-engineering/*.test.mjs
pnpm typecheck
pnpm lint
pnpm architecture:check --changed
```

If that genuine .NET fixture is unavailable, inspect `scripts/graph-engineering/pre-z8-dotnet-fixture.mjs`, `pre-z8-dotnet-fixture.test.mjs` and `DOTNET_FIXTURE_SPEC.md` to produce a new owned fixture using existing tools. Do not use a missing manifest or test skips to claim the genuine evidence lane passed. The full script suite has not been rerun with all U4 additions; the 10-test U4 subset must not be represented as that combined suite.

Serialize all emitting validation. Required order when those outputs need rebuilding: root typecheck, CLI typecheck, CLI build, Desktop build, then native acceptance with frozen artifacts:

```powershell
pnpm typecheck
pnpm --dir apps/zcode-cli typecheck
pnpm --dir apps/zcode-cli build
pnpm --filter @zcode/desktop build:no-runtime-assets
# Only after all emitting commands have finished:
node scripts/graph-engineering/pre-z8-u4-native.mjs --scenario=cancel
```

Do not run CLI/Desktop builds or emitting typechecks concurrently, and do not rebuild while a native fixture is running. A driver-only fix does not require rebuilding unchanged, verified artifacts; document reuse and recheck hashes. Do not invoke generic Desktop `build` to download runtime assets, or use production `dev:desktop` against user data.

The existing isolation driver creates an owned private profile/workspace and loopback controlled provider. `Z1_PACKAGED_EXE` must be absent; the driver rejects an inherited installed executable override. Never substitute an installed profile/model configuration. The fixture's initial Git preparation concerns only its synthetic workspace; development-checkout staging/commits remain forbidden.

On this machine, sandboxed Electron/Edge startup previously failed before DOM/model activity; an approved unchanged retry succeeded. If this repeats, record the environment failure and request only the legitimate process-launch authorization needed by the tool. Do not add `--no-sandbox`, disable native approval controls, copy credentials, or fake the outcome. Close only the fixture's owned processes through its normal cleanup.

## Open requirements and next action

TASK_001 is ready to implement with existing abstractions and no product redesign. After it passes, U4 still needs the complete/no-tests/approval/artifact-read scenario and current-build U2 pass/fail/source-drift presentation checks, review and durable archival. Only then begin U5 contracts/implementation. [BACKLOG.md](BACKLOG.md) retains the remaining dependency order and human/live blockers.

Every new result must name its layer, source/artifact identity, command, exit status, receipt and limits. Preserve failed receipts and original evidence. Do not stage, commit, push, publish, begin Z8, or claim the user-operated pilot is complete.

Handoff-only verification is recorded in [handoff-validation.json](evidence/handoff-validation.json): document formatting, local links/source anchors, copied-evidence integrity, independent review and preservation checks. These checks do not add a product test/build PASS. The requested work-time estimate is separately recorded in [work-time-estimate.json](evidence/work-time-estimate.json), with logged windows and exclusions rather than invented active-time accounting.
