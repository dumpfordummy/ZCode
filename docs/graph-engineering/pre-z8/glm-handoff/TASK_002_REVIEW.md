# TASK_002 Review — Independent verification of identity contract and U4 cancellation proof

Verification-only review. No production source/tests were modified, no checks were
weakened, no staging/commit/push, no TASK_003, and U4 is not declared complete. The
reviewer did not implement TASK_002 and did not assume `TASK_002_REPORT.md` was
correct; every claim below was re-derived from the checked-out source, the working-tree
diff, the archived receipt, and freshly run commands.

Checkout: `main` @ `6f41ad53a1fef2a02af004cdfc89a5c5cf91a4dd` (unchanged). Working-tree
changes are the uncommitted accumulation of TASK_001 + TASK_002 (neither was committed).

## Scope separation: TASK_002 vs preserved TASK_001 work

The working tree mixes both tasks. Separated by inspecting the diffs and `TASK_001_REPORT.md`:

| File | Owner | Verification |
| --- | --- | --- |
| `scripts/graph-engineering/pre-z8-u4-native.mjs` | **TASK_001 only** | Diff is exclusively the pre-Run return-to-Design boundary (`graph-view-design` click + preservation asserts, lines 89-118). No TASK_002 edit. Report's "unchanged this task" claim is accurate. |
| `scripts/graph-engineering/pre-z8-u4-proof.mjs` | **TASK_002** | Correlation rewrite + local `nativeQueueItemId`. |
| `scripts/graph-engineering/pre-z8-u4-proof.test.mjs` | **TASK_002** | Realistic fixtures + 9 new regression tests. |
| `docs/.../pre-z8-u4-native-spec.md` | TASK_001 (nav section) + TASK_002 (identity section) | Cumulative; identity section is TASK_002. |
| `docs/.../EXECUTION_PLAN.md` | TASK_001 (nav row) + TASK_002 (proof row, next-action) | Cumulative. |
| `evidence/.../cancel-attempt-2-navigation-fixed/` | TASK_001 (preserved) | Untouched. |
| `evidence/.../cancel-attempt-3-identity-proof-pass/` | TASK_002 | 20 files + manifest. |
| `glm-handoff/TASK_001_REPORT.md` | TASK_001 (preserved) | Untouched. |

## 1. Identity contract — CONFIRMED (with two documentation path defects)

Every identity relationship was re-derived from current source. The contract is sound.

| Identity | Verified meaning | Source (re-verified) |
| --- | --- | --- |
| `attempt.commandId` | bare UUID from `options.id()` | `packages/services/src/graph-engineering/app/run-plan.ts:53` and `:191`; `app/routing-plan.ts:36` |
| `attempt.inputId` | equals `commandId` (Graph design) | `run-plan.ts:58` (`inputId: commandId`), `:200`; `routing-plan.ts:41` |
| `session_input.id` | `queue_<commandId>` (separate queue-row identity) | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/command-inbox.ts:75-77` (`queueItemIdForCommand` returns `` `queue_${commandId}` ``), assigned `:182`, returned as ledger `id` at `v4-bridge.ts:442` (`id: admission.queueItemId`), stored `session-inputs.ts:49-50` |
| `payload.intent.sourceCommandId` | equals `envelope.commandId` (correlation key) | `v4-bridge.ts:422` (`sourceCommandId: envelope.commandId`) |
| `session_id` | native session owner; equals `attempt.sessionId` | native ledger row `sessionID: childSessionId` at `v4-bridge.ts:443`; matches `attempt.sessionId` in the archived receipt |
| queue-row design doc | `queue_<sourceCommandId>` reversible lookup | `apps/zcode-cli/packages/contracts/src/interfaces/session-store.port.ts:1192` |

Correlation logic in `pre-z8-u4-proof.mjs:48-57`:
- Requires exact session AND exact source command: filter is
  `input.session_id === item.sessionId && input.payload?.intent?.sourceCommandId === item.commandId` (both, AND). ✓
- Requires exactly one match: `assert.equal(matching.length, 1)` (line 53). ✓
- Independently validates queue-row mapping: `assert.equal(match.id, nativeQueueItemId(item.commandId))`
  (line 55); helper defined locally at `:8-10` as `` `queue_${commandId}` ``, matching the runtime
  `queueItemIdForCommand` byte-for-byte. Not imported from the runtime (layer boundary preserved). ✓
- Rejects missing/malformed identity: optional chaining (`payload?.intent?.sourceCommandId`) makes a
  missing/empty/wrong-typed intent simply not match → 0 matches → count assert fails. ✓

The old assertion `input.id === item.inputId` conflated the two namespaces
(`queue_<commandId> !== <commandId>`). The source confirms this was by design, not a production
ownership defect. Option B (harness-only correction) was correctly applied.

**Defects (documentation only — line numbers and substantive claims are correct):**
- **D1**: `TASK_002.md` cites `packages/contracts/src/interfaces/session-store.port.ts:1192`. That path
  does not exist (there is no top-level `packages/contracts`; `ls packages/ | grep contract` is empty).
  Actual path: `apps/zcode-cli/packages/contracts/src/interfaces/session-store.port.ts:1192`. Content at
  :1192 is exactly the cited `queue_<sourceCommandId>` doc.
- **D2**: `TASK_002.md` cites `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/v4/v4-bridge.ts:442`
  (extra `/v4/` segment). Actual path: `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/v4-bridge.ts:442`.
  (`v4-bridge.ts` lives directly under `zcode-protocol/`; `command-inbox.ts` lives under `zcode-protocol-v4/`.)
  Content at :442 is exactly `id: admission.queueItemId`.

Note: the spec (`pre-z8-u4-native-spec.md` identity section) and the proof code comments use
filename-only references (`run-plan.ts:58`, `command-inbox.ts:75-77`), which are correct; the wrong full
paths appear only in the `TASK_002.md` handoff doc.

## 2. Assertion preservation — CONFIRMED

Compared the HEAD proof (`git diff -- scripts/graph-engineering/pre-z8-u4-proof.mjs`) against the
current proof. No assertion was removed or weakened; the change is a strengthening.

- Cancellation order: `cancelRequestedAt <= attempt.updatedAt` and `<= run.updatedAt` (`:25-26`) — unchanged. ✓
- Terminal proof: `completedInterrupted`, `terminalProof.sourceCommandId === commandId`, `logEpoch`,
  `seq >= 0` integer (`:21-24`) — unchanged. ✓
- Exact count: `inputs.length === 3` (`:38-42`) — unchanged. ✓
- Forbidden successor: `toolAttempts.length === 0`, `approvalAttempts.some(...) === false`,
  `run.result === undefined`, `admitted.map(nodeId) === ["analyze","implement"]` (`:27-37`) — unchanged. ✓
- Companion isolation: `inputs.find(id === companion.id)` + `session_id` + `deepEqual(payload)`
  (`:59-62`) — unchanged. ✓
- Restart / no-replay: lives in `pre-z8-u4-native.mjs:157-163` (record/ledger/model-count unchanged
  across `stopApp`/`launch`, plus the pushed assertion string). TASK_002 did not touch `native.mjs`
  (only TASK_001's navigation fix is there), so this assertion is preserved. ✓

Within the correlation loop, the old post-match asserts `matching[0].session_id === item.sessionId`
and `matching[0].payload.intent.sourceCommandId === item.commandId` were relocated into the filter
predicate (so a mismatch now yields 0 matches → count failure) and `sourceCommandId` is additionally
re-asserted after the match (`:56`). The new `match.id === nativeQueueItemId(item.commandId)` (`:55`)
is an **addition**, not a replacement. Net effect: correlation predicate strengthened, queue-row identity
now independently validated.

Minor observation (not a defect, not required by the verification points): `TASK_002.md` "Authorized
correction" item 3 says "validate the matched row's payload structure is complete." The implementation
validates `match.id` and `match.payload.intent.sourceCommandId` post-match, but does not assert the
presence of `payload.intent.queueItemId` (which the contract calls "redundant") or `kind`/`delivery`/
`status`. Malformed identity is still rejected via the filter. This is a partial fulfillment of an
authorized sub-item, not a regression.

## 3. Regression quality — MOSTLY GOOD; one negative test fails for the wrong reason

`pre-z8-u4-proof.test.mjs` now has 19 tests. Fixtures use realistic `queue_`-prefixed rows with
`payload.intent.sourceCommandId`; the old unrealistic `ledger.id === attempt.inputId` fixtures are gone.
No hardcoded real run IDs (synthetic UUIDs like `implement-command-uuid`; the real run id
`777dd5f4-...` appears only in the archived receipt, never in tests).

Negative tests were executed individually to capture the actual failure reason:

| Test | Intended reason | Actual failure | Verdict |
| --- | --- | --- | --- |
| wrong-session | 0 correlation matches (`0 !== 1`) | `assert.equal` `0 !== 1` at `matching.length` | ✓ intended |
| wrong-command | 0 correlation matches | `0 !== 1` at `matching.length` | ✓ intended |
| tampered-id | new queue-id assert (`queue_tampered-id !== queue_<cmd>`) | `assert.equal` on `match.id` | ✓ intended (exercises the NEW assertion) |
| duplicate | `2 !== 1` exact-one-match | `2 !== 1` at `matching.length` (analyze iteration) | ✓ intended |
| malformed payload | 0 correlation matches | `0 !== 1` at `matching.length` | ✓ intended |
| cross-session / missing-companion / extra / changed-payload (existing) | respective | respective | ✓ intended |

**Defect D3 (test quality):** `pre-z8-u4-proof.test.mjs:187-193`
"U4 rejects when no ledger entry matches the admitted attempt" supplies only two rows
(`companion` + `analyze`), so the proof fails at the exact-count check
`assert.equal(inputs.length, 3, "Only Analyze, Implement and the independent Chat may be admitted.")`
(`pre-z8-u4-proof.mjs:38-42`) — **before** reaching the correlation loop. It does not exercise its
named "no ledger entry matches" scenario. This is exactly the failure mode the review brief warned
about ("tests that... fail for [not] the intended reason"). Mitigating factor: the 0-correlation-matches
path is in fact covered by the wrong-session and wrong-command tests, so this is a misleading test, not
a true coverage gap. The test should be repaired to supply three rows (e.g. a third non-matching row)
so the count passes and the correlation `0 !== 1` is the failure.

Shared-assumption note: the `nativeRow` fixture helper and the proof's `nativeQueueItemId` both
construct `` `queue_${commandId}` ``. By design (the task forbids importing the runtime helper into the
harness), the unit tests do not independently verify the `queue_` format against the runtime — that
validation is supplied by the native run (section 4), whose real ledger rows are `queue_`-prefixed.

## 4. Native evidence — CONFIRMED

Archived receipt: `evidence/pre-z8/u4/cancel-attempt-3-identity-proof-pass/pre-z8-u4-summary.json`.

- `status: PASS`, `error: (none)`, `runId: 777dd5f4-5f83-4348-a508-a141c18962f0`, `terminalRun.status: Cancelled`. ✓
- `testedBuild` records SHA-256 for 4 artifacts the driver pinned; all four match the bytes currently on
  disk (see section 5).
- Assertion sequence (`summary.assertions`, 5 entries) includes the three assertions that execute **after**
  the formerly failing line (`pre-z8-u4-cancel.mjs:191`, the first `assertU4Cancellation`):
  1. "The exact native Implement input receives interrupted terminal proof after durable cancel intent..."
     (pushed at `pre-z8-u4-cancel.mjs:220`, after late-provider-release and frozen-run checks `:197-219`).
  2. "The distinct ordinary Chat stays at its original native question during Graph cancellation, then
     completes only after its explicit answer..." (pushed at `:284`, after the **second**
     `assertU4Cancellation` re-proof at `:273` and the no-review check `:279-282`).
  3. "Restart selects the same terminal cancelled history with its exact native proof and preserved source,
     without replay, recovery admission or another model request." (pushed at `pre-z8-u4-native.mjs:161`,
     after `stopApp`/`launch` and record/ledger/model-count equality `:157-159`).
- `cancellationProof`: `commandId === inputId === terminalProof.sourceCommandId`
  (`1ab1e059-9aa0-436d-8e54-fc63c5a41e8e`); `sessionId = sess_2eb6fdf7-...`; `seq = 70`;
  `nativeObservedAt (1790490360327) >= cancelRequestedAt (1790490360249)`; `nativeInputs = 3`;
  `companionSessionId (sess_025b8154-...) !== sessionId`. ✓
- Real ledger rows from `nativeLedger` (3 distinct): implement row `id = queue_1ab1e059-...`,
  `session_id = sess_2eb6fdf7-...`, `payload.intent.sourceCommandId = 1ab1e059-...`,
  `payload.intent.queueItemId = queue_1ab1e059-...`. The corrected proof correlates this row via
  session+source-command and validates `id === queue_<commandId>`. The **old** proof would have evaluated
  `queue_1ab1e059-... === 1ab1e059-...` (false) → `0 !== 1` → FAIL on this exact real data, confirming
  the fix was necessary and the run genuinely exercised it.
- `providerLateRelease`: one held reply, `delivered: false`, `connectionOpenAtRelease: false`
  (cancel aborted the connection). ✓
- Screenshots present for every post-failure milestone: `cancelled-after-edit`,
  `companion-still-waiting-after-cancel`, `companion-completed-after-cancel`,
  `cancelled-reopened-no-replay` (1280+1920 where applicable). ✓
- Manifest integrity: `manifest.json` lists 20 files; recomputed SHA-256 for all 20 — **0 mismatches**.
  Manifest `runId`/`status`/`scenario` match the receipt. ✓
- `notRun` field respects constraints (human/live/company-project pilot, OS dialog, installed-artifact
  qualification, `fixture.test.mjs` execution, Z8). `fixtureErrors: []`.

## 5. Build validity — CONFIRMED (provenance clear; emitting checks did not modify artifacts)

The report's claim that "build artifacts... were reused" and "No build artifacts changed" was
investigated empirically, not taken on faith.

- `pnpm typecheck` is `tsc -b packages/... packages/desktop/tsconfig.host.json` (build mode, **emits**;
  not `--noEmit`). `packages/desktop/tsconfig.host.json` has `outDir: "out/host"`, so a re-emit could in
  principle touch `packages/desktop/out/host/`.
- Tracked working-tree changes are **only** `scripts/**` and `docs/**`
  (`git diff --name-only | grep -vE "^(scripts/|docs/)"` is empty). No package source changed. The proof
  and test edits are `.mjs` files under `scripts/`, which are not in any `tsconfig` project, so they never
  enter the build.
- The 4 artifacts the native run pinned in `testedBuild` were re-hashed from disk; **all four match the
  receipt** byte-for-byte:
  - `apps/zcode-cli/packages/cli/dist/zcode.cjs` → `8a3d061f...`
  - `packages/desktop/out/main/index.js` → `8313a177...`
  - `packages/desktop/out/host/index.js` → `c28816f7...`
  - `packages/desktop/out/renderer/index.html` → `7ce34d94...`
- **Empirical emitting-check test:** snapshotted the 4 SHAs, ran `corepack pnpm typecheck` (exit 0), then
  re-hashed. All four SHAs **UNCHANGED**. `git status` showed **no** `dist-types`/`out/` drift afterward.
  Conclusion: with package source unchanged from HEAD, `tsc -b` (incremental) is a no-op on these
  artifacts; emitting checks did not modify them. This is stronger evidence than file existence.

Because provenance is clear (unchanged source + SHA match against the receipt + empirically non-mutating
typecheck), the review did **not** rebuild from scratch and did **not** rerun the native cancellation
scenario — the task's conditional ("if artifact provenance is unclear, rebuild... and rerun") did not
trigger. The archived receipt + provenance verification stand as the build/scenario evidence.

## Actual commands and results

| Command | Result |
| --- | --- |
| `node scripts/check-workspace-freshness.mjs` | PASS — main aligned with origin/main (ahead 0 / behind 0) |
| `git diff --name-only` | only `scripts/**` + `docs/**` changed (no package source) |
| `node --test scripts/graph-engineering/pre-z8-u4-provider.test.mjs scripts/graph-engineering/pre-z8-u4-proof.test.mjs scripts/graph-engineering/pre-z8-u4-artifact-fault.test.mjs` | PASS — 19 tests, 0 fail |
| `node --import tsx --test packages/ui/test/graphRunSummary.test.ts` | PASS — 12 tests, 0 fail |
| `node --import tsx --test packages/services/src/graph-engineering/app/service.test.ts packages/services/src/graph-engineering/app/sequential-service.test.ts packages/services/src/graph-engineering/adapters/recovery.test.ts` | PASS — 24 tests, 0 fail |
| `corepack pnpm typecheck` | PASS (exit 0); 4 pinned artifact SHAs unchanged; no dist-types drift |
| `corepack pnpm architecture:check --changed` | PASS — 0 violations / 0 baseline / 0 new |
| `corepack pnpm lint` | PASS baseline — 70 warnings / 0 errors (matches report) |
| `corepack pnpm exec oxfmt --check` on 4 changed files | PASS — all correct format |
| Negative-test failure-reason probe (inline node) | 5 of 6 intended reasons confirmed; D3 found (see section 3) |
| Manifest SHA-256 re-verify (20 files) | 0 mismatches |

### Checks NOT RUN
- **Native `--scenario=cancel` rerun**: NOT RUN. Build provenance was clear (section 5), so the task's
  rebuild-and-rerun conditional did not trigger. The archived attempt-3 receipt was verified instead.
- **Live paid-model / installed-credential / company-project checks**: NOT RUN (task constraints; the
  archived run's `notRun` field confirms the same constraints were honored).
- **Other U4 native journeys** (complete/no-Tests, concurrent Chat, genuine pass/fail, source-drift):
  NOT RUN — out of scope for this review and explicitly still NOT RUN per the execution plan.
- **TASK_003 / Z8 / U5 / U6**: NOT STARTED.

## Defects, missing verification, and baseline exceptions

### Defects (report-then-fix; not fixed by this review)
- **D1** — `TASK_002.md` cites a non-existent path
  `packages/contracts/src/interfaces/session-store.port.ts:1192`. Correct path:
  `apps/zcode-cli/packages/contracts/src/interfaces/session-store.port.ts:1192`. Line/content correct.
- **D2** — `TASK_002.md` cites `.../zcode-protocol/v4/v4-bridge.ts:442` (spurious `/v4/`). Correct path:
  `.../zcode-protocol/v4-bridge.ts:442`. Line/content correct.
- **D3** — `pre-z8-u4-proof.test.mjs:187-193` ("rejects when no ledger entry matches") supplies 2 rows
  and fails at the exact-count assert (`pre-z8-u4-proof.mjs:38-42`), not at the correlation loop. It does
  not test its named scenario. The 0-match correlation path is covered elsewhere, so this is a misleading
  test rather than a coverage gap.

### Missing verification
- None blocking. The native scenario was not rerun (provenance was clear); this is documented above, not
  an oversight.

### Baseline exceptions
- `pnpm lint`: 70 warnings / 0 errors is the pre-existing baseline (unchanged by TASK_002; the warnings
  are in `packages/services/src/node.ts`, unrelated to this task).
- Host Node 24.11.1 vs `mise.toml`-pinned 24.14.0 (no `mise` installed); `engines.node >=24.0.0`
  satisfied. `corepack pnpm` provides pnpm 10.33.2. No source/lockfile mutation. (Same benign note as
  TASK_001/002 reports; re-observed here.)

## Verdict

**DEFECT_FOUND** — non-blocking.

The core of TASK_002 is **CONFIRMED**: the identity contract is correct and verified from source; the
proof correction correlates via exact session + exact source command, requires exactly one match, and
independently validates the queue-row mapping; no assertion was removed or weakened; the complete native
`--scenario=cancel` run finished with PASS including all assertions after the formerly failing
correlation line; and build provenance is clear (typecheck does not mutate the pinned artifacts).

The defects are documentation/test-quality, not implementation: two wrong source paths in the handoff
doc (D1, D2) and one negative test that fails for the wrong reason (D3). None invalidates the TASK_002
result, the corrected proof, or the native evidence. They should be fixed before the cancellation-proof
slice is treated as closed, but they do not require reverting the proof change or rerunning the native
scenario. U4 as a whole remains IN PROGRESS (other native journeys still NOT RUN); this review does not
declare U4 complete.
