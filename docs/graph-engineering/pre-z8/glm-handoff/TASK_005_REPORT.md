# TASK_005_REPORT — Strengthen manifest-wait tests and complete remaining U4 native coverage

## Summary

| Part | Scenario | Result | Category | Evidence |
| --- | --- | --- | --- | --- |
| 1 | manifest-wait regression tests | PASS | actual execution (focused tests) | 4 strengthened tests, 16-test suite PASS |
| 3A | concurrent ordinary Chat (completing run) | PASS | actual execution, current build | `evidence/pre-z8/u4/concurrent-chat-attempt-2-pass/` |
| 3A | (attempt 1) | FAIL | harness-assertion defect (preserved) | `evidence/pre-z8/u4/concurrent-chat-attempt-1-harness-assertion-defect/` |
| 3B | genuine test pass / failure | BLOCKED | environment blocker (SDK 8.0.425) | U2 durable evidence mapped item-by-item with build-identity caveat |
| 3C | source drift / stale evidence | PASS | actual execution, current build | `evidence/pre-z8/u4/source-drift-attempt-1-pass/` |

No product or contract defects were found. One harness defect was found and fixed (Part 3A
attempt 1). U4 is **not** declared complete: the genuine pass/fail journey remains BLOCKED for a
current-build rerun, and U5/U6/Z8 are not started.

Checkout: `main` @ `6f41ad53a1fef2a02af004cdfc89a5c5cf91a4dd` (unchanged). No reset/stage/commit/
push/publication. Build under test (4 pinned artifacts, SHA-256 MATCH across complete-attempt-2,
concurrent-chat-attempt-2, source-drift-attempt-1):

| Artifact | SHA-256 |
| --- | --- |
| `apps/zcode-cli/packages/cli/dist/zcode.cjs` | `8a3d061fc217212d561a639b090e7152e6f2f44bfb1ac42ab88edf40bfd61332` |
| `packages/desktop/out/main/index.js` | `8313a1774afa18719ef60467924861d9eed76dcbcc7fc585f7bad8fde6889b74` |
| `packages/desktop/out/host/index.js` | `c28816f71fc5f51deef3d443dbb24a71c28312640fff38da66d2576caeb949c3` |
| `packages/desktop/out/renderer/index.html` | `7ce34d94428365c4da1fb0bb568fa1dbd0a32299bf769dd44b9070d4a6c4addf` |

---

## Part 1 — Strengthened manifest-wait tests (test-file only)

File: `scripts/graph-engineering/pre-z8-u4-manifest-wait.test.mjs`.

1. **ready-no-size** ("ready element is not visible; visible wait fails, attached wait passes") —
   replaces the `childElementCount === 0` proxy with actual layout/visibility proof: the browser
   layout rect `height === 0` (the real reason a visibility wait cannot complete; width is not
   required to be zero) and Playwright `isVisible() === false`. It then proves the original
   `waitFor({ state: "visible" })` cannot complete (bounded-time reject) and the fixed
   `waitFor({ state: "attached" })` keeping `[data-state="ready"]` does complete.
2. **loading→ready** ("loading then test-released ready transition is awaited, not pre-empted") —
   replaces the 250 ms page timer + `elapsed >= 200 ms` check with a test-released completion
   signal (no timer). Proves the wait does not complete before release (bounded-time reject — the
   timeout is a failure upper bound, not a sleep) and completes after release.
3. **stuck loading** and **error** negatives kept unchanged.

Verification: `node --test scripts/graph-engineering/pre-z8-u4-manifest-wait.test.mjs
scripts/graph-engineering/pre-z8-u4-proof.test.mjs` → 16 PASS / 0 FAIL. Test-file-only change; no
product UI, dependency or framework change.

---

## Part 3A — Concurrent ordinary Chat (completing run) — PASS

**Category:** actual execution, current build, isolated synthetic workspace + controlled loopback
provider.

**Run:** `258777b9-eb9c-49f3-8f87-d9a357cf8221`, profile
`.tmp/z1-native-1790495709422-47e627`. Status PASS.

**What was missing (the gap):** The cancel scenario (`cancel-attempt-3`) proves a companion Chat
stays isolated against a **cancelled** run. The complete scenario's `verifyU3LaterChat` is a
**later** (sequential, post-completion) Chat — not concurrent. No evidence proved a companion Chat
stays isolated while a Graph run **completes** its final gate and terminal proof (the gate/approval/
successor admission path).

**Implementation:**
- `pre-z8-u4-provider.mjs`: `u4Response` and `startU4Fixture` gained a `holdEnabled` option
  (default `true`, preserving the cancel scenario exactly). `concurrent-chat` uses
  `holdEnabled: false` so the run proceeds through review to the final gate without the cancel hold.
  The companion output/question text is parameterized by `holdEnabled` so the concurrent-completion
  evidence does not falsely claim "cancellation" (`U4_COMPANION_OUTPUT_CONCURRENT`).
- `pre-z8-u4-concurrent.mjs` (new): `assertU4CompanionWaiting` verifies the companion stays at its
  original native question (exactly 1 ledger input, no tool result, exactly 1 companion provider
  request) at a given run phase; `completeU4ConcurrentCompanion` answers the companion after the run
  completes and verifies the completed Graph record stays byte-frozen, source bytes preserved, no
  extra Graph review request, no fixture errors.
- `pre-z8-u4-native.mjs`: new `concurrent-chat` branch drives the complete flow with
  `assertU4CompanionWaiting` at the gate-pending and completed phases, then
  `completeU4ConcurrentCompanion` instead of `verifyU3LaterChat`.

**Assertions proven (concurrency, item-by-item):**
- Companion isolated at **gate-pending** phase: 1 input, no tool result, 1 companion request,
  12 model requests (unchanged).
- Companion isolated at **completed** phase (after final-gate approval + terminal completion):
  1 input, no tool result, 1 companion request, 12 model requests (unchanged).
- Run completed: `analyze`/`implement`/`review` all `completedSuccess`; `final-gate` `Approved`;
  `run.status = Completed`.
- After answering the companion: completed Graph record byte-frozen; source bytes preserved
  (`AFTER_SOURCE`); native review requests unchanged (2 — Read tool-call + final-text); no fixture
  errors; 4 ledger rows total (companion + 3 Graph nodes).

**Build identity:** artifacts MATCH `complete-attempt-2-manifest-wait-pass` (same TASK_004 build).

### Part 3A attempt 1 — harness-assertion defect (preserved, not overwritten)

Run `76c50b55-7387-4a81-b6bc-3b7590ec1d0b` FAILED, but the concurrency assertions **passed** at
both phases (companion isolated throughout the completing run; run reached `Completed`). The sole
failure was a wrong harness expectation: `completeU4ConcurrentCompanion` asserted native review-stage
provider requests `=== 1`, but the review node legitimately makes **2** (Read tool-call request +
final-text request after the Read result — confirmed via `requests.json`: 2 native review requests
94 ms apart). This is a **harness defect**, not a product or concurrency defect.

**Fix (minimal, no assertion weakening):** capture the review-request count *before* answering the
companion and assert it is *unchanged* after — proving the companion answer triggers no extra Graph
review, regardless of how many review requests the run makes. Rerun PASS (attempt 2).

Archived at `evidence/pre-z8/u4/concurrent-chat-attempt-1-harness-assertion-defect/` (8 files +
manifest naming the defect). Product behavior was correct; no product rerun needed.

---

## Part 3B — Genuine test pass / failure — BLOCKED (environment)

**Category:** environment blocker for current-build rerun; U2 durable evidence mapped item-by-item
as historical evidence with a build-identity caveat.

**Blocker:** The U2 real-VSTest lane hard-requires .NET SDK 8.0.425
(`pre-z8-dotnet-source.mjs:1` `SDK_VERSION = "8.0.425"`; `pre-z8-u2-fixture.mjs:82`
`global.json` with `rollForward: "disable"`; `:188` `assert.equal(version.stdout.trim(),
SDK_VERSION)`; `:193` `assert.equal(path.basename(fixture.sdkPath), SDK_VERSION)`). Installed SDKs
are 3.1.426 / 6.0.428 / 9.0.304 / 10.0.401 — **8.0.425 is not installed**. Installing it is
unauthorized dependency installation. The U4 provider has no test-execution path. Adding a
node:test verification format to the product is a forbidden product-feature addition (confirmed:
the product supports exactly two test-verification formats — `dotnet-vstest-trx-v1` native parser
and `zcode-json-v1` generic contract; no node:test/jest/pytest/TAP/JUnit adapter exists).

**U2 durable evidence mapped item-by-item (historical, earlier build):**

| Requirement | U2 evidence | Status |
| --- | --- | --- |
| Real test execution produces results (not provider claims) | `pass-attempt-3/pre-z8-u2-pass-check-2-original.trx` and `fail-attempt-1/pre-z8-u2-fail-check-2-original.trx` are real VSTest TRX files (`VisualStudio/TeamTest/2010` schema, real `TestRun id`, real timestamps, `runUser`). Assertions: "Genuine {pass,fail} native VSTest process/report facts". | covered (historical) |
| UI shows execution / verification / human decision separately | `pre-z8-u2-build-test-review.png`, `pre-z8-u2-result-1280/1920.png`, `pre-z8-u2-reviewed-manifest.png` capture the layered UI. | covered (historical) |
| Failure stays failed (not upgradable by agent text or approval) | `fail-attempt-1`: `run.status = Failed` (terminal); genuine-fail TRX; not upgradable. `pass-attempt-3`: `run.status = Completed`; genuine-pass TRX. | covered (historical) |
| Missing/invalid reports are not ordinary assertion failures | U2 has **distinct** scenarios: `missing-required-attempt-1`, `zero-attempt-1`, `skipped-attempt-1` — separate from pass/fail, producing distinct evidence states, not `tests-failed`. | covered (historical) |

**Build-identity caveat:** U2 evidence was captured against build SHAs
`a60c0ba495bd / 2c9b498c4ba7 / 6e005a432c44 / 5d32245326af`, which **differ** from the current
build (`8a3d061fc217 / 8313a1774afa / c28816f71fc5 / 7ce34d944283`). The genuine pass/fail
contract is proven durable but **not re-verified on the current build**.

**Possible current-build path (follow-up, not done):** the existing `zcode-json-v1` contract is an
extension point — a harness wrapper could run `node --test` and emit the product's `zcode-test-v1`
JSON. This uses existing product infrastructure (no new feature), but requires authoring a
`zcode-json-v1` recipe + wrapper with exact provenance fields (`operationId`/`sourceDigest`/
`buildDigest`) and carries contract-mismatch risk. It is beyond the minimal safe scope of this task
and is recommended as a separate follow-up. It was **not** forged here.

**Decision:** do not forge a run. Report BLOCKED for current-build rerun; map U2 durable evidence
item-by-item with the build-identity caveat.

---

## Part 3C — Source drift / stale evidence — PASS

**Category:** actual execution, current build, isolated synthetic workspace + controlled loopback
provider.

**Run:** `68874734-8dc1-49c4-ad1e-10689f4d9046`, profile
`.tmp/z1-native-1790496090405-cbd47f`. Status PASS.

**What was missing (the gap):** The U2 `source-drift` scenario mutates `MathOps.cs` at the
**test-verification** boundary (post-admission; `observationValid=false`; `invalid` projection).
The Graph service `StaleEvidence` path (`approvals.ts:156-195`) and UI `stale-approval-request`
blocking (`graphRunSummary.ts:54-55,88`) are real product mechanisms, but **no U4 native scenario**
drove a Graph run into `StaleEvidence` via source mutation at the **approval-gate** boundary.

**Implementation:**
- `pre-z8-u4-source-drift.mjs` (new): `withU4SourceDrift` performs an inode-preserving in-place
  mutation of `fixture.mjs` (marker `Z1_AFTER_7391` → `Z1_DRIFTED_7391`) around an observer, with
  exact-byte + atime/mtime restore in `finally` (mirrors `pre-z8-u2-fault.mjs
  withU2OwnedMutation`; refuses concurrent identity changes). `assertU4StaleEvidence` waits for the
  persisted `StaleEvidence` state and asserts the UI blocks the decision. `driveU4SourceDrift` opens
  the gate, mutates at the boundary, attempts approval, asserts StaleEvidence, restores source, and
  proves no auto-recovery.
- `pre-z8-u4-native.mjs`: new `source-drift` branch runs to the final gate (`startU3Fixture`, no
  companion, `held:false`), opens the gate, then `driveU4SourceDrift`.

**Assertions proven (item-by-item):**
- `run.status === "StaleEvidence"` and `gate.status === "StaleEvidence"` (persisted record —
  contract proof).
- `gate.message === "Relevant evidence or source state changed after review."` (exact product
  message from `approvals.ts:181`).
- `gate.resumeRequired === false`.
- UI: `uiBlocked = true` — approve control disabled, `graph-approval-blocked` visible, run card
  `[data-status="StaleEvidence"]`.
- 3 node attempts `completedSuccess`; the approval decision was blocked.
- After exact-byte source restore (`restored-exact-bytes`, `beforeSha256 === afterSha256`,
  `mutatedSha256 !== beforeSha256`): the run **stays** `StaleEvidence` — no auto-recovery, no stale
  bypass, no blind replay. A fresh reviewed run is required.
- The blocked decision added no new native input and no model request (ledger/modelCount unchanged).

**Build identity:** artifacts MATCH `concurrent-chat-attempt-2-pass` and `complete-attempt-2` (same
TASK_004 build).

Archived at `evidence/pre-z8/u4/source-drift-attempt-1-pass/` (8 files + manifest, including the
restoration receipt).

---

## Part 4 — Defect handling

| Defect | Type | Handling |
| --- | --- | --- |
| concurrent-chat review-count assertion `=== 1` (should be before/after equality) | harness | minimal fix + targeted rerun → PASS (attempt 2). Attempt-1 failure preserved. No assertion weakening, no fixed sleep, no swallowed exception. |
| concurrent-chat companion text falsely claiming "cancellation" | harness (evidence accuracy) | parameterized by `holdEnabled`; cancel wording preserved exactly. |
| U2 SDK 8.0.425 not installed | environment | not fixable in-scope; reported as BLOCKED; U2 durable evidence mapped. |
| Genuine pass/fail on current build | not a defect | BLOCKED (environment + no node:test adapter in product). |

No product or contract defects were found. The `StaleEvidence` product path, the concurrency
isolation, and the manifest-ready wait all behaved per contract.

---

## U4 automated checkpoint status

**Covered (actual execution, current build):**
- `--scenario=cancel` PASS (TASK_002/TASK_003) — cancellation after edit + companion isolation
  against cancellation + restart without replay.
- `--scenario=complete` PASS (TASK_004) — completed execution, agent-reported evidence, zero
  configured tests, exact human approval, manifest-ready wait, later ordinary Chat.
- `--scenario=concurrent-chat` PASS (TASK_005) — companion Chat isolated against a **completing**
  run (gate + approval + terminal proof); no cross-talk.
- `--scenario=source-drift` PASS (TASK_005) — source mutation at the approval-gate boundary blocks
  the decision via `StaleEvidence`; no auto-recovery after restore.

**Covered (mapped historical evidence, earlier build — build-identity caveat):**
- Genuine test pass (`pass-attempt-3`, real VSTest TRX).
- Genuine test failure (`fail-attempt-1`, real VSTest TRX, not upgradable).
- Missing/zero/skipped as distinct from pass/fail (U2 scenarios).
- Post-admission source/build drift at the test-verification boundary (U2 `source-drift`/
  `build-drift`).

**BLOCKED (current build):**
- Genuine test pass/failure rerun on the current build — SDK 8.0.425 not installed; U2 lane cannot
  run. No forge.

**NOT RUN (out of scope):**
- Human/live-provider/company-project pilot; actual OS dialog interaction; installed-artifact / OS
  scaling / cross-platform qualification; full eight-scenario native matrix (combined U6
  regression); U5/U6/Z8.

**U4 is NOT declared complete.** The genuine pass/fail journey is covered only by mapped historical
evidence with a build-identity caveat; a current-build rerun is BLOCKED. Per the spec, the complete
eight-scenario native matrix remains combined U6 regression.

---

## Changed files

| File | Change |
| --- | --- |
| `scripts/graph-engineering/pre-z8-u4-manifest-wait.test.mjs` | Part 1: strengthened ready-no-size + loading→ready tests (actual visibility/size; test-released signal; bounded-timeout failure upper bound). Negatives kept. |
| `scripts/graph-engineering/pre-z8-u4-provider.mjs` | `holdEnabled` option on `u4Response`/`startU4Fixture`; companion output/question text parameterized; `U4_COMPANION_OUTPUT_CONCURRENT` const. Cancel wording preserved exactly. |
| `scripts/graph-engineering/pre-z8-u4-concurrent.mjs` | New: `assertU4CompanionWaiting` + `completeU4ConcurrentCompanion` (companion isolation against a completing run). |
| `scripts/graph-engineering/pre-z8-u4-source-drift.mjs` | New: `withU4SourceDrift` (inode-preserving mutation + exact-byte restore), `assertU4StaleEvidence`, `driveU4SourceDrift`. |
| `scripts/graph-engineering/pre-z8-u4-native.mjs` | `concurrent-chat` and `source-drift` scenario branches + dispatch; import new helpers. |
| `docs/graph-engineering/pre-z8/u4/concurrent-chat-attempt-1-harness-assertion-defect/` | New: attempt-1 failure archive (harness defect). |
| `docs/graph-engineering/pre-z8/u4/concurrent-chat-attempt-2-pass/` | New: concurrent-chat PASS archive. |
| `docs/graph-engineering/pre-z8/u4/source-drift-attempt-1-pass/` | New: source-drift PASS archive. |

No product code, dependency, lockfile, migration, public API, or database schema changed. No
reset/stage/commit/push/publication.

---

## Verification results

| Check | Command | Result |
| --- | --- | --- |
| manifest-wait + U4 proof tests | `node --test pre-z8-u4-manifest-wait.test.mjs pre-z8-u4-proof.test.mjs` | 16 PASS / 0 FAIL |
| concurrent-chat native scenario | `node pre-z8-u4-native.mjs --scenario=concurrent-chat` | PASS (run `258777b9-…`) |
| source-drift native scenario | `node pre-z8-u4-native.mjs --scenario=source-drift` | PASS (run `68874734-…`) |
| Build identity | 4 pinned artifact SHA-256 MATCH across complete-attempt-2, concurrent-chat-attempt-2, source-drift-attempt-1 | MATCH |
| Genuine pass/fail current-build rerun | (U2 lane) | BLOCKED — SDK 8.0.425 not installed |

## Remaining risks

- Genuine pass/fail is only mapped historical evidence on the current build; a current-build rerun
  is BLOCKED until SDK 8.0.425 is available or a `zcode-json-v1` + node:test harness path is
  authorized and built (follow-up).
- The concurrent-chat and source-drift scenarios reuse the complete flow's captured-prompts proof by
  mapping (same fixture/flow, current build); they do not re-assert the 3-captured-prompts
  invariant themselves (complete-attempt-2 remains the primary proof).
- Human/live/OS-conformance and the full eight-scenario native matrix remain NOT RUN (U6).
