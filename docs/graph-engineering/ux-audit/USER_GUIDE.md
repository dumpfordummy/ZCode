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
2. Choose the **Workflow**. Enter the **request** (what should be done). Documents, instructions and skills go under **Context**, not in the request.
3. Under **Checks**, choose the saved Build and Test. They are configuration: "Saved · not run". Nothing has run.
4. **Review and run.** This uses the existing save and preflight mechanisms and shows the exact snapshot inline. Nothing executes yet. If the form is unchanged since the last review, no new workflow revision is created.
5. Read the review. The statements the preflight cannot verify are listed first. Tick the acknowledgment (it is per run and starts unticked), then **Start run**. Start stays disabled until you tick.

**Save as workflow only** creates the workflow without reviewing or running it.

One run at a time can own the workspace. While one is unresolved the form is disabled and says why, with a **View run** action.

## Repeat a request

Open a run and choose **Start a new request from this one**. The form is pre-filled from that run's captured parameters and bindings. The bindings are checked against today's saved checks and references, so they may need correction. **Nothing starts** until you review and press Start.

## When a run needs you

A **Needs you** strip appears on every destination while a run waits for a permission, a question or an approval. It is built from the complete run list, not from the visible page of history.

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

Every Graph control is reachable by keyboard and shows a border and fill when focused (the application resets the standard outline globally). Navigation announces the current destination. English and Simplified Chinese are supported, and so are Zai Dark and Zai Light. Built-in workflow names, parameter labels and step names are translated for display only; captured definitions and identities are never changed.

## Known limits

See [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md).
