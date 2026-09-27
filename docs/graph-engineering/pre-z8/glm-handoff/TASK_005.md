# TASK_005 — Strengthen manifest-wait tests and complete remaining U4 native coverage

## Scope

Two parts: (1) minimally strengthen the two manifest-wait regression tests per the new
requirements (actual visibility/size proof; test-released completion signal); (2) establish and
execute the remaining U4 native coverage — concurrent ordinary Chat, genuine test pass/failure,
and source-drift / stale-evidence. No U5/U6/Z8. U4 not declared complete.

Checkout: `main` @ `6f41ad53a1fef2a02af004cdfc89a5c5cf91a4dd` (unchanged baseline).

## Part 1 — Strengthen manifest-wait tests (test-file only)

File: `scripts/graph-engineering/pre-z8-u4-manifest-wait.test.mjs`.

1. **ready-no-size test** — replace the `childElementCount === 0` proxy with actual
   visibility/size info: assert the browser layout rect `height === 0` (the real reason a
   visibility wait fails; width is not required to be zero) and `isVisible() === false` (actual
   Playwright visibility API); then prove the original `waitFor({ state: "visible" })` cannot
   complete (bounded-time reject) and the fixed `waitFor({ state: "attached" })` keeping
   `[data-state="ready"]` does complete.
2. **loading→ready test** — replace the 250 ms page timer + `elapsed >= 200 ms` check with a
   test-released completion signal (no timer). Prove the wait does not complete before release
   (bounded-time reject — timeout as failure upper bound, not a sleep) and completes after
   release.
3. **Keep** the stuck-loading and error negative tests and the harness manifest-content
   validation unchanged.

No product UI change, no new dependency/framework. Test-file-only change → no full native rerun
required for Part 1.

## Part 2 — Remaining U4 coverage checklist

Built from `U4_RUN_SPEC.md`, `pre-z8-u4-native-spec.md`, current source, and archived evidence.
Each scenario maps existing evidence item-by-item (not by name) and names the missing assertions.

### A. Concurrent ordinary Chat (with a completing run)

- **Expected:** Graph and an independent ordinary Chat truly overlap in the spec-required window.
  The companion Chat asks a real native question and stays unanswered while the Graph run executes
  — including the final-gate approval and terminal completion. session/input, questions,
  permissions, cancel and results do not cross-talk. The unrelated Chat survives the completing
  run and completes only after its explicit answer, with no other input and no change to the Graph
  record/source (`U4_RUN_SPEC.md:21`; native-spec §3, §7).
- **Forbidden:** A second Host; answering the companion through a second channel; the Graph run's
  gate/approval/successor admission mutating the companion session/input; companion
  question/permission bleeding into the Graph run; treating the post-completion `verifyU3LaterChat`
  as concurrent.
- **Existing evidence (item-by-item):**
  - `cancel-attempt-3` (cancel scenario): companion Chat waits unanswered during the Graph run
    (Analyze→Implement), survives cancellation, completes independently after. Proves concurrent
    overlap during a **cancelled** run + companion session/input isolation + no ledger/model/source
    cross-talk + companion tool result absent during the run.
  - `complete-attempt-2` (complete scenario): `verifyU3LaterChat` is a **later** (sequential,
    post-completion) Chat — NOT concurrent.
- **Missing assertions (the gap):** Concurrent overlap during a **completing** run — specifically
  that the Graph run's final-gate approval and terminal completion (not cancellation) do not
  interfere with the concurrently-waiting companion. The cancel scenario proves companion isolation
  against cancellation; it does not prove it against a completing run's gate/approval/successor
  admission.
- **Command:** `node scripts/graph-engineering/pre-z8-u4-native.mjs --scenario=concurrent-chat`
  (new scenario; reuses `startU4Companion` + the complete flow with the provider hold disabled).

### B. Genuine test pass / failure

- **Expected:** Real test execution produces the result (not the provider claiming pass). UI shows
  execution, verification and human decision as three separate axes. A genuine failure stays
  failed — agent text or human approval cannot upgrade it. Current invocation, source/build
  identity and actual test count are checked. Missing/invalid reports are invalid evidence, not
  ordinary assertion failures (`U4_RUN_SPEC.md:9,15`; native-spec:54).
- **Forbidden:** Provider directly claiming tests-passed; agent-reported text upgraded to
  tests-passed; human approval upgrading a failed test; treating missing/invalid reports as plain
  failures.
- **Existing evidence (item-by-item):**
  - U2 native matrix (`evidence/pre-z8/u2/`): `pass-attempt-3` (real VSTest, 3 passed,
    tests-passed projection), `fail-attempt-1` (BAD_SOURCE, 3 failed, tests-failed projection,
    not upgradable), `source-drift`/`build-drift` (invalid evidence). These cover the requirement
    but were captured against an earlier build with .NET SDK 8.0.425.
  - U4 `complete-attempt-2`: `configuredTestCount=0` (no tests) — does NOT cover genuine pass/fail.
- **Missing assertions:** A current-build U4 run with configured Tests producing genuine pass and
  genuine failure via real test execution, asserted through the U4 projection (tests-passed /
  tests-failed, not upgradable).
- **Blocker (environment):** The U4 provider has no test-execution path. The U2 real-VSTest lane
  hard-requires SDK 8.0.425 (`pre-z8-u2-fixture.mjs:82` `rollForward:"disable"`; `:188` version
  assert; `:193` sdkPath basename assert), which is NOT installed here (only 3.1/6.0/9.0/10.0).
  Installing SDK 8.0.425 is unauthorized dependency installation; adding a node:test verification
  format to the product is a forbidden product-feature addition.
- **Command:** BLOCKED. Map U2 durable evidence item-by-item with the build-identity caveat and
  report the blocker. Do not forge a run.

### C. Source drift / stale evidence

- **Expected:** At the spec-defined evidence-capture/approval boundary, a controlled mutation of
  the synthetic source file makes the captured evidence stale. Old evidence is NOT continued as
  current. Approval and subsequent execution are blocked or require re-verification per the current
  contract (`StaleEvidence`). No auto-approve, no stale-state bypass, no blind replay
  (`U4_RUN_SPEC.md:11`; native-spec:58; approvals.ts:156-195).
- **Forbidden:** Auto-approving despite source drift; bypassing StaleEvidence; replaying the stale
  run; treating the stale captured snapshot as still-current.
- **Existing evidence (item-by-item):**
  - U2 `source-drift` (durable evidence): mutates `MathOps.cs` at the Test permission boundary;
    Graph verification rejects (`observationValid=false`, issues `/source.*changed/i`); evidence
    projection `invalid`. Covers post-admission drift at the **test-verification** boundary, NOT at
    the **approval-gate** boundary.
  - Graph service `StaleEvidence` path (`approvals.ts:156-195`) + UI `stale-approval-request`
    blocking (`graphRunSummary.ts:54-55,88`): real product mechanism. Tested at service/smoke layer
    (`z3-native-smoke` `waitStatus StaleEvidence`) but NO U4 native scenario drives a Graph run
    into StaleEvidence via source mutation at the gate boundary.
- **Missing assertions:** A U4 native scenario that runs to the final-gate approval boundary,
  mutates `fixture.mjs` AFTER the gate request is captured, attempts approval, and asserts:
  `run.status === "StaleEvidence"`, `gate.status === "StaleEvidence"`, gate message mentions
  source/evidence changed, UI `stale-approval-request` issue, Approve disabled (`canDecide false`),
  captured snapshot unchanged but no longer current. Plus: restore source, verify no auto-recovery
  (run stays StaleEvidence; re-verification required).
- **Command:** `node scripts/graph-engineering/pre-z8-u4-native.mjs --scenario=source-drift`
  (new scenario; reuses the complete-to-gate flow + an inode-preserving source mutation at the
  gate boundary with exact-byte `finally` restore).

## Part 3 — Execution plan

- **3A concurrent-chat**: implement + run to PASS. Reuses `startU4Companion`; the `complete` flow
  with the provider hold disabled (`startU4Fixture(workspace, { holdEnabled: false })`); a new
  companion-completion helper that verifies isolation during the completing run's gate/approval and
  after terminal completion.
- **3B genuine pass/fail**: BLOCKED (SDK 8.0.425). Map U2 durable evidence item-by-item; report.
- **3C source-drift**: implement + run to PASS. Mutate `fixture.mjs` at the gate boundary; assert
  the real `StaleEvidence` product path; exact-byte restore in `finally`.

## Allowed defect handling

Confirmed local harness defects (selector, wait state, identity mapping): minimal fix + targeted
regression + full rerun of the affected scenario, no per-step approval needed. No assertion
weakening, no fixed sleeps, no swallowed exceptions, no repeated clicks. Production/contract
defects: read-only diagnosis, preserve evidence, report; pause dependent work.

## Constraints

Isolated workspace + controlled loopback provider only. No installed credentials, no live paid
models, no company projects. No reset/stage/commit/push/publication. No U5/U6/Z8. U4 not declared
complete. Each scenario gets its own attempt evidence directory; failures not overwritten.
