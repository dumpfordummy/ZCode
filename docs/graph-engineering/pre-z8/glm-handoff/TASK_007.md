# TASK_007 — Closeout of TASK_006 test/report issues + U5 sequential reuse implementation

## Authorization (verbatim constraints)

不访问现有凭证；不调用真实付费模型；不操作公司项目。不新增依赖、不放宽审批或沙箱。
不 reset、stage、commit、push、发布。完成 U5 后停止，不开始 U6/Z8。

Checkout: `main` @ `6f41ad53a1fef2a02af004cdfc89a5c5cf91a4dd` (unchanged). Node 24.11.1
(mise pins 24.14.0 — deviation recorded), pnpm 10.33.2 via corepack. Local SDK 8.0.425 retained
from TASK_006's narrow exception (NOT re-installed; TASK_007 adds no SDK/package install authorization).

## Part 1 — Limited closeout of TASK_006 (NOT full U4 re-review)

### 1.1 verifyU2Test redaction proof

The TASK_006 fix branched on the product's `rawPreview.redacted` output and accepted either
branch — so a sensitive artifact wrongly retained as `redacted: undefined` would still pass the
`else` branch (security hole). Replaced with a predetermined-expectation helper
`assertArtifactRedaction(rawPreview, receipt, expected)` where `expected` ("clean"|"sensitive")
is decided by the known fixture content, not the product output. Both expectations reject
flag/digest inconsistency in either direction. The genuine U2 fixture TRX is known-clean
(`Cases.cs`/`Adapter.cs` are static constants asserted in `assertU2Preserved`), so `verifyU2Test`
asserts `expected: "clean"` specifically. New focused test `pre-z8-u2-proof.test.mjs` proves
accept (clean/sensitive) and reject (over-redaction, under-redaction/security-hole, inconsistent
validation, non-drifting digest, clean digest-drift). Shared proof reran both genuine pass/fail —
PASS. No production redaction rule changed.

### 1.2 dotnet-fixture 7/8 state preserved

Failing sub-case: "equal assertion names stay scoped to a second project and framework"
(`pre-z8-dotnet-fixture.test.mjs:123-163`), which builds a secondary fixture with
`framework: "net6.0"`. Failure: `NU1100 Unable to resolve 'Microsoft.NETCore.App.Ref (= 6.0.36)'`.
Missing precondition: 6.0.x reference packs absent from the minimal SDK 8.0.425 install (only
8.0.31 present); fixture `NuGet.Config` is `<clear/>` (no package source). 7 net8.0 sub-cases
pass; parent asserts `evidence.cases.length === 8` so the suite reports 1 fail. NOT a regression.
No skip/delete/relabel/target-framework/rollForward change. U6 closure: install
`Microsoft.NETCore.App.Ref` 6.0.36 (and 6.0.x host/runtime packs) into the local toolchain, or use
a fuller SDK install — requires dependency-prep authorization not granted here.

### 1.3 Toolchain/execution record corrections

- Version availability CONFIRMED (`dotnet --version === 8.0.425`, sdk dir present) — recorded
  separately from release checksum.
- Release checksum NOT VERIFIED: original zip not retained; Microsoft publishes no `.sha512`/`.sha`
  for 8.0.425 at canonical CDN paths (all `BlobNotFound`); `dotnet-install.ps1` does only a
  post-install version-output check. Version output / dir existence / file size are NOT checksum
  matches. SDK obtained over HTTPS from official CDN (transport integrity only).
- "Emitting checks (serial)" in TASK_006_REPORT was inaccurate — they were parallel tool calls.
  Corrected; TASK_007 runs emitting checks serially.
- Historical starting point (TASK_006 SDK install) vs current checkout (`6f41ad53`) vs current
  authorized exception (TASK_007 adds none) distinguished.

## Part 2 — U5 implementation (spec-first, per U5_REUSE_SPEC.md)

Goal: sequential workflow reuse, NOT new agent/runtime. No second workflow schema, credential
store, or execution engine. State owners (existing): workflow library owns immutable portable
versions; draft store owns unsubmitted editor/transfer state; platform/file services own file
selection/read/save.

### A. File export
Portable definition from an explicitly selected immutable template version (or current definition),
via existing export validation/preview/confirmation. Save through `IPlatformService.saveFile`, not
copy-JSON. Envelope is always `zcode-workflow` v1. Omit run records/conversations/approvals/
credentials/workspace source. Disclose omitted local values; warn task prose may contain secrets
(scanner is not a guarantee). Fix the confirmed capture gap: map frozen selected reference roles
to required rebinding roles before deleting the local template instance (baseline probe showed
`exportedRoles: []` despite `capturedRoles` non-empty).

### B. File import
`IPlatformService.selectFile` + bounded `IFileService` read (≤256,001 bytes; reject >256,000).
Fatal UTF-8, stat/mtime/size re-check. `workflow.preview(action: import)` validation. Cancel/
malformed/unsupported-version/save-failure preserve current unsaved design. Rebind to destination
workspace; no silent source-machine paths/model overrides/permissions. Zero native dispatch
(model/command/plugin/MCP/worker). Preserve node refs/conditions/bindings/advanced fields; reject
unsupported explicitly.

### C. Repeat request
Pure transform `applyGraphRunRequest(definition, request): GraphSequentialDefinition`. Nonblank
≤12,000-char request, exactly one Start. Pinned instance: update only existing string
`parameters.request`; missing/non-string → Advanced. Share the existing parameter-to-Start
renderer. Clone without revision/pin/local-binding mutation. Run stays a separate deliberate
action with fresh request ID + freshly bound preflight; no replay of Unknown/Interrupted; old
runs/versions unchanged.

### D. Experimental parallel boundary
Preserve existing Fork/Join + history. Show experimental status/limits. Sequential export is NOT
parallel-plan backup. No parallel portability/auto-merge/new scheduler.

### Coordinator-owned hook (per spec)
`useGraphTemplateFiles(target)` exposes `canImportFile`, `canExportFile`, `importFile(isCurrent)`,
`exportFile(json, isCurrent)`. Import returns `{path, json}` or `undefined` (cancel/stale). Export
sends fresh UTF-8 `ArrayBuffer` of reviewed JSON to native save dialog, suggested name
`workflow.zcode-workflow.json`, returns `SaveFileResult` or `undefined`. Service/platform/workspace
lifetime + cleanup generation around async work (StrictMode-safe).

## Part 3 — Acceptance (actual UI/service integration, distinguish test-double vs real-platform vs OS-dialog)

Round-trip; unconfigured-binding prompt; cancel/invalid/unknown-version/save-failure protection;
zero native dispatch in import/export/preview/repeat-prep; no old approval/PASS/run-identity
inheritance; Guided/Advanced + saved advanced fields intact; experimental parallel plan + history
unchanged by sequential ops. Unexecuted levels marked NOT RUN.

## Part 4 — Delivery

TASK_007.md, TASK_007_REPORT.md, update EXECUTION_PLAN.md. Report actual changes, screenshots,
acceptance evidence, operation steps. Separately list: TASK_006 leftover closeout status; U5
implementation & acceptance; this-execution vs historical vs FAIL/BLOCKED/NOT RUN; U6 environment
issues + human work. Mark U5 automated checkpoint complete only when necessary implementation +
checks done; do not write unexecuted OS-dialog/human tests as passed.
