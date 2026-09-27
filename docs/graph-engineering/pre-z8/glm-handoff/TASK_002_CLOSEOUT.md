# TASK_002 Closeout — Closure of review defects D1–D3

This document records the closure of the three defects raised in
`TASK_002_REVIEW.md`. The original review is preserved unchanged as a historical
record; this closeout is additive. No production identity contract, proof logic,
cancellation, isolation, or no-replay assertion was modified. The historical native
`--scenario=cancel` run (attempt-3) is **not** re-described here as a new run — its
evidence remains the archived receipt at
`evidence/pre-z8/u4/cancel-attempt-3-identity-proof-pass/`.

Checkout: `main` @ `6f41ad53a1fef2a02af004cdfc89a5c5cf91a4dd` (unchanged). No
staging, commit, push, or publication.

## Defect closure

### D1 — Wrong `session-store.port.ts` path in `TASK_002.md` — CLOSED

- **Was:** `TASK_002.md` table row for `session_input.id` cited
  `packages/contracts/src/interfaces/session-store.port.ts:1192`. That path does not
  exist (no top-level `packages/contracts`; `ls packages/ | grep contract` is empty).
- **Fix:** `docs/graph-engineering/pre-z8/glm-handoff/TASK_002.md` line 17 — path
  corrected to `apps/zcode-cli/packages/contracts/src/interfaces/session-store.port.ts:1192`.
- **Re-verified from source:** the file exists at the corrected path; line 1192 reads
  exactly `/** global createSession.firstInput 查重：由 queue_<sourceCommandId> 找回真实 session。 */`.
  Line number and content were already correct; only the path prefix was wrong.

### D2 — Wrong `v4-bridge.ts` path in `TASK_002.md` — CLOSED

- **Was:** `TASK_002.md` cited
  `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/v4/v4-bridge.ts:442` (spurious
  `/v4/` segment).
- **Fix:** same line 17 — path corrected to
  `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/v4-bridge.ts:442`. (`v4-bridge.ts`
  lives directly under `zcode-protocol/`; `command-inbox.ts` lives under `zcode-protocol-v4/`.)
- **Re-verified from source:** file exists at the corrected path; line 442 is
  `id: admission.queueItemId,`. Line number and content were already correct.

Note: the D1/D2 edits lengthened line 17 (the `apps/zcode-cli/packages/contracts/...`
prefix is longer than the old `packages/contracts/...`), which changed the markdown
table's max column width. `oxfmt --check` then flagged the whole table for re-padding.
`oxfmt --write` was applied to `TASK_002.md` only; it re-padded table columns and made
no semantic change. Both corrected paths survive the reformat (verified by grep). This
is a formatting consequence of the content fix required for `pnpm fmt:check`, not a
gratuitous broad reformat.

### D3 — Negative test failed for the wrong reason — CLOSED

- **Was:** `pre-z8-u4-proof.test.mjs:187-193`
  "U4 rejects when no ledger entry matches the admitted attempt" supplied only two rows
  (`companion` + Analyze), so the proof failed at the exact-count check
  (`assert.equal(inputs.length, 3, "Only Analyze...")`, `pre-z8-u4-proof.mjs:38-42`)
  **before** reaching the correlation loop. It did not exercise its named scenario.
- **Fix:** minimal change to that one test only (no other test touched, proof logic
  untouched). The test now supplies three rows that pass the exact-count check:
  - `companion` (preserved, unchanged fixture),
  - Analyze row (`nativeRow({ commandId: "analyze-command-uuid", sessionId: "sess_analyze" })`),
  - a third legitimate native-shaped row belonging to neither the Analyze nor the
    Implement session/command
    (`nativeRow({ commandId: "unrelated-command-uuid", sessionId: "sess_unrelated" })`).
  Analyze correlates to its row (1 match, passes); the Implement attempt reaches the
  correlation loop and finds zero matches → fails at `assert.equal(matching.length, 1)`
  (`pre-z8-u4-proof.mjs:53`).
- **Specific failure reason verified:** the test no longer uses a bare
  `assert.throws`. It captures the thrown error and asserts:
  1. `caught instanceof assert.AssertionError`,
  2. `caught.message` does **not** match `/Only Analyze/` (proves the proof advanced
     past the exact-count check into the correlation loop),
  3. `caught.message` matches `/(0\s*!==\s*1|actual[\s\S]*\b0\b[\s\S]*expected[\s\S]*\b1\b)/`
     (Node 24 formats `assert.equal(0, 1)` as `0 !== 1`; the alternative pattern covers
     the older `+ actual - expected` layout for robustness).
- **Confirmed by probe:** with the three rows, the Analyze iteration matches exactly one
  row and the Implement iteration yields `0 !== 1`; the message contains no "Only
  Analyze" text. The 0-match correlation path is therefore genuinely exercised. (It is
  also independently covered by the wrong-session and wrong-command tests.)

No existing count, identity, cancellation, companion-isolation, or no-replay assertion
was deleted or weakened. The proof file `pre-z8-u4-proof.mjs` was not modified for D3
— only the test. This matches the review's expectation that D1–D3 should not require
production or proof-logic changes.

## Actual verification commands and results

| Command | Result |
| --- | --- |
| `node --test scripts/graph-engineering/pre-z8-u4-provider.test.mjs scripts/graph-engineering/pre-z8-u4-proof.test.mjs scripts/graph-engineering/pre-z8-u4-artifact-fault.test.mjs` | PASS — 19 tests, 0 fail (D3 test now passes for the intended reason) |
| D3 failure-reason probe (inline node, isolated) | AssertionError; no "Only Analyze"; matches `0 !== 1` — correlation loop reached |
| `corepack pnpm architecture:check --changed` | PASS — 0 violations / 0 baseline / 0 new |
| `corepack pnpm exec oxfmt --write docs/.../TASK_002.md` then `--check` | PASS — all matched files correct format; both corrected paths survive |
| `corepack pnpm exec oxfmt --check scripts/.../pre-z8-u4-proof.test.mjs docs/.../TASK_002.md` | PASS |
| `corepack pnpm typecheck` | PASS (exit 0); 4 pinned desktop/CLI artifacts SHA-256 UNCHANGED (no mutation) |
| `corepack pnpm lint` | PASS baseline — 70 warnings / 0 errors (pre-existing, unchanged by this closeout) |

### Checks NOT RUN
- Native `--scenario=cancel` rerun: NOT RUN. D1–D3 are documentation/test-quality fixes
  with no proof-logic change; the archived attempt-3 evidence stands. (The complete
  scenario is exercised in Part 2 of this session, separately.)
- Live paid-model / installed-credential / company-project checks: NOT RUN (constraints).

## Remaining limitations

- `TASK_002_REPORT.md` (the original implementation report) is preserved as a historical
  record and was not edited; it uses filename-only source references (`v4-bridge.ts`,
  `command-inbox.ts`) which are correct, and does not contain the wrong full paths, so no
  correction is needed there.
- The unit-test `nativeRow` helper and the proof's local `nativeQueueItemId` both
  construct `` `queue_${commandId}` ``. By design (the task forbids importing the runtime
  helper into the harness layer), the unit tests do not independently verify the `queue_`
  format against the runtime; that validation is supplied by the native run, whose real
  ledger rows are `queue_`-prefixed. This is a deliberate layer-boundary decision, not a
  defect.
- `TASK_002.md` "Authorized correction" item 3 ("validate the matched row's payload
  structure is complete") remains partially fulfilled: the proof validates `match.id` and
  `match.payload.intent.sourceCommandId` post-match, and rejects malformed identity via
  the filter, but does not assert the presence of `payload.intent.queueItemId` (the
  contract calls it "redundant") or `kind`/`delivery`/`status`. Not a regression; recorded
  for completeness.

## Verdict

D1, D2, D3 — **CLOSED**. The TASK_002 cancellation-proof slice stands CONFIRMED with the
review defects addressed. U4 as a whole remains IN PROGRESS; this closeout does not
declare U4 complete.
