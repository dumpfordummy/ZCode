# Graph Engineering: current user guide

This guide describes the navigation and flow **as implemented in this working tree**. It replaces the tab names in [`pre-z8/USER_GUIDE.md`](../pre-z8/USER_GUIDE.md) (Workflows / Design / Runs / Project setup) for everyday use. Everything that guide says about drafts, versions, references, conditions, bounded repair, recovery and evidence still applies; only where you find it changed.

Graph is for structured, repeatable, supervised work. Chat is for interactive work. Both use the same native coding-agent runtime, workspace, tools and permission configuration.

## Where things are

| Destination   | What it is for                                                                                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Runs**      | Start a run (**New run**), see what needs you, supervise, read results, repeat a request.                                                                                                                          |
| **Workflows** | Edit the graph: Guided/Advanced, canvas, bindings, conditions, bounded repair, the **Workflow library** (choose, versions, transfer) and **New request** for the current design. Node positions are not rewritten. |
| **Checks**    | The saved project checks: a list plus **one** selected editor. Project scan and the .NET preset are under it, as ways to add checks.                                                                               |

A bar under the tabs always shows the effective model, mode and the saved-check status for the next run. Changing them is still done where it always was (Workflows → Workspace defaults).

## Run something

1. Open **Graph Engineering**. You land on **Runs → New run**.
2. Choose the **Workflow**. Enter the **request** (what should be done). Documents, instructions and skills go under **Context** (see _Add context_ below), not in the request.
3. Under **Checks**, choose the saved Build and Test for each step. Each choice shows the check's name, its kind and "Saved · not run", with an **Edit check** action (see _Checks for this workflow_ below). They are configuration; nothing has run. A workflow without Build/Test steps says that configured test evidence is not included, and never implies that tests passed.
4. **Review and run.** This uses the existing save and preflight mechanisms and shows the exact snapshot inline. Nothing executes yet. If the form is unchanged since the last review, no new workflow revision is created.
5. Read the review. The statements the preflight cannot verify are listed first. Tick the acknowledgment (it is per run and starts unticked), then **Start run**. Start stays disabled until you tick.

**Save as workflow only** creates the workflow without reviewing or running it.

One run at a time can own the workspace. While one is unresolved you can still **prepare the next task**: the request, context and check choices stay editable and are kept (see _Prepare the next task while a run is active_). Only starting is blocked.

When **Review and run** is unavailable, the reason is shown beside it (in the bar that stays at the bottom of the form), with the way to fix it: **Go to first field** for a missing required field, context or check, **View current run** when a run owns the workspace. A failed review (for example a preflight error) is shown in the same bar. The longer list of fields to complete stays above it.

## Prepare the next task while a run is active

While a run waits for a native permission, a native question or the final approval, the workspace is still owned by that run, but the form is not locked:

- Enter the next request, choose its context and checks. Nothing is instantiated, saved as a workflow, preflighted or started, and the running run's request, evidence and approval are not touched.
- **Review and run**, **Save as workflow only** and **Start** are disabled with the reason and **View current run**. They are refused on every path, not only by the disabled buttons.
- Your draft survives visiting Workflows, Checks, the current run and its conversation, and switching workspace. **New run** returns to it.
- When the run resolves **nothing happens automatically**: it is not reviewed, acknowledged or started. Press **Review and run** yourself; you get a fresh preflight and an unticked acknowledgment.

There is no queue and no concurrent run. The Host still admits one unresolved run.

## Checks for this workflow

Under each Build/Test step of the workflow you chose, the New run form lists the check that step will use: name, kind and "Saved · not run". The count in the bar under the tabs ("Checks 5 saved") is the whole project, not what this workflow uses; the bar is labelled "For the next run".

- **Edit check** opens the one Checks editor on that check. A bar at the top stays in view with **Back to new run** and a reminder that your request, context and check choices are kept; Back returns to the control you came from.
- A choice refers to a check by its id. If the check was renamed the choice stays. If it was removed, or no longer fits the step, the row shows the id and why ("no longer in the saved checks", "cannot be used for this step") with **Open Checks**, **Review and run** stays disabled, and nothing is replaced for you, even when another compatible check exists. Choose again yourself.
- Cancelling, a failed save and a conflicting save leave your request, workflow, context and check choices as they were.
- While a run is unresolved, **Save checks** is disabled with its reason (the Host refuses it too). You can still edit; the edits stay as a draft.

## Add context

Under **Context**, each kind of reference the workflow accepts (for example _Additional project instructions_ or _Existing native skill_) is a **slot** that holds **one** item. A slot that holds something is shown as a chip: what it is, which steps use it ("Used by Analyze, Implement"), and its status. The line above the chips says how many slots are set and how many required slots are still empty.

1. Press **Add context**. To change a chip use its **Replace**; for an empty required slot use **Choose…**.
2. Under **Add to**, pick the slot. If it already holds something the picker says that selecting a result **replaces** it. Only the slot you chose changes.
3. Type to search the workspace. For instructions, the native instruction files are listed first; for skills, the loaded skill list is shown and can be filtered. Move with ↑ ↓ and press **Enter** to select. **Nothing is selected until you move to a result and press Enter**, and Enter never starts the run. **Esc** closes the picker and puts the focus back where you opened it.
4. A file is checked by the Host when you select it. If the check fails (empty file, over 100 KB, outside the workspace) the reason is shown beside the slot and your previous selection is kept. Cancelling or closing the picker changes nothing.

A chip's status is only what the Host has established:

- _Already delivered as native instructions_: the Host matched this file to an instruction the native session already loaded (same path, digest and size).
- _Explicit read reference_: the agents will read the file. If the native session was not available, the Host's own note says delivery is Unknown; nothing is called "inherited".
- _Not checked yet_: the value came from a saved draft, **Run again** or the Advanced field. It is checked when you review the run.
- Skills show _Available native skill_, _Disabled or unverifiable_ (listed but not selectable), _Unknown_ (not in the loaded list) or _Skill list not loaded_.

**Remove** (✕) empties a slot. If it was **required**, the slot comes back as "required, nothing selected", **Review and run** stays disabled, and the field is named under the request; a required slot never turns into an optional one.

**Advanced** keeps one text field per slot with the raw value (a path or a skill id), stored exactly as typed and checked at review. Every value, including ones the picker cannot validate, still appears as a chip, and a saved value for a slot this workflow version does not declare appears as a chip marked "not accepted" that you can remove.

Limits: chip statuses from a check last only for the current session; the Context controls stay editable while a run is unresolved (only review and start are blocked); the Workflows editor's per-step reference field is unchanged.

## Repeat a request

Open a run and choose **Start a new request from this one**. The form is pre-filled from that run's captured parameters and bindings. The bindings are checked against today's saved checks and references, so they may need correction. **Nothing starts** until you review and press Start.

## When a run needs you

A **Needs you** strip appears on every destination while a run waits for a permission, a question or an approval. It is built from the complete run list this Host returned for this workspace, not from the visible page of history, so it still finds a waiting run that is on another page. It says so: it is not a queue across workspaces or other Hosts.

- **Permission.** Graph cannot answer it. **Open conversation** takes you to that step's own conversation, where you use the ordinary Allow / Deny. The run shows the step's _configured_ command, labelled as configuration and not as the exact request; the exact request is in the conversation.
- **Back to run.** In a Graph-owned conversation, **Back to run** returns to the same workspace, run and step. It does not answer anything.
- **Approval.** Open the run, then **Review captured approval request**. A comment is required. The decision is recorded against the exact request id, version and digest. Approving records consent; it does not commit or publish.

## Read a result

Each run shows three separate facts: **Execution**, **Test evidence** and **Human decision**. The decision can be _Pending_, _Not reached yet_, _Not requested_, _Approved_, _Rejected_ or _Unknown_, derived from the gate's own record.

When a run stops, one block says what was rejected, the recorded diagnostic and what is still true from captured facts:

- **Reviewer output rejected** (for example prose or a code fence around the JSON, or an unbound evidence reference). This is not a `needs_changes` verdict. No approval was requested.
- **Test failed.** The reviewer is not started.
- A **valid** `needs_changes` or `needs_human` is a reviewer decision: the run continues to the pending human gate.

The **Steps** list shows what actually ran, in order, with repair iterations labelled. Nodes never reached are listed apart. **View run graph** shows the frozen definition read-only.

## Keyboard, language, theme

Every Graph control is reachable by keyboard and shows a border and fill when focused (the application resets the standard outline globally). Navigation announces the current destination. Focus follows the moves you ask for: **View current run** and **Go to run** put focus on the run summary, **New run** on the request field, and **Back to new run** on the control that opened the Checks editor. Nothing else moves focus (not a refresh, not a Host event). There is no shortcut that skips review; Enter in the context picker only selects, and Esc only closes. English and Simplified Chinese are supported, and so are Zai Dark and Zai Light. Built-in workflow names, parameter labels and step names are translated for display only; captured definitions and identities are never changed.

## Known limits

See [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md). For the UX-M1 additions (draft while running, checks for this workflow, keyboard/state clarity) see [UX_M1_REPORT.md](UX_M1_REPORT.md): they were verified on Linux Chromium with a fixture Graph Host; **Windows native acceptance is pending**.
