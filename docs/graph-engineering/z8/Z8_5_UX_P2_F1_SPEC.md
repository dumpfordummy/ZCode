# Z8.5-UX-P2-F1 — operator-clarity follow-up to UX-P2

A **separate, additive** presentation follow-up. It is stacked on the frozen UX-P2 head
`bfd80aadfc542011ba33752273a25c3b0415c23f` (PR #26, branch `claude/operator-first-run-views-qee24s`)
and does not modify #26, #25, #24 or the integration branch. It is **not** part of the currently
approved combined tree (`ecb71be2af9ecb0804e7602f362921a2bdfd1fe8`); that tree never contained these
changes and must not be described as if it did.

Public DTOs, RPC signatures, run/step/evidence/approval/inspection enums, permission semantics,
admission/Save/review/approval handlers, saved stores, scope derivation (sourceScope v1/v2/v3),
`observationValid`, acceptance/evidence generation, the Test runner and timeout/freshness policy are
**frozen**. This lane changes what is said and which control leads, never what is true or allowed.

## Owners and invariants

| Fact                                            | Owner (unchanged)                   | F1 rule                                                                                  |
| ----------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------- |
| Run status, attempt status, evidence, approvals | Host run record → `graphRunSummary` | Render only. Wording is chosen from existing summary fields; no outcome is derived.      |
| Native permission / question / ownership        | Native session                      | Graph never answers it. A disagreement is shown as _unconfirmed_, never resolved.        |
| Draft (request, context, check choices)         | `graphDraftStore`                   | No new writers. A route only moves focus.                                                |
| Saved checks, Save, prepare, review, Start      | `useGraphProjectSetup`, Host        | Untouched. Passive viewing never saves, runs, prepares, answers or starts an inspection. |
| Disclosure open/closed, focus                   | Local component state / DOM         | Moving focus calls no service.                                                           |

Never collapsed into one green check (kept from UX-P2): _running_, _waiting for native permission_,
_waiting for a human decision_, _Test failed_, _evidence invalid_, _stale evidence_, _uncertain
ownership_, _completed without Test evidence_.

## Findings, classification and rules

Each finding was reproduced in the real components with identical synthetic fixtures on the frozen
UX-P2 head before any production edit (`scripts/graph-engineering/ux-p2f1-*.mjs`).

| #   | Observed on frozen UX-P2                                                                                                                                                         | Class                                | Rule in F1                                                                                                                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | No saved checks: the Checks row and the blocked footer both offer `Set up project checks`.                                                                                       | Misleading duplicate                 | The Checks row owns the only `Set up project checks` control (id `graph-template-setup-checks`, used by native drivers). The footer offers a **locator**, not a second command: `Go to first field`.                                                                                                     |
| 2   | 10 unresolved fields, 2 of them checks: the footer's only route is `Set up project checks`, which resolves 2 of 10. P2 had replaced `Go to first field` in every no-checks case. | Misleading next step (P2 regression) | The footer route again leads through the unresolved list. It targets the first field that can be acted on **now**; a check field with no saved check is not actionable (its select has no options), so it routes to the Checks row's setup button. The count and the full unresolved list are unchanged. |
| 3   | Run `Running` with an attempt `WaitingForUser` / `Unknown` / `Interrupted` / `CancelRequested`: "agent work is running · Nothing is needed from you right now."                  | Misleading (synthetic only today)    | Fail closed. A run that says `Starting`/`Running` while a current attempt is waiting or unconfirmed never claims "nothing is needed": the banner follows the attempt, is a warning, and the Execution fact names the attempt status. No approval is invented; no action is added or hidden.              |
| 4   | `Unverified or invalid evidence … 1 discovered · 1 passed · 0 failed · 0 skipped`; with no counts a row of dashes.                                                               | Ambiguous raw counts                 | Counts under anything other than accepted passing/failing evidence read **"Reported by the test runner, not accepted: …"**, in the subtle tone, with `data-accepted="false"`. A row with no reported count is not shown. Accepted passed/failed counts are unchanged.                                    |
| 5   | End cursor: `end · Inspect step` stays on non-Completed runs, `Current step: end` is hidden for every status.                                                                    | Inconsistent                         | One predicate (`graphSettledAtEnd`) = status `Completed` **and** cursor End hides both. Every other status keeps both, so a stopped, failed, interrupted, cancelled or NeedsHuman run is never shown as "No action required" and an End cursor is never read as completion.                              |
| 6   | UX-P2 report: "Checks-setup page text identical before/after".                                                                                                                   | Inaccurate report wording            | Behaviour unchanged. The F1 report adds a prospective correction; the original report and evidence are left as written.                                                                                                                                                                                  |

### Reachability of finding 3

`Sequencer`/tool observers assign `run.status` from the attempt status in the same persisted record
(`run.status = node.status`), except when the run is already `Interrupted`. So `Running` beside a
waiting/unconfirmed attempt is **not produced by the current writers**; it can come from a restored,
imported or hand-edited record or a future writer defect. The reachable disagreement is the opposite
one (run `Interrupted`, attempt later observed `WaitingForUser`/`WaitingForPermission`); that already
renders truthfully ("Execution interrupted; outcome unconfirmed" with the native conversation as the
primary action) and is asserted unchanged. The F1 rule is therefore defensive presentation, labelled
as such, not a claim that a live mismatch was observed.

### Status matrix (finding 3, run status `Starting`/`Running`)

| Current attempt status                  | Banner                                                                                         | Tone / icon    | Actions                                                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------- |
| Running / Starting / Completed / none   | Stage sentence + "Nothing is needed" (UX-P2)                                                   | progress       | Unchanged (conversation outline, Cancel)                                                                 |
| WaitingForPermission                    | Permission block (UX-P2, unchanged)                                                            | warning/shield | Conversation primary (unchanged)                                                                         |
| WaitingForUser                          | "Question waiting: …" (the consistent-state title)                                             | warning/alert  | Conversation primary + question help (unchanged)                                                         |
| Unknown / Interrupted / CancelRequested | "{step}: the native status is “{status}” while the run says Running. Treat it as unconfirmed." | warning/alert  | Conversation primary, `inspectUnknown` guidance; recovery controls only for a run-level uncertain status |

### End-cursor matrix (finding 5)

| Run status (cursor at End)                                                                                                                                                     | `Current step: end` | `end · Inspect step`                                             | "No action required" |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- | ---------------------------------------------------------------- | -------------------- |
| Completed                                                                                                                                                                      | hidden              | hidden                                                           | shown (if no action) |
| Failed, Cancelled, Interrupted, Unknown, NeedsHuman, Rejected, StaleEvidence, BudgetExhausted, NoProgress, CancelRequested, Running, Starting, Waiting\*, AwaitingContinuation | shown               | shown (unless a gate/failed/invalid check already owns the step) | never                |

### New run next-action ownership (findings 1 and 2)

- One control sets up checks: the Checks row. With no saved checks it leads (outline) and Refresh
  steps back (ghost); with saved checks nothing changes.
- The blocked footer never repeats that command. Its reason text, `data-blocked-by`, disabled
  Review/Save and the unresolved-fields list are unchanged. Its route is `Go to first field`
  (`graph-go-to-first-field`) → focus only.
- Unresolved-list buttons for a check field with no saved check use the same focus target.
- No click in this lane saves, prepares, runs or edits a field.

## Default view: information kept and removed

Kept (safety / decision value): exact command, ordered arguments, read scope and expiry before any
authorization; failed Test vs invalid evidence vs reviewer failure; human-approval request and
Approve/Reject; native permission and question wording; the unsaved-check notices; the full
unresolved-fields list and count; `graph-tool-reportFresh`/`reportParsed` readable through
`innerText` (Evidence checks stays open).

Removed or reworded because it was duplicate or contradictory: the footer's second `Set up project
checks`; "Nothing is needed" next to a waiting/unconfirmed attempt; the all-dash counts row; the
unlabelled raw counts under invalid evidence.

Made longer on purpose: a mismatched run (one execution note), a non-Completed End-cursor run (one
`Current step` fact), reported counts under invalid evidence (one label).

## Contracts kept

Every `data-testid`, `data-state`, `data-status`, `data-tone`, `data-blocked-by` value and every
exact native-driver label is kept, with these deliberate exceptions: the P2-only footer id
`graph-new-run-setup-checks` is **removed**, and `graph-go-to-first-field` is **restored** for the
no-saved-checks case. `graph-run-current-step` / `graph-run-show-step` return for non-Completed End
cursors (they were absent in P2 and present in #25). New: `graph-run-attempt-status` (note on the
Execution fact when attempt and run disagree).

Out of scope and unchanged: services, native CLI, Host ownership/admission, RPC, sourceScope v1/v2/v3,
stores, evidence generation, permissions, timeout/freshness, workflow configuration, root
dependencies, lockfile; the global/non-Graph focus indicator and the conflicting light-hover
contrast measurements (separate, not authorized here).

## Acceptance scenarios

Same synthetic fixtures on the frozen UX-P2 head and on F1, English/Chinese, light/dark, 1366×768,
1093×614 and 900×640; keyboard Tab/Enter/Space/Escape, focus after a route, no clipped control or
horizontal overflow.

New run: no saved checks with 2 blockers; no saved checks with 10 blockers (2 checks); no saved
checks, other fields complete; saved checks with fields open; valid.
Run: Running; attempt WaitingForUser / WaitingForPermission / Unknown / Interrupted / CancelRequested
under a Running run; consistent WaitingForUser; Interrupted with WaitingForUser; End-cursor matrix
(Completed, Failed, Cancelled, Interrupted, NeedsHuman, Running); failed Test; invalid evidence.
Step: failed Test (accepted failing), invalid evidence with and without counts, accepted pass.

Negative controls: viewing, routing by `Go to first field`, expanding every disclosure and changing
tabs cause no Save, instantiate, prepare, run, conversation open, answer, inspection start or edit;
the draft and the Review gating are unchanged.
