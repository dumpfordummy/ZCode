# TASK_001 — Repair U4 pre-run navigation and prove owned cancellation

## Outcome and bounded scope

On a fresh isolated synthetic workspace, the U4 cancellation driver starts a separate ordinary Chat and leaves its native question unanswered, returns to the existing Graph **Design**, opens the real preflight, and explicitly starts the prepared agent-assisted run. The unchanged native flow then edits the fixture, cancels the exact owned Implement input, preserves the edit and unrelated Chat, and reopens the same cancelled history after restart without replay.

Completion requires the actual cancellation scenario to pass with retained evidence. Fixing the missing navigation alone is not enough to claim the scenario passed; later assertions may expose another defect. Record a new blocker if that happens.

This task changes the acceptance harness/specification and evidence only. Non-goals: product UI/runtime/service changes, modifying the shared `showGraph` behavior, new dependencies/frameworks, U5 implementation, other U4 native journeys, broad refactoring, cleanup of unrelated changes, CLI policy changes, live providers/company projects, parallel support, or Z8. No development-repository staging, commits, pushes or publication.

## Confirmed failure, not an assumption

The copied [attempt-1 receipt](evidence/u4-cancel-attempt-1/pre-z8-u4-summary.json) and [screenshot](evidence/u4-cancel-attempt-1/pre-z8-u4-failure.png) describe the actual preceding attempt:

- `scenario: pre-z8-u4-cancel`, `status: FAIL`; timeout at `pre-z8-u4-native.mjs:96` waiting for `graph-run-button`.
- `startU4Companion()` calls `showGraph()`. That shared helper deliberately selects **Runs**. `GraphEditor` renders Run only under **Design**.
- The page is Runs with “No runs yet”; `finalRecord.runs` is empty. There is one companion input and one controlled loopback model request. No provider hold or Graph Edit/cancel boundary was reached.
- Companion IDs in this failed fixture: session `sess_22fa0946-2844-4fad-8c22-d38ea8278372`, input `queue_01a0dfcc-f4a9-71f2-a92d-abf8394dcd77`. New fixtures must get their own actual IDs; these are evidence, not constants to reuse.

Original log: `.tmp/pre-z8-current/u4-native-cancel-1.log`. Original profile: `.tmp/z1-native-1790461139054-5cede5`. Preserve both and the copied evidence. Do not resume or rewrite this failed profile to make it appear successful.

## Preconditions to recheck

1. Read root `AGENTS.md`, [HANDOFF.md](HANDOFF.md), `U4_RUN_SPEC.md` and `pre-z8-u4-native-spec.md` in the parent directory. Use `.agents/skills/architecture-governance/SKILL.md` for the harness code change; update the relevant native spec before editing behavior.
2. Confirm branch/HEAD and actual dirty files against `evidence/checkout-snapshot.json`. Preserve all prior changes. The 72 tracked modifications and many untracked programme files are intentional working state, not a clean baseline.
3. Confirm the driver still has this missing navigation and the product still exposes `graph-view-design` and Design-only Run. If the checkout has changed, investigate the delta before applying the old diagnosis.
4. Confirm pinned Node/pnpm, installed dependencies, available local Electron/CLI outputs and fixture support. No emitting build/native process may conflict with the next command. Check that `Z1_PACKAGED_EXE` is absent.
5. Recheck the four artifact hashes in HANDOFF and relevant source hashes in the snapshot. Those files matched the failed attempt at handoff. Hash equality alone is not proof of complete output coverage; if needed outputs/source changed or are missing, rebuild serially and label the new artifact.
6. Use `createIsolation()` and its generated `.tmp` workspace/profile with `startU4Fixture`; retain normal native permissions and private-home isolation. No installed configuration/credentials or live GLM endpoint is required.

The navigation fix needs no product decision. OS/tool permission needed to start a normally sandboxed fixture must be handled through the receiving agent's legitimate approval mechanism, not a test flag that disables sandboxing.

## Exact source and useful references

All paths below are repository-relative. Symbols/selectors were verified in the actual checkout; line numbers are locators at handoff, not durable API.

| File / symbol                                                                                                                                             | Read for                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/graph-engineering/pre-z8-u4-native.mjs`, scenario setup around lines 89–96                                                                       | `startU4Companion` detour immediately precedes the Run click. Own the explicit pre-run Design navigation at this U4 orchestration boundary. The same file already owns confirmation, cancellation/complete branching, restart, receipt writing and `finally` cleanup. |
| `scripts/graph-engineering/pre-z8-u4-cancel.mjs`, `startU4Companion`, `driveU4Native`, `cancelU4AfterEdit`, `completeU4Companion`                         | Real native question and exact companion identity; existing permission/question navigation; hold-after-edit, cancellation and later Chat proof. These are existing implementation, not tasks to rewrite.                                                              |
| `scripts/graph-engineering/z3-native-helpers.mjs:28`, `showGraph`                                                                                         | Opens Graph if needed and selects `graph-view-runs`. Retain this contract; cancellation/history helpers and older tests rely on it.                                                                                                                                   |
| `scripts/graph-engineering/pre-z8-u3-common.mjs`, `ledger`, `modelCount`, `readGraphRecord`, `readU3OptionalRecord`, `assertU3FixturePreserved`, `u3Wait` | Existing read-only observations and bounded waits. `assertU3Idle` assumes zero inputs and is appropriate before creating the companion, not afterward.                                                                                                                |
| `scripts/graph-engineering/pre-z8-u4-ui.mjs`, `captureU4Guided` around line 143                                                                           | Already selects `graph-view-design` through the public control. `selectU4Run`, `assertU4Summary`, `openU4Native`, `captureU4Summary` provide existing exact-run observations.                                                                                         |
| `packages/ui/src/graph-engineering/GraphEditor.tsx`, `showingDesign`, `showingRuns`, `graph-run-button`                                                   | Actual destination-dependent rendering. Run invokes existing preflight for graph v5. Reference only; do not edit product code to satisfy the driver.                                                                                                                  |
| `packages/ui/src/graph-engineering/GraphEditorNavigation.tsx`, `destinations`                                                                             | Existing public buttons `graph-view-workflows`, `graph-view-design`, `graph-view-runs`, `graph-view-setup`; no new navigation API needed.                                                                                                                             |
| `scripts/graph-engineering/pre-z8-u4-provider.mjs`, `startU4Fixture`, `u4Response`, `releaseHeld`, `U4_COMPANION_*`                                       | Controlled provider requests actual Read/question/Edit; holds only the response following exact successful native Edit. Companion completion requires its real explicit answer.                                                                                       |
| `scripts/graph-engineering/pre-z8-u4-proof.mjs`, `assertU4Cancellation`                                                                                   | Independent assertions on persisted Graph facts and native ledger identities; do not weaken them.                                                                                                                                                                     |
| `scripts/graph-engineering/pre-z8-u4-{provider,proof,artifact-fault}.test.mjs`                                                                            | Ten existing fixture/proof/restoration tests. The three concrete filenames are in the command below. Pure/HTTP coverage does not exercise Design navigation.                                                                                                          |
| `scripts/graph-engineering/isolation.mjs`, `createIsolation`; `acceptance-paths.mjs`, `acceptancePaths`; `z3-fixture.mjs`, `AFTER_SOURCE`                 | Existing owned profile/process/fixture lifecycle, exact storage paths and before/after source oracle. No new isolation system is needed.                                                                                                                              |
| `packages/ui/test/graphRunSummary.test.ts`                                                                                                                | Deterministic separation of cancel intent/unknown/terminal display. Do not make a transient screenshot the only oracle.                                                                                                                                               |
| `packages/services/src/graph-engineering/app/service.test.ts`, `app/sequential-service.test.ts`, `adapters/recovery.test.ts`                              | Existing late-completion/cancellation/Unknown/recovery invariants. Service race evidence is a different layer from HTTP abort observation.                                                                                                                            |

Expected edits:

1. `docs/graph-engineering/pre-z8/pre-z8-u4-native-spec.md`: specify the public return-to-Design boundary after the companion detour and its zero-execution/preservation assertions. Correct the stale preparation status with actual evidence references, without deleting historical failures.
2. `scripts/graph-engineering/pre-z8-u4-native.mjs`: small explicit navigation and meaningful pre-run observations/receipt. Prefer the existing U4 callsite; do not change generic history helpers or introduce a new navigation subsystem.
3. `scripts/graph-engineering/pre-z8-u4-ui.mjs` or `pre-z8-u4-cancel.mjs` only if a cohesive observation helper is necessary. Avoid moving unrelated code. Any new test helper must observe public UI/owned records rather than set stores or inject native outcomes.
4. Compact progress/evidence: update `EXECUTION_PLAN.md` and the U4 lane receipt with real new status; archive the new attempt under a distinct directory in `docs/graph-engineering/evidence/pre-z8/u4/` and add a manifest/index without replacing history evidence. Record the exact remaining U4 next action. A separate phase report is not requested.

No product files, package manifests, lockfiles, runtime controls or historical evidence should change. Add the required brief Chinese bug-fix comment explaining why the companion return leaves the driver in Runs and why explicit Design selection is necessary.

## Behavior and interface contracts

- `showGraph(window)` continues to mean open Graph **Runs**. The U4 caller explicitly chooses Design through `graph-view-design` before looking for Run. Wait for the actual expected public control/readiness, not elapsed time, force clicks, hidden DOM invocation or a direct React/Zustand mutation.
- Before and after this navigation, preserve the prepared definition/revision/request/reference selection, owned source/test bytes and fixture configuration. The post-companion native ledger still contains that one input and the model-request count does not grow. Do not call the zero-input `assertU3Idle` after the deliberate companion submission.
- Opening `graph-run-confirmation` performs static preparation only: ledger and model-request count remain unchanged; `graph-confirm-run` stays disabled before `graph-preflight-ack`. Acknowledgement and the existing explicit Confirm Run remain the only admission path.
- The frozen confirmation must still contain `definition.template.id === "agent-assisted"` and the selected instructions reference with `delivery === "native-instructions"`. Check the eventual run against that exact reviewed snapshot; do not regenerate a substitute design to fix navigation.
- Graph owns run/admission/cancel state. Native services own actual session/input, permissions/questions, tools and terminal proof. The driver performs public actions and read-only observations. No artificial run, ledger row, terminal event, approval or report may be inserted.
- Hold the controlled provider response only after the exact successful native Edit. The fixture source must equal `AFTER_SOURCE`; the independent test file must remain byte-identical. Hold no unrelated session and do not increase provider/tool authority.
- Cancellation is not success based on UI text. Require the existing `assertU4Cancellation` proof: same Implement node/attempt/command/session/input, `completedInterrupted`, matching `sourceCommandId`, nonempty `logEpoch`, nonnegative integer sequence, and `cancelRequestedAt` no later than terminal record updates.
- Exactly three admitted inputs are allowed: Analyze, Implement and the independent companion. Graph sessions must differ from the companion. No Review admission, Tool attempt, final-gate request/decision or run result is permitted after cancellation.
- Release the held provider response and record actual connection state. An already-aborted connection is not a delivered late native terminal event. Preserve service race tests for that separate case.
- Already-written source remains, unrelated Chat stays on its same unanswered question and completes only after its explicit answer. The cancelled Graph record stays identical. Restart the same owned profile through existing `stopApp`/`launch`; do not admit any replay, replacement session or extra model request.
- Record transient Stop requested UI only if observed. A fast abort may make it unobservable in the native screenshot; deterministic projection tests separately cover that display state. Do not add runtime delays to manufacture a screenshot.

```mermaid
sequenceDiagram
  participant Driver
  participant UI as Public Graph / Chat UI
  participant Graph as Graph owner
  participant Native as Native session owner
  Driver->>UI: Create independent Chat, leave question waiting
  Driver->>UI: Return through showGraph (Runs)
  Driver->>UI: Explicitly select Design
  Note over Driver,Native: Same draft, source, ledger and model count
  Driver->>UI: Open preflight, acknowledge, Confirm Run
  UI->>Graph: Existing reviewed Run command
  Graph->>Native: Analyze then Implement
  Native-->>Driver: Actual successful Edit reaches controlled provider
  Driver->>Graph: Public Cancel for selected run
  Graph->>Native: Exact owned cancellation
  Native-->>Graph: Authoritative interrupted terminal proof
  Driver->>UI: Answer same independent Chat, restart same profile
  Note over Graph,Native: Cancelled history unchanged; no successor or replay
```

## Ordered implementation

1. Recheck the prerequisites and read the existing failed receipt/screenshot. Record baseline status and artifact identity. Do not launch an unchanged 30-second failure merely to reconfirm the already retained reproduction unless source evidence has drifted.
2. Update the native acceptance spec first with the navigation boundary and preservation oracle. Record the decision that the generic Runs helper stays unchanged.
3. Extend the existing E2E observations before changing navigation: capture the prepared definition/configuration/source/test and post-companion ledger/model count; assert their preservation around the boundary. Expected values come from prior observations and independent fixture constants, not from a new helper's returned “success” flag.
4. Make the minimal callsite fix using the existing public Design control and readiness checks. If a helper is extracted, keep ownership/meaning explicit. Do not add a mock test that only asserts the same sequence of helper calls, or a test that searches source for a selector string; the real UI boundary is the decisive regression test.
5. Run focused fixture tests and relevant projection/service checks. Inspect the diff for narrowed scope and unchanged assertions. Run mandatory root typecheck/lint and architecture checks; keep emitting commands serial.
6. Reuse verified unchanged artifacts or rebuild in the recorded serial order when necessary. Run only `--scenario=cancel` in a new owned fixture. Normal permissions and genuine native tool execution remain required.
7. Inspect the actual receipt, independent ledger/record facts, fixture bytes and screenshots. If a later assertion fails, retain the attempt and diagnose its layer. Do not dilute an expectation to get PASS or silently expand into a product change.
8. Archive evidence with hashes, update compact progress and exact next action, and independently review the final small diff. Leave U4 OPEN until its other required journeys pass. Do not start U5 in this task.

## Concrete acceptance tests

These are requirements-level oracles. The first repaired native run is **NOT RUN** at handoff; prior ten-test PASS is retained baseline only.

| Input / event                                                                                                                                                                                                   | Expected observable result                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh agent-assisted prepared design with selected native instructions; independent Chat awaits `U4_COMPANION_OPTION`; Graph is on Runs                                                                         | Selecting Design exposes exactly one usable Run action. Definition/revision, request/reference selection, source/test/config bytes and the one-entry companion ledger remain unchanged; no new provider request.                |
| Click Run without acknowledging preflight                                                                                                                                                                       | Real confirmation shows the same agent-assisted/native-instructions snapshot; confirm disabled, zero additional inputs or provider requests.                                                                                    |
| Explicitly acknowledge and confirm                                                                                                                                                                              | New Graph run captures that exact definition. Analyze/Implement use distinct native sessions through the existing runtime; native permission/question routes open exact owned sessions without adding inputs.                   |
| Native Implement successfully edits `fixture.mjs`; provider response is held                                                                                                                                    | Source exactly `AFTER_SOURCE`, test bytes unchanged, exactly one provider hold, Implement has no terminal proof yet.                                                                                                            |
| Cancel the selected run at that boundary                                                                                                                                                                        | Durable intent followed by exact `completedInterrupted` proof; terminal Graph state Cancelled; exactly three inputs overall; no Review/gate/result/successor; retained source unchanged.                                        |
| Release held response after cancellation                                                                                                                                                                        | Receipt truthfully distinguishes aborted connection from actual delivery; cancelled record and source stay unchanged; no forbidden successor or extra input.                                                                    |
| Open original companion then explicitly answer its native question                                                                                                                                              | Same session/input/payload was still waiting before answer. Its actual completion does not mutate the cancelled Graph record or source, and total admitted input count stays three.                                             |
| Stop and relaunch the same owned profile                                                                                                                                                                        | Same cancelled run selected, proof/history preserved; ledger/model count unchanged; no replay or fresh recovery admission.                                                                                                      |
| Unit negative fixtures: remove proof; change source command/session; set proof to completedSuccess; move cancel timestamp after terminal update; append Review/gate; remove/change companion or append an input | Existing proof tests reject every case. Do not replace these assertions with status-only checks.                                                                                                                                |
| Provider fixture: missing exact successful Edit or wrong companion answer                                                                                                                                       | Existing provider tests reject/avoid hold or completion. HTTP abort test does not claim delivery. Existing artifact-fault guard/restoration tests remain passing even though this cancellation task does not fault an artifact. |

If a public control is absent/disabled due to a real readiness problem, preserve the displayed diagnostic and stop that attempt. Longer timeouts, alternate profile/configuration, forced clicks and direct admission are not substitutes.

## Verification commands and working directories

Working directory: `C:\Users\USER\Desktop\Personal\ZCode`. Use the inspected pinned environment in HANDOFF. All commands here are **NOT RUN for the repaired driver at handoff**. Record actual start/end, exit status and logs when executing them.

First, architecture entry and focused tests (one command at a time):

```powershell
node scripts/check-workspace-freshness.mjs --no-fetch
pnpm architecture:check --changed
pnpm architecture:context graph-engineering
node --test scripts/graph-engineering/pre-z8-u4-provider.test.mjs scripts/graph-engineering/pre-z8-u4-proof.test.mjs scripts/graph-engineering/pre-z8-u4-artifact-fault.test.mjs
node --import tsx --test packages/ui/test/graphRunSummary.test.ts
node --import tsx --test packages/services/src/graph-engineering/app/service.test.ts packages/services/src/graph-engineering/app/sequential-service.test.ts packages/services/src/graph-engineering/adapters/recovery.test.ts
pnpm typecheck
pnpm lint
pnpm architecture:check --changed
```

Use the installed formatter on only files actually changed; for the two expected edits:

```powershell
pnpm exec oxfmt --check scripts/graph-engineering/pre-z8-u4-native.mjs docs/graph-engineering/pre-z8/pre-z8-u4-native-spec.md
```

If output/source validation requires rebuilding, run the CLI typecheck/build and Desktop `build:no-runtime-assets` sequentially as listed in HANDOFF, then record new hashes. Otherwise explicitly record artifact reuse. After all emitting operations finish:

```powershell
node scripts/graph-engineering/pre-z8-u4-native.mjs --scenario=cancel
```

The driver writes `.tmp/z1-native-<owned-id>/pre-z8-u4-summary.json` and screenshots and closes its fixture in `finally`. Capture stdout/stderr and the real process exit code using the receiving agent's normal command logging; do not let a pipeline's success mask a failed Node exit. No second native scenario should run concurrently.

Full Graph/Git/UI/script regression commands are in HANDOFF. For this driver-only task the listed focused integration checks, mandatory root checks and real native journey are the necessary gate. Broaden only for changed scope or a discovered regression; the final combined suite remains U6 work.

## Stop or escalation conditions

- Wrong/missing working-tree implementation, unexpected concurrent writer, different native driver/product contract, or changed artifacts with no trustworthy source/build correspondence: preserve state, establish the new baseline before proceeding.
- Fixture tries to use an installed profile/provider/credential/company workspace, unowned path, live endpoint or unsupported tool install: stop before execution and record the required authorization or missing prerequisite.
- Normal Electron launch is denied/crashes before DOM: classify environment failure, retain receipt and obtain normal tool authorization if necessary. Keep application/runtime/browser sandbox and approval policy intact.
- New failure implies product cancellation, ownership, evidence, historical mutation or recovery defect: keep its evidence; do read-only diagnosis, but do not repair product code under this harness-only task. Present the concrete finding and proposed next scoped task/spec decision.
- Existing negative tests fail: distinguish a prior baseline from a new regression; do not weaken identity, ordering, evidence, count or immutability assertions. Missing native evidence is NOT RUN/blocked, never PASS.

## Required completion evidence

Provide a compact completion entry with changed files/reason, source/branch/HEAD and uncommitted-diff inventory; exact commands/exits/layers; artifact hashes or verified reuse; original and new attempt paths; screenshot paths; and remaining U4 actions. No separate all-stage report is needed.

The successful receipt must include actual run/attempt/command/session/input identities, frozen preflight definition, navigation invariance observations, native permission/question/Read/Edit observations, original/after source and test hashes, cancel request/terminal ordering, provider release/abort result, three-input ledger, unrelated Chat completion and same-profile restart without replay. Capture readable Design/preflight and post-edit/cancelled summary at the existing 1280×720 and 1920×1080 sizes. Capture transient Stop requested only if genuinely observed; state otherwise.

Archive only owned synthetic evidence and selected logs/screenshots with SHA-256 and provenance; do not copy whole profiles, auth/config stores or unrelated data. Verify originals were preserved, changed files stay in task scope, and the index is still empty. Mark live provider, company project, human pilot, OS dialogs/scaling, installed artifact and Z8 checks NOT RUN. A successful TASK_001 closes this cancellation acceptance slice, not all U4 or pre-Z8.
