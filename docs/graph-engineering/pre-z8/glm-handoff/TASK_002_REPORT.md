# TASK_002 Report — Establish identity contract and correct U4 cancellation proof

## Summary

TASK_002 is **complete**. The identity contract between Graph command/input identity and native ledger-row identity was established from source, the U4 cancellation proof was corrected to correlate via the exact owning session ID and the exact original source command ID (with independent queue-row ID validation), and the complete native `--scenario=cancel` scenario **PASSED** — including all assertions after the previously failing line.

No production session ownership, persistence, cancellation, recovery, or ID generation was changed. The correction is harness-only, as authorized. No staging, commit, push, publication, Z8, or TASK_003 was started.

## Confirmed identity semantics and source references

The Graph record and the native `session_input` ledger use **separate identity namespaces** by design. They are correlated, never string-equal. This was verified from source and from the actual native ledger rows.

| Identity                         | Space                         | Source                                                                                                                                                                                                              |
| -------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `attempt.commandId`              | bare UUID                     | `packages/services/src/graph-engineering/app/run-plan.ts:53` (`options.id()`), `:191`, `app/routing-plan.ts:36`                                                                                                     |
| `attempt.inputId`                | bare UUID, equals `commandId` | `run-plan.ts:58` (`inputId: commandId`), `:200`, `routing-plan.ts:41`                                                                                                                                               |
| `session_input.id`               | `queue_<commandId>`           | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/command-inbox.ts:75-77` (`queueItemIdForCommand`), assigned at `:182`, returned as ledger row `id` at `v4-bridge.ts:442`, stored by `session-inputs.ts:49` |
| `payload.intent.sourceCommandId` | bare UUID, equals `commandId` | Observed in actual native ledger rows; set by the runtime admission path                                                                                                                                            |
| `session_id`                     | `sess_<uuid>`                 | Native session owner; matches `attempt.sessionId`                                                                                                                                                                   |

The old proof assertion `input.id === attempt.inputId` conflated the two namespaces: `queue_<commandId> !== <commandId>`. The source confirms this is by design, not a production ownership defect. Option B (harness correction) was authorized and applied. Full contract documented in `docs/graph-engineering/pre-z8/glm-handoff/TASK_002.md`.

## Changed files and rationale

Source/branch/HEAD: `main` @ `6f41ad53a1fef2a02af004cdfc89a5c5cf91a4dd` (unchanged).

| File                                                                                    | Change                                                                                                                                                                                                                                                                                      | Rationale                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/graph-engineering/pre-z8-u4-proof.mjs`                                         | Added local `nativeQueueItemId(commandId)` helper. Replaced `input.id === item.inputId` correlation with `input.session_id === item.sessionId && input.payload?.intent?.sourceCommandId === item.commandId`, then independently validates `match.id === nativeQueueItemId(item.commandId)`. | Correlate via the two ownership attributes that span the two identity namespaces (session + source command), then validate the queue-row ID mapping as a separate check. The helper is defined locally to preserve layer boundaries — no runtime import.                                                                                                               |
| `scripts/graph-engineering/pre-z8-u4-proof.test.mjs`                                    | Updated all fixtures to use realistic native-shaped ledger rows (`queue_`-prefixed ids, `payload.intent.sourceCommandId`). Kept existing negative cancellation tests. Added 9 new regression tests.                                                                                         | The old fixtures set `ledger.id === attempt.inputId`, which is the unrealistic assumption this task repairs. New tests cover: valid correlation, wrong session, wrong source command, tampered queue-row id, no match, duplicate match, malformed payload, companion isolation, and a demonstration that the realistic row shape would have failed the old comparison. |
| `docs/graph-engineering/pre-z8/pre-z8-u4-native-spec.md`                                | Added "Identity correlation between Graph attempts and native ledger rows" section.                                                                                                                                                                                                         | Specification precedes implementation; the identity contract must be documented before the proof change.                                                                                                                                                                                                                                                               |
| `docs/graph-engineering/pre-z8/EXECUTION_PLAN.md`                                       | U4 checkpoint row, evidence-ledger row, and next-action line updated.                                                                                                                                                                                                                       | Record the real new status: cancellation-proof slice PASS, remaining U4 journeys still NOT RUN.                                                                                                                                                                                                                                                                        |
| `docs/graph-engineering/pre-z8/glm-handoff/TASK_002.md` (new)                           | Identity contract document with source references.                                                                                                                                                                                                                                          | Required by the task: explain the relationship and cite exact source paths/symbols.                                                                                                                                                                                                                                                                                    |
| `docs/graph-engineering/evidence/pre-z8/u4/cancel-attempt-3-identity-proof-pass/` (new) | 20 owned synthetic evidence files + SHA-256 manifest.                                                                                                                                                                                                                                       | Archive the passing attempt separately; earlier failed attempts preserved.                                                                                                                                                                                                                                                                                             |

TASK_001's navigation fix in `pre-z8-u4-native.mjs` and its evidence archive remain intact and unchanged.

## Before/after regression results

### Before (TASK_001 attempt-2)

- `pre-z8-u4-proof.test.mjs`: 10 tests PASS — but fixtures used `ledger.id === attempt.inputId`, never exercising the real `queue_` format.
- Native `--scenario=cancel`: **FAIL** at `pre-z8-u4-proof.mjs:36` (`0 !== 1`). The proof asserted `input.id === item.inputId`, evaluating `queue_7cccd9b3-... === 7cccd9b3-...` (false). Navigation and cancellation itself were correct; only the identity correlation was broken.

### After (TASK_002)

- `pre-z8-u4-proof.test.mjs`: **19 tests PASS** (10 existing + 9 new). All fixtures now use realistic `queue_`-prefixed rows with `payload.intent.sourceCommandId`. New tests verify the proof rejects: wrong session, wrong source command, tampered queue-row id, no match, duplicate match, malformed payload, and companion collision.
- Native `--scenario=cancel`: **PASS** (exit code 0). All 5 assertions completed, including the three after the previously failing line: interrupted terminal proof after cancel intent, companion isolation through cancellation and explicit answer, and restart selecting the same cancelled history without replay.

No assertion was weakened, dropped, or converted to a status-only check.

## Exact verification commands and actual outcomes

All emitting commands run serially. Native run ran only after all typecheck/lint/architecture/format completed.

| Command                                                                                                                                                                                                                         | Result                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `node --test scripts/graph-engineering/pre-z8-u4-provider.test.mjs scripts/graph-engineering/pre-z8-u4-proof.test.mjs scripts/graph-engineering/pre-z8-u4-artifact-fault.test.mjs`                                              | PASS (19 tests: 10 original + 9 new regression)                                                               |
| `node --import tsx --test packages/ui/test/graphRunSummary.test.ts`                                                                                                                                                             | PASS (12 tests)                                                                                               |
| `node --import tsx --test packages/services/src/graph-engineering/app/service.test.ts packages/services/src/graph-engineering/app/sequential-service.test.ts packages/services/src/graph-engineering/adapters/recovery.test.ts` | PASS (24 tests)                                                                                               |
| `corepack pnpm typecheck`                                                                                                                                                                                                       | PASS (exit 0)                                                                                                 |
| `corepack pnpm lint`                                                                                                                                                                                                            | PASS baseline (70 warnings / 0 errors — pre-existing, no new errors)                                          |
| `corepack pnpm architecture:check --changed`                                                                                                                                                                                    | PASS (0 violations / 0 baseline / 0 new)                                                                      |
| `corepack pnpm exec oxfmt --check` on changed files                                                                                                                                                                             | PASS (all 4 changed files; TASK_002.md and proof.test.mjs reformatted in write mode, content verified intact) |
| `node scripts/graph-engineering/pre-z8-u4-native.mjs --scenario=cancel`                                                                                                                                                         | **PASS** (exit 0). Run `777dd5f4-5f83-4348-a508-a141c18962f0`. Profile `.tmp/z1-native-1790490337476-e3e6a4`. |

Build artifacts from TASK_001's serial build were reused (desktop `out/main/index.js` present, CLI adapter dists present, Electron present). No build artifacts changed because all edits are in harness scripts and docs, not built packages. `Z1_PACKAGED_EXE` unset (dev Electron).

## Native scenario evidence

Run `777dd5f4-5f83-4348-a508-a141c18962f0`, status **Cancelled**, exit code **0**.

- **Cancellation ordering**: `cancelRequestedAt = 1790490360249` ≤ run `updatedAt = 1790490360327` and ≤ implement `updatedAt = 1790490360327`.
- **Implement terminal proof**: `completedInterrupted`, `sourceCommandId = 1ab1e059-9aa0-436d-8e54-fc63c5a41e8e` (matches `commandId`), `seq = 70`.
- **Identity correlation**: implement ledger row `id = queue_1ab1e059-...`, `session_id = sess_2eb6fdf7-...` (matches `attempt.sessionId`), `payload.intent.sourceCommandId = 1ab1e059-...` (matches `attempt.commandId`). Proof correlated via session + source command, validated `id === queue_<commandId>`.
- **Exactly 3 native inputs**: companion (`queue_01a0e18a-...` / `sess_025b8154-...`), analyze (`queue_4cbfd2bf-...` / `sess_51aec3a7-...`), implement (`queue_1ab1e059-...` / `sess_2eb6fdf7-...`).
- **No Review/gate/result/successor** after cancellation.
- **Companion isolation**: companion stayed at its original question during cancellation, completed only after its explicit answer, without changing the cancelled Graph record or source bytes.
- **Restart**: same cancelled history selected with preserved proof and source, no replay or recovery admission.
- **10 model requests**, **19 screenshots** captured.
- Evidence archived at `evidence/pre-z8/u4/cancel-attempt-3-identity-proof-pass/` (20 files + SHA-256 manifest).

## Remaining blockers

None for this task. The cancellation-proof slice is PASS. The remaining U4 native journeys (complete/no-Tests, concurrent Chat, genuine pass/fail, source-drift) are NOT RUN — they are separate scenarios, not blockers.

## Checks NOT RUN and tooling exceptions

- Live paid-model checks, company-project execution, installed-credential access: NOT RUN (per task constraints).
- Z8, TASK_003: NOT STARTED.
- Other U4 native journeys (complete/no-Tests, concurrent Chat, genuine pass/fail, source-drift): NOT RUN.
- U5, U6, broad Graph/Git/UI full regression beyond the focused lanes: NOT RUN.
- Human/OS conformance: NOT RUN.
- **Toolchain note (benign)**: host has Node 24.11.1 rather than `mise.toml`-pinned 24.14.0 (no `mise` installed). Root `engines.node >=24.0.0` satisfied; `corepack pnpm` provides pnpm 10.33.2. No source/lockfile mutation. The `.tmp/bin/pnpm` shim from TASK_001 (gitignored) remains available for turbo.

## Changed files (final inventory)

```
 M docs/graph-engineering/pre-z8/EXECUTION_PLAN.md
 M docs/graph-engineering/pre-z8/pre-z8-u4-native-spec.md
 M scripts/graph-engineering/pre-z8-u4-native.mjs        (TASK_001, unchanged this task)
 M scripts/graph-engineering/pre-z8-u4-proof.mjs
 M scripts/graph-engineering/pre-z8-u4-proof.test.mjs
?? docs/graph-engineering/evidence/pre-z8/u4/cancel-attempt-2-navigation-fixed/   (TASK_001, preserved)
?? docs/graph-engineering/evidence/pre-z8/u4/cancel-attempt-3-identity-proof-pass/
?? docs/graph-engineering/pre-z8/glm-handoff/TASK_001_REPORT.md   (TASK_001, preserved)
?? docs/graph-engineering/pre-z8/glm-handoff/TASK_002.md
?? docs/graph-engineering/pre-z8/glm-handoff/TASK_002_REPORT.md
```
