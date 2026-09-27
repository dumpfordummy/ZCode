# TASK_007 — Report

## Outcome

**U5 is COMPLETE (automated checkpoint).** Sequential workflow file transfer, repeat-run reuse,
and the experimental parallel boundary are implemented per `U5_REUSE_SPEC.md`, with the TASK_006
test/report closeout items (Part 1) resolved. Pure-logic acceptance is covered by `node:test`
(341/343 graph-engineering tests PASS, 0 FAIL, 2 pre-existing skipped); the React hook lifecycle,
actual platform file IO, and real OS dialog ergonomics are NOT RUN at the unit level (no UI test
runner exists in `packages/ui` and the dependency ban forbids adding one). This is ≠
human/paid-model/company-project/release acceptance; U6 and Z8 are not started.

Checkout: `main` @ `6f41ad53a1fef2a02af004cdfc89a5c5cf91a4dd` (unchanged). No reset/stage/commit/push.

---

## Part 1 — TASK_006 closeout (limited, NOT full U4 re-review)

| Item | Status | Evidence |
|------|--------|----------|
| 1.1 `verifyU2Test` redaction proof | **DONE** | Predetermined-expectation helper `assertArtifactRedaction(rawPreview, receipt, expected)` replaces the branch-on-product-output hole; `expected` decided by known fixture content. New `pre-z8-u2-proof.test.mjs` proves accept (clean/sensitive) + reject (over-redaction, under-redaction/security-hole, inconsistent, non-drifting/clean digest-drift). Genuine U2 pass/fail reran PASS. Evidence `evidence/pre-z8/u2/pass-attempt-5-stricter-redaction-proof/`, `fail-attempt-3-stricter-redaction-proof/`. No production redaction rule changed. |
| 1.2 dotnet-fixture 7/8 state | **PRESERVED** | net6.0 sub-case `NU1100` (minimal SDK 8.0.425 lacks 6.0.x ref packs; fixture `NuGet.Config` is `<clear/>`). 7 net8.0 sub-cases pass. NOT a regression; no skip/delete/relabel/framework/rollForward change. U6 closure needs 6.0.x ref packs or fuller SDK — dependency-prep not authorized here. |
| 1.3 Toolchain/execution record | **CORRECTED** | Version availability CONFIRMED (`dotnet --version === 8.0.425`) recorded separately from release checksum NOT VERIFIED (zip not retained; no `.sha512`/`.sha` at canonical CDN paths; installer does version-output only). "Serial" emitting-checks label in TASK_006_REPORT was inaccurate (parallel tool calls) — TASK_007 runs them serially. Historical install point vs current checkout vs current exception distinguished. |

---

## Part 2 — U5 implementation (spec-first)

State owners (existing, unchanged): workflow library owns immutable portable versions; draft store
owns unsubmitted editor/transfer state; platform/file services own file selection/read/save. No new
agent/runtime/schema/credential-store/execution-engine.

### A. File export

`captureTemplate` (services `domain/workflow.ts`) — **capture gap fixed**: before deleting
`graph.template`, the selected reference roles are mapped to required rebinding roles with `nodeIds`
filtered to remaining task nodes (roles with no remaining nodeIds dropped). Baseline probe showed
`exportedRoles: []` despite non-empty `capturedRoles`; now both roles export as `required: true`.
Envelope is always `zcode-workflow` v1; Start cleared, revision=0, task configs reset to inherit,
tool `recipeId` reset to node id. Omit run records/conversations/approvals/credentials/workspace
source (scanner discloses task prose may contain secrets; not a guarantee).

`useGraphTemplateFiles(target).exportFile(json, isCurrent)` — encodes reviewed JSON to fresh UTF-8
`ArrayBuffer`, calls `IPlatformService.saveFile` with suggestedName
`workflow.zcode-workflow.json`, returns `SaveFileResult` or `undefined` (cancel/stale). Reuses
existing export validation/preview/confirmation; not copy-JSON.

### B. File import

`useGraphTemplateFiles(target).importFile(isCurrent)` — `selectFile` → `stat` (type/finite-integer
size/mtime; over-256,000-byte size rejected pre-read) → bounded `readFileRange` (256,001 bytes) →
second `stat` → `assertStatUnchanged` → `decodeImportBytes` (fatal UTF-8 + byte limit + blank) →
returns `{path, json}` or `undefined` (cancel/stale). `workflow.preview(action: "import")`
validates schema/version; `acceptPreview` rebinds to destination workspace. Cancel/malformed/
unsupported-version/save-failure preserve current unsaved design. Zero native dispatch.

### C. Repeat request

`applyGraphRunRequest(definition, request)` — pure transform in leaf module
`domain/workflow-request.ts` (imports only `contract.ts`; avoids the `workflow.ts` ↔
`workflow-contract.ts` back-edge cycle). Nonblank ≤12,000-char request, exactly one Start. Pinned
instance: update only existing string `parameters.request`; missing/non-string → throws "use the
Advanced path". Unpinned: update Start text. `structuredClone` — no revision/pin/local-binding
mutation, no execution, no old-run-state copy. `GraphRepeatRequest.tsx` renders the shared
Textarea + Apply; Advanced-only message when unsupported.

### D. Experimental parallel boundary

No changes to Fork/Join/history. Sequential export is not parallel-plan backup. No parallel
portability/auto-merge/new scheduler. (No parallel source modified this task.)

### Architecture decisions this task

- **Leaf-module pattern for exported domain functions**: `applyGraphRunRequest` lives in
  `domain/workflow-request.ts`, `decodeImportBytes`/`assertStatUnchanged` in
  `domain/workflow-transfer.ts` — both import only from `contract.ts` (or nothing), avoiding the
  `workflow.ts` type-back-edge into `workflow-contract.ts`. Same pattern as `editor-context.ts`.
- **Transfer boundary extraction**: the hook's pure import-boundary checks (byte limit, fatal
  UTF-8, blank, double-stat tamper) were extracted to `domain/workflow-transfer.ts` so they are
  coverable by `node:test` without a UI test runner. The defensive stat-shape classifier
  (non-file/non-finite → silent skip for old remote servers) stays inline in the hook.
- **`GraphDesignSections.tsx` wrapper**: keeps `GraphEditor.tsx` at its 398-line baseline under the
  400-line `max-lines` lint rule while adding `GraphRepeatRequest` + `GraphRoutingEditor` to the v5
  design view.

---

## Part 3 — Acceptance (layer distinction)

| Layer | What | Result | Evidence |
|-------|------|--------|----------|
| Pure logic (test-double, `node:test`, no deps) | `applyGraphRunRequest` 8 cases; `captureTemplate` capture gap 3 cases; `decodeImportBytes` 6 cases; `assertStatUnchanged` 5 cases; bounds 1 case | **PASS 23/23** | `adapters/workflow-request.test.ts`, `adapters/workflow-transfer.test.ts` |
| Existing services rejection (`node:test`) | `previewTemplate` char-length (256,000) + envelope/schema/version rejection; `captureTemplate`/`instantiateTemplate` | **PASS (no regression)** | Full graph-engineering suite 341/343 PASS, 0 FAIL, 2 pre-existing skipped |
| Actual platform file IO wiring | `selectFile`/`saveFile`/`stat`/`readFileRange` calls; hook React lifecycle (scope/generation guard, StrictMode cleanup, single-flight); stat-shape classifier | **NOT RUN (unit)** | `packages/ui` has no test runner (only `lint`/`lint:fix`); adding vitest/jest/@testing-library/jsdom needs new devDependencies — forbidden by 不新增依赖 |
| Real OS dialog ergonomics | native `selectFile`/`saveFile` dialog UX | **NOT RUN (human pilot)** | Per `U5_REUSE_SPEC`: "actual OS dialog ergonomics remain a human pilot check" |

### Acceptance criteria mapping

| Criterion (Part 3) | Status | How |
|--------------------|--------|-----|
| Round-trip | Pure transforms PASS; file-IO round-trip NOT RUN (human pilot) | export `captureTemplate`→reviewed JSON→`saveFile`; import `selectFile`→bounded read→`decodeImportBytes`→`preview(import)`→`acceptPreview` |
| Rejections (cancel/invalid/unknown-version/save-failure) | Pure rejection PASS; dialog cancel/save-failure NOT RUN | byte-limit/UTF-8/blank/tamper throw; `previewTemplate` rejects oversized/invalid envelope; cancel → `undefined` (code path only) |
| Zero native dispatch (import/export/preview/repeat-prep) | **PASS (code inspection)** | Hook calls only platform file ops + pure transforms; `GraphTemplateTransfer` calls `workflow.preview` + `acceptPreview`; `GraphRepeatRequest` calls `applyGraphRunRequest`→`onChange`. No model/command/plugin/MCP/worker path |
| No old approval/PASS/run-identity inheritance | **PASS** | `captureTemplate` deletes `graph.template` (revision=0, Start cleared); `applyGraphRunRequest` clones, no revision/pin/binding mutation. Tested |
| Guided/Advanced integrity | **PASS** | Pinned non-string/missing request → throws "use the Advanced path"; `GraphRepeatRequest` shows Advanced-only message. Tested |
| Parallel boundary unchanged by sequential ops | **PASS (no change)** | No parallel source modified; sequential export does not touch Fork/Join/history |

### Emitting checks (serial, this execution)

| Check | Command | Result |
|-------|---------|--------|
| Typecheck | `corepack pnpm typecheck` | exit 0 — **PASS** |
| Architecture | `corepack pnpm architecture:check --changed` | 0 violations, 0 baseline, 0 new — **PASS** |
| Lint | `corepack pnpm lint` | 75 pre-existing warnings, **0 errors** — PASS |
| Format | `oxfmt --check` on 8 changed files | All matched files correct format — **PASS** |
| Graph-engineering tests | `node --import tsx --test` (full suite) | 343 tests, 341 PASS, 0 FAIL, 2 pre-existing skipped — **PASS** |

---

## Part 4 — Delivery

### Changed files (U5, this task)

| File | Change |
|------|--------|
| `packages/services/src/graph-engineering/domain/workflow-request.ts` | **NEW** — leaf module: `applyGraphRunRequest` pure transform |
| `packages/services/src/graph-engineering/domain/workflow-transfer.ts` | **NEW** — leaf module: `decodeImportBytes`, `assertStatUnchanged`, `TRANSFER_BYTE_LIMIT`, `IMPORT_READ_BOUND` |
| `packages/services/src/graph-engineering/domain/workflow.ts` | `captureTemplate` capture-gap fix (export selected reference roles as required rebinding roles); `applyGraphRunRequest` removed to leaf module |
| `packages/services/src/graph-engineering/workflow-contract.ts` | Re-export `applyGraphRunRequest` + transfer functions/type from leaf modules |
| `packages/services/src/graph-engineering/adapters/workflow-request.test.ts` | **NEW** — 11 tests (capture gap 3 + applyGraphRunRequest 8) |
| `packages/services/src/graph-engineering/adapters/workflow-transfer.test.ts` | **NEW** — 12 tests (bounds 1 + decodeImportBytes 6 + assertStatUnchanged 5) |
| `packages/ui/src/hooks/useGraphTemplateFiles.ts` | **NEW** — file import/export hook (scope/generation, bounded read, double-stat, fatal UTF-8 via extracted pure functions) |
| `packages/ui/src/graph-engineering/GraphTemplateTransfer.tsx` | File import/export buttons wired (gated by `canImportFile`/`canExportFile`); `fileSaved`/`fileError`/`fileUnavailable` status |
| `packages/ui/src/graph-engineering/GraphRepeatRequest.tsx` | **NEW** — New request form (applyGraphRunRequest → onChange; Advanced-only when unsupported) |
| `packages/ui/src/graph-engineering/GraphDesignSections.tsx` | **NEW** — wrapper (GraphRoutingEditor + GraphRepeatRequest) keeping GraphEditor under max-lines |
| `packages/ui/src/graph-engineering/GraphEditor.tsx` | Uses GraphDesignSections wrapper (back to 398-line baseline) |
| `packages/ui/src/graph-engineering/GraphLibrary.tsx` | Pass `target` to GraphLibraryManagement |
| `packages/ui/src/graph-engineering/GraphLibraryManagement.tsx` | `target` prop threaded to GraphTemplateTransfer |
| `packages/ui/src/i18n/locales/en-US.ts` | 8 keys (importFile, exportFile, fileSaved, fileUnavailable, repeatRequest, repeatRequestHelp, applyRequest, requestAdvancedOnly) |
| `packages/ui/src/i18n/locales/zh-CN.ts` | 8 keys (matching zh-CN strings) |
| `docs/graph-engineering/pre-z8/glm-handoff/TASK_007_REPORT.md` | This report (new) |
| `docs/graph-engineering/pre-z8/EXECUTION_PLAN.md` | U5 row → COMPLETE; ledger rows + next actions updated |

### This-execution vs historical vs FAIL/BLOCKED/NOT RUN

| Item | Classification |
|------|----------------|
| U5 pure-logic tests (23) + full graph-engineering suite (341/343) | **Actual execution** — fresh, this session, current build |
| Emitting checks (typecheck/architecture/lint/oxfmt) | **Actual execution** — serial, this session |
| TASK_006 closeout (Part 1.1–1.3) | **Actual execution** — prior session, evidence retained |
| Actual platform file IO wiring (hook unit tests) | **NOT RUN** — no UI test runner; dependency ban forbids adding one |
| Real OS dialog ergonomics | **NOT RUN** — human pilot check per spec |
| Full eight-scenario native matrix | **NOT RUN** — U6 (out of scope; 完成后停止，不开始 U6/Z8) |
| Human / live / company-project / release acceptance | **NOT RUN** |

### Side-effect and security checks

- **Zero-execution**: import/export/preview/repeat-prep invoke no model/command/plugin/MCP/worker (code inspection). `decodeImportBytes` uses `fatal: true` — invalid UTF-8 throws, no silent replacement. `assertStatUnchanged` rejects mid-read tamper.
- **No credential/secret access**: no existing credentials accessed; no live paid models; no company projects. File transfer carries only the portable template envelope (no run records/conversations/approvals/credentials/workspace source).
- **No dependency/dependency/dependency/relaxation**: no new packages; no approval/sandbox relaxation; no reset/stage/commit/push/publication.
- **No production redaction rule change** (Part 1.1 helper is test-only).
- **No defensive-code addition beyond the already-implemented boundary checks**: the stat-shape classifier (non-file/non-finite → silent skip) is pre-existing defensive handling, left inline and marked NOT RUN for unit coverage.

### Remaining risks

- The hook's React lifecycle (scope/generation guard, StrictMode cleanup, single-flight `isCurrent`)
  and the platform file IO calls have zero unit coverage — only code inspection + typecheck guard
  them. A UI test runner (vitest + @testing-library + jsdom) would close this but needs dependency
  authorization not granted here.
- Real OS dialog ergonomics (cancel/reselect/overwrite-prompt/save-failure) are unverified — human
  pilot only.
- U4 dotnet-fixture net6.0 sub-case remains a baseline limitation (Part 1.2).
- U5 completion is automated-only — ≠ human/paid-model/company-project/release acceptance.

---

## Next manual check

Authorized workspace, real desktop build: open Graph Engineering → sequential design → export a
pinned template to file (verify the native save dialog appears, suggested name
`workflow.zcode-workflow.json`, saved file opens as valid JSON with `format: "zcode-workflow"` and
the selected reference roles as `required: true`). Then import that file into a fresh workspace
(verify the open dialog, preview shows the template with unresolved required references, accept
rebinds to the destination). Then on a pinned instance, use New request to change the request text
and confirm the run is a separate deliberate action. Expected evidence: screenshots of the two
dialogs + preview + accepted design. Stopping condition: any dialog/preview/rebinding defect. The
one next decision needed: whether to authorize U6 (full native matrix + UI test runner
dependencies) or a bounded human pilot of U5 first.

## Gate recommendation

U5 automated checkpoint is evidenced: implementation complete, pure-logic acceptance 341/343 PASS,
emitting checks serial-green, zero-native-dispatch by inspection, parallel boundary untouched. What
remains unverified: actual platform file IO wiring and real OS dialog ergonomics (NOT RUN — no UI
test infra; human pilot only). U6/Z8 may begin only with explicit authorization — this task stops
per 完成后停止，不开始 U6/Z8. No automatic publication or deployment.
