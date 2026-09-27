# TASK_003 Report — U4 complete/no-Tests native scenario (attempt 1)

## Summary

The U4 **complete/no-Tests** native scenario was run for the first time
(`node scripts/graph-engineering/pre-z8-u4-native.mjs --scenario=complete`). The run
**reached `Completed` status and satisfied every primary completion assertion** (agent-reported
evidence, zero configured Tests, exactly one source change, `fixture.mjs` in the snapshot, exact
human approval bound to the request identity). It then **FAILED** inside the secondary
artifact-inspector fault check `verifyU4ArtifactErrors`, at the manifest-export visibility step.

The failure is a **harness defect**, not a product defect and not an environment issue. Per the
task's read-only-diagnosis directive, the harness fix is **not applied in this task**; it is
diagnosed and proposed below. No production source/tests were modified, no assertions were
weakened, and no staging/commit/push occurred.

Checkout: `main` @ `6f41ad53a1fef2a02af004cdfc89a5c5cf91a4dd` (unchanged).

## Actual command and outcome

| Command | Result |
| --- | --- |
| `node scripts/graph-engineering/pre-z8-u4-native.mjs --scenario=complete` | **FAIL** (exit 1). Run `28d89f46-63fd-4427-ac6b-ff10c36a4460` reached `Completed`, primary assertions passed, then failed at `pre-z8-u4-artifact-ui.mjs:50`. Profile `.tmp/z1-native-1790492736978-feb844`. |

## What passed (verified from the receipt)

Receipt: `.tmp/z1-native-1790492736978-feb844/pre-z8-u4-summary.json` (archived at
`evidence/pre-z8/u4/complete-attempt-1-manifest-visible-timeout/`, 14 files + SHA-256 manifest,
all verified).

The error stack (`at verifyU4ArtifactErrors (.../pre-z8-u4-artifact-ui.mjs:50)` called from
`pre-z8-u4-native.mjs:185`) proves the proof reached line 185, so every assertion at lines
164-184 passed:

- **Run completed**: `terminalRun.status = "Completed"`; `finalRecord` run status `Completed`,
  result present. The result text is `"... Agent-led source review only. Tests are not configured
  and were not run. Human review is still required."` — controlled-provider, not live model.
- **Evidence = agent-reported, zero Tests**: `summaryProofs[3].evidence.state = "agent-reported"`,
  `configuredTestCount = 0`, `checks = []`. This is the `assertU4Summary(..., { evidence:
  "agent-reported", human: "approved" })` call at `native.mjs:170-173`. `agent-reported` was
  **not** upgraded to `tests-passed` (per `U4_RUN_SPEC.md:7,9`).
- **Exactly one source change with `fixture.mjs`**: `summaryProofs[3].sourceChanges.length = 1`
  (assertions at `native.mjs:174-178`).
- **Exact human approval**: `summaryProofs[3].human.state = "approved"`, bound to
  `requestId = 46ddc355-...`, `requestVersion = 1`, `requestDigest = d9cb872c...`, with a
  controlled-harness decision `value = "approve"`. Not a live human; correctly bound to the exact
  saved request identity per `U4_RUN_SPEC.md:11,17`.
- **Artifact fault loop PASSED**: `artifactRestorations` has 2 entries (`missing` + `corrupt`),
  both restored. `summaryProofs[4]` and `[5]` are the `assertU4Summary` calls inside the loop
  (`artifact-ui.mjs:32-35`), both `agent-reported`/`approved`. The missing/corrupt errors were
  shown and artifacts restored byte-for-byte (restoration receipts
  `pre-z8-u4-artifact-<digest>-{missing,corrupt}.json` archived).
- **3 distinct native ledger rows** (`queue_`-prefixed, distinct sessions/source commands), **11
  controlled-provider requests**, no fixture errors.
- **4 executed artifacts** pinned in `testedBuild`; all 4 match the known-good baseline
  byte-for-byte (see build validity below).

Screenshots `pre-z8-u4-completed-agent-reported-approved-1280/1920.png` and
`pre-z8-u4-artifact-{missing,corrupt}-visible-error.png` were captured, confirming the run
visibly reached completion and the artifact fault checks.

## What failed — root cause (read-only diagnosis)

**Failing assertion:** `pre-z8-u4-artifact-ui.mjs:50`
```js
await window.getByTestId("graph-export-manifest").click();
await window.locator('[data-testid="graph-manifest-read-state"][data-state="ready"]').waitFor();
```
Playwright error: `locator.waitFor: Timeout 30000ms exceeded` — the locator resolved 61 times to
a **hidden** `<div role="status" data-state="ready" data-testid="graph-manifest-read-state">`.
`data-state="ready"` **is** set (the manifest read completed), but the element is hidden.

**Root cause — harness defect:**

The `ReadState` component (`packages/ui/src/graph-engineering/GraphArtifactInspector.tsx:118-136`)
renders the outer `<div data-testid="${testId}-read-state" data-state={state.status}>` always, but
only renders children for `loading` (`<p>reading</p>`) and `error` (the error block). For
`state.status === "ready"` it renders **no children** — an empty `<div className="text-ui-sm">`
with zero size. Playwright's `waitFor()` defaults to `state: "visible"`, which requires a
non-empty bounding box, so an intentionally-empty ready-state div is never "visible" → 30s
timeout.

This is **inconsistent with the same file's own pattern**: the artifact fault loop checks the
artifact read-state via `getAttribute("data-state")` (hidden-tolerant) at `artifact-ui.mjs:43-47`:
```js
assert.equal(
  await window.getByTestId("graph-artifact-read-state").getAttribute("data-state"),
  "ready",
);
```
The manifest check at line 50 should use the same hidden-tolerant approach, but uses
`waitFor()` (visibility-required) instead.

## Classification

- **Product defect?** No. `ReadState` correctly sets `data-state="ready"` and renders an empty
  status div when the read is complete (nothing to show when ready). This is correct, intended
  UI behavior. No UI/service test references `graph-manifest-read-state` visibility.
- **Harness defect?** **Yes.** `pre-z8-u4-artifact-ui.mjs:50` assumes the ready-state div becomes
  visible, but the product renders it empty (zero-size) when ready. The fix is to check
  `data-state === "ready"` via `getAttribute` (or `waitFor({ state: "attached" })` then
  `getAttribute`), matching the loop at lines 43-47. This **corrects a bug**; it does not weaken
  the assertion (the semantic check — "manifest read reached ready state" — is preserved).
- **Environment issue?** No. Artifacts valid (4/4 SHA match), controlled provider worked (11
  requests, 3 native inputs, no fixture errors), run reached `Completed`. The 30s timeout is a
  visibility-semantics mismatch, not an environment failure.

**Proposed fix (NOT applied in this task — reported per read-only-diagnosis directive):**
replace line 50's `waitFor()` with an attached-then-getAttribute check, e.g.
```js
const manifestState = window.getByTestId("graph-manifest-read-state");
await manifestState.waitFor({ state: "attached" });
assert.equal(await manifestState.getAttribute("data-state"), "ready");
```
This is a one-line harness change in a `.mjs` script (not production code, not an architectural
change). Applying it and rerunning is left for explicit authorization.

## Build validity

- Tracked working-tree changes are only `scripts/**` and `docs/**`; no package source changed
  (`git diff --name-only | grep -vE "^(scripts/|docs/)"` empty). The `.mjs`/`.md` edits are not
  in any `tsconfig` project.
- The 4 artifacts the driver pinned in `testedBuild` were re-hashed against the known-good
  baseline (the cancel attempt-3 receipt) — all 4 **MATCH** byte-for-byte:
  `cli/dist/zcode.cjs` (`8a3d061f...`), `desktop/out/main/index.js` (`8313a177...`),
  `desktop/out/host/index.js` (`c28816f7...`), `desktop/out/renderer/index.html`
  (`7ce34d944...`).
- `corepack pnpm typecheck` (tsc -b, emits) run this session did not mutate the 4 artifacts (SHAs
  unchanged, no `dist-types` drift). No rebuild performed; provenance clear.

## Evidence

Archived at `docs/graph-engineering/evidence/pre-z8/u4/complete-attempt-1-manifest-visible-timeout/`
(14 files + SHA-256 `manifest.json`, all re-verified 0 mismatches): receipt
`pre-z8-u4-summary.json`, `completed-agent-reported-approved` (1280/1920),
`final-gate-pending` (1280/1920), `artifact-missing-visible-error`,
`artifact-corrupt-visible-error`, `failure`, `native-edit-permission`, `native-question`,
`guided-controls` (1280/1920), and the two artifact restoration receipts. No whole profile,
auth/config stores, or unrelated data copied. Earlier cancel attempt-2/attempt-3 archives are
untouched.

## Remaining blocker

The complete/no-Tests scenario cannot reach a full PASS until the harness defect at
`pre-z8-u4-artifact-ui.mjs:50` is corrected (manifest-export ready-state visibility →
hidden-tolerant `data-state` check). The primary completion acceptance is already verified; the
blocker is the secondary artifact-inspector manifest-export check, which runs **after** the
completion assertions and the missing/corrupt fault loop (both of which passed).

## Checks NOT RUN

- Applying the harness fix and rerunning: NOT RUN (read-only-diagnosis directive; reported, not
  fixed in this task).
- `verifyU3LaterChat` (`native.mjs:186`), the second `assertU4Summary` (187-190), and
  `assertU3FixturePreserved` (191): NOT reached (failure at 185). These are downstream of the
  blocker and will run once the blocker is cleared.
- Live paid-model / installed-credential / company-project checks: NOT RUN (constraints; the run
  used the controlled loopback provider only).
- Other U4 journeys (concurrent Chat, genuine pass/fail, source-drift): NOT RUN.
- U5/U6/Z8: NOT STARTED. U4 is NOT declared complete.
