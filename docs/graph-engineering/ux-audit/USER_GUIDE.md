# Graph Engineering: current user guide

This guide describes the navigation and flow **as implemented in this working tree**. It replaces the tab names in [`pre-z8/USER_GUIDE.md`](../pre-z8/USER_GUIDE.md) (Workflows / Design / Runs / Project setup) for everyday use. Everything that guide says about drafts, versions, references, conditions, bounded repair, recovery and evidence still applies; only where you find it changed.

Graph is for structured, repeatable, supervised work. Chat is for interactive work. Both use the same native coding-agent runtime, workspace, tools and permission configuration.

## Where things are

| Destination   | What it is for                                                                                                                                                                                                                                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Runs**      | Start a run (**New run**), see what needs you, supervise, read results, repeat a request.                                                                                                                                                                                                                              |
| **Workflows** | Edit the graph: Guided/Advanced, canvas, bindings, conditions, bounded repair, the **Workflow library** (choose a workflow, inspect versions, save, export, import) and **New request** for the current design. It shows which workflow and version the current design started from. Node positions are not rewritten. |
| **Checks**    | The saved project checks: a list plus **one** selected editor. Project scan and the .NET preset are under it, as ways to add checks.                                                                                                                                                                                   |

**Layout.** The three destinations share one row of tabs. New run, Workflows and Checks show the workflow name and **For the next run · Model … · Mode … · Checks N saved**. The model and mode are read-only here (change them in Workflows → Workspace defaults); **Checks** opens the Checks destination. A selected run instead shows its task and captured workflow once, followed by its own status and facts. **Hide run history** gives the detail area more room; **Show run history** restores the same list and selection. With a narrow content area the history becomes a bounded list above the detail area. The canvas uses the available detail width, while the New run form keeps its reading width.

## Run something

1. Open **Graph Engineering**. You land on **Runs → New run**.
2. Choose the **Workflow**; its longer description is under **Workflow details**. Enter the **request** (what should be done). Documents, instructions and skills go under **Context** (see _Add context_ below), not in the request.
3. Under **Checks**, choose the saved Build and Test for each step. Each choice shows the check's name, its kind and "Saved · not run", with an **Edit check** action (see _Checks for this workflow_ below). They are configuration; nothing has run. A workflow without Build/Test steps says that configured test evidence is not included, and never implies that tests passed.
4. **Review and run.** This uses the existing save and preflight mechanisms and shows the exact snapshot inline. Nothing executes yet. If the form is unchanged since the last review, no new workflow revision is created.
5. Read the review. The statements the preflight cannot verify are listed first. Tick the acknowledgment (it is per run and starts unticked), then **Start run**. Start stays disabled until you tick.

**Save as workflow only** creates the workflow without reviewing or running it.

The bar at the bottom of the form is the only place with actions. When the form can be reviewed it says "Ready to review. Nothing starts until you confirm." "Ready" means you may go on to the review; it does not mean any check has run or passed. On a short form the bar sits right under the form; on a long one it stays at the bottom of the window.

One run at a time can own the workspace. While one is unresolved you can still **prepare the next task**: the request, context and check choices stay editable and are kept (see _Prepare the next task while a run is active_). Only starting is blocked.

When **Review and run** is unavailable, the reason is shown beside it (in the bar that stays at the bottom of the form), with the way to fix it: **Go to first field** for a missing required field, context or check, **View current run** when a run owns the workspace. A failed review (for example a preflight error) is shown in the same bar: first what that means ("Review could not be prepared. Nothing was started; your request, context and check choices are kept."), then the Host's own message, unchanged. A failed **Start** in the review says "Start did not complete" and asks you to check the run list before starting again. It does not claim that nothing started, because a lost reply can hide an admitted run. Only failures of reviewing and starting appear in these bars. A failed check save, a cancel or a decision stays where it happened. The longer list of fields to complete stays above it.

## Find recent work

The run list shows the **newest run first**, by the order in which runs were created (a run's later progress never moves it). It pages 25 runs at a time with **Newer runs** and **Older runs**. Each row has a status icon and words (for example _Waiting for native permission_), the time, the workflow and the test evidence; the selected row has an accent bar.

- Opening a run on purpose shows its page, even if you had paged away from it: **Start**, **Go to run** (Needs you), **View current run** and **Back to run** all do this.
- A refresh or an update from the Host never changes the page you are on, the selected run or where the keyboard focus is. If a new run arrives while you are on an older page, the rows on that page shift by one.
- Times are shown in the app's language, in your time zone. A run without a recorded time says "Time not recorded".

## Prepare the next task while a run is active

While a run waits for a native permission, a native question or the final approval, the workspace is still owned by that run, but the form is not locked:

- Enter the next request, choose its context and checks. Nothing is instantiated, saved as a workflow, preflighted or started, and the running run's request, evidence and approval are not touched.
- **Review and run**, **Save as workflow only** and **Start** are disabled with the reason and **View current run**. They are refused on every path, not only by the disabled buttons.
- Your draft survives visiting Workflows, Checks, the current run and its conversation, and switching workspace. **New run** returns to it.
- When the run resolves **nothing happens automatically**: it is not reviewed, acknowledged or started. Press **Review and run** yourself; you get a fresh preflight and an unticked acknowledgment.

There is no queue and no concurrent run. The Host still admits one unresolved run.

## Checks for this workflow

Under each Build/Test step of the workflow you chose, the New run form lists the check that step will use: name, kind and "Saved · not run". The count at the end of the tab row ("Checks 5 saved") is the whole project, not what this workflow uses; that line is labelled "For the next run".

- **Edit check** opens the one Checks editor on that check. A bar at the top stays in view with **Back to new run** and a reminder that your request, context and check choices are kept; Back returns to the control you came from.
- A choice refers to a check by its id. If the check was renamed the choice stays. If it was removed, or no longer fits the step, the row shows the id and why ("no longer in the saved checks", "cannot be used for this step") with **Open Checks**, **Review and run** stays disabled, and nothing is replaced for you, even when another compatible check exists. Choose again yourself.
- Cancelling, a failed save and a conflicting save leave your request, workflow, context and check choices as they were.
- While a run is unresolved, **Save checks** is disabled with its reason (the Host refuses it too). You can still edit; the edits stay as a draft.

### Unsaved check edits

Edits in the Checks editor are a draft for this workspace until you press **Save checks**. **They are never used by Review or by a run**: those always use the saved checks.

- **Back to new run** returns at once and keeps the draft. The bar says that unsaved edits stay in Checks and are not used by the next run. Nothing asks you to save or discard when you leave, and nothing stops you from going to a waiting run.
- In New run, a line says that Checks has unsaved edits and that Review uses the saved checks shown. A selected check that you changed (or removed) in the draft is marked; the row still shows the saved check.
- In the Checks editor, changed and new checks are marked in the list, and a summary above **Save checks** lists every added, changed and removed check by name and id, including edits made on earlier visits. **Save checks** writes that whole list. If the list cannot be summarized (for example the raw JSON is invalid), the summary says so; Save still validates first and refuses an invalid list.
- **Discard all unsaved check edits…** asks for confirmation and names its scope: every check returns to the saved checks, not only the one that is open. **Keep editing** changes nothing. Discard needs the saved checks to be loaded; while they could not be read it is disabled with the reason. When the saved checks were changed elsewhere (a conflict), use the conflict's own **Discard edits and use loaded checks**.

## Add context

Under **Context**, each kind of reference the workflow accepts (for example _Additional project instructions_ or _Existing native skill_) is a **slot** that holds **one** item. A slot that holds something is shown as a chip: what it is, which steps use it ("Used by Analyze, Implement"), and its status. The line above the chips says how many slots are set and how many required slots are still empty.

1. Press **Add context**. To change a chip use its **Replace**; for an empty required slot use **Choose…**.
2. Under **Add to**, pick the slot. If it already holds something the picker says that selecting a result **replaces** it. Only the slot you chose changes.
3. Type to search the workspace. For instructions, the native instruction files are listed first; for skills, the loaded skill list is shown and can be filtered. Move with ↑ ↓ and press **Enter** to select. **Nothing is selected until you move to a result and press Enter**, and Enter never starts the run. **Esc** closes the picker and puts the focus back where you opened it.
4. A file is checked by the Host when you select it. If the check fails (empty file, over 100 KB, outside the workspace), the picker says which file could not be used and whether the previous selection was kept (or that nothing is selected in this slot), followed by the Host's reason, unchanged. A file from **Choose file…** is named by its file name; the full path is in its tooltip. Cancelling the file chooser, or closing the picker, changes nothing and is not shown as a failure. If the file chooser itself fails, the picker says so and keeps the previous selection.

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

## Reusable workflows

**Workflows → Workflow library** is one dialog. On the left is the list of workflows, grouped **Yours** and **Built-in**. On the right is the selected workflow with four tabs: **Versions**, **Use**, **Share** and **Advanced**. The footer is always visible: **Open in Runs** (the main way forward) and **Load into design**, with the reason beside them when one is unavailable. If **Load into design** cannot proceed, the footer says why in terms of that operation (for example "3 required fields need configuration in Use" with **Open Use**, or that a run owns the workspace); field-level readiness is on the Use tab. A failure (for example a revision conflict) appears directly above the tabs, with **Refresh library**, and a success message from an earlier action disappears as soon as the next action starts or fails. Changing tabs keeps what you typed and any preview you reviewed.

- **Versions.** One row per version the app offers: **Version N**, **Latest** (only when a workflow has several), **Used by current design** (only when the design's own record names that workflow, version and definition) and a creation date for your own versions. There is no generic "current version". Your own versions are immutable and each one can be chosen. A built-in lists only what the app offers today; a version it no longer offers is not recreated.
- **New run** says which workflow and version the next run will instantiate ("This run will use … · Version N · Built-in"). When a workflow has several versions, a **Version** choice appears there too.
- **Use.** **Load into design** puts the chosen version into the Workflows design (it asks before replacing unsaved edits). **Open in Runs** opens New run with the chosen workflow and version; it never reviews or starts anything.
- **Share** holds three separate tasks. **Save current design** saves the design shown in Workflows as a new workflow or as a new version of one of yours; the target is chosen there (by default the workflow the design started from), and before you confirm it says if the save includes your unsaved design edits and if it would rename the workflow. **Export a version** names the exact `Workflow · Version N` and never includes the unsaved canvas. **Import a file** is three steps: choose, preview and review, then save with an explicit target. Everything is previewed and reviewed (tick the review box) before anything is saved, and the previews do not change the library.
- After a save, a new version or a duplicate, the result is selected and named ("Saved: X · Version N is now selected"). For a built-in use **Duplicate to edit**; built-ins cannot be archived or given versions.
- **Advanced** holds the technical identities (version digest, library revision), **Refresh library** and **Manual JSON** for environments that cannot select a file. A library conflict ("revision changed") shows **Refresh library** next to the error; your reviewed preview is kept.

While a run owns the workspace you can browse workflows, inspect versions and preview. Loading a design, creating, versioning, duplicating, archiving, importing-and-saving and **exporting to a file** are refused, each with its reason and **View current run**. **Open in Runs** is allowed (it only navigates).

### A run that used a version that is no longer offered

**Start a new request from this one** on a run whose workflow version the library does not offer now (a built-in corrected since, or changed content) shows "Version N used by this run is no longer offered. Version M is available." instead of quietly showing another version. The run is untouched. **Continue with version M** copies only what matches by stable identity (parameter id and type, context role id and kind, step id of a check, repair region id), lists what was not carried, and keeps Review disabled while a required value is missing.

## When a run needs you

A **Needs you** strip appears on every destination while a run waits for a permission, a question or an approval. When you are already looking at that run, the strip is a quiet one-line pointer and the run's banner carries the action (there is no second Open conversation button). It is built from the complete run list this Host returned for this workspace, not from the visible page of history, so it still finds a waiting run that is on another page. It says so: it is not a queue across workspaces or other Hosts.

- **Permission.** Graph cannot answer it. **Open conversation** takes you to that step's own conversation, where you use the ordinary Allow / Deny. The run shows the step's _configured_ command, labelled as configuration and not as the exact request; the exact request is in the conversation.
- **Back to run.** In a Graph-owned conversation, **Back to run** returns to the same workspace, run and step. It does not answer anything.
- **Approval.** Open the run, then **Review captured approval request**. A comment is required. The decision is recorded against the exact request id, version and digest. Approving records consent; it does not commit or publish.

## Read a result

A selected run opens on its **banner**: one block that says what is happening or what stopped, and the one thing to do next (for example **Open conversation**, **Review captured approval request** or **Inspect the failing Test**, in the accent colour; the other actions are plain). Amber means it needs you or the outcome is uncertain; red is a real failure (a failed Test); green is a completed run. Each state is explained once, in the banner. Under it is a strip of the steps the run actually visited, then three facts kept apart: **Execution**, **Test evidence** and **Human decision**. A fact that does not apply (for example no configured Tests, or an approval never requested) is a quiet line, not an emphasised value. The decision can be _Pending_, _Not reached yet_, _Not requested_, _Approved_, _Rejected_ or _Unknown_, derived from the gate's own record; a run that stopped before a gate says _Not requested_, never _Pending_.

The compact facts keep execution, test evidence, reviewer outcome (when present) and human decision separate, alongside the current step and captured file-change count. A result preview quotes the captured text. The full original request and output are in **Request and result**; **Evidence** keeps checks and captured file changes; **Technical details** keeps captured identities, metadata and the full workspace path. The application header identifies the active workspace. Anything needed to decide is in the banner or the action bar, never only in a tab.

When a run stops, the banner keeps the failure and recorded diagnostic visible; **Result details** expands the supporting captured facts. If no approval was requested, that reason remains visible:

- **Reviewer output rejected** (for example prose or a code fence around the JSON, or an unbound evidence reference). This is not a `needs_changes` verdict. No approval was requested.
- **Test failed.** The reviewer is not started.
- A **valid** `needs_changes` or `needs_human` is a reviewer decision: the run continues to the pending human gate.

The **Steps** list shows what actually ran, in order, with repair iterations labelled. Nodes never reached are listed apart. **View run graph** shows the frozen definition read-only across the full detail width. **Fit graph** fits the complete graph; **Focus selected step** returns to readable node zoom. Pan, zoom and the node buttons navigate without saving positions. **Step details** opens the selected node or repair group's inspector below the graph; **Close step details** returns keyboard focus to the trigger. Full resolved instructions and routine routing facts expand in the inspector. Refresh and switching detail tabs keep the current viewport and historical attempt. Switching runs loads that run's captured graph.

## Keyboard, language, theme

Every Graph control is reachable by keyboard and shows a border and fill when focused (the application resets the standard outline globally). Navigation announces the current destination. Focus follows the moves you ask for: **View current run** and **Go to run** put focus on the run summary, **New run** on the request field, and **Back to new run** on the control that opened the Checks editor. Nothing else moves focus (not a refresh, not a Host event). There is no shortcut that skips review; Enter in the context picker only selects, and Esc only closes. English and Simplified Chinese are supported, and so are Zai Dark and Zai Light. Built-in workflow names, parameter labels and step names are translated for display only; captured definitions and identities are never changed.

## Known limits

See [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md). For the UX-M1 additions (draft while running, checks for this workflow, keyboard/state clarity) see [UX_M1_REPORT.md](UX_M1_REPORT.md) and their Windows acceptance in [UX_M1_WINDOWS_REPORT.md](UX_M1_WINDOWS_REPORT.md), including the items it records as blocked or not run. For the UX-M2 additions (newest-first history, unsaved check edits, failure explanations) see [UX_M2_REPORT.md](UX_M2_REPORT.md): they were verified on Linux Chromium with a fixture Graph Host; UX-M2 Windows acceptance is recorded in [UX_M2_WINDOWS_REPORT.md](UX_M2_WINDOWS_REPORT.md). For the UX-M3 additions (one library surface, version semantics, separate save/export/import, Open in Runs, historical pins) see [UX_M3_REPORT.md](UX_M3_REPORT.md): they were verified on Linux Chromium with a fixture Graph Host and the real workflow service; UX-M3 Windows acceptance is in [UX_M3_WINDOWS_REPORT.md](UX_M3_WINDOWS_REPORT.md). The UX-M4 visual system (scoped surfaces and accent, banner-first run detail, task-first New run, master–detail library) is described in [UX_M4_REPORT.md](UX_M4_REPORT.md) and the rules behind it are in [DESIGN.md](../../../DESIGN.md); its functional checks are automated, and its visual acceptance is the user's.
