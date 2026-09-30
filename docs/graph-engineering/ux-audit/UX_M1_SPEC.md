# UX-M1 specification: finish the daily engineering loop

Status: **2026-09-30, written before implementation** (AGENTS.md: spec first). Plan: [UX_M1_MILESTONE.md](UX_M1_MILESTONE.md). Baseline: integration tip `b877f7f` (merge of PR #2, which contains the Context picker), branch `claude/graph-ux-m1`. Section 3 (UX-M1.1) is complete. Sections 4 (UX-M1.2) and 5 (UX-M1.3) are finalized in their own commits, before the behaviour they describe is implemented. Windows acceptance (UX-M1.4) is not claimed by anything here.

## 1. Outcome and vocabulary

A solo engineer can prepare the next task while a run occupies the workspace, adjust its context and checks without losing work, and return to the current run. Nothing about admission changes.

- **Draft**: the renderer's unsent form for the next run (request, workflow choice, references, check selections). Owned by `useGraphDraftStore`, keyed by `workspaceKey` and template key. It is not persisted, not queued, and not a run.
- **Occupied**: a run of this workspace is unresolved (`graphRunIsUnresolved`). The Host allows one unresolved run and stays authoritative.
- **Draft lock**: the form cannot be edited. **Admission lock**: Review, Save-as-workflow, Start and every equivalent path are refused. Today one reason (`newRunReason`) does both. UX-M1.1 separates them.

## 2. Ownership (nothing new is added)

| State or rule                                                         | Single owner                                                                       | Consumers                                      |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------- |
| Draft (parameters, bindings, library selection)                       | `useGraphDraftStore`                                                               | New-run form, picker, checks selection         |
| Whether a run occupies the workspace                                  | Host projection `view.runs`, read through `graphRunIsUnresolved`                   | `graphAdmission` (pure) → `GraphEditor`, hooks |
| Admission and the `activeRun` restriction                             | Graph Host (authoritative)                                                         | renderer refuses earlier, never later          |
| Native permissions, approval, evidence, reviewer validation, recovery | unchanged                                                                          | unchanged                                      |
| Saved checks (configuration)                                          | the Host recipe store, written only by the existing check editor and `saveRecipes` | unchanged                                      |

Renderer-side refusals are defence in depth and are never weaker than the Host. They read the latest Host projection, so a stale projection can only make them _more_ conservative.

## 3. UX-M1.1: prepare the next task while a run is active

### 3.1 Rules

1. While occupied, the new-run form (request, workflow, context picker, check selections, Advanced fields) stays **editable**. Read-only catalogue, search and reference validation keep working through their existing interfaces.
2. While occupied, **every** path that would instantiate a definition, save a replacement workflow, prepare a runnable submission, or admit work is refused, and the reasons are shown beside the primary action with a **View current run** action.
3. The draft lock keeps today's reasons except "a run is unresolved": an operation in flight, another Host owns the workspace, a revision conflict, Graph unavailable, no model. These still lock the form.
4. Editing the draft never changes the running definition, its captured request or references, evidence, or an approval request. It only writes the draft store.
5. Draft state survives visiting Workflows, Checks, the current run and its native conversation, and workspace switches, because the store is keyed by workspace and template.
6. When the run resolves, **nothing happens automatically**: no instantiate, no preflight, no acknowledgment, no Start. Review is a fresh explicit action; its acknowledgment starts unchecked.

### 3.2 Guarded paths (inventory from the source, not from button styles)

| #   | Path                                                                                                                                   | Enforcement after this change                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | **Review and run** and **Save as workflow only** in `GraphTemplateBindings`                                                            | disabled while admission is locked, and the click handler refuses too                                            |
| 2   | `GraphLibrary.onInstantiate` and `apply` (also the Save/Discard replace dialog)                                                        | refuse while admission is locked                                                                                 |
| 3   | `GraphEditor.reviewAndRun`, `useGraphRunActions.handleRun` and `startRun` (a non-v5 definition starts a run from `handleRun` directly) | refuse while admission is locked                                                                                 |
| 4   | Inline review **Start** (`GraphRunConfirmation`, `onStart`)                                                                            | `canConfirm` plus a guard in `onStart`                                                                           |
| 5   | Design tab **Review and run** (`GraphDesignPanel.onRun`)                                                                               | existing `canRun`; also reaches path 3                                                                           |
| 6   | `useGraphEngineering.run` and `prepareRunConfirmation`                                                                                 | **hook-level refusal** against the latest Host projection: the lowest renderer path, whichever control called it |
| 7   | `useGraphChecks` (project-checks run from the Checks destination)                                                                      | hook-level refusal (its UI already guards)                                                                       |
| 8   | Graph Host `service.run`                                                                                                               | authoritative, unchanged                                                                                         |

Deliberately not guarded, and why: `graph.save` from the Workflows editor (design edits apply to a future run; existing behaviour); `saveRecipes` (existing check-save authority, no new privilege); **Run again** (only seeds the draft store). There is no keyboard shortcut that starts or reviews a run; a test asserts the form has no `onKeyDown` path to `onInstantiate`.

### 3.3 Event order

```mermaid
sequenceDiagram
  participant U as User
  participant D as Draft store (renderer)
  participant E as GraphEditor
  participant H as Host projection (view.runs)
  U->>D: edit request, context, checks (run occupies workspace)
  Note over E,H: draft lock = none, admission lock = run-active
  U->>E: Review and run
  E--xU: refused; reason and View current run shown beside the action
  H-->>E: current run resolves (projection changes)
  Note over E: no effect runs: no instantiate, no prepare, no Start
  U->>E: Review and run (explicit)
  E->>H: instantiate if the form changed, then prepare (fresh preflight)
  E-->>U: inline review, acknowledgment unchecked
  U->>E: tick, Start (explicit)
```

### 3.4 Acceptance and how each is verified

1. A task can be drafted during a native permission wait, a question wait and a final-approval wait. **Browser** (real `GraphEngineeringPanel`, real `useGraphEngineering`; the Graph Host and workflow services are fixtures).
2. Draft edits produce no run, native input, definition revision, save, instantiate, prepare or approval decision. **Browser**: call log.
3. Every guarded path refuses while occupied. **Browser**: buttons, plus the hook called programmatically (real hook, no button); **unit**: `graphAdmission`.
4. The captured run and its evidence are unchanged (deep-equal before and after drafting). **Browser** and unit.
5. Returning from the current run restores the exact draft and workspace. **Browser**.
6. After the run resolves nothing starts; an explicit Review needs a fresh preflight and an unchecked acknowledgment. **Browser**.
7. UI-to-Host: the instantiate payload equals the draft bindings. **Browser** (payload) and the existing round-trip test.

## 4. UX-M1.2: one draft-preserving setup journey

Finalized **2026-09-30**, before UX-M1.2 was implemented. Source read: `GraphTemplateBindings`, `GraphTemplateRecipeBindings`, `GraphRecipeReadStatus`, `GraphContextBar`, `GraphSetupPanel`, `GraphProjectRecipes`, `GraphRecipeForm`, `graphWorkflowView`, `useGraphRecipes`/`readGraphRecipeSnapshot`, `graphDraftStore`, `graphEngineeringViewStore`, and the Host `recipes` handler (`app/service.ts`).

### 4.1 What exists today, and the gaps

Already correct and **kept unchanged**: check choices are stored in the draft (`bindings.recipes`, `recipeGroups`, `buildMappings`) by stable recipe id, not by list position; the checks editor draft (`workspaces[key].recipes`) and its digest conflict handling; single-flight, sequence-guarded recipe reads (`readGraphRecipeSnapshot`, a late read cannot overwrite a newer snapshot or another workspace); `templateBindingErrors` blocks Review when a selected check is missing or incompatible; "Set up checks" and "Back to new run" already exist; the Host refuses `recipes save` while any graph is unresolved (`"Project recipe edits are blocked while a graph is unresolved."`, `app/service.ts`) and re-verifies recipe digests during a run.

Gaps this milestone closes:

1. The New-run pane shows a `<select>` per Build/Test step but not what the chosen check _is_ (name, kind, saved/not run) nor a way to open **that** check. The context bar shows only the project-wide count.
2. Every unresolved selection shows one sentence and the select silently displays "Choose a compatible check", so the stored id is not visible and "missing" and "incompatible" are not distinguished.
3. The route to the editor opens the first check and the return control scrolls away with the page. Entering the Checks tab from the New-run pane offers no return, and a stale `returnToWorkflow` value can survive navigation.
4. While a run is unresolved the editor's **Save checks** button looks usable; the Host then refuses it with a raw error. (Checks _editing_ stays allowed; only the save is blocked.)
5. The context bar does not say that model, mode and saved checks are the settings of the **next** run, not the current one.

### 4.2 Ownership (no new store, no second editor)

| State or rule                                      | Single owner                                                                                          |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Which check a step uses                            | draft store `bindings.recipes`/`recipeGroups`/`buildMappings` (unchanged)                             |
| What saved checks exist                            | Host recipe store, read through the existing `recipes` interface (unchanged)                          |
| Unsaved edits to saved checks                      | draft store `recipes` (unchanged)                                                                     |
| Which check the editor opens and where "Back" goes | view store selection: `mode`, `returnToWorkflow` and a new renderer-local `checkId` (navigation only) |
| Whether a step's selection is valid                | new pure `graphCheckSelection` over (template, bindings, snapshot); never writes anything             |
| May checks be saved                                | Host (authoritative). The renderer refuses earlier using the same projection (`graphAdmission`)       |

### 4.3 Rules

1. **Selected checks are visible per step.** Under each Build/Test step the New-run pane shows, for every selected check id in group order: name, kind, and `Saved · not run` (or the existing "needs attention" state), and an **Edit check** action. A step without a selection shows "No check selected". A workflow without Build/Test steps keeps its existing statement that configured test evidence is not included; nothing says or implies that tests passed.
2. **Unresolved selections are explicit and block Review.** Each stored id is classified `resolved`, `missing` (not in the saved checks) or `incompatible` (saved but not usable for this step). Unresolved ones show the stored id, the reason, and an **Open Checks** action. They are never replaced, dropped or auto-selected, even when exactly one compatible check exists. The existing `templateBindingErrors` remains the blocker; the row is the explanation.
3. **One editor, one route.** **Edit check**, **Set up checks** and the context bar's Checks chip all open the existing Checks destination. Entering it from the New-run pane sets `returnToWorkflow`; entering it from anywhere else clears it. **Edit check** also sets `checkId`, and the editor opens that check (matching `id`) and moves focus to its first field. No modal, no second editor.
4. **Back is always reachable.** While `returnToWorkflow` is set the editor shows a sticky bar with **Back to new run** and a note that the request, context and check choices are kept. Back leaves the pane exactly as it was (the draft never left the store).
5. **Draft-preserving failure and cancel.** Cancelling, navigating away, a failed or conflicting save, a failed re-read and a workspace switch never change the request, workflow, references or check selections. Only an explicit, successful save changes saved checks.
6. **Save authority is unchanged and visible.** While a run is unresolved, **Save checks** is disabled with a reason, and `saveRecipes` refuses at the hook (defence in depth; the Host still enforces the same rule and re-verifies digests during a run). Editing the checks text stays allowed. Nothing about the running definition, its recipes or evidence is touched.
7. **After an explicit save** the recipe snapshot is refreshed through the existing interface and each step re-resolves by **stable id**: a selection survives only if that id still exists and is compatible. Renaming a check keeps the selection (the label updates); removing or making an id incompatible turns it into an unresolved row.
8. **Next-run wording.** The context bar is labelled as the configuration of the next run, and its Checks chip is the project-wide count; the per-step rows above are what this workflow will use.
9. **Preflight uses what is shown.** Review instantiates from the draft's normalized bindings; the preflight is built from the instantiated definition, so the checks in the review are exactly the selected, resolved ones. A stale, unresolved or missing selection prevents Review before any Host call.
10. **Late replies.** A recipe read that resolves after a save, a refresh or a workspace switch is discarded (existing sequence guard); it never writes another workspace's or template's draft.

### 4.4 Acceptance and how each is verified

1. Selected checks per step (name, kind, Saved · not run) match the draft. **Browser** (generic workflow, real recipe store) and **unit** (`graphCheckSelection`).
2. Edit check opens the right check; Back returns to the identical draft. **Browser**: view-store selection, focus, draft-store equality before and after.
3. Missing, incompatible and unselected steps are explicit and Review stays blocked with no `wf.instantiate`/`wf.prepare`. **Browser** (Host call log) and **unit**.
4. A rename keeps the selection; a removal does not auto-replace it, even when another compatible check exists. **Browser** with a real save through the real recipe store.
5. Cancel, failed save (injected failure) and revision/digest conflict leave the draft untouched. **Browser**.
6. Saving is refused while a run is unresolved (no `graph.recipes.save` reaches the Host), then allowed once resolved. **Browser**; hook guard by **mutation test**.
7. Instantiate and prepare payloads equal the visible choices; the review lists the same checks. **Browser** (payloads and review text).
8. Late reads (after switch or after save) do not overwrite. **Browser** with held Host operations.
9. Copy is localized in English and Simplified Chinese; check names, ids, commands and paths are not translated. **Unit** (message keys) and **Browser** (zh-CN pass).

## 5. UX-M1.3: keyboard, localization and state clarity

To be finalized before implementation (see the plan, section 6).

## 6. Verification approach and fixtures

Real components and hooks are mounted in real Chromium with the repository's own Vite and `playwright-core` (no new dependency). Fixture boundaries, disclosed in every result: the Graph engineering and workflow services (a controllable in-memory Host that records every call and uses the real `instantiateTemplate` and recipe validation), the run records (`summaryRun()`, documented as unit-only captured records), the native environment preview and file search (as in the Context picker harness), and two labelled module stubs that are irrelevant to this milestone: the composer's model/mode configuration hook and the Workflows design panel. No native runtime, permission owner or Electron is involved; this is not Windows acceptance.

## 7. Out of scope (recorded, not implemented)

Concurrent runs, queues, auto-start, permission policy, exact pending-permission payloads, reviewer retry, Chat "Run as a workflow…", new schemas or stores, persistence of drafts across restarts, and translation of executable instructions.
