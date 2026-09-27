# U1 UI implementation checkpoint

Date: 27 September 2026. Owner: UI subagent, coordinated by the root implementation agent.

The U1 UI source is implemented. The coordinator subsequently reported final-source typecheck, lint and desktop build PASS, and independently reran all 48 Graph UI tests successfully. The expanded controlled native acceptance run is in progress in the safety lane. This note is not evidence that native acceptance or U2–U6 is complete. The specification is [IMPLEMENTATION_SPEC.md](../IMPLEMENTATION_SPEC.md), and the original bounded investigation is [U0_UI_AUDIT.md](U0_UI_AUDIT.md).

## Ownership and implemented behavior

- `packages/ui/src/store/graphDraftStore.ts` owns only unsubmitted Renderer drafts: base/full definition, template parameters and bindings keyed by immutable template version, project-check text/base digest, and library selection. The existing `graphEngineeringViewStore.ts` continues to own navigation. Both use the existing identity-first workspace key, with no second accepted queue or Host state owner. This is in-memory retention across component/navigation/workspace changes; it does not persist task text to disk or promise recovery after quitting the Renderer.
- `GraphEditor.tsx` exposes Workflows, Design, Runs and Project setup. The workspace and saved/dirty/conflict/frozen-run context remain visible. `GraphEditorNavigation.tsx`, `GraphEditorSurface.tsx` and `GraphDesignReadiness.tsx` are cohesive presentation extractions, retaining native navigation and existing selectors.
- `GraphLibrary.tsx` uses the new service-owned `agent-assisted` template by default when available and pins the newest compatible non-archived version on first load. Refresh does not move a partially filled form to a new version. `GraphLibraryManagement.tsx` contains explicit version selection, hashes, duplicate/archive and the existing raw transfer surface.
- `GraphTemplateBindings.tsx` retains task/context/check selections in the draft store, uses a multiline request field and optional context disclosure, rejects whitespace-only required values, provides a step-name preview and corrective field/setup navigation, and filters checks with the public service helper `graphRecipeCompatibility`. Existing templates and verifier requirements are not rewritten.
- Agent-led templates and no-Tool run views state that configured test evidence is not included. Templates containing Tools say that configured project checks are required and evidence depends on check type. Neither loading nor saving checks receives an execution/test-success label.
- `useGraphRecipes.ts`, `graphRecipeRead.ts` and `GraphRecipeReadStatus.tsx` provide independent `not-loaded`, `loading`, `ready` and `error` states. Ready/empty and ready/incompatible are distinct. A failed refresh preserves the last snapshot but remains error and cannot enable creation. Explicit retry remains available. Reads do not enter the graph mutation admission helper or create an agent/session.
- `GraphProjectRecipes.tsx` retains the advanced JSON configuration form and all fields. Refresh or a delayed save cannot overwrite newer local text; external digest changes expose conflict with a visible saved version and explicit Use saved action. U2 guided forms are not claimed in this checkpoint.
- `graphTemplateReplacement.ts` plus the Library dialog implement Save and replace, Discard and replace, and Cancel. Save must succeed and supplies its acknowledged revision to instantiate. Failed Save and Cancel preserve the draft. The reviewed template digest, form, definition and scope are checked again after asynchronous Save. Cancel/close depends on actual pending work so a failed revision-conflict Save cannot trap the dialog.
- `GraphEngineeringPanel.tsx` places the existing parallel toggle under an experimental disclosure and shows its limitations. No parallel admission, recovery, transfer or merge behavior was changed.

## Review fixes before the build checkpoint

1. A save acknowledgement can arrive before a refreshed workspace projection. `reconcileGraphDraft` now ignores lower as well as equal incoming revisions, preventing rollback of the just-accepted definition. The new regression was run red first, then passed after the guard; the Chinese source comment records the cause.
2. Independent review found that the first render after a target switch could expose the previous workspace view before effect cleanup. With a retained draft store, that could incorrectly initialize workspace B using workspace A's definition, especially A revision 5 → B revision 1. `graphWorkspaceRead.ts` and `useGraphEngineering.ts` now scope the projection synchronously by the captured service/target pair. The target includes path and identity. The new scope exposes no previous view, error or pending state before effects run.
3. Workspace reads use both current-scope and read-sequence checks and withhold stale return values. Mutation callbacks also check scope plus generation. Their results are returned only after the final awaited reload and another ownership check; switching during that reload cannot release a stale result into a form.
4. Read errors and action errors are separate, scope-tagged projections. A successful retry clears a prior read error while an action failure remains visible after the action's reconciliation read.
5. Root lint initially reported two new max-lines errors in GraphLibrary and GraphEditor. Presentation/management extractions fixed these without suppressing rules or compressing formatting. Final file lengths at this checkpoint were 338 and 378 lines respectively; `useGraphEngineering.ts` was 392 lines.

The independent reviewer reread the scoped hook and the new deferred tests after the fixes and reported no remaining actionable finding in that review lane. Native target-switch interactions remain part of the coordinator-owned acceptance run.

## Actual test evidence

All commands used the pinned local environment, without installs:

```powershell
. .\.tmp\z1-env.ps1
$env:PATH="$PWD\node_modules\.bin;$env:PATH"
```

| Check                                                                                              | Actual result                                                                  | Evidence                                                              |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| New draft/recipe/replacement helpers authored before implementation                                | RED for missing new modules/exports, then PASS after implementation            | Current tests listed below; original invocation output in the task    |
| Older acknowledged definition regression                                                           | RED with old reconciliation; PASS after monotonic guard                        | `graphEngineeringView.test.ts`                                        |
| New workspace scope/deferred read tests                                                            | RED before new read helper existed; 3 PASS after implementation                | `graphWorkspaceRead.test.ts`                                          |
| All current Graph UI pure tests, `node --import tsx --test` over `packages/ui/test/graph*.test.ts` | **48 PASS, 0 FAIL**, no skipped tests; final duration 936 ms                   | `.tmp/pre-z8-current/u1-ui-tests.log`                                 |
| Focused `pnpm exec oxlint` over Graph UI, owned hooks/stores/locale and workspace read test        | **0 warnings, 0 errors**, 56 files                                             | `.tmp/pre-z8-current/u1-ui-focused-lint.log`                          |
| Owned changed-file `pnpm exec oxfmt`                                                               | PASS                                                                           | Formatter invocation output                                           |
| `git diff --check -- packages/ui` before final scoped hook patch                                   | PASS; Git emitted only configured LF/CRLF conversion warnings                  | Invocation output; coordinator should include latest final diff check |
| Root final-source typecheck                                                                        | **PASS**, coordinator reported                                                 | `.tmp/pre-z8-current/u1-typecheck.log`                                |
| Root final-source lint / desktop build                                                             | **PASS**, coordinator reported; lint retains 70 baseline warnings and 0 errors | `.tmp/pre-z8-current/u1-lint.log`, `u1-desktop-build.log`             |
| Root independent Graph UI test rerun                                                               | **48 PASS**, coordinator reported                                              | `.tmp/pre-z8-current/u1-ui-integrated.log`                            |
| Native U1 interactions/screenshots                                                                 | **NOT RUN by this lane**                                                       | Safety/native lane owns the isolated harness after coordinator build  |
| Live models, installed credentials, company workspaces, human pilot                                | **NOT RUN**                                                                    | No authorization used or requested by this lane                       |

New meaningful test coverage is in `graphPreZ8Drafts.test.ts`, `graphRecipeRead.test.ts`, `graphTemplateReplacement.test.ts` and `graphWorkspaceRead.test.ts`. Existing `graphEngineeringView.test.ts` and `graphWorkflowView.test.ts` gained monotonic revision, whitespace, latest-version and recipe-kind coverage. A compatibility test initially used an invalid Test fixture without its declared Build node; the fixture was corrected to include Build, preserving the shared compatibility rule.

## Native harness selectors and exact actions

The safety agent was given these selectors directly. Existing native admission/session selectors were preserved.

| Surface/action               | Selector or action                                                                                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace / workflow state   | `graph-workspace`, `graph-library-workspace`, `graph-workflow-header`, `graph-workflow-state`                                                                              |
| Four destinations            | Click `graph-view-workflows`, `graph-view-design`, `graph-view-runs`, `graph-view-setup`                                                                                   |
| Workflows surface            | `graph-library-dialog` is inline in Workflows; Design opens a modal with `graph-library-open`                                                                              |
| Intent and immutable version | `graph-library-entry`; current pin text is visible; open the `graph-library-management` details summary before using `graph-library-version`                               |
| Request/context              | `graph-template-parameter-request`; optional reference inputs are inside the Context details disclosure                                                                    |
| Verification semantics       | `graph-template-verification`; for a no-Tool selected run, `graph-run-verification`                                                                                        |
| Recipe read status           | `graph-recipe-read-state` with `data-state="not-loaded\|loading\|ready\|error"`; empty and incompatibility have visible explanatory text                                   |
| Refresh/retry read           | `graph-template-load-recipes` remains explicit, enabled after failure                                                                                                      |
| Setup from creation          | Click `graph-template-setup-checks`, then `graph-return-to-workflow`; the typed request and bindings remain intact                                                         |
| Project-check JSON           | `graph-project-recipes`, `graph-recipes-json`, `graph-load-recipes`, `graph-save-recipes`, `graph-recipes-saved`; conflict discard is `graph-recipes-use-saved`            |
| Compatible slot choices      | `graph-template-recipe-build`, `graph-template-recipe-test` for existing verified templates; options exclude incompatible kinds                                            |
| Create                       | `graph-library-instantiate`; successful creation navigates to Design (inline creation surface disappears; modal closes)                                                    |
| Dirty replacement            | Create opens `graph-replace-dialog`; click exactly one of `graph-replace-save`, `graph-replace-discard`, `graph-replace-cancel`; the old replace checkbox no longer exists |
| Run corrective reason        | `graph-run-blocked-reason`; existing `graph-run-button`, `graph-readiness-errors` and model/settings routes remain                                                         |
| Library management/transfer  | First open `graph-library-management`; then existing duplicate/archive/transfer selectors, including nested `graph-template-transfer`, are available                       |
| Experimental parallel        | First open `graph-advanced`; then existing `graph-parallel-toggle`; banner `graph-parallel-experimental` is visible                                                        |

The intended U1 harness matrix is: agent-assisted with no checks; no-config/empty; malformed config read failure and successful explicit retry; only wrong-kind command recipe; compatible Build/Test selection; whitespace required request; retained task Setup/back, modal close/reopen and workspace switch; dirty replacement Cancel/Discard/Save-failure; then the controlled native sequence and final gate. Every load/read/save/create case must assert zero native/model submissions before explicit Run.

## Exact next actions

1. Coordinator root typecheck/lint and desktop build are now reported PASS; final combined diff/format/evidence checks remain coordinator-owned. No UI source edits are in flight.
2. Safety lane is running the isolated expanded U1 harness and captures screenshots. Record actual assertion failures and fix them without weakening the acceptance criteria.
3. Coordinator records the verified U1 checkpoint and advances to the already-authorized U2 contracts and implementation. This UI lane has completed read-only [U2 form/flow planning](U2_UI_PLAN.md) but has not started U2/U3 product behavior.

No staging, commit, push, publication, Z8 work, installed credential read or live paid-model call was performed by this lane.
