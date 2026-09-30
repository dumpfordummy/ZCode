# Recommended design direction

Status: **approved 2026-09-30 with the corrections below; implementation is specified in [IMPLEMENTATION_SPEC.md](IMPLEMENTATION_SPEC.md).** The clickable prototype (`prototype/index.html`) demonstrates one journey of it with synthetic data.

Approved decisions and corrections (these override anything below that differs):

- Destinations **Runs / Workflows / Checks**, "New run" prominent, generic-first with game workflows as presets.
- Inline Review with a sticky acknowledgment/Start area; acknowledgment stays explicit, per run and initially unchecked.
- A Needs-you strip and a persistent **Back to run** in graph-owned conversations that restores the workspace, run and step.
- Permission information in Graph is read-only: the native owner's pending details if available, otherwise the configured command labelled as configuration. Graph never answers or authorises.
- The step trail is the primary Runs view, with an optional read-only **View run graph** of the frozen run definition; branches and repair loops are not flattened.
- Deferred: Chat composer "Run as a workflow…", reviewer retry. Focus is fixed in Graph and the touched Chat return-link surface only.
- "Review and run" is the single entry using existing save/instantiate/preflight; if that cannot be made safe without a service-contract change, keep the explicit creation step and report the gap.
- The repeat-run count (four interactions) is a target, not a measured result. The prototype's fixed claims (eight unknowns, three permission prompts, inherited AGENTS.md, unchanged configuration, passing checks or reviewer) must not be copied into production.
- Correction to the audit: Graph focus was already visible (`graphFocusClass`); see UX_AUDIT B7.

## The problem in one paragraph

Graph's four tabs are named after the system's parts (template form, graph editor, history, config). The user's job is a loop: describe a task, pick context and checks, review, supervise, answer interruptions, read the result, go again. Today that loop crosses three tabs and a modal, hides repeat work in a Design-tab disclosure, makes the user open the native conversation three times without a way back, and ends failed runs with an "inspect" button. The fix is to organise around the loop and to keep everything advanced where it is.

## Navigation

Three destinations, one persistent context bar, one interruption strip.

```
Graph Engineering
┌──────────────────────────────────────────────────────────────────────────────┐
│ ← Back to chat   Graph Engineering                                            │
│ [Workspace sample-engine ⧉] [Model default] [Permissions Ask] [Checks 2 saved]│  context bar
│ Runs (1)     Workflows     Checks                                             │  destinations
│ ⚠ Permission needed: Implement wants to edit zz-demo.txt   [Go] [Review in…] │  Needs-you strip (only while waiting)
├───────────────────────┬──────────────────────────────────────────────────────┤
│ [+ New run]           │  detail: new-run form | review | run                 │
│ Needs you             │                                                      │
│ Running               │                                                      │
│ Recent                │                                                      │
└───────────────────────┴──────────────────────────────────────────────────────┘
```

| Today                                                                          | Proposed                       | Note                                                                                                                       |
| ------------------------------------------------------------------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Workflows tab (template form + summary)                                        | **Runs**: new-run form         | Same fields, ordered by the job: request, workflow, context, checks.                                                       |
| Runs tab (history + selected run)                                              | **Runs**: list + run view      | Master-detail; the list is the history and the "Needs you" queue.                                                          |
| Preflight dialog                                                               | **Runs**: Review step (inline) | Same content and same acknowledgment; sticky commit bar.                                                                   |
| Design tab, Workflow library, versions, transfer, condition and repair editors | **Workflows**                  | Unchanged capabilities: Guided and Advanced, canvas, bindings, conditions, bounded repair, replace/discard/cancel dialogs. |
| Experimental parallel toggle in the header                                     | **Workflows** overflow         | Still reachable, out of primary chrome.                                                                                    |
| Project setup                                                                  | **Checks**                     | List + one editor; scan and .NET preset as "Add from scan / preset".                                                       |
| "New request" disclosure in Design                                             | **Run again** on any run       | Pre-fills the new-run form; never starts a run.                                                                            |
| Recovery, checkpoints, artifacts, identities                                   | Run view → Evidence            | Blocking warnings also appear in the result block, never only here.                                                        |

"Runs" is the name because the app's sidebar already uses "task" for a Chat session ("New task", "Tasks"); a Graph destination called Tasks would collide. _Task_ stays as the word for the request; a _run_ is one execution of it.

## Journeys

### Repeat run (the daily case)

| #   | Action             | Today                                              | Proposed                                                             |
| --- | ------------------ | -------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | Open Graph         | lands on Design                                    | lands on Runs, request focused                                       |
| 2   | Enter the task     | Design → expand New request → edit → Apply request | type it (or Run again / recent chip)                                 |
| 3   | Context and checks | disclosure per role, selectors                     | already shown, remembered from the last run; change inline if needed |
| 4   | Start review       | Save and run                                       | **Ctrl+Enter** or "Review and run"                                   |
| 5   | Confirm            | scroll a 1093px dialog, tick, Confirm              | tick and Start, visible without scrolling                            |

Seven interactions today (counted from the UI), four proposed.

### First run

Land on Runs with an empty list and the form. If there are no saved checks the Checks section says so and offers "Add a Build/Test check" or "Use the Agent-assisted workflow (no project checks)". The app never converts a verified workflow into an agent-only one on its own.

### Supervise and interrupt

Run view shows the step trail, the three verdicts, and the current block: running, waiting on a permission, or waiting on a decision. The strip carries the same call to action on every destination. A permission is answered in its native conversation; the conversation shows a persistent **Back to run**.

### Result

- **Waiting on you:** reviewer decision, checks, changes, required comment, Approve / Reject. Approval records consent; it commits and publishes nothing.
- **Reviewer output rejected:** headline, plain cause, "still true", and three actions. Not a `needs_changes` verdict.
- **Test failed:** same shape, with the failing assertion one click away and no reviewer.
- **Done:** Run again / New run.

### Reuse

Run again on a run; recent-request chips; workflow, context and checks carried across. Nothing starts until Review is confirmed.

## Wireframes

### W1 New run (Runs destination, nothing selected)

```
┌ Needs you ───────────┬─ New run ──────────────────────────────────────────┐
│ ⚠ Bump timeout …     │ What should be done?                               │
│   Waiting · 34 min   │ ┌────────────────────────────────────────────────┐ │
│ Recent               │ │ Modify zz-demo.txt file content to after       │ │
│ ✓ Add null check …   │ └────────────────────────────────────────────────┘ │
│ ✕ Rename retry …     │ This is the request. Documents go under Context.   │
│                      │ Recent: [Bump timeout…] [Add null check…]           │
│                      │ ── Workflow ────────────────────────────────────── │
│                      │ [Sequential engineering · v2 ▾]  Analyze → … → Approval│
│                      │ ── Context ─────────────────────────────────────── │
│                      │ (AGENTS.md inherited) [Context.md ×] [+ Add file/skill]│
│                      │ ── Checks · saved configuration, none has run ───── │
│                      │ Build  [Build demo ▾]   ◌ Saved · not run           │
│                      │ Test   [Test demo content ▾] ◌ Saved · not run      │
│                      │ ─────────────────────────────────────────────────── │
│                      │ Nothing starts until you confirm.  [Review and run] │
└──────────────────────┴────────────────────────────────────────────────────┘
```

### W2 Review (inline step, sticky commit bar)

```
│ ← Back to edit                                                              │
│ Review before you run                                                       │
│ Task · Workflow + steps · Context · Checks (commands) · Since last run      │
│ ── Unknowns you accept (8, grouped, verbatim in production) ──────────────  │
│ ── What will ask you: Edit zz-demo.txt · Build · Test · (approval later) ──  │
│ ── Details: workspace path · models · limits · preflight digest ──────────  │
│ ┌ sticky ─────────────────────────────────────────────────────────────────┐ │
│ │ ☐ I have read the 8 unknowns and accept them   [Back to edit] [Start run]│ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
```

### W3 Run view (block changes by state)

```
│ Modify zz-demo.txt file content to after            [Run again] [Cancel run]│
│ [Stopped · Reviewer output rejected]  Sequential engineering v2             │
│ Analyze ✓ › Implement ✓ › Build ✓ › Test ✓ › Review ✕ › Your approval ⊘     │
│ ┌ Execution ──┐ ┌ Checks ─────┐ ┌ Your decision ────────────────────────┐   │
│ │ ✕ Stopped   │ │ ✓ 1/1 passed│ │ ⊘ Not requested                       │   │
│ └─────────────┘ └─────────────┘ └───────────────────────────────────────┘   │
│ ┌ result block ─────────────────────────────────────────────────────────┐   │
│ │ ✕ Reviewer output was rejected. No approval was requested.            │   │
│ │ Why · Still true (Build/Test passed; file on disk) ·                  │   │
│ │ [Inspect reviewer output] [Open reviewer conversation] [New request…] │   │
│ └───────────────────────────────────────────────────────────────────────┘   │
│ Steps | Checks | Changes | Evidence        (one panel at a time, arrow keys) │
```

The block above the tabs changes with the state: permission (tool, target or command, one action to the conversation), approval (reviewer decision, comment, Approve / Reject), test failure, or a plain confirmation.

### W4 Checks (list + one editor)

```
│ Project checks       │ Test demo content                     Configuration only│
│ ▤ Build demo  Saved  │ Name [..........]  Kind Test                             │
│ ▤ Test demo   Saved  │ Executable [node]  Working dir [.]                       │
│ [+ Add check]        │ Arguments (ordered) 1 test.mjs  2 {operationId} …        │
│ (scan / .NET preset  │ Sources · Report path · Minimum tests · Required tests   │
│  live under Add)     │ [Revert] [Save check]      Run this check now (native)   │
```

## Why this shape, and what it costs

| Decision                                                     | Alternative rejected                      | Cost accepted                                                                                                                    |
| ------------------------------------------------------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Merge the Workflows form and Runs into one destination       | Keep four tabs and fix each               | One destination has two jobs; the form collapses to a one-line "New run" when a run is open.                                     |
| Master-detail inside Runs                                    | Run detail in a drawer or modal           | Needs about 1000px; below that it becomes one pane with a back action.                                                           |
| Inline Review step                                           | Keep the modal and make it scroll better  | A route change instead of a dialog; keeps context and lets the commit bar be sticky. A modal remains acceptable on phone widths. |
| Keep the per-run acknowledgment                              | "Remember my acknowledgment"              | One extra tick per run. Any change to that is a policy decision, not UX.                                                         |
| Permission stays in the native conversation, with a way back | Embed the native permission card in Graph | Two hops instead of one. Embedding may be feasible but needs an ownership review; not assumed.                                   |
| Implicit instantiate on "Review and run"                     | Keep "Create workflow" as a required step | Depends on confirming that repeated instantiation does not create duplicate definitions; if it does, the explicit save stays.    |
| A linear step trail in Runs, canvas only in Workflows        | Canvas everywhere                         | Users lose the graph picture during supervision; the trail carries state better at 1280 wide.                                    |
| Roving-tab detail views (Steps, Checks, Changes, Evidence)   | Accordions per field                      | Four names to learn; one panel visible at a time, so no nested disclosure.                                                       |
| Border and fill focus                                        | Restore outlines                          | Honours the current global reset; restoring outlines is a separate app-wide decision.                                            |

## Preserved boundaries

| Boundary                                                  | How the design keeps it                                                                                                                   |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Native agent and session ownership                        | Graph only opens the existing conversation; the prototype's mock conversation is labelled simulated.                                      |
| Strict reviewer output, bound evidence references         | Failure block shows the rejection and the raw output; nothing extracts or "repairs" it; no retry is offered.                              |
| Source freshness, historical definitions, pinned versions | Review shows the frozen snapshot; Workflows keeps version and transfer controls.                                                          |
| Approval semantics                                        | Approval stays a separate, commented, per-run decision over captured evidence; "Not requested" is added only for gates never dispatched.  |
| Conservative recovery                                     | Evidence view keeps checkpoint, recovery and release controls; Unknown work is still never replayed.                                      |
| Permission prompts                                        | Never bypassed; the strip and the run only point to them.                                                                                 |
| Advanced capability                                       | Guided/Advanced, canvas, conditions, repair policy, bindings, library, transfer, .NET preset, JSON view all stay, in Workflows or Checks. |

## Separate proposed workstream: permission policy

Three permission prompts per Sequential Engineering run is a real cost. Reducing it (for example, allow a saved check for the duration of one acknowledged run) is a **security and policy** change to native permission ownership. It is not designed or implied here. If wanted, it needs its own spec, threat review and native acceptance. This design only makes each prompt faster to find and return from.

## Open decisions for the review

1. Destination name **Runs** (recommended) versus another word that avoids "task".
2. Whether Graph may preview a pending native permission payload, or shows only Graph-known command data.
3. Whether "Review and run" may instantiate implicitly (see the table), or "Create workflow" remains a step.
4. Whether the Chat composer gets "Run as a workflow…" (a small, separate change).
5. Whether to revisit the global focus reset now, or ship Graph-scoped focus first.
6. Whether reviewer-output retry is worth its own design (out of scope here).
