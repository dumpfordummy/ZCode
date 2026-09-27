# TASK_004 Report — Manifest-ready wait fix and complete/no-Tests scenario PASS

## Summary

The harness defect at `pre-z8-u4-artifact-ui.mjs:50` is fixed with a minimal, race-free change
(`waitFor()` → `waitFor({ state: "attached" })`, keeping the `[data-state="ready"]` selector).
Four new focused regression tests verify the actual wait behavior against controlled
`data-state` transitions. The complete `--scenario=complete` native scenario now reaches a **full
PASS** — every acceptance point including the manifest export/content check, `verifyU3LaterChat`,
the second `assertU4Summary`, and `assertU3FixturePreserved`.

No production UI/runtime/contract code was modified, no assertion was weakened, no fixed sleeps
were added, no staging/commit/push. U4 is not declared complete.

Checkout: `main` @ `6f41ad53a1fef2a02af004cdfc89a5c5cf91a4dd` (unchanged).

## Part 1 — Wait-semantics fix

### What changed

`scripts/graph-engineering/pre-z8-u4-artifact-ui.mjs:49-56` — one locator wait:

```js
await window.getByTestId("graph-export-manifest").click();
// ReadState renders an intentionally empty (zero-size) <div data-state="ready"> when the
// manifest read completes, so a visibility wait can never succeed. The [data-state="ready"]
// attribute selector itself excludes loading/error; "attached" only confirms the element is
// in the DOM with that state, not that it is visible. ...
await window
  .locator('[data-testid="graph-manifest-read-state"][data-state="ready"]')
  .waitFor({ state: "attached" });
```

### Why this is correct and race-free

- `ReadState` (`GraphArtifactInspector.tsx:118-136`) sets `data-state={state.status}` on the
  outer div always. For `ready` it renders no children (empty/zero-size under product styling).
  A `visible` wait can never succeed on that empty div — the TASK_003 failure.
- The `[data-state="ready"]` attribute selector is the gating condition: it matches only when
  `state.status === "ready"`, never during `loading` or `error`. So there is no race where the
  element "already exists but is still loading" — a loading element has `data-state="loading"`
  and does not match the selector.
- `state: "attached"` requires the element matching that selector to be in the DOM. It does not
  require visibility, so the intentionally-empty ready div passes. This matches the same file's
  existing hidden-tolerant pattern at lines 43-47 (`getAttribute("data-state")` for
  `graph-artifact-read-state`).
- No stale-ready reuse: `graph-export-manifest` is clicked immediately before the wait on every
  run, and the manifest **content** is then validated against the current `run.id` and
  `run.artifacts` (`manifest.runId === run.id`, `manifest.artifacts.length ===
  run.artifacts.length`, per-artifact `digest` equality, and sensitive fields `undefined`) — the
  state marker is not treated as content validation.

### Forbidden approaches — none taken

No ready-condition deletion, no product-UI enlargement, no fixed sleeps, no timeout extension,
no exception swallowing, no skipped checks, no re-click/re-submit to mask the wait.

## Part 2 — Focused regression

New file `scripts/graph-engineering/pre-z8-u4-manifest-wait.test.mjs`. Uses
`chromium.launchPersistentContext` (the same standalone-Chromium mode as
`pre-z8-u4-history.mjs`) with a loopback `page.setContent` fixture that renders the outer
read-state div exactly as `ReadState` does. State transitions are driven by controlled
completion signals (`page.evaluate` → in-page `setTimeout`), not test-side sleeps.

| Test | Scenario | Expected | Result |
| --- | --- | --- | --- |
| ready state element with zero size passes the attached wait | empty ready div (no children) | `attached` resolves fast; childElementCount 0; data-state ready | PASS |
| loading then controlled ready transition is awaited, not pre-empted | starts loading, controlled 250ms timer flips to ready | wait blocks ≥200ms; resolves with data-state ready | PASS |
| stuck loading is never treated as ready | stays loading, no completion signal | `[data-state=ready]` never matches; attached wait times out | PASS |
| error state is never treated as ready | controlled transition to error | `[data-state=ready]` never matches; attached wait times out | PASS |

These verify actual Playwright wait behavior, not source strings. Existing missing/corrupt
artifact, byte-restoration, and manifest-content assertions are unchanged.

## Part 3 — Full native scenario

### Actual command and outcome

| Command | Result |
| --- | --- |
| `node scripts/graph-engineering/pre-z8-u4-native.mjs --scenario=complete` | **PASS** (exit 0). Run `51ce11b5-7f27-4bea-98ef-c8777150e18b`. Profile `.tmp/z1-native-1790493865713-1ff905`. |

### Full PASS coverage (verified from receipt)

Receipt: `.tmp/z1-native-1790493865713-1ff905/pre-z8-u4-summary.json` (archived, see Evidence).

- **status: PASS**, error: (none), 6 assertions pushed, `fixtureErrors: []`.
- **Primary completion**: `terminalRun.status = Completed`. `summaryProofs[3]`:
  `evidence.state = "agent-reported"`, `configuredTestCount = 0`, `sourceChanges.length = 1`,
  `human.state = "approved"`. `agent-reported` was not upgraded to `tests-passed`.
- **Missing/corrupt artifact checks + restoration**: `artifactRestorations` has 2 entries
  (missing + corrupt), both restored. Errors shown
  (`pre-z8-u4-artifact-{missing,corrupt}-visible-error.png`), bytes restored byte-for-byte
  (restoration receipts archived).
- **Manifest export + content check** (the formerly failing step): `exportedManifest` present;
  `runId === run.id` (MATCH); `artifacts.length === 3` (MATCH `run.artifacts`); per-artifact
  `digest` equality; sensitive fields (`content`, `sourcePath`, `sessionId`, `commandId`, `args`,
  `stdout`, `stderr`, `issue`) all `undefined` — redacted manifest contract preserved.
  `pre-z8-u4-artifact-restored-manifest.png` captured.
- **verifyU3LaterChat**: assertion[4] — "One real later ordinary Chat input/reply uses the
  original completed Analyze session while the entire captured Graph run, prompt, bindings and
  predecessor outputs stay byte-equivalent."
- **Second assertU4Summary**: assertion[5] — "Completed execution, agent-reported evidence with
  zero configured Tests, and exact human approval remain separate..."
- **assertU3FixturePreserved**: `fixtureErrors: []`; source preserved as `AFTER_SOURCE`.
- **4 native ledger rows** (`queue_`-prefixed, distinct sessions/source commands — the later
  Chat adds a fourth), **12 controlled-provider requests**, no live model, no fixture errors.
- **4 executed artifacts** pinned in `testedBuild`; all 4 SHA-256 MATCH the bytes on disk and
  the known-good baseline (see Build validity).

### Build validity

- Tracked working-tree changes are only `scripts/**` and `docs/**`; no package source changed
  (`git diff --name-only | grep -vE "^(scripts/|docs/)"` empty). The `.mjs` edits are not in any
  `tsconfig` project.
- 4 pinned artifacts re-hashed against the known-good baseline (cancel attempt-3 receipt) — all
  4 MATCH byte-for-byte: `cli/dist/zcode.cjs` (`8a3d061f...`), `desktop/out/main/index.js`
  (`8313a177...`), `desktop/out/host/index.js` (`c28816f7...`), `desktop/out/renderer/index.html`
  (`7ce34d944...`). The complete-run `testedBuild` SHAs also MATCH the disk bytes.
- `corepack pnpm typecheck` (tsc -b, emits) run this session did not mutate the 4 artifacts (SHAs
  UNCHANGED, no `dist-types` drift). No rebuild performed; provenance clear.

## Actual verification commands and results

| Command | Result |
| --- | --- |
| `node --test scripts/graph-engineering/pre-z8-u4-manifest-wait.test.mjs` | PASS — 4 tests |
| `node --test scripts/graph-engineering/pre-z8-u4-provider.test.mjs scripts/graph-engineering/pre-z8-u4-proof.test.mjs scripts/graph-engineering/pre-z8-u4-artifact-fault.test.mjs scripts/graph-engineering/pre-z8-u4-manifest-wait.test.mjs` | PASS — 23 tests (19 existing + 4 new) |
| `corepack pnpm exec oxfmt --write` then `--check` on changed scripts | PASS — all correct format |
| `corepack pnpm architecture:check --changed` | PASS — 0 violations / 0 baseline / 0 new |
| `corepack pnpm typecheck` | PASS (exit 0); 4 artifacts SHA UNCHANGED |
| `corepack pnpm lint` | PASS baseline — 70 warnings / 0 errors |
| `node scripts/graph-engineering/pre-z8-u4-native.mjs --scenario=complete` | **PASS** (exit 0) |

### This run vs historical evidence vs NOT RUN

- **This run (actual execution):** the manifest-wait fix, the 4 new regression tests, and the
  complete `--scenario=complete` PASS (run `51ce11b5-...`). All commands above were executed in
  this session with real results.
- **Historical evidence (preserved, not re-described as new):** cancel attempt-2 (TASK_001
  navigation) and cancel attempt-3 (TASK_002 identity proof) archives remain untouched. Complete
  attempt-1 (TASK_003 failure at the old `waitFor()`) is preserved at
  `evidence/pre-z8/u4/complete-attempt-1-manifest-visible-timeout/`.
- **NOT RUN:** live paid-model / installed-credential / company-project checks (constraints; the
  run used the controlled loopback provider). Other U4 journeys (concurrent Chat, genuine
  pass/fail, source-drift). U5/U6/Z8.

## Evidence

Archived at `docs/graph-engineering/evidence/pre-z8/u4/complete-attempt-2-manifest-wait-pass/`
(10 files + SHA-256 `manifest.json`, all re-verified 0 mismatches): receipt
`pre-z8-u4-summary.json`, `completed-agent-reported-approved` (1280/1920),
`final-gate-pending` (1280/1920), `artifact-missing-visible-error`,
`artifact-corrupt-visible-error`, `artifact-restored-manifest`, and the two artifact restoration
receipts. No whole profile/auth/config copied. Attempt-1 failure archive preserved separately.

## Remaining blockers

None for the complete/no-Tests scenario. It is a full PASS.

Remaining U4 work (separate scenarios, not blockers): concurrent Chat, genuine pass/fail, and
source-drift native journeys are still NOT RUN. U5/U6/Z8 not started. U4 not declared complete.
