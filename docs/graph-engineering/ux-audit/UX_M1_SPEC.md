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

To be finalized before implementation (see the plan, section 5).

## 5. UX-M1.3: keyboard, localization and state clarity

To be finalized before implementation (see the plan, section 6).

## 6. Verification approach and fixtures

Real components and hooks are mounted in real Chromium with the repository's own Vite and `playwright-core` (no new dependency). Fixture boundaries, disclosed in every result: the Graph engineering and workflow services (a controllable in-memory Host that records every call and uses the real `instantiateTemplate` and recipe validation), the run records (`summaryRun()`, documented as unit-only captured records), the native environment preview and file search (as in the Context picker harness), and two labelled module stubs that are irrelevant to this milestone: the composer's model/mode configuration hook and the Workflows design panel. No native runtime, permission owner or Electron is involved; this is not Windows acceptance.

## 7. Out of scope (recorded, not implemented)

Concurrent runs, queues, auto-start, permission policy, exact pending-permission payloads, reviewer retry, Chat "Run as a workflow…", new schemas or stores, persistence of drafts across restarts, and translation of executable instructions.
