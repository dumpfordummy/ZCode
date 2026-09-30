# UX-M1 — Finish the daily engineering loop

Status: proposed development milestone, ready to authorize as a bounded Claude Cloud task.

This is an internal UX milestone. It does not rename Z7, start Z8, change an application version, or authorize a release.

## 1. Outcome

A solo engineer can prepare the next task while an existing run is active, adjust that draft's context and selected checks without losing work, and return to the current run when attention is needed. Review and execution remain subject to the existing owner, preflight, and permission rules.

The main journey is:

`Inspect current run -> New run -> prepare next task -> adjust context/checks -> return to current run -> after admission is available, review -> explicitly start`

A next-run draft is not a queued job, a new workflow instance, or permission to execute.

## 2. Baseline and scope

Use the existing UX integration branch:

`claude/zcde-graph-ux-audit-be80d8`

Before starting, verify it includes the Context picker from PR #2. The reported feature tip was `85e13379c42b239acea5115afbad5eb818cc04cf`; verify ancestry or an equivalent reviewed merge/squash. Do not assume the PR has been merged, switch to an older base, or recreate the feature from its report.

Existing work to preserve:

- Runs / Workflows / Checks, with Runs -> New run as the default.
- Inline preflight, explicit per-run acknowledgment, and existing lost-submission recovery.
- Needs-you and Back to run.
- Distinct execution, machine evidence, reviewer validation/outcome, and human-decision states.
- Context chips and searchable picker, including role/cardinality and native-delivery semantics.
- Saved-check editor, Guided/Advanced editing, workflow versions and transfer.
- Read-only run graph and immutable captured definitions/evidence.

The source of these baseline statements is the supplied handoff, implementation specification/report, and Claude's Context-picker delivery report. Their results remain attributed to their original environments. This plan is not an independent code review or test run.

Read the current versions of:

- Applicable `AGENTS.md` / `CLAUDE.md` instructions.
- Root `PRODUCT.md` and `DESIGN.md`.
- `docs/graph-engineering/ux-audit/CLOUD_HANDOFF.md`.
- `IMPLEMENTATION_SPEC.md`, especially its recorded deviations.
- `CONTEXT_PICKER_SPEC.md` and `USER_GUIDE.md`.

Record the actual starting commit once. Do not repeat the whole UX discovery exercise.

## 3. Delivery structure

Use one new milestone branch, for example `claude/graph-ux-m1`, based on the current integration branch after the Context picker is included. If the name is occupied, choose a new name without overwriting it.

Implement three internal checkpoints in order, with focused commits and tests. Open one integration PR when the Cloud work is complete. A separate Windows checkpoint validates the combined result afterward.

| Checkpoint | Deliverable                                               | Execution environment                 |
| ---------- | --------------------------------------------------------- | ------------------------------------- |
| UX-M1.1    | Next-run drafting while the workspace is occupied         | Claude Cloud; native acceptance later |
| UX-M1.2    | Draft-preserving context/check setup navigation           | Claude Cloud; native acceptance later |
| UX-M1.3    | Keyboard, localization, and state clarity on that journey | Claude Cloud; native acceptance later |
| UX-M1.4    | Combined Windows and human acceptance                     | Windows, after the development batch  |

No separate user approval is needed between the first three checkpoints once the milestone is authorized. Stop only for an unavailable prerequisite, a genuine contract decision, or an out-of-scope change.

## 4. UX-M1.1 — Prepare the next task while a run is active

### User benefit

Waiting for a permission, answer, or final review no longer prevents the engineer from drafting the next request.

### Required behavior

- Keep the next-run request, workflow selection, context picker, and saved-check selections editable while an existing Graph run occupies the workspace.
- Keep actions that would instantiate, save a replacement workflow, prepare a runnable submission, or admit work blocked under the existing active-run restriction. This includes Review and run, Start, and Save as workflow only where they use those operations.
- Inspect all call paths, not just disabled button styles. Keyboard shortcuts and alternate controls must obey the same guards.
- Show a concise blocking reason and View current run action beside the blocked primary action.
- Read-only catalogue, search, and validation operations may still be used through their existing interfaces.
- Preserve the draft while visiting Workflows, Checks, the current run, or its native conversation.
- Keep workspace/template draft identity and restoration consistent with the existing store. Do not add a new persistent store.
- Changing the draft must not mutate the running definition, captured request, references, evidence, or approval request.
- When the existing owner permits a new run, enable the next appropriate action only if its other validation requirements pass. Do not infer availability solely from a status label.
- Completion of the current run never auto-reviews, acknowledges, instantiates, or starts the draft. The user must review and start explicitly.
- Preparing another task is not an execution queue. Do not add scheduling or concurrent admission.

### Acceptance

1. A task can be drafted during native permission/question waits and final human approval waits.
2. Draft edits produce no new run, native input, tool execution, definition revision, or approval decision.
3. Review/Start and equivalent mutation paths remain blocked while the owner disallows admission.
4. Current-run snapshots and evidence remain unchanged.
5. Returning from the current run restores the exact draft and correct workspace.
6. Once admission becomes available, fresh preflight and an unchecked acknowledgment are required; nothing starts automatically.

## 5. UX-M1.2 — One draft-preserving setup journey

### User benefit

The engineer can correct context/check configuration without navigating back to an empty form or accidentally changing which configuration will run.

### Required behavior

- Reuse the Context picker already implemented. Do not rebuild it or change reference roles/cardinality.
- In the new-run pane, show the selected checks for that draft's chosen workflow, not merely the number of checks saved in the project.
- Keep task, context, and saved checks visibly separate. A workflow without configured Tests must not imply that tests passed.
- Provide a clear route from the new-run pane to the existing selected-check editor, then back to that draft. Avoid another full editor implementation or unnecessary modal layer.
- Preserve request text, workflow selection, references, and unaffected check selections during navigation, cancellation, or failed saves.
- Keep the existing check-save authority and active-run guards. Do not grant new configuration-write privileges as part of this feature.
- After an allowed explicit check save, refresh available configuration through the existing interfaces. Retain the selection by stable identity only when it is still valid.
- If a selected check/reference disappears, is disabled, or becomes incompatible, show it as unresolved and block Review normally. Do not select a different check silently.
- The preflight must use the same effective draft choices shown in the form. Captured existing runs continue displaying their captured configuration.
- Label workspace/default settings as next-run configuration where needed. Do not present them as the model/mode/checks used by a historical run.
- Stale asynchronous results after workspace/template changes must not overwrite another draft.

### Acceptance

1. New run -> edit/check configuration -> cancel or save -> return retains the draft.
2. Editing one check through existing authorized operations leaves other checks unchanged.
3. Deleted/incompatible selections are visible and are not replaced automatically.
4. Context/check selections survive workspace changes and restore only to their own workspace.
5. Instantiation/preflight failure leaves user-entered data available for correction.
6. UI-to-Host tests verify the actual binding/configuration payload, not only labels or chip counts.
7. Setup and navigation do not dispatch engineering work.

## 6. UX-M1.3 — Keyboard, localization, and state clarity

### User benefit

The daily path works predictably without a mouse, mixed product labels, hidden errors, or ambiguous run states.

### Required behavior

- Complete keyboard navigation and visible focus for the controls touched by UX-M1.1 and UX-M1.2, including return links and blocked-action explanations.
- Keep picker Enter/Escape semantics: selecting context cannot submit or start a workflow, and closing returns focus appropriately.
- Do not introduce keyboard shortcuts that bypass preflight or acknowledgment. Adding a shortcut is optional, not required scope.
- Localize new and directly affected UI-owned labels/messages in English and Simplified Chinese. Use the existing locale system.
- Do not translate or rewrite model instructions, user text, stored IDs, raw diagnostics, captured definitions, or artifacts. Explanatory UI labels can be localized while original evidence remains available.
- Keep pending permission, pending question, pending human approval, failed machine evidence, malformed reviewer output, and valid reviewer decisions distinguishable.
- Keep Needs-you discoverable when the selected history page excludes the pending run. State the scope of the Host projection; do not claim a global queue beyond it.
- At 1280x720 and 1920x1080 in supported light/dark themes, the primary action, blocking reason, and route back to the current run must remain usable. Scrolling is allowed; hiding the necessary action is not.
- Do not conduct another app-wide restyling, introduce new brand tokens, or promise formal WCAG conformance.

### Acceptance

1. Complete the prepare -> inspect current run -> return journey using the keyboard.
2. Validate English/Chinese UI labels on the touched surfaces; original source/evidence text is preserved.
3. Exercise active wait, missing required context, invalid check, preflight error, and ready-to-review states.
4. Browser tests cover navigation, focus, late replies, and payload behavior with fixture boundaries disclosed.
5. Capture and inspect representative screenshots; image existence alone is not visual acceptance.

## 7. Cloud validation and reporting

Use repository-pinned development tooling, currently documented as Node 24.14.0 / pnpm 10.33.2; check the repository before assuming those versions remain the requirement.

Use existing locked dependencies. Do not change lockfiles, engine requirements, architecture thresholds, or permission policy to make the environment pass. The existing dependency-only `--ignore-scripts` setup is not a working native Electron runtime; record any necessary setup limitations.

During each checkpoint:

- Update the affected spec before behavior changes.
- Add focused regression tests using existing infrastructure.
- Run targeted tests and checks for the files changed.

On the final Cloud commit:

- Run root typecheck, lint, the full architecture check, changed-file formatting, and relevant UI/service/helper suites.
- Run the existing Context-picker browser and UI-to-Host coverage where affected.
- Use actual browser/components/hooks when supported; do not substitute only pure-model tests for interaction claims.
- Record the actual command, working directory, tool versions, exit code, and pass/fail/skip counts.
- Preserve fixture-dependent skips and baseline exceptions as such. Counts are observations, not fixed acceptance targets.
- Do not run a helper module as though it were an executable scenario and call a no-op exit successful acceptance.
- Keep historical Windows results separate from new Cloud results.

Deliver a compact `UX_M1_REPORT.md` with checkpoint status, commit identity, screenshots, actual tests, known gaps, and the Windows checklist. Update the current guide without rewriting historical reports.

## 8. UX-M1.4 — One combined Windows acceptance checkpoint

Do this after the Cloud development batch, not after each renderer commit.

Validate the exact proposed integration commit. A merge into the UX integration branch is not by itself release acceptance.

1. Inspect the target commit/diff and prepare the supported local environment.
2. Run emitting checks before building Desktop. Record fresh versus reused CLI/runtime artifacts and their provenance. Do not silently solve the separate CLI lockfile issue or rely on an unexplained sibling binary.
3. Use actual executable native drivers with disposable workspaces and controlled providers. Migrate affected selectors/navigation while preserving semantic assertions.
4. Run the maintained six reviewer scenarios against the combined UI.
5. Exercise draft-while-running during a real permission or approval wait; confirm no second work admission and no automatic start after the first run resolves.
6. Exercise real workspace files, native file selection, applicable enabled-skill selection, required-reference removal, and captured context provenance.
7. Exercise workspace-switch draft restoration and an actual instantiation/preflight failure without losing the draft.
8. Verify Needs-you across a history containing more than one page, including a pending run outside the selected page.
9. Verify Back to run returns to the correct workspace/run/step without answering permission.
10. Perform a short human usability check at the two desktop sizes; inspect light/dark and English/Chinese on touched surfaces.

Use a coverage map for the historical drivers affected by the earlier navigation redesign. Run the relevant required scenarios or explicitly retain them as pending; do not call unexecuted drivers compatible merely because test IDs were retained.

The user does not need to provide live credentials to the coding agent. Live-provider testing is a separate user-operated decision. No packaging or release is required by this milestone.

## 9. Completion states

### CLOUD DEVELOPMENT COMPLETE — WINDOWS ACCEPTANCE PENDING

All three Cloud checkpoints are implemented, the combined Cloud tests pass with disclosed exceptions/skips, the PR contains reproducible source/tests/docs, and the Windows checklist is explicit.

This is sufficient to continue renderer development on the integration branch. It is not a safety certification or release qualification.

### MILESTONE ACCEPTED

The combined Windows checks and the user's short usability check pass, no milestone-required scenario remains unresolved, and the user accepts the result.

Main merge, packaging, and publication remain separately authorized actions.

## 10. Not part of UX-M1

- Automatic Build/Test approval, Bash allowlists, broader sandbox access, permission policy, or reviewer capability changes.
- Exact pending-permission payload access requiring a new ownership/interface arrangement.
- Reviewer retries, tolerant JSON extraction, or new repair/replay behavior.
- Concurrent Graph runs, automatic queues, or auto-starting prepared drafts.
- Chat composer “Run as a workflow…” unless separately authorized.
- New workflow schemas, new runtime/provider stores, or persistence rewrites.
- Automatic translation of executable model instructions.
- Broad mobile/non-Windows qualification, full historical-suite cleanup, new release infrastructure, or Z8.

Record useful out-of-scope findings; do not implement them opportunistically.

## 11. Git and operational boundaries

When the user sends an implementation authorization for this plan:

- Use a dedicated Cloud feature branch; preserve unrelated work.
- Normal scoped commits and a push of that feature branch are allowed.
- Open the milestone PR against `claude/zcde-graph-ux-audit-be80d8`.
- Do not merge, push directly to main/integration, force-push, rewrite tags, or publish.
- Do not retrieve/print credentials or operate on company projects.
- Inspect screenshots and recordings as well as text before committing them; do not claim a text-only scan cleared media.
- Do not add product dependencies or alter safeguards without a separate decision.

The final result should be one coherent daily workflow, not three new parallel configuration systems.
