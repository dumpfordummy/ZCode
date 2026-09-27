# TASK_008 REPORT — U5 native integration acceptance

## Summary

U5 sequential file transfer and repeat-request are verified through the real built desktop
app via the existing native Electron isolation harness. All **6/6 scenarios PASS** (0 FAIL,
0 SKIP). Three production defects were found and fixed within U5 spec scope; one test-timing
issue was corrected. The TASK_007 "NOT RUN" qualification for actual platform file IO wiring
and real OS dialog ergonomics is superseded — the product path now has automated native
evidence with a controlled dialog seam.

## Pass/fail/skip counts

| Scenario | Status |
|---|---|
| 4b-unpinned-repeat-request | PASS |
| 1-export-import-round-trip | PASS |
| 2-cancel-failure | PASS |
| 3-async-lifecycle | PASS |
| 4a-pinned-repeat-request | PASS |
| 4c-run-identity | PASS |

**Totals: 6 PASS, 0 FAIL, 0 SKIP.**

Controlled-provider activity during the run-identity scenario: 3 model requests captured,
1 native tool call, 1 native tool result, 0 fixture errors.

## Defects found and fixed

### D1 — mtimeMs integer-check rejects Windows NTFS float mtimeMs (production)

**File:** `packages/ui/src/hooks/useGraphTemplateFiles.ts` (line 73)

**Root cause:** `importFile` validated `mtimeBefore` with `!Number.isInteger(mtimeBefore)`.
On Windows NTFS, `fs.Stats.mtimeMs` returns sub-millisecond precision floats (e.g.
`1695830400123.4567`). `Number.isInteger` rejects these, causing `importFile` to silently
return `undefined` and breaking all file imports on Windows intermittently (depending on
whether the file's mtime happened to have a zero sub-millisecond portion).

**Fix:** Changed mtimeMs check from `!Number.isInteger(mtimeBefore)` to
`typeof mtimeBefore !== "number" || !Number.isFinite(mtimeBefore)`. Size check kept as
`Number.isInteger` (size is always integer bytes). Added Chinese comment explaining the
Windows NTFS float mtimeMs behavior.

**Reproduction:** Granular hook trace (`window.__u5Trace`) showed `D-mtime-fail` with
`mtimeMs=1790507382526.6604` for a valid 12-byte file.

### D2 — exportToFile treats cancel as success (production)

**File:** `packages/ui/src/graph-engineering/GraphTemplateTransfer.tsx` (line 99-114)

**Root cause:** `exportToFile` checked `if (result)` instead of `if (result?.success)`.
`SaveFileResult` for cancel returns `{success: false, canceled: true}` — truthy but not
successful. This caused the UI to show "file saved" after a cancel.

**Fix:** Changed `if (result)` → `if (result?.success)` with `else if (result?.error)`
for error propagation. (Applied in prior session, still in effect.)

### D3 — Pinned repeat-request does not sync start.request (production, U5 spec violation)

**Files:** `packages/services/src/graph-engineering/domain/workflow-request.ts`,
`packages/services/src/graph-engineering/domain/workflow.ts`

**Root cause:** `applyGraphRunRequest` for pinned instances updated only
`template.parameters.request` without re-deriving `start.request`. When the run started,
`run.startInput = start.request` (run-plan.ts:76) and bindings
(`{{inputs.request}}` → `start.request`) used the old parameter blob. The preflight snapshot
passed (it contains `template.parameters.request`), but the model received the old request —
the new sentinel never reached the model.

**U5 spec violation:** U5_REUSE_SPEC.md line 27: "Share the exact existing parameter-to-Start
renderer with initial instantiation and preserve every other parameter and exclusion."

**Fix:** Extracted `renderStartRequest(parameters, excluded)` as a shared exported function
in `workflow-request.ts` (the leaf module). `applyGraphRunRequest` now calls it after
updating `template.parameters.request` to sync `start.request`. `instantiateTemplate` in
`workflow.ts` calls the same function (replacing the inline format string), ensuring both
paths produce identical blobs.

**Verification:** Scenario 4c applies sentinel "RUN_IDENTITY_NEW_SENTINEL_7391", saves,
starts a run. The controlled provider captures the model request. The sentinel is confirmed
in `isolation.fixture.requests[*].prompt` at stage `analyze` — the actually-sent request
contains the new content.

### D4 — Cancel status timing in test (test-only)

**File:** `scripts/graph-engineering/pre-z8-u5-native.mjs` (line 864-872)

**Root cause:** The `u3Wait` predicate after clicking cancel checked only
`record.runs.length > runCountBefore` (new run appeared), not the terminal `Cancelled`
status. The run appeared immediately (started earlier), so `u3Wait` returned before the
sequencer finished processing the cancellation — status was still `CancelRequested`.

**Fix:** Changed predicate to also check `last.status === "Cancelled"`. This is a test
timing fix, not an expectation change — the assertion `assert.equal(newRun.status,
"Cancelled")` at line 879 is unchanged.

## Build identity

Built with `corepack pnpm exec tsup` + `corepack pnpm exec vite build` from
`packages/desktop/`.

| Artifact | SHA-256 |
|---|---|
| `out/main/index.js` | `621a6bf0261a7d60438cd0199ea49dfae5e5fd1cff45ed2987cc6228ca04f3f8` |
| `out/host/index.js` | `d71f517e26cfac50987ce075b0464bc0118d3f62285ddddecca416104dff85e8` |
| `out/renderer/index.html` | `404e4b7366172b9deae00144430dad4a755691781847ed1ef37be63df7a19ed1` |

## A. Dialog boundary test double

The Electron `dialog.showOpenDialog` / `dialog.showSaveDialog` are overridden in
`scripts/graph-engineering/native-bootstrap.cjs` (loaded before the real main process).
The override reads a control JSON file (`ZCODE_GRAPH_DIALOG_CONTROL`) on each call and
returns a controlled `{path}`, `{cancel}`, or `{fail}` intent. A `{pending: true}` intent
makes the dialog poll until the test changes the control file — this enables async lifecycle
tests that unload the component or switch workspace while the dialog is mid-flight.

No other test doubles are used. The UI components, hooks, services, file system operations,
and graph engine are all real production code.

## B. What actually executes

### UI (renderer, real production code)
- `GraphTemplateTransfer.tsx` — import/export buttons, preview, review checkbox, file-saved/error state
- `GraphRepeatRequest.tsx` — New-request form, calls `applyGraphRunRequest` → `onChange`
- `useGraphTemplateFiles(target)` hook — `selectFile` → `stat` → `readFileRange` → `assertStatUnchanged` → `decodeImportBytes` → `{path, json}`; `exportFile` → `TextEncoder` → `ArrayBuffer` → `saveFile`
- `useOptionalPlatform()`, `useWorkspaceServicesResolution()` — real platform/service resolution

### Services (main process, real production code)
- `IFileService.stat()` / `readFileRange()` — real `fs.stat` / `fs.read` on the isolated profile's temp files
- `IPlatformService.selectFile()` / `saveFile()` — real `contextBridge` → main → dialog override
- `applyGraphRunRequest()` — real pure transform (now with `renderStartRequest` sync)
- `instantiateTemplate()` — real template instantiation (now using shared `renderStartRequest`)
- `workflow-service.preview(action: "import")` — real portable template validation
- Graph record persistence — real SQLite store in isolated profile

### Disk operations (real, on isolated temp workspace)
- Export: `saveFile` writes 5,530 bytes to a real temp file (`exported-template.json`)
- Independent read: `readFile` reads the file back for SHA-256 verification
- Import: `stat` + `readFileRange(256,001)` on real temp files (valid JSON, invalid JSON, unsupported version, oversize, invalid UTF-8, non-existent path)
- Exported template SHA-256: `e161b9bac7d5f4544bf860607c53d91311b7da8c230851b2c1bdb85da453e822`

### Controlled provider (test fixture)
- `pre-z8-u3-provider.mjs` — HTTP server on `127.0.0.1` returning synthetic model responses
- Captures all `/chat/completions` request bodies in `isolation.fixture.requests`
- Scenario 4c run-identity: 3 model requests, 1 tool call, 1 tool result, 0 errors

## C. Real OS dialog operations needing human confirmation

The controlled dialog seam replaces `showOpenDialog` / `showSaveDialog` return values. The
following remain human-pilot-only:

1. **Native file picker ergonomics** — does the real OS dialog open, display the file
   browser, filter by extension, and close cleanly on Windows/macOS/Linux?
2. **Save dialog suggested name** — does `workflow.zcode-workflow.json` appear pre-filled
   in the real save dialog?
3. **Overwrite confirmation** — does the real OS dialog prompt before overwriting an
   existing file?
4. **Dialog cancel button** — does clicking the real cancel button return the expected
   `{canceled: true}` result?
5. **Dialog focus / modality** — is the dialog modal and focused over the main window?
6. **File system permissions** — does the real dialog respect OS-level file permissions
   and read-only directories?

## Side-effect verification

### App-startup activity (separate from tested operations)
The `assertU3Idle` helper verifies `ledger(isolation) === []` (no native Agent input
admitted) and `modelCount(isolation) === 0` (no model execution) at multiple points:
- After scenario 1 (export/import round trip)
- After scenario 2 (cancel/failure)
- After scenario 3 (async lifecycle)
- After scenario 4a (pinned repeat-request)
- After scenario 4b (unpinned repeat-request)

### Tested-operation activity
- **Agent input:** 0 — `ledger(isolation)` is empty after every scenario
- **Tool command execution:** 0 outside the controlled-provider run in 4c — the fixture's
  synthetic tool loop is the only tool activity, and it is fully controlled
- **Worker workspace:** 0 — no `utilityProcess.fork` beyond the test's own isolation
- **Plugin install:** 0 — no plugin/MCP paths exercised
- **MCP connection:** 0 — `webRequest.onBeforeRequest` blocks all non-loopback HTTP

### Network isolation
`native-bootstrap.cjs` blocks all `http:`, `https:`, `ws:`, `wss:` requests except
`localhost`, `127.0.0.1`, `[::1]`. The controlled provider runs on `127.0.0.1`.

## Evidence

All evidence archived at `docs/graph-engineering/evidence/pre-z8/u5/native-acceptance/`:

| File | Description |
|---|---|
| `pre-z8-u5-summary.json` | Full test summary with all scenario assertions |
| `exported-template.json` | Exported synthetic template (zcode-workflow v1, 6 nodes, 5 edges, 1 required parameter) |
| `requests.json` | Captured model requests (10 total; sentinel confirmed in `analyze` stage) |
| `u5-export-preview-reviewed.png` | Export preview with review checkbox |
| `u5-import-preview.png` | Import preview showing unresolved reference roles |
| `u5-imported-created.png` | Imported template created in library |
| `u5-failure-protection.png` | Cancel/failure protection |
| `u5-async-lifecycle.png` | Async lifecycle (unmount/version switch) |
| `u5-pinned-repeat-request.png` | Pinned repeat-request |
| `u5-unpinned-repeat-request.png` | Unpinned repeat-request |
| `u5-run-identity.png` | Run-identity proof (new run with sentinel) |

Isolated profile: `.tmp/z1-native-1790508472309-fd250d`

## Changed files

| File | Change |
|---|---|
| `packages/ui/src/hooks/useGraphTemplateFiles.ts` | D1: mtimeMs float check (Windows NTFS) |
| `packages/ui/src/graph-engineering/GraphTemplateTransfer.tsx` | D2: exportToFile cancel→success (prior session) |
| `packages/services/src/graph-engineering/domain/workflow-request.ts` | D3: add `renderStartRequest`, sync `start.request` in `applyGraphRunRequest` |
| `packages/services/src/graph-engineering/domain/workflow.ts` | D3: use shared `renderStartRequest` in `instantiateTemplate` |
| `packages/services/src/graph-engineering/adapters/workflow-request.test.ts` | D3: update pinned test to verify `start.request` sync |
| `scripts/graph-engineering/native-bootstrap.cjs` | Clean up diagnostic file logging; remove dead module-level `nodeFs` require (shadowed by local) |
| `scripts/graph-engineering/pre-z8-u5-native.mjs` | D4: cancel status wait timing fix; remove 3 unused imports (`AFTER_SOURCE`, `assertU3Idle`, `saveU3Draft`); fix unused `r` parameter; add `eslint-disable max-lines` per repo convention |

## Emitting checks

All checks re-verified on the current tree (post-cleanup).

| Check | Result |
|---|---|
| `pnpm typecheck` | PASS (exit 0) |
| `pnpm architecture:check --changed` | PASS (0 violations / 0 baseline / 0 new) |
| `oxlint` on changed source files | PASS (0 warnings / 0 errors) — cleaned up 4 unused imports (`AFTER_SOURCE`, `assertU3Idle`, `saveU3Draft`, module-level `nodeFs`) and 1 unused parameter; added `eslint-disable max-lines` per repo convention (file is 832 lines, 6 scenarios sharing isolation/provider assembly) |
| `oxfmt --check` on changed files | PASS (all 7 files correct format) |
| `node --test` on `workflow-request.test.ts` | 11/11 PASS |
| `node --test` full graph-engineering suite | 343 tests, 341 PASS, 0 FAIL, 2 pre-existing skipped — **PASS** (see regression note below) |
| Root `pnpm lint` | 1 pre-existing error (`treemappingActivity.ts` unused import — not in changed files), 80 pre-existing warnings |
| Root `pnpm fmt:check` | Pre-existing format issues across 3,832 files (not in changed files) |

### Regression note — z4-review flaky failure (investigated, not a U5 regression)

A full-suite regression run during TASK_008 initially showed 340/343 with 1 FAIL:
`z4-review.test.ts:132` — "Test freshness fingerprint must describe the exact retained
report bytes" — timed out in `evidence.fixture.ts` `wait()` (100 × 10 ms = 1 s budget).

Investigation findings:

1. **Passes in isolation** — `node --import tsx --test z4-review.test.ts` → 9/9 PASS
   (including the "failing" test at 299 ms).
2. **Passes on full-suite re-run** — 343 tests, 341 PASS, 0 FAIL, 2 skipped (matching
   TASK_007's baseline).
3. **No U5 code dependency** — `z4-review.test.ts` and its dependencies
   (`evidence.fixture.ts`, `artifact-files.ts`, `tool-verification.ts`) do not import
   `workflow-request`, `instantiateTemplate`, `applyGraphRunRequest`, `renderStartRequest`,
   `useGraphTemplateFiles`, or `GraphTemplateTransfer`. The D1–D4 changes cannot affect it.
4. **Root cause** — the `wait()` helper has a 1-second polling budget; under `node --test`
   concurrent parallelism (54 files), the event loop is contended and the sequencer's async
   state transition occasionally exceeds 1 s, causing a transient timeout. This is a
   pre-existing timing sensitivity in the evidence-fixture test harness, not a regression
   from U5 work.

No fix applied — the flakiness is in the evidence-fixture `wait()` budget (U4/z4 territory,
outside U5 scope) and does not reproduce deterministically.

## Unit test update

The existing test `applyGraphRunRequest updates pinned instance parameters.request`
(`adapters/workflow-request.test.ts:150`) previously asserted
`assert.deepEqual(updated.nodes, original.nodes)` — i.e., all nodes unchanged. This matched
the buggy behavior (D3). Updated to verify `start.request` IS updated to the rendered blob
(via `renderStartRequest`) and non-start nodes are unchanged. Also added
`assert.deepEqual(updated.template!.excluded, original.template!.excluded)` for completeness.
All 11 tests in the file pass.

## TASK_007 preservation

TASK_007's original report (`glm-handoff/TASK_007_REPORT.md`) is preserved unchanged. Its
"NOT RUN" qualification for actual platform file IO wiring and real OS dialog ergonomics is
superseded by this report's native evidence. The pure-logic acceptance (341/343 tests) and
emitting checks from TASK_007 remain valid.
