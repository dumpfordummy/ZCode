# Graph Engineering handoff to GLM-5.2

Focused native reviewer acceptance is complete. No publication or Z8 work is authorized. Read the repository AGENTS.md, [acceptance specification](CODEX_ACCEPTANCE_SPEC.md), and [closeout](CODEX_CLOSEOUT.md) before changing code. This document is the portable entry point; the receiving machine needs no conversation history.

## Source identity and transfer

- Original Codex acceptance base: `ed3bd3a86ea8556f5ebd4e070c177270f1a1586d`.
- Pre-handoff HEAD: `ffe9f48ef89a6bbea4ea8ddfdb7fe23875f78a93` (`Audit`), on `main`.
- Origin: `https://github.com/dumpfordummy/ZCode.git`.
- Handoff branch: `handoff/graph-pre-z8-codex`.
- Handoff payload commit: `fc265a34172f88f3146e54ad669ea56e006f71ae` (`handoff: complete Graph reviewer native acceptance`). A subsequent documentation-only receipt commit records this immutable SHA. The final transfer tip includes that receipt; obtain its full SHA with `git rev-parse HEAD` and compare it with `git ls-remote origin refs/heads/handoff/graph-pre-z8-codex`. A commit cannot literally contain its own hash, so the final tip is verified through Git rather than a self-referential field.

At handoff start, status and both staged/unstaged diffs were empty. The required freshness fetch confirmed local main equals origin/main. The intervening Audit commit already contains all acceptance source, tests, reports and 319 next-iteration evidence files. It also contains the earlier documentation-only changes under `docs/graph-engineering/pre-z8/glm-handoff/`: BACKLOG.md, HANDOFF.md, and evidence/document-format-check.log, handoff-validation.json, work-time-estimate.json. Those are unrelated prior work and remain untouched.

The closeout describes the historical end of acceptance, when those changes were uncommitted. Its statements about main/HEAD and no commit/push are historical, superseded for transfer by the identities here. All 35 source/attribution receipt entries still match their recorded SHA-256 bytes. No product source changed during this handoff, so expensive native scenarios were not repeated merely to commit documentation.

## Files and reasons

Paths below are repository-relative. These changes are already in Audit unless explicitly marked handoff-only.

### Reviewer/template contract

No production contract rewrite was necessary during acceptance. Existing `packages/services/src/graph-engineering/app/workflow-service.ts` pins built-in version 2; `domain/workflow-sample-nodes.ts` supplies request and verification; `app/artifacts.ts` enforces strict parsing and bound references. These paths share the `packages/services/src/graph-engineering/` prefix. Preserve their implementation, not merely this description.

`architecture-policy.yaml` removes the reproduction test's max-file-lines exception. It now has `exceptions: []`; thresholds and baseline were not relaxed.

### Native reviewer acceptance harness

Under `scripts/graph-engineering/`:

- `reviewer-native.mjs`: isolated scenario driver, native UI admission, final-state assertions and retained receipts.
- `reviewer-native-fixture.mjs`: synthetic ignored source, declared Node Build/Test recipes and scripts.
- `reviewer-native-responses.mjs`: controlled loopback model replies and real native Read/Edit requests.
- `reviewer-native-proof.mjs`: native ledger, command identity, report, verification, reviewer binding and gate assertions.
- `reviewer-native-ui.mjs`: ordinary Workflows/setup/Design interactions and exact-size native captures.
- `z6-provider-fixture.mjs`: optional responder injection with existing default preserved; records offered tools and replies.
- `pre-z8-u1-ui.mjs`: optional exact content-size capture; existing callers retain default behavior.

These reuse existing isolation, z5/z6 native transport, recipe readers and permission helpers. The driver never substitutes direct Build/Test execution for Graph Tool operations.

### Production UI changes

Under `packages/ui/src/graph-engineering/`:

| File                        | Why it changed                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| GraphWorkflowSummary.tsx    | Separate task request from selected Context; show saved checks without implying execution; use existing translated Run action. |
| graphWorkflowSummaryData.ts | Derive saved configuration/context summaries without introducing service state.                                                |
| graphRequestText.ts         | Extract task only from a verified canonical request envelope, otherwise retain actual captured input.                          |
| GraphRunHistory.tsx         | Distinguish workflow name from request and restore Enter/Space row activation.                                                 |
| GraphRunOverview.tsx        | Present captured request and persisted current reviewer output validation distinctly.                                          |
| graphRunOutputs.ts          | Select current iteration/attempt output without a stale fallback.                                                              |
| GraphRunActions.tsx         | Identify reviewer validation failure from actual outputValidation, not machine-check invalidity.                               |
| GraphCanvas.tsx             | Keep zoom at least 0.85 and center the selected measured node when viewport dimensions change; no topology mutation.           |

`packages/ui/src/i18n/locales/graphPreZ8.ts` and `graphRunClarity.ts` provide the corresponding task/context, saved-check and validation wording.

### .NET proof correction

`scripts/graph-engineering/pre-z8-u2-proof.mjs` derives fixture TRX privacy expectations from original generated bytes: VSTest adds absolute assembly paths even for synthetic source. It independently verifies user-path removal and preserves validation/digest checks. `pre-z8-u2-proof.test.mjs` covers clean and sensitive metadata. Product redaction, SDK selection, global.json and frameworks are unchanged.

### Service and UI tests

Under `packages/services/src/graph-engineering/adapters/`, the former oversized test is split into `reviewer-reproduction.test.ts`, `reviewer-decisions.test.ts`, `reviewer-version.test.ts`, `reviewer-reproduction.fixture.ts`, `reviewer-reproduction-data.fixture.ts`, and `reviewer-reproduction-helpers.fixture.ts`. The seven cases retain coverage. Their simulated native ports are explicitly service-level tests, not desktop proof.

`packages/ui/test/graphReviewerPresentation.test.ts` and `graphWorkflowSummaryData.test.ts` cover the bounded presentation changes. The native driver above supplies interaction acceptance.

### Documentation and evidence

`CODEX_ACCEPTANCE_SPEC.md` defines ownership and acceptance. `CODEX_CLOSEOUT.md` retains full results, build identities, exact gate/session/artifact IDs, screenshot links and a manual checklist. Small `evidence/final-scenarios.json` and `evidence/dotnet-results.json` index the accepted runs. The closeout's 14 linked native screenshots cover both requested sizes and label negative cases.

Handoff-only additions are this document and `evidence/handoff-checks.json`. No new profiles, runtime logs, build outputs, authentication/config stores or dependencies are staged. Large logs and machine-path dumps already exist in the remotely published Audit ancestor; this handoff does not re-add or rewrite that history. Treat them as historical diagnostics, never destination configuration. All earlier failures remain retained. Local `.tmp` profiles and new handoff command logs stay local.

## Contracts to preserve

- Graph Host owns admission, attempts, immutable artifacts, validation and approval requests. Native sessions own Read/Edit, recipe execution, permissions and terminal facts. Main forwards/schedules; it does not own Graph business state. The acceptance spec includes the event sequence diagram.
- Reviewer receives original request plus current Test verification. Only explicitly bound artifact IDs may be cited. Nested reportArtifactId does not establish an independent binding.
- Output must be exactly one schema-valid JSON object, without prose/fences. Do not add extraction or permissive recovery. Preserve ownership, workspace/run association, freshness, digest and schema validation.
- Genuine failed Test routes to run-level NeedsHuman before reviewer admission in this template. It cannot become reviewer PASS.
- Valid needs_changes and needs_human complete the reviewer with valid output and reach the final human gate. Invalid output fails the reviewer attempt and routes to run-level NeedsHuman without that gate. These are different facts despite similar labels.
- Declared ignored/untracked sources are allowed with valid fingerprints/provenance. Git tracking is not universal acceptance policy.
- Reviewer retains ordinary native tool capabilities. No-command instructions are prompt guidance, not a capability boundary. No new permission model or Build/Test permission-policy change was introduced.
- Built-in generic Sequential Engineering v2 is selected explicitly for new instantiation. Historical saved definitions/runs are not rewritten or silently migrated.

## Accepted normal UI path

Workflows shows Task request separately from Context (documents/instructions/skills) and labels Build/Test as saved configuration, not completed checks. Project setup preserves a saved-check list and one intelligible editor. Design uses readable zoom and selection focus with a populated inspector after node/mode/tab transitions; users pan the long graph instead of shrinking every label. At 720px height setup scrolling is expected.

Runs shows workflow name and actual captured request distinctly, retains raw input access, and separates output-validation failure from valid reviewer outcomes. Actionable approval/failure states do not show No action required. The happy path stops at Final human review / WaitingForApproval; it is not automatically approved. No additional collapsible sections or broad redesign were added.

## Historical acceptance results

All following scenario harnesses exited 0 on the final frozen Desktop/CLI build. Real native sessions performed the edit, Build/Test and artifact capture; only model responses were controlled. Node Test accepted one named assertion with matching current operation/source/build identities, except the intentional failed-Test case.

| Case           | Run ID                               | Result                                                                                          |
| -------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| pass           | 2535e508-4717-46e0-ab9b-9391b2301d68 | Valid pass; final human gate pending.                                                           |
| prose-fence    | f0b3ad3a-2984-4992-9c25-33299c8f5586 | Strict output validation rejected.                                                              |
| unbound-report | be9f0186-bc6f-4c18-ab3a-be5b622a7e9e | Evidence reference rejected.                                                                    |
| needs_changes  | 35b3a12b-9122-41f2-85c9-59889859a1b0 | Valid decision; human gate pending.                                                             |
| needs_human    | ed2d29ab-ca8a-438b-85f9-880ad6853aae | Valid decision; human gate pending.                                                             |
| test-failure   | a7b199ff-8fe9-46d8-bee4-b6038d780655 | Test exit 1, one failed assertion; no reviewer dispatch.                                        |
| .NET U2 pass   | 3a6c5f18-983e-43bc-8724-1ece2ed593ab | System SDK 8.0.425; four tests, three passed, one skipped, zero failed; restart without replay. |

The initial .NET run's native Build/Test succeeded but the old harness privacy assertion failed; it was not an SDK availability failure. The original local SDK path was absent at inspection; the system SDK supplied 8.0.425 without installation or policy changes.

See the closeout for the frozen Main/Host/preload/renderer/CLI hashes and prior 360 service, 118 UI and 19 helper passes. This is historical evidence after transfer, not proof of execution on the GLM machine. Live-model adherence, user-operated acceptance, final human approval, packaged/installed qualification, other platforms, publication and Z8 were NOT RUN or intentionally pending.

## Reproduction on the receiving machine

Run from repository root. Inspect mise.toml and use Node 24.14.0 / pnpm 10.33.2. Inspect existing dependencies, CLI runtime assets, Electron and local/system .NET SDKs before native execution. Do not expect this machine's `.tmp` toolchains/profiles or shell environment. Never copy absolute user-directory paths into product configuration. No new dependency or SDK installation is authorized by this handoff.

Required checks:

```powershell
node scripts/check-workspace-freshness.mjs
pnpm typecheck
pnpm lint
pnpm architecture:check --changed
node --import tsx --test packages/services/src/graph-engineering/adapters/reviewer-reproduction.test.ts packages/services/src/graph-engineering/adapters/reviewer-decisions.test.ts packages/services/src/graph-engineering/adapters/reviewer-version.test.ts
node --import tsx --test packages/ui/test/graph*.test.ts
node --test scripts/graph-engineering/pre-z8-u2-proof.test.mjs scripts/graph-engineering/pre-z8-u2-fixture.test.mjs scripts/graph-engineering/z6-provider-responses.test.mjs
```

Full Graph services (PowerShell):

```powershell
$graphTests = @(Get-ChildItem packages/services/src/graph-engineering -Recurse -Filter '*.test.ts' | Sort-Object FullName | ForEach-Object FullName)
node --import tsx --test @graphTests
```

Two genuine-TRX replay cases require PRE_Z8_TRX_FIXTURE_MANIFEST. Without it, report skips honestly. To regenerate on an appropriately provisioned machine, run `node --import tsx --test scripts/graph-engineering/pre-z8-dotnet-fixture.test.mjs`; inspect its printed Genuine VSTest evidence path and successful evidence.json, then set `$env:PRE_Z8_TRX_FIXTURE_MANIFEST` to that newly generated absolute path before the full service command. Do not reuse a nonexistent source-machine path or infer native execution from replay tests.

Serialize emitting builds in this order; do not build while native checks run:

```powershell
pnpm typecheck
pnpm --dir apps/zcode-cli typecheck
pnpm --dir apps/zcode-cli build
pnpm --filter @zcode/desktop build:no-runtime-assets
```

Inspect existing runtime assets first; this command intentionally avoids downloading replacements. Record new build hashes if rerunning acceptance.

```powershell
node scripts/graph-engineering/reviewer-native.mjs --scenario=pass
node scripts/graph-engineering/reviewer-native.mjs --scenario=prose-fence
node scripts/graph-engineering/reviewer-native.mjs --scenario=unbound-report
node scripts/graph-engineering/reviewer-native.mjs --scenario=needs_changes
node scripts/graph-engineering/reviewer-native.mjs --scenario=needs_human
node scripts/graph-engineering/reviewer-native.mjs --scenario=test-failure
dotnet --list-sdks
node scripts/graph-engineering/pre-z8-u2-native.mjs --scenario=pass
```

Native UI requires a usable desktop session and ordinary process permissions. Keep the controlled loopback provider and existing permission helpers. For .NET, global.json pins 8.0.425 with rollForward disabled. Existing z4-fixture.mjs accepts PRE_Z8_DOTNET_ROOT pointing to an inspected SDK installation root containing dotnet; leave it unset when the correct system installation supplies the SDK. Do not change global.json, install another SDK, relax rollForward, or alter target frameworks without separate authorization.

## Fresh handoff checks and next state

On 2026-09-28, freshness, root typecheck, lint, architecture and the three focused reviewer test files all exited 0. Reviewer tests: seven passed, zero failed/skipped. Lint: 75 warnings, zero errors. Architecture: zero violations/baseline/new; no exceptions. All 35 source receipt hashes matched. See [small check receipt](evidence/handoff-checks.json). No native rerun was needed because source behavior is byte-identical to accepted evidence.

Focused acceptance is complete; no release was published and no Z8 work started. Human acceptance, live-provider evaluation, final human approval and package qualification remain separate future work requiring their own scope. Do not invent a next milestone or continue implementation merely because this handoff exists.
