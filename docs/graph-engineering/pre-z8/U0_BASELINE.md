# U0 baseline and implementation decisions

Status: bounded U0 automated baseline complete. Source/contract decisions and fresh controlled native Build permission reproduction are established. No installed user run was inspected. This is a fresh continuation of the documentation handoff, not evidence that U1–U6 already exist.

## Identity and scope

- Checkout/branch/HEAD: `C:\Users\USER\Desktop\Personal\ZCode`, `main`, `7e5f02d76abf20d567df1a9e6ddb868ab3421205`.
- Root package 3.14.0; local tag `graph-v3.14.0-z7.2`. No installed artifact/version or private settings read.
- Existing changes preserved: modified README and untracked guide/planning pack. No staged files, reset, commit, push or publication.
- User authorizes all U0–U6 and supersedes milestone stopping restrictions. Recommended scope: local Windows sequential; parallel experimental with Z7-A12 FAIL retained.
- Toolchain: existing project-local Node 24.14.0/pnpm 10.33.2. `rg` WinGet shim fails; use bounded `git grep`, `git ls-files`, PowerShell reads. Plain bundled pnpm 11 attempted dependency verification in one audit command and stopped before removal (`NO_TTY`); subsequent commands use the pinned helper. No install authorized or completed.

## Confirmed source baseline

| Area              | Actual ownership/path and issue                                                                                                                                                                                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Library/create    | `GraphLibrary` → `useGraphWorkflow` → `GraphWorkflowService.instantiate` → existing revision-checked Graph save. This copies/pins v5; it does not run native work                                                                                                                       |
| Recipes           | `useGraphEngineering.recipes` is null until explicit read; shared pending/error obscures not-loaded/loading/read-failed distinctions. `GraphProjectRecipes` edits raw JSON; config adapter preserves unrelated config through digest checks                                             |
| Binding           | UI lists all recipe kinds. Instantiation accepts symbolic recipe IDs; native preflight checks conventional `build`/`test` IDs, then native run snapshots validate evidence requirements. A saved Test owns global `buildNodeId`, which needs a per-definition mapping for renamed nodes |
| Drafts            | Editor and template binding forms hold local React state. Mode/workspace/remount can drop unsubmitted data. A retained workspace-keyed UI draft store is needed; no execution state moves into it                                                                                       |
| Preflight         | `createWorkflowPreflight` reads existing native metadata and selected model/recipe/reference policy, then Graph freezes reviewed provenance before admission. Existing-only native preview must remain read-only                                                                        |
| Native permission | Tool attempt contains exact native operation/session; Tool inspector can open it. Graph approval is a distinct revision-bound decision. Source does not establish the user's missing action cause                                                                                       |
| Evidence          | Recipe `zcode-json-v1` differs correctly from payload `zcode-test-v1`; strict identity/source/build/freshness/positive-test checks and 1,000-entry cap remain                                                                                                                           |
| Skills            | Ordinary `useSkills` catalog call can start a cold runtime. Graph must use existing-only metadata preview, preserving the Z6 native read boundary                                                                                                                                       |
| Parallel          | Separate plan/owner and owned clones; no valid portable Fork/Join contract. Keep local plans and record failure rather than silently exporting sequential content                                                                                                                       |

Detailed bounded source investigations live under `investigations/` as they are finalized.

## Supported profile and unresolved facts

The authorized synthetic profile is local Windows with SDK 8.0.425 and standard VSTest/TRX. SDK TestPlatform ObjectModel, host and TRX logger files exist; project-owned inspected NuGet caches are empty. A package-free custom synthetic test adapter using the genuine VSTest engine is feasible but not yet proven. U2 must prove it before claiming adapter runtime support. No .NET SDK version implies MTP/VSTest choice for a user's project. Private project targets, feeds, game harnesses and RTP rules remain unknown and unsupported without separate authorization.

Current real native JSON fixture is useful lifecycle evidence but is not a VSTest/TRX adapter. MTP, restricted script wrappers, private/game harnesses, external linked source and unreviewed imports remain outside initial support. No new process engine/provider store is permitted.

## Fresh verification

Commands used the pinned helper. Logs: `.tmp/pre-z8-current/`.

| Check                                                       | Actual result                | Evidence                                                                                                                                                                                                                  |
| ----------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Freshness normal                                            | PASS                         | Approved ref fetch; main/origin/main ahead 0 / behind 0. Initial sandbox FETCH_HEAD denial retained in execution plan                                                                                                     |
| Root typecheck                                              | PASS, exit 0                 | `baseline-typecheck.log`                                                                                                                                                                                                  |
| Root lint                                                   | PASS, 70 warnings / 0 errors | `baseline-lint.log`                                                                                                                                                                                                       |
| Graph/Git services                                          | PASS, 189 tests              | `baseline-services.log`                                                                                                                                                                                                   |
| UI Graph tests                                              | PASS, 34 tests               | `baseline-ui.log`                                                                                                                                                                                                         |
| Graph fixture/script tests                                  | PASS, 63 tests               | `baseline-scripts.log`                                                                                                                                                                                                    |
| CLI typecheck                                               | PASS, 27 tasks               | `baseline-cli-typecheck.log`                                                                                                                                                                                              |
| CLI build                                                   | PASS, 16 tasks               | `baseline-cli-build.log`                                                                                                                                                                                                  |
| Desktop build                                               | PASS                         | `baseline-desktop-build.log`; CLI/typecheck/build serialized                                                                                                                                                              |
| Architecture changed                                        | PASS, 0 violations           | Initial command; controlled graph context read                                                                                                                                                                            |
| CLI lint                                                    | FAIL, preexisting            | `baseline-cli-lint.log`; compare actual diagnostics later                                                                                                                                                                 |
| Whole-repo format                                           | FAIL, 2,874 files            | `baseline-format.log`; includes current planning docs, do not blanket reformat                                                                                                                                            |
| Native configured Build permission reproduction             | FAIL at Electron startup     | `u0-native-permission.log`; owned `.tmp/z1-native-1790449219595-298cd5`, page crashed before native ledger/model requests. No claim about product permission failure                                                      |
| Same native reproduction, approved execution retry          | PASS                         | `u0-native-permission-elevated.log`; fresh `.tmp/z1-native-1790449608051-bed6ce/z4-summary.json`; actual exact-session permission and Build result, zero Agent inputs/model requests. No sandbox/approval setting changed |
| User's actual stalled run / live provider / company project | NOT RUN                      | Outside authorization                                                                                                                                                                                                     |

## Product wireframe and shared decisions

```text
Graph | workspace path | workflow / saved or unsaved | Back to Chat
Workflows       Design            Runs             Project setup
Agent-assisted  Guided / Advanced  Execution        Scan (read only)
Verified task   explicit context   Evidence         Review configuration
Advanced       prompt preview     Human decision   Save / explicit calibration
               same definition    required action  Advanced recipe JSON
```

`IMPLEMENTATION_SPEC.md` defines the ownership/event-order diagram, no-execution reads, additive agent-assisted v5 template, retained draft semantics, U2 adapter constraints and later phase acceptance. Renderer drafts remain local unsubmitted projections. Host/native owners and their conservative execution boundaries are unchanged.

U1 starts with the new `agent-assisted` template plus explicit recipe/readiness states, intent-first template use and safe draft retention. Existing generic/bugfix/slot v1 templates must not change. Root coordinates services/shared contracts; the UI agent receives disjoint UI/store/hook ownership. Test meaningful negative paths before UI/native acceptance. Native startup investigation continues independently; U1 is not complete until controlled native workflow evidence is obtained or a blocker is explicitly reported.

The three audit notes are finalized. Initial Electron startup failed in the restricted environment; the unchanged harness passed with approved execution permissions. The initial owned session was interrupted and its processes were confirmed gone before retry. This establishes the controlled Build permission journey, not the cause of the user's installed-run report. No blanket retry or permission transport change is justified by this evidence.

Exact next actions: integrate/test U1 template and UI against the new specification; run fresh typecheck/lint/architecture plus U1 service/UI/native acceptance, review diff and write U1_REPORT.md before U2 product implementation. Recipe-state distinctions and draft preservation receive their controlled UI assertions in U1; baseline source behavior and its deficiencies are retained above.
