# Z8.5-UX-P2 — operator-first New run and Run/step surfaces

Presentation-only follow-up to UX-P1, stacked on the frozen UX-P1 head
`79fa0bbf54c329fdb9674408be5fbe2b69ec0373` (PR #25). It is a separate, additive proposal: it does not
change, retarget or re-validate #24/#25 and is **not** part of the currently approved combined tree.
Public DTOs, RPC signatures, run/step/evidence/approval/inspection state enums, permission
semantics, admission/Save/review/approval handlers, saved stores and scope derivation are
**frozen**. This lane changes what is shown first and how clearly the next action reads, not what is
true or what is allowed.

## Owners and invariants

| Fact                                       | Owner (unchanged)                   | UX-P2 rule                                                                                              |
| ------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Run/step state, evidence, human approval   | Host run record → `graphRunSummary` | Render only. New wording is chosen from existing summary fields; no new derivation of any outcome.      |
| Approval request, decision, Approve/Reject | `GraphApprovalInspector` + Host     | Handlers, arguments, enable rules and the sticky commit bar are untouched.                              |
| Native permission, native conversation     | Native session                      | Graph never answers it; wording stays "answer it in that conversation".                                 |
| Draft (request, context, check choices)    | `graphDraftStore`                   | No new writers; tab changes keep it.                                                                    |
| Saved checks, Save, prepare, review, Start | `useGraphProjectSetup`, Host, hook  | Untouched. Passive viewing never saves, runs, calls a model, starts an inspection or asks a permission. |
| Disclosure open/closed                     | Local component state               | Expanding never calls a service.                                                                        |

Never collapsed into one green check: _running_, _waiting for native permission_, _waiting for a
human decision_, _Test failed_, _evidence invalid_, _stale evidence_, _uncertain ownership_,
_completed without Test evidence_. A completed run is not a verified result; saved configuration is
not executed verification; a stopped or failed run never reads as if an approval were requested.

## Information map

### Default (always visible)

- Run: title, the one banner (state, the one next action), step strip, the three fact rows
  (Execution, Test evidence, Human decision), and the current step **while the run is not settled**.
- Step: the verdict sentence, the failing or invalid cause, the test counts, the way to the owning
  conversation, and for a human gate the exact review text, workspace, the successor and the
  Approve/Reject bar with its reason.
- New run: request, selected workflow identity line, context chips, selected Build/Test, the one
  blocker with its one route, and the primary Review action.
- Before authorizing execution (inline review, inspection command review): exact executable,
  ordered arguments, scope, side-effect warning, expiry. **Unchanged in this lane.**

### Details (existing disclosures; nothing deleted, all keyboard-reachable `details`/`summary`)

Request id/version and comment-policy rows of a human gate (next to the existing request
correlation JSON), the per-check evidence facts and the generic explanation of what they mean,
operation JSON, session/operation/runtime ids, digests, frozen recipe.

## Changes

### Run and step

1. **Running banner names the stage.** While nothing needs the operator, the banner says which step
   is running and whether it is agent work or a configured check, and states that nothing is needed
   (`Implement parser fix: agent work is running` / `Build: running the configured check`). The
   conversation, step and Cancel actions stay, but a session that is merely running is no longer
   the accent-filled primary action (nothing waits on the operator, so no false urgency);
   permission, question and uncertain-ownership sessions stay primary. Permission, question,
   approval and continuation banners keep their existing titles and tones.
2. **Uncertain ownership no longer reads as an approval defect.** When a run's outcome is unconfirmed
   (Interrupted / Unknown) and no approval request, decision or dispatched gate exists, the Human
   decision fact reads "Undetermined — the run's outcome is unconfirmed" instead of "the approval
   record is incomplete or unresolved". The state (`data-state="unknown"`) is unchanged; any real
   request, decision or stale gate keeps the original wording.
3. **Stale evidence says why.** The stale-evidence banner gets the existing approval-inspector
   explanation (the evidence or graph changed; the historical request is preserved; start a new run
   for a new review) so the banner is a complete statement, not a title and a button.
4. **No End-node noise on settled runs.** When the current step is the terminal End node, the
   banner no longer offers `end · Inspect step` and the facts no longer repeat `Current step: end`.
   The End node stays in the step strip and the Steps list.
5. **Tool (Build/Test) step leads with the verdict.** Order: outcome, evidence verdict, the failing
   or invalid cause, the test-count sentence (replacing the `1 / 0 / 1 / 0` row; Test steps only),
   then the open conversation action. The six Yes/No evidence facts, the verifier classification
   and the generic "these are separate facts" explanation sit under one `Evidence checks`
   disclosure with the same `data-testid`s. It is **open in every state**: a Windows native driver
   reads `graph-tool-reportFresh` with `innerText` on a completed, passing Build step, and text
   inside a closed `details` reads as empty. Collapsing passing facts by default is reported as a
   future dependency, not done here. The operator can still collapse it by keyboard.
6. **Human gate inspector.** The opaque "Request and version" row and the optional comment-policy row
   move into the existing request-correlation disclosure. A _required_ comment policy stays in the
   default view. The review text, workspace, successor, evidence, comment field, Approve and Reject
   and their blocked reason are unchanged.

### New run

7. **Compact checks status.** The saved-checks status line and its Refresh / Set up actions share
   one row; the status sentence states the count and no longer repeats "does not mean they ran"
   (each selected check already reads `Saved · not run`, the header reads `5 saved · not run`, and
   the review states "Saved checks only"). The `graph-recipe-read-state` element, its
   `data-state` values and both button test ids are unchanged.
8. **The Build relationship appears only when it can matter.** `Build relationship: <name>` is
   shown only when the workflow binds more than one Build step; with a single Build step it is
   the Advanced disclosure's content only. The Advanced disclosure still opens by itself when the
   mapping is unresolved.
9. **No saved checks: the route is the next action.** When the saved checks were read and the list
   is empty, the blocked-by-fields footer offers `Set up project checks` instead of `Go to first
field` (the first field would be an empty select). The reason text, `data-blocked-by="fields"`,
   disabled Review/Save and the unresolved-fields list are unchanged.

## Contracts that block further simplification (kept; reported as future dependencies)

These are asserted by existing browser suites or read by Windows native drivers, so they are **not**
changed here. A future owner-coordinated pass could simplify them.

| Surface                                                                                                                  | Why it stays                                                                               |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Two unsaved-check notices (block + row marker)                                                                           | UX-M2.2 asserts both ids/text; native drivers read `Unsaved edits in Checks`.              |
| Footer "Not ready to review: N to complete or correct" plus the unresolved-fields list                                   | UX-M1/M4 assert the sentence and `graph-template-unresolved` text.                         |
| `Nothing starts until you confirm` next to Review and `This run will use …`                                              | UX-M3/M4 assertions.                                                                       |
| Selected-check row `Name Kind · Saved · not run [Edit check]`                                                            | `stepRows` reads its exact text.                                                           |
| Execution / Test evidence / Human decision fact rows and their wording (`Stopped after Test failure`, `Not requested …`) | UX-M4 and U1 assert them; native drivers read ids and `data-state`.                        |
| Banner `No approval was requested…` (failed Test / invalid evidence / reviewer output)                                   | Safety contract (UX-M4); never implies an approval is pending.                             |
| Needs-you scope note                                                                                                     | UX-M1.3 contract (`graph-needs-you-scope` count).                                          |
| "Not visited in this run" chips stay visible buttons                                                                     | Native drivers click `graph-select-node-<id>` and cannot click inside a closed disclosure. |
| Inline run review (digests, provenance, command recipes)                                                                 | It is the authorization surface; exact arguments and scope must be reviewable.             |

## Selector and driver contract (Codex-owned drivers read-only)

Kept: every `data-testid`, `data-state`/`data-status`/`data-tone` value, the exact English labels of
the inspection actions, `graph-review-run`, `graph-library-instantiate`, `graph-go-to-first-field`
(except when no checks exist, item 9), `graph-run-show-step` (except on an End node, item 4),
`graph-tool-<fact>` text (now inside a disclosure that is **in the DOM**, not removed). Behavioural
differences a driver could see are listed in the report.

## Acceptance scenarios

Rendered with the real components in the existing Host harness, **identical synthetic fixtures before
(untouched #25 head) and after**, English/Chinese, light/dark, 1366×768, 1600×900 and 1093×614:

New run valid · blocked (missing field, occupied by a run, empty request, no saved checks) · unsaved
checks · command review · draft survives Checks and back · run running · waiting for native
permission · waiting for a human decision (with and without checks) · genuine Test FAIL · invalid
evidence · stale evidence · successful Build/Test · agent-only completion · executor uncertain ·
invalid reviewer output · inspection verifying / awaiting permission / denied / executor lost · step
details (failed Test, invalid evidence, human gate, running step).

Negative control: passive viewing, opening disclosures and changing tabs produce **zero** Save,
instantiate, prepare, run, inspection start, permission request or conversation open.

Acceptance is truthful state and an obvious next action, not a word count. A render with less text
but a hidden failure, an unclear next action or a changed contract fails.

## Out of scope

No service/shared/CLI change, no Graph Host, process control, native permission, RPC/protocol,
draft/saved store, role/decision or domain-evidence change, no workflow/CI change, no lockfile or
root package change, no global design-system primitive change, no native or installer run, no new
engine support. Codex-owned `eng-p1*`, `ux-m1-helpers.mjs` and the inherited UX-M2/context-picker
harness are read-only here.
