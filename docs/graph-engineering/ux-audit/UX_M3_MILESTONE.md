# UX-M3 — Reusable workflows you can trust

Status: **approved by the user on 2026-09-30**, with the decisions and refinements recorded below. Internal UX milestone. It does not rename Z7, start Z8, change an application version or authorize a release.

Baseline: `claude/zcde-graph-ux-audit-be80d8` at `2d83f9e` (merge of PR #6: the UX-M2 Windows closeout). UX-M1 and UX-M2 are closed and are not reopened. Their BLOCKED / NOT RUN items ([UX_M1_WINDOWS_REPORT.md](UX_M1_WINDOWS_REPORT.md) sections 6 and 8, [UX_M2_WINDOWS_REPORT.md](UX_M2_WINDOWS_REPORT.md) section 8) stay historical backlog unless this milestone names one.

## 1. Objective

The engineer can choose a reusable workflow, see exactly which version a new run will instantiate, and intentionally version, export, import and reuse it from one Workflows surface, then open it in Runs.

Journey: `Workflows -> choose workflow -> inspect versions -> intentionally edit / create a version -> import / export if needed -> Open in Runs -> Review -> Start`.

Graph stays an agent engineering workspace, not a workflow-database UI. Advanced capability stays reachable; it moves behind an **Advanced** section rather than disappearing.

## 2. Evidence behind the scope (source at the baseline)

- The library dialog opens a second modal (**Manage versions and transfer**) that holds the only version selector, the duplicate/archive controls and a **Transfer** block; the New-run pane has no version at all and does not say which version it will instantiate.
- `GraphEditor` passes `disabled || conflicted || Boolean(activeRun)` to the library, so every read-only action is disabled while a run owns the workspace, although `list` and `preview` are pure.
- Version rows are bare numbers; `createdAt` is never shown (built-ins store 0); the `Built-in` string is never rendered; the digest and library revision are shown as ordinary content.
- Capture reads the displayed (possibly unsaved) design without saying so; a new version sets `entry.name = template.name`; the new-version target is whichever entry the dropdown shows, not the workflow the design came from; after a create/version the selection does not move.
- Built-ins are synthesized from the repository with one version (`BUILTIN_TEMPLATE_VERSION = 2`, deliberate since `ed3bd3a`; pinned by `reviewer-version.test.ts` and `workflow-service.test.ts`). Old built-in bodies are not retained. `GraphLibrary` resolves a missing selected version with `?? latest`, and `graphRunAgain` seeds the form under the historical key; the suspected consequence is unconfirmed until reproduced (M3.3).
- Blocked historical z6 drivers: `<details>` assumptions (navigation), a hard-coded built-in version 1 (migration rule), a stacked-modal problem. See [UX_M1_WINDOWS_REPORT.md](UX_M1_WINDOWS_REPORT.md) section 6.

## 3. Decisions taken

1. Library mutations (create, version, duplicate, archive, import-and-save) stay **blocked** while a run owns the workspace, even though the Host has no rule for them (they are profile-scoped).
2. **Run again** on a pin that is no longer offered: an explicit notice and an explicit path to the offered version, carrying over only structurally compatible values (section 4, M3.3). Never automatic, never a silent replacement.
3. A single dialog with sections (Workflow, Versions, Use, Share, Advanced); no new top-level destination, no in-page redesign.
4. Built-in version 1 stays unavailable. Drivers derive the built-in version the Host actually offers; exact-version semantics are not weakened.

## 4. Checkpoints (internal; no approval stop between them)

Each checkpoint's contract is written in [UX_M3_SPEC.md](UX_M3_SPEC.md) and committed before its behavior.

| Checkpoint | Deliverable                                                     | Size / risk    |
| ---------- | --------------------------------------------------------------- | -------------- |
| UX-M3.1    | One library surface, clear version semantics, read-only browse  | M / low-medium |
| UX-M3.2    | Separate save-version and share tasks with explicit targets     | M-L / medium   |
| UX-M3.3    | Open in Runs; honest historical pins                            | S / low-medium |
| UX-M3.4    | Restore the four historical drivers on the final UI             | S / low        |
| Windows    | One combined acceptance, afterwards                             | after Cloud    |

### UX-M3.1 — one library surface, clear version semantics

- One dialog with sections **Workflow**, **Versions**, **Use**, **Share**, **Advanced**. The nested Manage modal goes away. No new top-level destination.
- **Built-in** versus **Yours** shown explicitly on each workflow.
- Versions: **Version N**; **Latest** only where it means the highest compatible version the Host offers; **Used by current design** only from facts (`definition.template` id + version + digest of the current design); no generic "Current version"; user-created immutable versions individually selectable; built-ins show only the versions the Host offers; no date for built-ins.
- Digest, library revision and raw JSON move to **Advanced** and stay reachable.
- **New run** shows which workflow and version it will instantiate. **Workflows** shows the origin (workflow and version) of the current design when the provenance actually exists.
- **Read-only during an active run:** allowed = browse workflows, inspect versions and metadata, read-only capture/import preview. Blocked with a reason = instantiate/replace design, create, save version, duplicate, archive, import-and-save, any other library mutation. **Export to disk is blocked** during this milestone while a run owns the workspace unless the implementation first proves its destination cannot modify the active workspace; the chooser is the OS save dialog and cannot be constrained, so it stays blocked.
- Host and UX-M1 admission rules are not weakened.

### UX-M3.2 — separate versioning and share tasks

- "Transfer" is no longer one operation. Four tasks around the existing service operations: **Save current design** (as a new workflow or as a new version), **Export selected version**, **Import a file** (choose, preview, save are separate), **Advanced / manual JSON**.
- Save-as-version: explicit target, defaulting to the workflow the current design originated from when that provenance exists; the dropdown selection is never an implicit mutation target. Unsaved edits are disclosed before the mutation ("This version includes your current unsaved design edits."). The existing reviewed-preview gate stays. Any name change the service derives is shown before confirmation; if avoiding it would need a service contract change, stop and report.
- After create / new version / duplicate: select the resulting workflow and version and show the result, derived from the authoritative returned list, never guessed.
- Built-ins: unsupported mutations disabled with an explanation, and **Duplicate to edit** where that is the supported path.
- Export identifies exactly `Workflow X / Version N` and never exports the unsaved canvas. Portable schema, size limits, secret/path scan and reviewed gate unchanged.
- Import: choose file, preview/review (no mutation), save into library (explicit mutation).
- The manual JSON route remains for environments without native file selection, under Advanced. Digest and library-revision conflict handling stay intact.

### UX-M3.3 — Open in Runs and honest historical pins

- An explicit **Open in Runs** action opens Runs -> New run with the selected workflow and version. It never starts, reviews or acknowledges.
- **Reproduce first, fix second:** a historical run pinned to a built-in version that is no longer offered, then **Run again**. No fix before a failing reproduction exists.
- If confirmed: never silently replace version N with the latest. Show that version N used by the run is no longer offered and which version is available; offer an explicit path to continue. Carry forward only structurally compatible values by stable identity (request; parameter id + compatible type; reference role id + accepted kind; matching stable recipe/check binding identity); no label or positional matching; list what could not be carried; missing required values stay missing and Review stays blocked. The historical run and its captured evidence are untouched.
- Built-in v1 is not synthesized and no fake historical library entry is created.

### UX-M3.4 — driver restoration

Restore, against the final UI: `z6-native-smoke --scenario=generic`, `z6-native-library`, `pre-z8-u1-native`, `pre-z8-u5-native`. Navigation is migrated mechanically; semantic assertions are not weakened. Drivers that select a NEW built-in derive the offered version from the Host. A dedicated assertion keeps: built-ins offer exactly their real versions; a historical unavailable v1 does not fall back to v2; user-created workflow v1/v2 assertions stay exact. `pre-z8-u3-native` stays out of scope unless an M3 regression requires it.

## 5. Boundaries (out of scope)

Permission policy, pending-permission payload ownership, reviewer retry, concurrency or queues, workflow search or tags, deleting workflows, cross-profile sync, automatic upgrade of historical pins, draft persistence across restart, the app-wide `html lang` change, packaging/release, Z8. No new product dependencies, credentials, live-model calls or company repositories. Host ownership, library immutability, digest checks, exact-version resolution, the library revision lock, the portable secret/path scan and size limits, and the UX-M1 admission rule are unchanged.

## 6. Validation

- Node 24.14.0 and pnpm 10.33.2 (`mise.toml`), existing locked dependencies.
- The Cloud browser harness gains the **real** `GraphWorkflowService` (with an in-memory library store) so `list`, `mutate`, `preview` and `instantiate` are exercised; fixture boundaries are documented in the report.
- Coverage: browsing while a run is active; mutations refused while active; built-in/user labels; version selection and origin; exact version used in Runs; create/new-version/duplicate result selection; dirty-design disclosure; import/export preview and the reviewed gate; library revision conflict with Refresh next to the error; the historical-pin reproduction and carry-forward; English/Chinese, light/dark, 1280x720 and 1920x1080. Targeted mutation checks where they add evidence.
- Typecheck, lint, full architecture check, changed-file formatting, relevant UI/service/script tests, and the Context-picker / M1 / M2 regressions affected. Actual exits and environmental skips reported.

## 7. Delivery and git

Branch `claude/graph-ux-m3` from the baseline; one PR targeting `claude/zcde-graph-ux-audit-be80d8`. `UX_M3_REPORT.md`, an updated `USER_GUIDE.md`, one combined Windows checklist. Normal scoped commits, pushing the M3 branch and opening the PR are authorized. No merge, no push to the integration branch or main, no force-push, tag or publication.

## 8. Completion state

**CLOUD DEVELOPMENT COMPLETE — WINDOWS ACCEPTANCE PENDING**, only when M3.1-M3.4 are complete in the Cloud and the combined Cloud pass is reported with real exits and disclosed exceptions.
