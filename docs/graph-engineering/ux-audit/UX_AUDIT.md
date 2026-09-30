# Graph Engineering UX audit

Date: 2026-09-30. Checkout: `claude/zcde-graph-ux-audit-be80d8` at `558347d` (product source identical to the accepted Codex closeout tip; only handoff evidence differs). Product source was not modified by this audit.

## How this was gathered

Everything below was observed in the **real built Desktop app on this machine** (Electron 41.0.3, renderer built from this checkout), driven through the repository's existing native isolation helpers with the controlled loopback provider. Model replies are scripted; the edit, Build/Test, permissions, artifacts and gates are genuine native behaviour. This proves UI behaviour and native integration, not live-model behaviour. Historical closeout evidence was read as context and not counted as evidence here.

| Journey                                                                                                 | Tool                                       | Captures                         |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------- |
| First use: fresh profile, synthetic workspace, **no saved checks**                                      | `tools/tour-first-use.mjs`                 | `screenshots/audit/fu-*`         |
| Returning user: saved Build/Test, generic workflow v2, real run with three permission waits, final gate | `tools/tour-returning.mjs --scenario=pass` | `rt-pass-*`                      |
| Returning user: reviewer replies with prose plus a fenced JSON block                                    | `--scenario=prose-fence`                   | `rt-prose-fence-*`               |
| Returning user: genuine failing Test                                                                    | `--scenario=test-failure`                  | `rt-test-failure-*`              |
| Final gate, Project setup list, New request, keyboard/semantics probes, preflight geometry              | `tools/tour-extras.mjs --mode=gate`        | `ex-*`, `extras-notes-gate.json` |
| zh-CN layout                                                                                            | `tools/tour-extras.mjs --mode=locale`      | `zh-*`                           |
| Keyboard focus styles                                                                                   | `tools/focus-probe.mjs`                    | `focus-probe-*`                  |

Not covered: the current app in Zai Light (only the prototype was checked in both themes), non-Windows platforms, mobile web, any user other than the author, real model latency, a history with many runs (the table was seen with one run). Task-count figures below are counted from the observed UI steps, not measured with people.

Priorities: **P0** blocks or endangers the core task, or hides a blocker. **P1** repeated friction in the daily loop. **P2** consistency and polish.

## What already works and should be kept

- Task request and Context are separate, and saved checks say "Saved checks only. Results appear in Runs after execution."
- The selected run's three-part status (Execution / Test evidence / Human decision) separates facts that used to be conflated.
- A valid reviewer decision is distinct from an invalid reviewer output.
- The native conversation banner explains why a graph-owned session blocks extra prompts.
- Preflight acknowledgment is explicit, per run and defaults to unchecked.
- Runs history is a table; rows are keyboard-activatable; the request is visible in the row.

## Findings

### P0

**A1. A stopped run does not say why, what is still true, or what to do.**

- Task affected: understand a failed run and continue.
- Observed (`rt-prose-fence-09-final-runs-1280x720.png`, `rt-test-failure-09-final-runs-1280x720.png`): the same "Structured output validation failed…" sentence appears twice; the action button reads "Evidence invalid — inspect" although the Test evidence card says _passed_ and the thing that failed is reviewer output; the raw cause is "Invalid strict JSON value."; the third card says **Human decision: Pending** although no approval was ever requested (spec: failed reviewer or Test dispatches no gate); no action leads to a new request.
- Root cause (**confirmed in source**): `GraphRunActions.tsx:137` reuses `inspectInvalidEvidence` for invalid _output_; the same failure is rendered by both the overview line and the actions alert; `graphRunSummary.ts:64-75` and `228-238` give the gate/human state only `approved | rejected | pending`, so a gate that was never dispatched reads "pending". The parser message text is passed through unexplained (**hypothesis:** it is the persisted diagnostic string).
- Proposal: one Result block: headline naming what was rejected and that no approval was requested; plain-language cause; "Still true" (Build and Test result, files on disk); actions "Inspect reviewer output", "Open reviewer conversation", "Start a new request from this one". Add a `not-requested` human state. Raw output shown in the Evidence view with the offending part marked.
- Acceptance: at 1280×720 the headline, cause and primary action are visible without scrolling; Decision reads "Not requested" for prose-fence, unbound-report and test-failure runs; no message is rendered twice; "Evidence invalid" is never used for reviewer output; a valid `needs_changes` still shows a pending gate; existing summary and native scenario assertions updated first.

**A2. Preflight is a full-viewport wall with the commit controls below the fold.**

- Task affected: start every run.
- Observed (`rt-pass-06-preflight-1280x720.png`, `-1920x1080.png`; `extras-notes-gate.json`): at 1280×720 the dialog scrolls 1093px inside a 646px area; the acknowledgment checkbox sits at y≈844 and **Confirm at y≈1065 in a 720px window**. Eight identical "unknown behaviour" lines and an ungrouped provenance list precede them, unchanged on every run.
- Root cause (**confirmed**): `GraphRunConfirmation.tsx:42` `DialogContent className="max-h-[90vh] overflow-auto"` with `DialogFooter` inside the scrolling content, ack before the limits list and a raw-JSON `<details>`.
- Proposal: an inline Review step (not a modal) with a decision-first summary, unknowns grouped and listed once, "what will ask you", details last, and a sticky commit bar holding the acknowledgment and Start. Keep the acknowledgment explicit, per run and unchecked by default. An informational "since your last run" line is optional and must not pre-acknowledge anything.
- Acceptance: at 1280×720 the acknowledgment and Start are visible without scrolling; all unknown statements remain present verbatim in production; Start is disabled until the box is ticked; preflight digest and acknowledgment still reach `onConfirm` unchanged.

**A3. Permission interruptions leave Graph with no summary and no way back.**

- Task affected: supervise a run (three prompts per Sequential Engineering run: Implement Edit, Build, Test).
- Observed (`rt-pass-08-wait-build-runs-1280x720.png`, `rt-pass-08-wait-build-conversation-1280x720.png`): Runs offers "Build · Open existing native conversation" with generic help; the command and arguments appear only in the native permission card; after Allow nothing returns the user to the run. The user goes Graph → Runs → conversation → Allow → Graph → Runs three times.
- Root cause (**confirmed** for the missing return path; **hypothesis** for the preview): Graph opens the session but the conversation has no link back; whether Graph may read the pending permission payload is an ownership question, not yet answered. Graph does hold the recipe's declared executable and arguments.
- Proposal: a "Needs you" strip on every Graph destination; a permission block in the run showing tool and target/command (from Graph-owned data, labelled as such if the payload is not readable); a persistent "Back to run" in a graph-owned conversation. Approval stays a native action; Graph never answers it.
- Acceptance: from any Graph destination, the pending prompt is one action away and the way back is one action; a test proves Graph sends no permission response; a strip appears for permission, question and approval waits.

**A4. First use lands on the raw graph editor with an invalid draft.**

- Task affected: start the first task.
- Observed (`fu-02-graph-landing-1280x720.png`): Design opens showing a one-node "Agent Task" with an empty Instructions field, "Draft needs attention before Run", and a "Save and run" button still in the toolbar. Runs and Project setup are empty with only defensive text ("Saving or opening a graph does not start an agent task").
- Root cause (**confirmed**): `graphEngineeringViewStore.ts:26` defaults `mode: "design"`.
- Proposal: land on the run-entry surface with the request focused and the workflow, context and checks below it; empty states offer the next action.
- Acceptance: a fresh workspace opens on the entry surface; no "needs attention" message on first paint; an existing per-workspace remembered destination is still honoured.

### P1

**B1. Two stacked forms and two "run" verbs.**

- Observed (`rt-pass-04-workflows-instantiated-1280x720.png`, closeout `normal-workflows-1280x720.png`): after "Create workflow" the full template form remains above a read-only summary; "Create workflow", "Manage versions and transfer" and "Save and run" all sit on one page, and "Save and run" also exists in Design.
- Root cause (**hypothesis**): the page composes the library form and the summary as siblings without a create/edit state.
- Proposal: one primary "Review and run" that instantiates then reviews (behaviour equal to today's "Save and run"); "Save as reusable workflow" secondary; the workflow chosen is a compact selector.
- Acceptance: a repeat run needs four interactions (request, Ctrl+Enter, acknowledge, Start); today a repeat needs at least seven (Design → expand "New request" → edit → Apply request → Save and run → acknowledge → Confirm, plus a preflight scroll) and a first run from the Workflows form needs about fifteen, counted from the steps the native driver performs (`instantiateReviewer` + `startNativeTemplate`), including two to three disclosure expansions.

**B2. Adding context is three disclosures deep.**

- Observed (`rt-pass-03-workflows-context-open-1280x720.png`): "Documents, native guidance and skills" → per-role block → "Find workspace file / Search / Choose file…" and a nested "Advanced" raw path field. Copy uses internal words ("native guidance", node ids "analyze, implement").
- Root cause (**hypothesis**): reference roles are rendered from template metadata.
- Proposal: context chips with an inline picker (search files and skills, Enter to add); raw path and skill id remain, one level down on the chip.
- Acceptance: a workspace file can be added by typing and pressing Enter with no disclosure opened; skills show origin and enablement; existing validation errors surface next to the chip.

**B3. Repeating a task is hidden.**

- Observed (`ex-03-design-new-request-1280x720.png`): "New request" is a disclosure inside **Design** (`GraphDesignSections.tsx:29`), it "applies a new request to the current design", and history rows carry the workflow name as the emphasised text with the request as small secondary text.
- Proposal: "Run again" on any run pre-fills the entry surface (never auto-starts); recent requests as chips; the request is the primary text of a run row.
- Acceptance: from a finished run, one action opens a pre-filled draft with nothing started; the prior run is unchanged.

**B4. The effective configuration is invisible until preflight, and the workspace path is repeated.**

- Observed: the header wraps to two lines at 1280 (`fu-02`); the absolute path appears in the header, in the Workflows body and in the selected-run card; the model and permission mode appear only in the preflight "Resolved primary destinations" list; "Workspace defaults for the next run" is a disclosure in Design.
- Root cause (**confirmed** for the path repeat): `GraphEngineeringPanel.tsx:41-46` `break-all` header path, plus per-view repeats.
- Proposal: a context bar (workspace name with full-path title and copy, model, permission mode, saved-check status) on every Graph destination.
- Acceptance: those four facts are visible on every destination without opening anything; the path is shown at most once.

**B5. Project setup is a form wall with drifting names.**

- Observed (`fu-03-setup-1280x720.png`, `ex-02-setup-list-1280x720.png`): refresh, list, Discover, ".NET profile", **all** guided check forms expanded, Validate, "Save recipes", Advanced JSON, "Run project checks" stacked; the same object is "Project setup", "Set up build/test checks", "project checks" and "recipes".
- Proposal: a Checks destination: list on the left, one editor on the right; scan and .NET as "Add check from scan / preset"; "Save check" for the selected item; one noun.
- Acceptance: only the selected check's form is shown; editing one leaves the others byte-identical (existing native assertion kept); saving never executes.

**B6. The final approval sits under a summary and a canvas.**

- Observed (`ex-07-final-gate-1280x720.png`, `rt-pass-09-final-runs-1920x1080.png`): "Review captured approval request" moves the page only slightly; the decision controls are in the inspector below the canvas. "Cancel attempt" sits beside the primary action with equal weight.
- Proposal: the approval block is part of the run's result column with the reviewer decision, changes and a required comment; Cancel is separated from decisions.
- Acceptance: after activating the gate at 1280×720 the comment field and Approve/Reject are visible without further scrolling; the required-comment rule is unchanged.

**B7. Navigation has no state semantics, some controls are small, and focus coverage has gaps.** _(Corrected 2026-09-30 — the original finding said keyboard focus was invisible. That was wrong.)_

- **Correction.** Graph already scopes a visible focus style: `graphFocusClass` (`graphFocus.ts`, applied on the `GraphEditor` root) gives buttons, summaries, inputs, textareas and comboboxes a white border and blue fill on `:focus-visible`. The first probe read computed styles immediately after focus, while buttons have a 150 ms colour transition, and so recorded the pre-transition state. Re-measured after the transition settles (`focus-probe-notes.json`): border `rgb(255,255,255)`, fill `rgb(0,29,61)`. The global outline/box-shadow reset in `styles.css` is real, but it is worked around here.
- Still true (observed): `graph-view-*` buttons have no `aria-current`/`aria-selected` (`GraphEditorNavigation.tsx:41-51`); 17 buttons on the landing Design screen are 24px tall (`h-6`); the panel header (experimental `<summary>`, back button) is outside the `graphFocusClass` scope and showed no focus change; the Chat conversation surface has no Graph-scoped focus or return link.
- Proposal: keep `graphFocusClass`, extend it to the whole panel and to the Chat return link; `aria-current="page"`; controls ≥28px on touched surfaces. The app-wide reset stays a separate decision.
- Acceptance: each touched interactive control shows a perceivable focus change after the transition settles, in Zai Dark and Zai Light; navigation announces the current destination.

### P2

- **C1. zh-CN mixes languages** (`zh-01-workflows-1280x720.png`): the built-in workflow name, its description, "Explicit run request", "Build" and "Test configured criteria" stay English. _Hypothesis:_ built-in template metadata are English constants in `domain/workflow-samples.ts`. Fix by UI-owned message ids keyed by template id and version. Acceptance: no English product strings on the zh-CN entry screen (user text excepted).
- **C2. An experimental feature is in the primary header** (`GraphEngineeringPanel.tsx:26-40`). Move it out of primary chrome; keep it reachable.
- **C3. The Design canvas wraps onto two rows with a long diagonal edge and dominates the page** (`rt-pass-05-design-1920x1080.png`). _Hypothesis:_ saved positions for the last two nodes. Belongs to the Workflows destination work; positions must not be silently rewritten.
- **C4. Defensive empty states.** "No runs yet. Saving or opening a graph does not start an agent task." explains a non-event and offers nothing. Offer the first action.
- **C5. Repeated status text.** "Saved" appears twice in Design; "Edits apply to a future run" / "Frozen run" ride beside the tabs as small print.
- **C6. Graph-owned native sessions look like ordinary tasks** in the app sidebar with identical truncated titles (`rt-pass-08-*`; titles here come from the scripted provider). _Hypothesis:_ production titles differ but still do not say which step a session belongs to. Needs a native title-ownership review before any change.

## Chat handoff (in scope, observed)

- Graph → Chat: opening a graph-owned session works and the ownership banner is good, but nothing links back (A3).
- Chat → Graph: the ordinary composer has no way to turn a drafted prompt into a Graph run; the only entry is the sidebar item. Proposal: "Run as a workflow…" in the composer's overflow that opens the entry surface with the text as the request (never auto-run). Small, separate workstream because it touches the composer.

## Cross-cutting items to decide separately (not Graph-scoped)

1. The global focus reset in `styles.css` and its `forced-colors` branch remove all standard focus indicators for the whole app.
2. Permission policy (for example remembering an Allow for a saved check within one run). This audit **does not** propose bypassing permission prompts; any policy change is its own design, security review and acceptance.
