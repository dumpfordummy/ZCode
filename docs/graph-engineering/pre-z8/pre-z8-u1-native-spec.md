# U1 controlled native acceptance specification

Status: controlled native U1 acceptance **PASS**, 27 September 2026, after the coordinator's combined build and start signal. This contract preceded the new `scripts/graph-engineering/pre-z8-u1-*` fixture implementation. The final full run, additional preparation-only recipe-independence probe, prior failed attempts and remaining NOT RUN checks are recorded below and in `docs/graph-engineering/evidence/pre-z8/u1/`.

## Purpose and scope

Exercise the shipped `agent-assisted` v1 template through the actual Electron UI, existing Host Graph owner, native sessions, ordinary native Read/Edit/question/permission interactions, and final Human Approval. Demonstrate useful work with zero configured recipes without manufacturing machine-test evidence. Independently inspect the synthetic file contents; do not run Build/Test or claim the agent-led workflow verified tests.

The fixture reuses `createIsolation`, exact Graph/native ledger observers, native permission acknowledgement handling, source evidence checks and native identity assertions. It does not alter application services, seed execution records, invoke private React callbacks, replace native results or bypass confirmation. New fixture response/transport/UI files are owned by this audit lane; product UI, shared contracts and integration remain coordinator-owned.

## Single owners and event order

```mermaid
sequenceDiagram
  participant Harness as Native acceptance driver
  participant UI as Product UI
  participant Graph as Existing Host Graph owner
  participant Native as Existing native session/runtime
  participant Fixture as Loopback controlled provider
  Harness->>UI: Select agent-assisted / enter task / navigate away and back
  UI->>Graph: Read, instantiate and save only
  Harness->>Graph: Read saved record and native input ledger
  Note over Harness,Graph: Assert no native input or model request
  Harness->>UI: Review frozen preflight and explicitly confirm
  Graph->>Native: Persist then admit Analyze
  Native->>Fixture: Actual Analyze prompt/tool observations
  Fixture-->>Native: Request native Read; return captured analysis
  Graph->>Native: Admit fresh Implement with exact analysis binding
  Fixture-->>Native: Native Read, explicit question, then native Edit
  Harness->>UI: Answer exact native question and permission once
  Graph->>Native: Admit fresh Review with captured handoffs
  Fixture-->>Native: Native Read; report observed source and no configured tests
  Graph->>Graph: Capture final source/evidence revision
  Harness->>UI: Required comment and explicit final decision
  Graph->>Graph: Persist approved completion
  Harness->>UI: Reopen completed history
  Note over Harness,Graph: Assert unchanged run, ledger, source and zero replay
```

The harness owns only its disposable profile/provider and evidence summary. Graph remains the run/attempt/evidence owner; the native runtime remains the session/input/tool/interaction owner. No remote or mobile delivery implementation changes; this is a Desktop continuous-link acceptance scenario only.

## Isolation and initial data

- Refuse inherited `Z1_PACKAGED_EXE`; use the fresh local build selected by `createIsolation` and its default automated private profile.
- Use only the loopback controlled provider, private environment and synthetic repository. No manual provider mode, installed data, company paths, credentials, installs, restore, external MCP, remote calls or paid model.
- Reuse the existing bounded synthetic source fixture (`fixture.mjs`, unchanged `fixture.test.mjs`, source-review note). Replace only this newly owned fixture's `AGENTS.md` before its seed baseline with instructions matching this Agent-only scenario: inspect/edit the marker, preserve unrelated work, and do not execute commands or tests. A seed commit is allowed only inside that verified newly owned fixture root so native source evidence has a tracked baseline. The development checkout is never staged or committed.
- The requested change is exactly `Z1_BEFORE_7391` → `Z1_AFTER_7391` in `fixture.mjs`. All other fixture source remains unchanged.
- Provider responses require actual native Read results and precise predecessor output. Implement asks an explicit native question and Edit permission, then requires the exact successful native Edit result for the intended file. Review performs a fresh native Read in its distinct session; the driver independently checks current source and unchanged tests before human approval. No fixture response calls Bash or emits a structured test report.

## Required assertions

1. A user can select the shipped `agent-assisted` template and pin v1 without selecting recipes or entering raw JSON. The current workspace is visible. Verification wording explains agent-led review and no configured test evidence.
2. Opening/configuring/dismissing/reopening the library, changing template selection and navigating through Project setup preserve the entered task. All read/create/save operations leave native input/model/check counts at zero.
   Before the Agent-only run, select the verified `generic` template and prove distinct empty, malformed-config read-failed, command-only incompatible and compatible Build/Test recipe states. Seed malformed/configuration data only in the owned fixture `.zcode/config.json`; retain the malformed input as evidence, use actual refresh/retry-read controls, and restore an empty valid configuration before Agent-only instantiation. The typed verified task survives Setup/back and each failure. Saved recipes are never executed during this matrix.
3. An unsaved design replacement Cancel keeps the original draft. Save/Discard paths are distinct product choices; the harness never silently checks a legacy replacement checkbox. A failed save never starts native work. Service/unit suites may own deterministic disk failure coverage; mark any unperformed native fault case explicitly.
   For native coverage, save an original synthetic design through the UI, edit its name, then temporarily move only its validated fixture Graph record to a unique sibling backup and place an empty directory at the exact record path. The real Save-and-replace action must fail its atomic file write, keep the replacement dialog and draft, and admit nothing. Restore in `finally`, verify byte equality, and write a restoration receipt even on failure; refuse cleanup if the owned obstruction is no longer the same empty directory. Separately, change only the fixture recipe configuration between reading and saving to exercise the real digest conflict. Its typed JSON remains until explicit acceptance of the saved version.
4. Instantiation preserves canonical v5 path `start → analyze → implement → review → final-gate → end`, stable references, no Tool nodes, no region, and End output `review`. A whitespace-only required request cannot instantiate.
5. Run preflight displays the frozen definition/settings/provenance, requires its existing acknowledgement, and remains side-effect free until confirmation. The run matches that captured snapshot.
6. Exactly three fresh native task sessions/inputs are admitted. Their resolved inputs contain the exact captured predecessor output once, with correct source command/input/session attribution. No task is resumed in an old session.
7. Opening the waiting question or permission targets the original session and changes neither native input ledger nor model-request count before response. The question and native Edit permission are answered through their existing native controls. Approval of either does not approve the Graph gate.
8. At the final gate, native Review is complete but run success is blocked. The required comment is enforced; source evidence captures the actual diff, the untracked review note, and the original fixture baseline. Human approval does not create test evidence.
9. After final approval, the run is Completed with exactly three native admissions, zero Tool attempts and zero test artifacts. The fixture source has the requested contents; the independent test source is unchanged but NOT RUN. Visible evidence wording never claims verified tests.
10. Navigating away/back and restarting the owned completed profile preserves exact frozen run/provenance, native input IDs, source state and model counts. No replay occurs.
11. Open one new sibling synthetic workspace inside the owned profile through the actual Desktop `--open-workspace` second-instance entry. It uses the same private environment, has its own Git boundary and no provider execution. Use the public sidebar workspace rows to switch back and forth. Workflow parameter and unsaved-design drafts remain distinct for the two workspaces, with no save or native/model admission. No private React callback, second Host ownership bypass or installed workspace state is used.

## Provider and driver negatives

Z8.5-U1 compatibility: the completed-run assertion now targets the visible
verification fact (`graph-run-evidence`, state `agent-reported`) scoped to the
exact run summary and its Completed execution state. It no longer requires the
removed explanatory paragraph's English wording. Existing zero Tool/test-artifact,
source-integrity, human-approval and restart/no-replay assertions remain required.
The selector guard must reject the removed `graph-run-verification` identifier;
negative driver tests must reject missing/hidden facts and verified-Test states.

Pure fixture tests must fail closed for unknown task headers, absent native tools, missing/duplicate predecessor output, incorrect Read source, wrong question answer, an absent/unknown/unsuccessful Edit result or one referring to another file, and review of unchanged source. Non-native metadata/model-title calls may return a neutral fixture label and never tool calls. Tests validate the controlled provider contract; they are not substitutes for the native run.

The driver must report FAIL on unexpected terminal state, absent required controls, wrong selected session, timed-out state, missing/changed evidence or unexpected provider error. Selector changes must be reconciled with the UI owner without deleting semantic assertions. It must not silently skip an unavailable acceptance path. Only specifically declared U6/user-operated cases may remain NOT RUN.

Pure filesystem fault-helper tests precede its implementation and cover restoring original bytes after a successful observation and an observation exception, refusing a record outside the fresh home, and refusing to remove an obstruction whose inode or contents changed. The helper never removes a nonempty directory, traverses a symlink or deletes an old profile. Keep any unsuccessful restoration receipt and backup for diagnosis; do not broaden cleanup.

## Evidence and verification

Record the actual build-file SHA-256 values, fixture scenario, private paths, timestamps, Graph run/attempt/session/command IDs, before/after ledger, provider tool results and failures. Save native screenshots for creation/retained task, preflight, native question, native permission, final gate and completed state. Capture 1280×720 and 1920×1080 checkpoints where supported; keep actual viewport geometry in the summary rather than claiming OS scaling coverage.

Pure fixture tests may run immediately with `node --test scripts/graph-engineering/pre-z8-u1-provider.test.mjs`. The native entry point is `node scripts/graph-engineering/pre-z8-u1-native.mjs` after the coordinator's serial U1 build. Existing approved shell escalation is needed in this environment for the Electron renderer; application/OS sandbox flags remain unchanged. Never run conflicting builds. Root typecheck/lint and final integrated native regression are coordinator-owned.

Human timing, novice comprehension, live-provider quality, actual-project compatibility, installed-artifact behavior and external platform checks remain NOT RUN unless separately evidenced. This fixture does not begin Z8.

## Preparation evidence

Architecture check before editing: PASS, zero violations/baseline/new. The Graph controlled context and public workflow/Graph contracts were read. The provider tests were written first and initially failed with the expected absent response module; after response implementation all six pure tests passed. Native U1 execution was held until the coordinator's combined build and explicit start signal; that checkpoint has now been exercised below.

The later owned-record fault helper also began with a missing-module red run. Five pure tests then passed: normal exact restoration, restoration after an observation exception, rejection outside the declared home, preservation of a nonempty obstruction, and preservation after an empty directory was replaced. Combined provider/fault tests: **11 PASS**, zero failures. Restoration uses a hard link whose destination must not exist, byte verification, then removal of only the unique owned backup name. Scoped syntax, lint and formatting checks passed for the new fixture files. Actual native configuration-conflict, failed-save and two-workspace paths subsequently passed in the full native scenario; pure tests are recorded separately.

### First actual native run and fixture-contract correction

The coordinator's combined U1 build was used in fresh profile `.tmp/z1-native-1790451610154-d15e5c`. It passed the native pre-run recipe/read/conflict matrix, actual workspace switch/back isolation, failed Save-and-replace exact restoration, instantiation, run preflight, native question and Edit permission. It then failed because the fixture incorrectly demanded an immediate full Read after Edit. Current native `Read` documentation explicitly says not to reread immediately after an edit, and `Edit` updates the native read-state cache. The actual tool returned its successful edit result, followed by the expected file-unchanged cache response to the redundant Read; the fixture rejected that response, so Graph conservatively stopped **NeedsHuman** with only two admissions. Actual fixture bytes already held the requested change. The full failing summary, screenshots and log are retained; this is a fixture-contract error, not a product success or a Graph permission failure.

Per coordinator review, the corrected provider requires the exact successful native Edit result for the intended file and rejects generic acknowledgements or another path. It no longer demands the redundant Read. The separate Review session still must freshly read and match the changed source, and the driver independently verifies actual source bytes, unchanged test bytes and captured source evidence **before** human approval. These checks retain the real acceptance criteria while following the checked-out native tool contract. Retry uses the same product build in another fresh profile.

The second profile `.tmp/z1-native-1790451749105-8c5c7f` completed all three native sessions and the final Graph decision, with fresh Review source evidence, three admissions, zero Tool attempts, no provider errors and 11 controlled model requests. Its last presentation assertion falsely matched the phrase `tests passed` inside the explicit negation `Approval does not establish that tests passed`. The saved run is **Completed**, but the harness is recorded **FAIL** and restart verification did not run. The presentation assertion now rejects affirmative standalone success labels and requires the exact agent-led/no-configured-evidence status label; negating a test-success claim is expected valid UI. The final fresh run below tested that correction and restart/no-replay. Both earlier attempts remain preserved.

### Targeted native recipe-independence preparation

After the full scenario, the coordinator requested a focused native regression for the confirmed Graph recipe-coupling fix. `pre-z8-u1-recipe-independence.mjs` uses another fresh automated profile and valid JSON with deliberately invalid unrelated `graphRecipes: "invalid unrelated recipes"`. Through the actual UI, create Agent-assisted v1, prepare its run, and inspect the native preflight snapshot. Require empty recipe inventory, unchanged fixture configuration, no run, zero native input/model/tool counts and unchecked execution acknowledgement. Do not run the graph. If native configuration itself rejects the project configuration, record that exact owner failure rather than bypassing it. Capture build hashes, summary and a screenshot. This is an additional preparation-only probe, not another full execution or live-model check.

The first preparation-only probe (`.tmp/z1-native-1790451914607-9b59a2`) exposed a driver sequencing error: the reused disk polling helper assumes a record file already exists, but this probe performs the first definition save. It read too soon and failed ENOENT with zero native/model work. The corrected driver waits for the actual acknowledged UI transition back to Design before reading the first persisted record. This failed probe is retained separately and does not establish whether recipe-independent preflight passed.

### Final native results and durable evidence

The full fresh run in `.tmp/z1-native-1790451817244-b3679b` **PASS**, exit 0, used the unchanged coordinator-built product. Run `2eba82da-9ed7-48d6-9762-6c73974513d1` reached **Completed** after exactly three fresh native admissions, 11 loopback controlled-provider requests and zero provider errors. All required pre-run recipe states, actual configuration compare-and-swap conflict, public workspace switch/back isolation, replacement Cancel, real atomic-save failure and exact restoration passed. The native question and Edit permission were observed in the original native session and remained distinct from the required-comment Graph gate. The independent Review read and direct source-byte assertions passed before approval. No Tool attempts or machine-test artifacts were created; `fixture.test.mjs` stayed byte-identical and was deliberately **NOT RUN**. A completed-profile restart preserved the exact record, provenance, native input ledger, source and provider count with zero replay.

The targeted preparation-only retry in `.tmp/z1-native-1790451947417-52e9b1` also **PASS**, exit 0. Native Agent-only instantiation and preflight accepted a valid configuration object containing an invalid unrelated `graphRecipes` field, retained its exact bytes and captured an empty recipe inventory. Execution acknowledgement stayed unchecked and Confirm disabled, with no persisted run, native admission, model request or tool result. Graph execution was intentionally **NOT RUN** in this targeted probe.

Durable evidence lives in `docs/graph-engineering/evidence/pre-z8/u1/`: raw passing summaries, three prior failure summaries and screenshots, malformed fixture configuration, exact save-restoration receipt, 18 passing screenshots, and a SHA-256 manifest. The receipt records the base commit and actual CLI/Main/Host/renderer output hashes; the checkout includes existing uncommitted implementation changes, so the base commit alone is not the tested implementation identity. Screenshots cover actual 1280×720 and 1920×1080 renderer viewports at device pixel ratio 1; they do not establish OS scaling conformance. Native permission and preflight images were visually inspected in addition to the DOM, identity and persisted-state assertions.

Still **NOT RUN**: user-operated novice/live-provider/actual-project pilot; OS scaling/accessibility conformance; and an intentionally held in-flight RPC while switching workspaces (the coordinator's deterministic UI/service tests cover stale responses). Do not treat controlled native fixture success as evidence for these checks. The old z4/z5/z6 navigation adaptations still require their separately recorded integrated native regressions.

## Existing native regression navigation adaptation

The coordinator subsequently assigned this lane the existing `z4-native-editor.mjs`, `z5-native-editor.mjs`, `z6-native-ui.mjs`, and `z6-native-library.mjs` navigation updates. The product moved recipe editing into Project setup, optional context into a disclosure and version/transfer controls into Workflow management. Drivers must reach those public controls through their new navigation and return to Design, retaining all existing recipe bytes, frozen snapshots, ledger/model counts, immutable version, native permission, archive and negative import assertions.

Dirty replacement no longer has a consent checkbox. Replace that obsolete control assertion with the equivalent stronger product contract: Instantiate opens the three-choice replacement dialog without writing or executing; Cancel preserves both saved and unsaved drafts; only a later explicit Discard replaces the draft. Native execution and evidence semantics are unchanged. No timing sleeps, private callbacks, disk-seeded execution records or weakened assertions may substitute for the actual UI state. Record these four files separately from the new U1 scenario. Syntax, scoped lint and formatting passed; their actual native regression remains coordinator-owned and is not implied by the new U1 scenario's pass.
