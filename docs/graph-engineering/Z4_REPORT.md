# Z4 implementation report

Date/timezone: 2026-09-24, Asia/Kuala_Lumpur.
Selected milestone: **Z4 only — inspectable artifacts, structured results and deterministic Tool nodes**.
Checkout: `C:\Users\USER\Desktop\Personal\ZCode`, branch `main`.
Starting and final HEAD: `5ded9d1b6e9399e05f6ab6efc60234387322fe20`; no Git publication is authorized for this assignment.

## Status

**IMPLEMENTED WITH NAMED BASELINE EXCEPTIONS.** Z4 implementation, all eleven requirement groups and all eighteen selected native scenarios pass their controlled assertions. Source/fixture checks total 233 passing tests; ten inherited native regressions also pass. CLI lint and full-repository formatting remain named baseline exceptions, detailed below. User-operated live-provider/project checks and packaged-environment checks remain **NOT RUN**. This is development verification, not a claim of user acceptance or a published installer.

The predecessor Z3 implementation exists in this checkout, including its native gate tests and report. Z4 extends the same Graph Host and native session runtime; it does not introduce a second agent, provider store, embedded application or process supervisor. The existing z2.2 packaging work and historical Z1–Z3 results remain preserved.

## Prerequisites and baseline

The Z4 prompt, task, roadmap, execution rules and shared report template were read along with repository `AGENTS.md`, `DESIGN.md`, architecture policy/controlled context, current Graph contracts and the actual Z3 implementation/report. The Z3 entry/intermediate/final approval owner, immutable source/text evidence, exact native input proof, one-use dispatch guard, conservative continuation/release and sequential Host orchestration were traced in source. These prerequisites are present.

The starting working tree contained **38 tracked changes and 212 untracked files**. A pre-edit SHA-256 inventory, source copies and tracked patch were retained in `.tmp/z4-baseline/`. Existing user/reference documents, Z3 implementation/evidence and later authorized packaging were not reset. The historical Z3 report still describes its historical next milestone; current progress is updated separately.

Node **24.14.0**, pnpm **10.33.2**, Windows x64 and the prepared project-local dependency installation were used. The synthetic C# proof uses installed .NET SDK **8.0.425**, `net8.0`, no package references, cleared package feeds and private .NET/NuGet/MSBuild directories. It uses a genuine three-assertion C# runner, not xUnit/TRX or a claim that `dotnet test` was used.

| Baseline check            | Actual result                                       | Retained log                            |
| ------------------------- | --------------------------------------------------- | --------------------------------------- |
| Workspace freshness       | PASS after metadata-only retry; main 0 ahead/behind | `.tmp/z4-baseline/freshness-retry.log`  |
| Root typecheck            | PASS                                                | `.tmp/z4-baseline/typecheck.log`        |
| CLI typecheck             | PASS                                                | `.tmp/z4-baseline/cli-typecheck.log`    |
| Graph/native source tests | 82 PASS                                             | `.tmp/z4-baseline/graph-tests.log`      |
| Source evidence tests     | 13 PASS                                             | `.tmp/z4-baseline/source-tests.log`     |
| UI tests                  | 24 PASS                                             | `.tmp/z4-baseline/ui-tests.log`         |
| Regression tests          | 57 PASS                                             | `.tmp/z4-baseline/regression-tests.log` |
| Root lint                 | PASS, 70 warnings and 0 errors                      | `.tmp/z4-baseline/lint.log`             |
| CLI lint                  | FAIL, 53 warnings and 85 errors                     | `.tmp/z4-baseline/cli-lint.log`         |
| Full formatting           | FAIL, 2,872 paths                                   | `.tmp/z4-baseline/format.log`           |
| Architecture              | PASS, 0 violations                                  | `.tmp/z4-baseline/architecture.log`     |

The first freshness attempt could not write its Git fetch metadata under the sandbox; the scoped retry succeeded. Initial CLI checks without the root `node_modules/.bin` PATH entry failed to find Turbo; those logs are retained separately and are not counted as successful checks. Corrected commands actually ran. Live-user Read/Edit/test, permissions, cancellation, restart and second-PC/installer checks remain **NOT RUN**. Their absence does not manufacture a prerequisite or authorize live accounts; controlled native evidence is recorded separately.

## Contracts and source map

Specs were written before their behavior changes:

- [Z4_SPEC.md](Z4_SPEC.md): versioning, owners, frozen execution, recovery and verification facts.
- [Z4_NATIVE_SPEC.md](Z4_NATIVE_SPEC.md): native recipe protocol, permissions, cancellation and limitations.
- [Z4_ARTIFACT_SPEC.md](Z4_ARTIFACT_SPEC.md): immutable storage, parser, bindings, recipes and bounds.
- [Z4_FIXTURE_SPEC.md](Z4_FIXTURE_SPEC.md): isolated real-process/native acceptance harnesses.
- `packages/services/src/graph-engineering/CONTRACT.md`: current public Graph boundary.

`GraphEngineeringService` and serialized `GraphState` remain the definition/run owners. `GraphTools` observes exact native operation facts and commits evidence before successor admission. `GraphArtifacts` owns run/attempt selectors and exact binding resolution. Files are stored by `createGraphArtifactStore` adjacent to existing Graph metadata. Native sessions and processes remain owned by the CLI runtime; React uses the existing Graph hook/service boundary.

The existing `ITerminalService.write` accepts terminal characters and has no authoritative command outcome. It was insufficient for this assignment. The bounded extension is `IZCodeAgentService.startRecipe`, `inspectRecipe`, and `cancelRecipe`, with `session/recipe/start`, `/inspect`, and `/cancel` in the strict shared protocol. Relevant implementation paths are `packages/shared/src/native-recipe.ts`, the existing `packages/services/src/zcode-agent/` facade, and `apps/zcode-cli/packages/bootstrap/src/app/native-recipe-*.ts` plus `zcode-protocol/native-recipe.ts`.

The extension uses the **same session `ToolExecutor`, permission broker and `ExecutionPort`/`NodeExecutionAdapter`** as native tools. A temporary provider-hidden `GraphRecipe` entry always requires native allow-once permission. It submits **zero model inputs**. The caller-created deferred session is persisted using the existing runtime session-persistence method before permission events; Open conversation navigates to that exact existing session. Actual built-in native tool contracts remain unchanged.

Tool-only creation explicitly selects the existing Host control client through `purpose: "native-recipe"`, without requiring a model registry. The ordinary Agent/Chat creation path retains provider readiness. `sessionPurposeClient.ts` rejects model selection on the recipe-only path; `conversationCommandClient.ts` routes an existing session's permission response through its already-running control client. Session title generation is disabled for this purpose. A real provider-empty `session/create` test confirmed that the CLI already supported this operation; no replacement create API or extra runtime was introduced.

Each tool attempt freezes recipe content/digest, captured workspace, native session/runtime and preallocated operation ID. Intent is persisted before side effects. Strict JSON Agent outputs retain the original session/input/command proof. Gate graph digests include frozen Tool recipes in v4; historical v3 digest calculation remains unchanged. A detached committed cache prevents an unsuccessful later write from leaking an uncommitted dispatch phase into recovery.

Definitions and records extend to version 4; legacy unversioned/v2/v3 records remain supported and are never executed on read/migration. Version 4 allows a sequential path with up to eight Agent Tasks, eight Tools and eight approvals. Tool-only paths require no provider configuration. No branching, parallel scheduling, replay of uncertain work, repair prompt, automatic schema relaxation or later milestone is included.

## Implemented behavior

Project recipes are editable through the Graph UI and stored only in the selected workspace's `.zcode/config.json` `graphRecipes` field, preserving other configuration keys. Writes use expected-content-digest concurrency and atomic replacement. Recipes select a fixed executable/argv, relative cwd, timeout, declared sources/outputs and command/build/test verifier. Only Host-generated `{operationId}`, `{sourceDigest}`, `{buildDigest}` and `{reportPath}` substitutions are allowed. Model text cannot choose commands or criteria. Script-shell recipes are unsupported.

Artifacts are immutable, bounded, run/attempt-scoped text, structured JSON, file, declared `.diff`/`.patch`, command or test observations. Manifests carry provenance, identities, byte length, SHA-256, capture time and validation. Reads verify identity, retained length/digest and the manifest. Whole-artifact and JSON Pointer bindings select exact completed attempts. Paths come from declared configuration, not model output. Unsafe paths, traversal, external references, symlinks/junctions, binary/invalid UTF-8 or oversized captures are explicit incomplete entries.

Strict Agent JSON is optional. It rejects prose, fences, duplicate keys, trailing data, unsafe property names and excessive bytes/depth/members. The local object schema is bounded and does not change provider parameters. Invalid output preserves native input completion while failing output validation and blocking dependents; no extra input is dispatched. Optional `evidenceReferences` must identify earlier valid artifacts in the same run/workspace and are reread for validation.

The Tool inspector separates process started/known, successful exit, report freshness, report parsing and configured acceptance. Build requires fresh declared outputs with source/content correlation. Test requires a fresh exact-operation/source/build report, positive discovered count, at least one passed execution, configured count/names, no failures and no skipped required tests. Model PASS cannot substitute for these facts. The C# fixture has exactly `add-positive`, `add-negative` and `add-zero`.

Normal native permissions remain separate from Graph approval. Cwd is validated again after the permission wait before native execution. Cancellation targets the exact stored native operation/runtime only. Lost acknowledgements, cold operation absence, process loss or an unobserved exit preserve uncertainty and block dependents. No automatic process restart or uncertain-input replay is offered. Inactive release remains audited and conservative.

Native redaction uses existing infrastructure; configured redaction environment values stay in the native environment and are not copied into recipes. Truncated native streams retain byte counts and truncation flags but withhold text to prevent partial-secret leakage across the capture boundary. Raw artifact content remains local and manifest export uses an explicit metadata-only projection. HTML is displayed as text.

## Verification matrix

The actual native scenario commands below are separate from source fixtures. All use synthetic workspaces and a controlled loopback provider where Agent Tasks are involved. Tool-only scenarios have no provider configuration.

| Requirement | Result and actual observation                                                                                                                                                                                | Layer                                 | Exact action / evidence                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Z4-A01      | PASS: Z1 text/history, Z2 sequential/recovery, Z3 gates and completed/pending/dispatch restarts preserve behavior; opening history submits no work                                                           | source + native                       | Ten final-Host scenarios in [regression index](evidence/z4/regressions/index.json), plus `complete`                       |
| Z4-A02      | PASS: strict field/whole JSON handoffs use exact native inputs; malformed/oversized outputs stop with one original input and no repair; Tool artifact feeds a fresh Agent session                            | service + native                      | `json-field`, `json-whole`, `json-invalid`, `json-oversized`, `tool-agent`; [native index](evidence/z4/native/index.json) |
| Z4-A03      | PASS: completed app restart preserves immutable evidence; actual altered artifact content is refused by the public inspection path; exact bytes restored afterward; foreign ownership/reference tests reject | service + native                      | `complete`, artifact source tests; [complete summary](evidence/z4/native/complete/summary.json)                           |
| Z4-A04      | PASS: native Read/Edit fixes the buggy fixture, native Build/Test executes, fresh parsed report has 3 discovered/3 passed; independent unchanged runner agrees                                               | native + independent process          | `complete`, `build-only`, `tool-agent`; fixture regression log                                                            |
| Z4-A05      | PASS: the model's structured PASS remains an opinion; genuine C# exit 1 and 3 failed assertions leave the Tool/run failed and block the success path                                                         | native                                | `model-pass`; [failed test summary](evidence/z4/native/model-pass/summary.json)                                           |
| Z4-A06      | PASS: zero tests, omitted report, genuinely earlier report, source changed during native permission, and different actual compiled build all remain nonpassing                                               | native + independent process          | `zero`, `missing`, `stale`, `wrong-source`, `wrong-build`                                                                 |
| Z4-A07      | PASS: path traversal/outside/junction and unsupported content rejected in source/native executor checks; actual HTML artifact remains inert text                                                             | service + native executor + native UI | artifact/path tests, native cwd-swap regression, `json-html`                                                              |
| Z4-A08      | PASS: targeted cancellation preserves unrelated Chat; actual process interruption and lost ACK persistence retain exact IDs and unknown outcome, with zero replay                                            | native                                | `cancel`, `crash`, `lost-ack`                                                                                             |
| Z4-A09      | PASS: duplicate/competing owners fail correctly; intent and ACK-write failures retain durable state; actual accepted-write boundary preserves sending intent before crash                                    | service + native                      | duplicate/competing owner/failed intent and ACK-write tests; historical three boundary regressions; `lost-ack`            |
| Z4-A10      | PASS: actual native synthetic environment secret is masked; metadata export excludes raw artifact content/argv; truncated streams withhold text                                                              | service + native executor + native UI | `redaction`, artifact export tests, native secret-at-cap regression                                                       |
| Z4-A11      | PASS: actual Agent native Read/Edit and ordinary Chat Read/Edit/test, permissions/questions/cancellation remain available without a demo-only tool allowlist                                                 | native                                | `complete`, `tool-agent`, ten historical regressions                                                                      |

Passing example: run `cba98ea8-d551-4a67-afe9-a542d2adbf01` used Agent session `sess_55284ccc-24db-4895-a44c-7f0b80a17bbb`, input `3456c1e3-7e91-4eac-ac2f-e6ffbcff11a6`. That one admitted input made **five controlled model requests**, including native Read/Edit tool turns. The Test operation `2892d9be-a7ea-4648-b884-306a7f26ab25` belongs to session `sess_69df283b-c39b-4056-898a-44a029852577`; source digest `295b19f442eebbacb47a3206595fb9de5a25226fe60be79880eaa0a2a2711bbe` and build digest `1a419fe380b6c1d000c95b5e8e7415f58f4f8950eceef3d81426c285b2d5976a` match its captured report. All five relevant Test facts are true, with **3 discovered / 3 passed / 0 failed / 0 skipped**.

Failed example: run `119e88c2-ad64-4aed-b314-9937b4b97454`, Test operation `008cf0a1-c4c6-4ece-b996-d680b04ff899`, session `sess_644a0749-7eb6-4f1c-9b01-3d56dbc92cc2` has **3 discovered / 0 passed / 3 failed / 0 skipped**. Its fresh report parses, but exit success and acceptance are false. The source digest is `3af6fe8fe94bb254957b25655535b00347820844deb0a62b6852d6320e3c295d`; build digest is `ac02bd9689c07d405badcb92e37043dfbf6496b370d769be48000323a9a61e90`. The Agent's one input made three controlled model requests and cannot change those machine facts.

The additional `tool-agent` native check passes the exact Test artifact to fresh session `sess_bd4d9d56-2a86-4c35-b2d7-7c6e98c3b9ba`, input `3e38f320-d226-4782-8b8c-73bee5e86eea`, and verifies the actual persisted native input/command and native Read. The human review gates in `complete` and the Agent evidence reviewer in `tool-agent` are distinct checks.

The unchanged actual [passing report bytes](evidence/z4/native/complete/test-report.json.txt) have SHA-256 `871548427aafe9df453b8b7b9cb4fed89a8a4780eb45516a51967f989a3712a9`; the [failing report bytes](evidence/z4/native/model-pass/test-report.json.txt) have SHA-256 `e45874ed842b90f8e44848baed92f91bc119f93b574389395d7462c2bec4ad48`. Their summaries retain the separate artifact manifests, native exit/output and attribution. A harness PASS on a negative scenario means the required refusal occurred, not that its tests passed. The cancellation scenario's one native Agent input belongs to the deliberately unrelated companion Chat.

The `lost-ack` scenario pauses the **initial accepted metadata write**, not a simulated native exit or a claimed dropped transport packet. Operation `3568fe79-97fa-4893-8dd5-1014f29cfe17` produced a real C# readiness receipt with its PID while the persisted attempt remained `sending`. Because that intentional owner stall prevents the new Graph view from publishing, the harness invokes the mounted panel's existing `onOpenConversation` callback (`WorkspaceShellLayout.handleSelectTaskInChat`) using only the already-created session/workspace identity, then accepts the actual native permission UI. The standard Open conversation button is separately verified in ordinary completed/running cases. After owned app shutdown/reopen, the operation remains interrupted/uncertain with no native restart, model input or fabricated result. The initial Graph-button and ordinary Search navigation failures are retained alongside this passing boundary proof.

Repository checks use the final source unless explicitly labeled intermediate. The source/test total is **233 passing tests**; desktop scenario counts are separate and are not added to that total.

| Check                                  | Actual result                                                                               | Retained evidence                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Root typecheck                         | PASS, exit 0                                                                                | [typecheck](evidence/z4/checks/final/typecheck.log)                                                                |
| CLI typecheck                          | PASS, exit 0, all 27 tasks successful                                                       | [CLI typecheck](evidence/z4/checks/final/cli-typecheck.log)                                                        |
| Graph/native Host source tests         | 121 PASS, 0 failed/skipped                                                                  | [Graph tests](evidence/z4/checks/final/graph-tests.log)                                                            |
| Source evidence tests                  | 13 PASS                                                                                     | [source tests](evidence/z4/checks/final/source-tests.log)                                                          |
| UI source tests                        | 25 PASS                                                                                     | [UI tests](evidence/z4/checks/final/ui-tests.log)                                                                  |
| Services/protocol/fixture regressions  | 64 PASS, including 7 actual independent C# fixture checks                                   | [regression tests](evidence/z4/checks/final/regression-tests.log)                                                  |
| Native recipe executor                 | 9 PASS                                                                                      | [native tests](evidence/z4/checks/native-executor/native-recipe-tests.log)                                         |
| Native empty-provider session creation | 1 PASS                                                                                      | [session test](evidence/z4/checks/native-executor/native-session-create-tests.log)                                 |
| Root lint                              | PASS, exit 0; 70 warnings, 0 errors                                                         | [root lint](evidence/z4/checks/final/lint.log)                                                                     |
| CLI lint                               | FAIL, exit 1; baseline 53 warnings/85 errors retained, no new diagnostic identities         | [CLI lint](evidence/z4/checks/final/cli-lint.log), [comparison](evidence/z4/checks/final/cli-lint-comparison.json) |
| Architecture                           | PASS; 0 violations, baseline 0, new 0                                                       | [architecture](evidence/z4/checks/final/architecture.log)                                                          |
| `pnpm verify:pre-push`                 | PASS, check only; no Git push performed                                                     | [pre-push check](evidence/z4/checks/final/verify-pre-push.log)                                                     |
| Native CLI bundle / desktop bundle     | PASS; final desktop rebuilt after UI wording correction                                     | [CLI build](evidence/z4/checks/final/cli-build.log), [desktop build](evidence/z4/checks/final/desktop-build.log)   |
| Full / scoped formatting               | FAIL full: 2,870 baseline paths; PASS scoped: no Z4-owned failures                          | [format log](evidence/z4/checks/final/format.log), [comparison](evidence/z4/checks/final/format-comparison.json)   |
| Final diff whitespace and preservation | PASS; 250 starting entries retained: 218 identical, 32 intentionally extended; none missing | [preservation inventory](evidence/z4/checks/final/preservation.json)                                               |

## Intermediate failures and corrections

Evidence is retained rather than replaced by a plan or a fabricated PASS:

- Initial integration command artifacts included an absolute cwd that the existing privacy redactor transformed, making otherwise exact command evidence incomplete. The artifact now records configured relative cwd; exact absolute native cwd remains in the owned operation identity. Service regressions pass.
- No-op Build reuse originally passed exit-only checks. Fresh pre/post output observations now reject unchanged prior outputs, independently of content-only fingerprints. All-skipped reports now fail, and test count bounds match the report contract.
- Review reproduced a source-change-during-session-create approval gap. Approval evidence is rechecked immediately before Tool start. Frozen recipe changes also stale v4 approval digests, preserving v3 compatibility.
- Review reproduced an unsuccessful metadata-write cache alias: the cached phase changed from `created` to unpersisted `sending`. The committed cache now uses a detached snapshot. Failed intent and acknowledgement writes retain their prior durable phases.
- Review reproduced mixed report/fingerprint and build/freshness observations. Retained report digest/length and build observation sets must agree before freshness/acceptance is asserted.
- Two actual native executor regressions reproduced partial secret exposure at the output cap and a cwd directory replaced by a junction while permission was pending. Withholding truncated stream text and revalidating cwd after permission fix both; all nine native executor tests pass.
- The first desktop harness attempt chose End=None. Actual readiness correctly rejected that invalid graph before any run/process/model request. Only the harness End selection was corrected; the initial failure and screenshot remain retained.
- The first provider-empty desktop Build failed at Host provider-readiness routing before dispatch. A real native protocol probe succeeded with an empty provider registry, locating the issue in the Host facade. The explicit recipe purpose and existing-session permission routing fix it; provider-free native Build now passes with zero native model inputs and zero model requests.
- Two actual desktop runs encountered Windows `EPERM` metadata replacement failures before command dispatch. A separate replacement probe reproduced 12 failures in 1,000 replacements without a reader and 668 with a continuous reader; the responsible OS actor is not identified. Graph now uses the existing shared `atomicWritePrivateTextFile` under its existing owner lock. Its bounded file-replacement retry does not replay native work. The bounded-reader repository regression passes; an extreme continuous-reader stress can still exhaust the finite retry and fail visibly. Historical boundary hooks were updated only to recognize the shared writer's temporary-file name, then their actual native regressions passed.
- The first complete desktop workflow executed three genuinely passing C# assertions but rejected its pretty-printed report because the existing feedback redactor minified unchanged JSON. Artifact capture now preserves original bytes only when the bounded duplicate-key-rejecting parser proves that the scrubbed values are identical. Actual secret removal remains incomplete evidence; hidden-secret duplicate-key tests still reject restoration. The complete native workflow now passes without changing the fixture's report format.
- Presentation harness retries reached actual provider-free Builds but failed to reopen the unrelated profile menu for language selection. The final presentation harness uses the normal menu for light theme and changes only its newly generated private profile's language before reopening completed history. This is rendering/reopen evidence, not a claim that the profile language-menu interaction passed.
- Visual review found Test-only report facts displayed as false on a successful Build. The inspector now labels them as Test report facts and shows localized Not applicable for Build/command; Tool deletion also names the correct node kind. The final narrow UI run checks these labels in English and Chinese. Screenshot-only retries (inherited resizing, unfitted viewport and clipped scroll framing) remain separate from functional results.

## Visual and operator evidence

All screenshots are actual Electron UI from isolated synthetic workspaces, not live-user evidence or mockups. [Native evidence](evidence/z4/native/index.json) includes immutable summaries and selected screenshots; [historical regression evidence](evidence/z4/regressions/index.json) separately labels ten final-Host passes and one earlier pre-Host-fix run. [Presentation evidence](evidence/z4/presentation/index.json) retains final and intermediate attempts.

- [Native graph design](evidence/z4/native/complete/z4-graph-design.png): the saved Agent, two Tool nodes and two Human Approval gates.
- [Native Build permission](evidence/z4/native/complete/z4-build-native-permission.png): the separate allow-once decision in Build's actual session.
- [Three passing tests and retained provenance](evidence/z4/native/complete/z4-positive-native-test-report.png): the Test inspector from passing run `cba98ea8-d551-4a67-afe9-a542d2adbf01`, with the final human evidence gate still pending.
- [Completed history reopened](evidence/z4/native/complete/z4-completed-reopened.png): the same completed run and retained artifacts after restarting the app, without redispatch.
- [Tampered artifact refused](evidence/z4/native/complete/z4-artifact-tamper-refused.png): a contained test changed retained bytes only; the original manifest's digest mismatch blocks inspection.
- [Chinese/light narrow canvas](evidence/z4/presentation/final-clarity-rendered/z4-chinese-light-narrow-canvas.png), [Tool inspector](evidence/z4/presentation/final-clarity-rendered/z4-chinese-light-narrow-tool-inspector.png), [artifact](evidence/z4/presentation/final-clarity-rendered/z4-chinese-light-narrow-artifact.png), and [Tool editor](evidence/z4/presentation/final-clarity-rendered/z4-chinese-light-narrow-tool-editor.png): actual 760 × 1000 desktop views, reviewed visually, with no document overflow. The existing Fit view control was used after resize. This is not mobile Web verification.

## User checks — separate

User authorization/performed-by/date/provider alias/real workspace: **NOT RUN / not supplied**. Live-user Read/Edit/test, permission/question, cancellation, restart and real-project outcomes: **NOT RUN**. No existing credentials, installed app profile, company repository or paid/live model was used. Controlled loopback providers and synthetic workspaces are separate evidence.

Z4 packaged installer, installed-app upgrade/uninstall, second-PC setup and distribution/publication: **NOT RUN**. The previously authorized z2.2 installer remains historical packaging; it does not contain these uncommitted Z3/Z4 changes.

## Diff and security review

Source changes are bounded to Graph evidence/orchestration/UI, the narrow existing native-session command extension, declared configuration and focused fixtures/docs. Historical reports, evidence, publisher/updater/identity settings and the separate prototype are preserved. No rule, architecture baseline or lint configuration was suppressed. Independent final review found no additional actionable defect in the native extension, provider-free routing, existing-only permission responses, detached durable cache or atomic metadata reuse. The final inventory is compared against the pre-Z4 working tree, not only HEAD, so preexisting Z3 work remains distinguishable. All 250 starting changed/untracked entries are still present: 218 are byte-identical and 32 were intentionally extended for Z4, including the current progress document. Historical Z3 reports/evidence and unrelated reference files are byte-identical. Release, updater, identity and packaging paths have no new diff; HEAD remains unchanged and the index is empty.

CLI lint remains a named baseline exception: **85 errors and 53 warnings**, with **zero new or removed diagnostic identities** in a multiset comparison. This is not a lint PASS. Three preexisting `max-lines` violations grew through narrow wiring: `create-app.ts` 1,145 → 1,155 counted lines, `app/types.ts` 591 → 592, and protocol `server.ts` 827 → 834. The [retained comparison](evidence/z4/checks/final/cli-lint-comparison.json) records counts, identities and changed positions. Full formatting still fails on **2,870 paths**, compared with 2,872 at baseline: no new failing paths, and the two touched session facade files are removed from the failing list. Z4-owned source/spec/evidence files pass scoped formatting. No whole-repository reformat or rule suppression was used.

Content is local, bounded and redacted where supported; no encryption, general retention manager, filesystem indexer or tamperproof certification is claimed. Snapshot digests at observed instants do not detect every intervening external write. Recipe execution is a trusted-workspace feature and can execute repository code, not an OS/network sandbox. Native root-child exit is observed; existing descendant cleanup is best effort. Incremental builds that do not recreate every declared output can conservatively fail freshness and should use a configured rebuild. Reports support the documented `zcode-test-v1` JSON envelope only; direct xUnit/TRX/JUnit interoperability is not implemented.

Additional bounds: artifact text is at most 256 KiB; strict JSON is bounded to depth 16 and 4,096 members/items; local schemas to 32 KiB, depth 8 and 256 nodes. The report contract permits at most 1,000 tests but the shared JSON member limit also applies, so larger reports with more fields can fail earlier. Mixed prose containing JSON that the privacy scrubber reformats remains conservatively incomplete. Declared binary file fingerprints are bounded to 32 MiB per file and 32 files; empty source declarations explicitly cover no sources. These limits do not authorize arbitrary paths or implicit whole-repository capture.

## Exact local reproduction and manual check

Prerequisites for these verified commands: Node 24.14.0 and pnpm 10.33.2 from `mise.toml`, the checkout's prepared dependencies/Electron runtime, and .NET SDK 8.0.425 for the C# acceptance fixture. Run PowerShell in the repository root. The first two lines below select this machine's previously prepared project-local toolchain; on another development machine, put those same pinned Node/pnpm versions on PATH instead. A fresh dependency installation or second-PC build was **NOT RUN** in this assignment. The isolated launcher is required for these checks; the ordinary production launcher is not the test setup.

Use Node 24.14.0/pnpm 10.33.2, the prepared checkout dependencies and .NET SDK 8.0.425 for the C# proof. Follow [Z1_SETUP.md](Z1_SETUP.md) if the local toolchain is absent. Fresh dependency installation on another PC has not been recertified by this assignment. Commands run from the repository root in PowerShell:

```powershell
$z4Tools = Join-Path (Get-Location) '.tmp/z1-toolchain'
$env:PATH = "$z4Tools;$z4Tools\node-v24.14.0-win-x64;$PWD\node_modules\.bin;$env:PATH"
$env:HUSKY = '0'
$env:PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN = 'false'
$env:npm_config_cache = Join-Path (Get-Location) '.npm-cache'
$env:ELECTRON_CACHE = Join-Path (Get-Location) '.electron-cache'
pnpm typecheck
pnpm --dir apps/zcode-cli typecheck
pnpm lint
pnpm --dir apps/zcode-cli lint --continue
pnpm architecture:check --changed
pnpm fmt:check
$graphTests = @(Get-ChildItem packages/services/src/graph-engineering -Recurse -Filter '*.test.ts' | ForEach-Object FullName)
node node_modules/tsx/dist/cli.mjs --test @graphTests packages/services/src/zcode-agent/*.test.ts
node node_modules/tsx/dist/cli.mjs --test packages/services/src/git/sourceSnapshot.test.ts packages/services/src/git/sourceSnapshot.edges.test.ts
node node_modules/tsx/dist/cli.mjs --test apps/zcode-cli/packages/bootstrap/src/app/native-recipe.test.ts
node node_modules/tsx/dist/cli.mjs --test apps/zcode-cli/packages/bootstrap/src/app/native-session-create.test.ts
node node_modules/tsx/dist/cli.mjs --test packages/services/test/*.test.ts apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/interaction-registry.test.ts scripts/graph-engineering/*.test.mjs
$env:TSX_TSCONFIG_PATH = 'packages/ui/tsconfig.json'
node node_modules/tsx/dist/cli.mjs --test packages/ui/test/*.test.ts
Remove-Item Env:TSX_TSCONFIG_PATH
# Complete emitting checks before building or launching these isolated apps.
$env:ZCODE_ENV = 'test'
node scripts/build-desktop-agent-cli.mjs
pnpm --filter @zcode/desktop build:no-runtime-assets
node scripts/graph-engineering/z4-native-smoke.mjs --scenario=build-only
node scripts/graph-engineering/z4-native-smoke.mjs --scenario=complete
node scripts/graph-engineering/z4-native-smoke.mjs --scenario=model-pass
node scripts/graph-engineering/z4-native-smoke.mjs --scenario=zero
node scripts/graph-engineering/z4-native-smoke.mjs --scenario=missing
node scripts/graph-engineering/z4-native-smoke.mjs --scenario=stale
node scripts/graph-engineering/z4-native-smoke.mjs --scenario=wrong-source
node scripts/graph-engineering/z4-native-smoke.mjs --scenario=wrong-build
node scripts/graph-engineering/z4-native-smoke.mjs --scenario=cancel
node scripts/graph-engineering/z4-native-smoke.mjs --scenario=redaction
node scripts/graph-engineering/z4-native-smoke.mjs --scenario=json-field
node scripts/graph-engineering/z4-native-smoke.mjs --scenario=json-whole
node scripts/graph-engineering/z4-native-smoke.mjs --scenario=json-invalid
node scripts/graph-engineering/z4-native-smoke.mjs --scenario=json-oversized
node scripts/graph-engineering/z4-native-smoke.mjs --scenario=json-html
node scripts/graph-engineering/z4-native-smoke.mjs --scenario=tool-agent
node scripts/graph-engineering/z4-native-boundaries.mjs --scenario=crash
node scripts/graph-engineering/z4-native-boundaries.mjs --scenario=lost-ack
node scripts/graph-engineering/z4-native-presentation.mjs
```

The native harness creates private app/HOME/config/data and workspace directories, blocks external application traffic and uses controlled loopback providers where an Agent Task is required. It launches actual Electron/Host/CLI and actual tools. Run it in an environment that permits these child processes; do not substitute the installed-profile launcher, broad process termination or private database rewrites.

The actual manual launcher fresh setup and exact-profile reopen both passed in a disposable profile with zero model requests/inputs, unchanged fixture/configuration/sentinel bytes, and identical settings across reopen. The recipe-printer helper also passed. The actual `--verify` helper ran against another genuinely offline-built synthetic manual fixture: exit 0 and all three named assertions passed, operation `bbedc3e7-07c2-40b2-a7c3-6e3a3192a3b6`. See [setup](evidence/z4/native/manual-setup/summary.json), [reopen](evidence/z4/native/manual-reopen/summary.json), and [independent helper](evidence/z4/native/manual-verify/summary.json). These are automated setup checks, not user-operated acceptance. The first reopen check failed because its screenshot helper resized the native window and legitimately changed private window settings; preserving the original size corrected the harness.

For user-operated testing, run `node scripts/graph-engineering/z4-launch-manual.mjs`. It creates a fresh isolated app and buggy synthetic C# workspace, configures no provider and submits no task/command. Configure an authorized provider only in that isolated app if testing Agent Tasks. Tool-only paths need no provider. This manual mode permits the user's explicitly configured provider traffic.

1. Follow the launcher's printed `Start → Implement → Review code → Build → Test → Review evidence → End` instructions. Rename the initial Agent Task to Implement, add Build/Test as Tools, and add Review code/Review evidence as Human Approval nodes. Select each node and set its Next node to the next member of that chain; node positions do not determine execution order. Copy Build's visible Node ID. Use the printed `z4-manual-recipes.mjs --profile ... --build-node-id ...` command to print the matching recipe array. Load project recipes, paste and Save; select each recipe and set End's result source to Test.
2. Enable Implement's printed strict JSON schema. Configure Review code to require the Implement `structured` artifact and a comment; configure Review evidence to require Test's `test` artifact and a comment. Save, inspect readiness and explicitly Run.
3. Respond to native permissions separately from the Graph gates. Open conversation must select each node's existing native session. Compare its stored session/input/operation ID with the inspector. Opening a session or entering a comment must not create another input/process.
4. Inspect the real Build and Test output, exact operation/source/build identities and the three named tests. A successful run needs 3 discovered/3 passed/0 failed/0 skipped, fresh parsed report and accepted evidence. Run the printed independent `z4-manual-recipes.mjs --profile ... --verify` command afterward; preserve unchanged runner/test sources.
5. Inspect artifacts and metadata-only manifest export. HTML remains text, unsupported binary artifacts remain visibly incomplete, and no raw content or substituted secret value belongs in exported metadata. A model reviewer outcome remains an opinion.
6. Quit and reopen with the exact printed `z4-launch-manual.mjs --profile ...` path; preserve history without new work. Test pending approval, targeted cancellation and interrupted/no-replay behavior in separate disposable runs. Record exact identities and results; do not mark these checks PASS until actually performed.

## Next eligible milestone

Z5 is the next roadmap milestone after Z4 verification and the applicable user/lead acceptance decision. **Not started.** Staging, commit, push, merge, packaging publication or installed-profile modification for this assignment: **none**.
