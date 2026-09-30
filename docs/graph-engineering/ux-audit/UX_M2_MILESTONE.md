# UX-M2 — Pick up where you left off

Status: **approved by the user on 2026-09-30**, with the refinements recorded below. Internal UX milestone. It does not rename Z7, start Z8, change an application version or authorize a release.

Baseline: `claude/zcde-graph-ux-audit-be80d8` at `3c5cff4` (merge of PR #4: UX-M1 Windows acceptance, its one defect fix `f5d610b` and the closeout). UX-M1 is closed from the user's perspective and is not reopened. Its BLOCKED / NOT RUN items ([UX_M1_WINDOWS_REPORT.md](UX_M1_WINDOWS_REPORT.md) sections 6 and 8) remain recorded as historical limitations and backlog; this milestone neither closes nor waives them.

## 1. Objective

The engineer can find the newest or current run immediately, iterate on it, and adjust a check or context without doubt about what the next run will actually use.

Journey:

`open Runs -> newest/current run on top -> inspect -> Start a new request from this one -> adjust a check (keep, discard or save, knowingly) -> adjust context (failures framed) -> Review -> Start -> the new run is on top, selected and visible`

## 2. Evidence behind the scope

From the source at `3c5cff4` and the M1 Windows observations (section 7 of the Windows report):

- The Host appends runs (`app/service.ts`); the renderer shows `view.runs` unchanged, 25 per page, so the newest run lands on the last page. The history page is initialised once from the selection (`GraphRunHistory`, `useState` initialiser), so after **Start** the new run is selected while page 1 stays shown. Paging reads "Previous runs / Next runs". Timestamps use `toLocaleString()` without the app locale.
- New-run check rows read the saved Host snapshot. After **Edit check** -> change -> **Back to new run** the row still reads "Saved · not run" with no sign of the unsaved edit, and Review uses the saved check. The Back note only says choices are kept. Discard exists only inside the digest-conflict block. A later **Save checks** writes every retained edit (Windows C9).
- The picker's "Could not use {value}. The previous selection was kept." appears only when the attempted value is known, so a native-chooser failure shows the bare Host diagnostic, and the sentence is shown even when no previous selection existed.

## 3. Checkpoints (internal; no approval stop between them)

| Checkpoint | Deliverable                           | Size / risk           |
| ---------- | ------------------------------------- | --------------------- |
| UX-M2.1    | Newest-first history that follows you | S / low-medium        |
| UX-M2.2    | Explicit unsaved-check semantics      | M / medium            |
| UX-M2.3    | Error framing on this journey         | S / low               |
| Windows    | One combined acceptance, afterwards   | after the Cloud batch |

Each checkpoint's contract is written in [UX_M2_SPEC.md](UX_M2_SPEC.md) and committed before its behaviour.

### UX-M2.1 — History

- Newest-first is a **renderer projection** over `view.runs`. "Newest" is **creation order**, not last progress or update time. The order is stable and deterministic (ties broken deterministically); the Host run array is never mutated.
- Explicit navigation to a run (Start, Go to run, View current run) reveals that run's page, including when the run was already selected but the user had since browsed to another page.
- Ordinary refreshes and Host events never reset the user's page, change the selected run or move keyboard focus.
- The small row shift when a newer run arrives while browsing older pages is accepted. No cursor pagination, no new history store. Selection and focus stay keyed by run identity; invalid page numbers are clamped.
- Paging wording is Newer / Older, consistent with the actual order.
- Graph-owned timestamps are formatted with the app locale. Time-zone semantics, stored timestamps and raw diagnostic text are unchanged. Missing or invalid timestamps never produce an invented date.
- Affected history scenarios are updated so they still prove their original semantic assertions; Needs-you and pagination coverage are not weakened.

### UX-M2.2 — Unsaved checks (approved approach: disclosure, Discard, Save summary)

- **No blocking Save / Discard / Keep dialog** when the user presses Back or navigates to a pending run. Back keeps the check draft and returns immediately. Navigation to permissions, questions or the current run is never blocked.
- Visible near the relevant actions: which checks have unsaved changes; that unsaved changes are not used by the next run; that Review uses the saved Host snapshot.
- New run marks affected selected checks, without substituting unsaved values for their saved configuration.
- Save explains the complete scope of the existing save operation: added, modified and removed checks by stable id, with names where available, including retained edits from earlier visits. An inline summary, not a confirmation modal per Save.
- Save authority, validation and digest-conflict handling are unchanged.
- Discard names its real scope. It discards the whole recipe draft and says so; it never implies "this check only". Discarding the whole dirty draft requires explicit confirmation. It reuses the existing snapshot/discard mechanisms. An unavailable or stale saved snapshot is never presented as a verified current value. The established conflict-resolution flow is preserved.
- Invalid raw JSON stays subject to existing validation. A generic "cannot summarize changes" message never enables an otherwise invalid save and never pretends a changed-check list is complete.
- Saving stays blocked while a run is unresolved; editing and inspecting drafts stay possible (M1).

### UX-M2.3 — Error framing

- Only the surfaces on this journey: Context selection, Checks read/save, the New-run action bar.
- The authoritative diagnostic stays verbatim under a UI-owned explanation.
- "Previous selection kept" is said only when a previous selection existed. A cancelled chooser is not a failed validation. No empty filename, no invented path.
- The UX-M1 Windows fix stays: a check-save error never appears beside **Review and run** as though preflight or execution failed.
- New framing is localized in English and Simplified Chinese. Stored instructions, user content, check names, identities, evidence and diagnostics are not translated.

## 4. Boundaries (out of scope)

- Graph Host ownership and admission, native permission policy, reviewer parsing, approval, evidence validation, recovery, concurrency.
- History search or filtering, restart-persistent drafts, the app-wide `html lang` change (separate app-wide task), a Workflows library/version/transfer redesign (proposed UX-M3, starting with restoring the blocked z6 native drivers), reviewer retry, queues, auto-start, pending-permission payloads, packaging, release, Z8.
- No new product dependencies, policy exceptions, live-model calls or company-project operations.

## 5. Validation

- Supported tooling (`mise.toml`: Node 24.14.0, pnpm 10.33.2) and existing locked dependencies.
- Focused unit and real-component Chromium checks during development; one combined final Cloud pass.
- Coverage: creation order, ties, paging and explicit-selection navigation; refresh without unwanted page or focus movement; locale-aware timestamps; Edit -> Back -> clear dirty marker -> preflight uses saved values; whole-draft Save summary including earlier retained edits; Discard scope, cancellation and conflict handling; refusal to save during an active run; chooser failure and cancellation with and without a previous selection; original diagnostic preservation; the M1 check-error isolation regression. Existing Context-picker and UX-M1 regressions included. Targeted mutation checks where they establish useful coverage.
- Screenshots of the touched journey at 1280x720 and 1920x1080, English/Chinese, light/dark, from the Cloud browser harness, inspected by eye. Fixture boundaries explicit.
- Typecheck, lint, full architecture check, changed-file formatting. Actual exits, failures and fixture-dependent skips reported.

## 6. Delivery and git

- Branch `claude/graph-ux-m2` from the baseline above; one PR targeting `claude/zcde-graph-ux-audit-be80d8`.
- `UX_M2_REPORT.md`, an updated `USER_GUIDE.md`, and one combined Windows acceptance checklist.
- Normal scoped commits and pushing the feature branch are authorized. No merge, no direct push to the integration branch or main, no force-push, tag or publication. No credentials retrieved or exposed.

## 7. Completion state

**CLOUD DEVELOPMENT COMPLETE — WINDOWS ACCEPTANCE PENDING**, only when all three Cloud checkpoints are implemented and the combined Cloud pass is reported with its real exits and disclosed exceptions. Windows acceptance and the user's check follow separately.
