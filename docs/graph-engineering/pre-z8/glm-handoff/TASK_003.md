# TASK_003 — Run the U4 complete/no-Tests native scenario

## Scope and authorization

Run the next unfinished U4 native journey — the **complete/no-Tests** scenario — after
the TASK_002 review defects D1–D3 were closed (see `TASK_002_CLOSEOUT.md`). This is a
verification-only native run. It does not modify production source/tests, does not weaken
assertions, does not access installed credentials, does not call live paid models, and does
not operate company projects. No staging, commit, push, or publication. U5/U6/Z8 are not
started and U4 is not declared complete.

The execution plan records `complete/no-Tests` as NOT RUN (only `--scenario=cancel` has
passed, via TASK_002). The cancel scenario is not re-described here.

## Entry point and command (confirmed from source)

- Driver: `scripts/graph-engineering/pre-z8-u4-native.mjs`.
- Arg parse: `process.argv.find((v) => v.startsWith("--scenario="))?.split("=")[1] ?? "cancel"` (`:39-40`).
- Guard: `assert.ok(["cancel", "complete"].includes(scenario))` (`:41`).
- Fixture factory: `scenario === "cancel" ? startU4Fixture : startU3Fixture` (`:48`) — complete uses the U3-shaped controlled loopback provider.
- Guard against installed executable override: `assert.equal(process.env.Z1_PACKAGED_EXE, undefined, ...)` (`:42-46`).
- **Command:** `node scripts/graph-engineering/pre-z8-u4-native.mjs --scenario=complete`

## Expected behavior (from `pre-z8-u4-native.mjs:164-195` and `U4_RUN_SPEC.md`)

The complete branch runs the U3-shaped Graph flow to completion with no cancellation and no
independent companion:

1. `assertU3CapturedPrompts` — capture the Graph's real native prompts (Read/question/Edit).
2. `openU4Gate` — open the existing approval gate.
3. `captureU4Summary` `pre-z8-u4-final-gate-pending` — record the gate-pending state.
4. `finishU3Graph` — release the held controlled-provider reply and complete the run
   (`held: scenario === "cancel"` is **false** for complete, so the provider releases normally
   and the run reaches `Completed`, not `Cancelled`).
5. `assertU4Summary` with `evidence: "agent-reported"`, `human: "approved"` → `projection`.
6. Assert `projection.evidence.configuredTestCount === 0` (no-Tests).
7. Assert `projection.sourceChanges.length === 1`.
8. Assert `fixture.mjs` is present in the source-change snapshot.
9. `captureU4Summary` `pre-z8-u4-completed-agent-reported-approved`.
10. `verifyU4ArtifactErrors` — temporarily rename/corrupt one owned artifact, assert the UI
    shows the read error and stale content is absent, then restore exact original bytes and
    timestamps in `finally` and read the restored artifact + export manifest through the UI.
11. `verifyU3LaterChat` — a later ordinary Chat cannot replace the captured request/result/source snapshots.
12. `assertU4Summary` again (`agent-reported`, `approved`).
13. `assertU3FixturePreserved(originalTest, AFTER_SOURCE)` — source bytes preserved.
14. Push the completion assertion string.
15. `assert.deepEqual(isolation.fixture.errors, [])` — no fixture errors.

## Forbidden behavior

- No cancellation path (this is the complete branch; the held-provider release must let the
  run finish, not abort).
- No test-pass summary inferred from agent prose or human approval. Evidence is
  `agent-reported` (the run completed) with **zero configured Tests** — `agent-reported` must
  not be upgraded to `tests-passed` (`U4_RUN_SPEC.md:7,9`).
- No live paid-model request; only the controlled loopback provider (`startU3Fixture`).
- No installed-credential access, no company-project operation.
- No replay, recovery admission, second Host, or Graph-record mutation by the later Chat.
- No source drift: fixture bytes must remain `AFTER_SOURCE`.

## Acceptance assertions (the scenario must reach all of these)

- Run status `Completed`; `assertU4Summary` evidence=`agent-reported`, human=`approved` (twice).
- `projection.evidence.configuredTestCount === 0`.
- `projection.sourceChanges.length === 1`, with `fixture.mjs` in the snapshot.
- Artifact fault checks pass: missing/corrupt artifact restored byte-for-byte, read error
  visible, stale content absent, restoration receipt written, restored artifact readable via UI.
- Later ordinary Chat leaves the completed Graph record and captured snapshots unchanged.
- `isolation.fixture.errors` empty.
- Source preserved as `AFTER_SOURCE`.
- The pushed assertion: "Completed execution, agent-reported evidence with zero configured
  Tests, and exact human approval remain separate..."

## Build and artifact validity (confirmed before run)

- Tracked working-tree changes are **only** `scripts/**` and `docs/**` (no package source);
  `git diff --name-only | grep -vE "^(scripts/|docs/)"` is empty. The proof/test/spec edits
  are `.mjs`/`.md`, not in any `tsconfig` project, so they never enter the build.
- The 4 artifacts the driver pins in `testedBuild` were re-hashed against the known-good
  baseline (the cancel attempt-3 receipt) — all 4 **MATCH** byte-for-byte:
  `cli/dist/zcode.cjs`, `desktop/out/main/index.js`, `desktop/out/host/index.js`,
  `desktop/out/renderer/index.html`.
- `corepack pnpm typecheck` (tsc -b, emits) was run this session and did **not** mutate the 4
  artifacts (SHAs unchanged, no `dist-types` drift). A rebuild from unchanged source would be
  byte-identical, so no rebuild is performed; provenance is clear per the TASK_002 review.

## Constraints

- Preserve all existing modifications and historical evidence; do not overwrite the cancel
  attempt-2/attempt-3 archives.
- On failure, preserve the receipt/screenshots and distinguish product defect, harness
  defect, and environment issue. Read-only diagnosis first; do not modify expected results or
  weaken assertions to obtain a pass.
- Do not start another production fix or architectural change in this task.
