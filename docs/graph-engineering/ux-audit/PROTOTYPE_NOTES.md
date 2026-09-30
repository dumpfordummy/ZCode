# Prototype notes

`prototype/index.html` is one self-contained file (inline CSS and JS, no dependencies, no network). Open it in any browser, or in Electron:

```powershell
node docs/graph-engineering/ux-audit/tools/capture-prototype.mjs   # captures + 30 interaction checks
node docs/graph-engineering/ux-audit/tools/record-prototype.mjs    # journey video
```

It reproduces the tokens of `.theme-zai-dark` / `.theme-zai-light` from `packages/ui/src/styles.css` and the `text-ui-*` scale; it introduces no colour, radius or type token. The frame around the Graph pane (sidebar) is static.

## Everything in it is synthetic

A permanent banner says so. No model, command, native session, artifact or permission exists behind any control. Nothing in the prototype, its screenshots or its video is native execution, a Graph acceptance result or evidence about live models. The native evidence in this folder is only the `screenshots/audit/` set, which is labelled as observations of the current app.

## The journey

Task entry → context and check selection → review (preflight) → running → **permission interruption** → result or actionable failure → new request.

Use **Prototype controls** (top right) to choose the outcome of the next run (passes / reviewer output rejected / Test fails) and to jump to a state for review. A jump seeds synthetic state; it is a shortcut, not an execution.

| Area                             | Functional in the prototype                                                                                                                                                                                                   | Simulated                                                                                                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request entry                    | Typing; Review disabled while empty; Ctrl/⌘+Enter opens Review; recent-request chips                                                                                                                                          | Recents come from seeded history                                                                                                                           |
| Workflow choice                  | Switching between Sequential engineering v2 and Agent-assisted changes steps, checks section and copy                                                                                                                         | Only two workflows exist                                                                                                                                   |
| Context                          | Inline picker with search; add and remove chips; AGENTS.md shown as inherited; request text is never modified by context changes                                                                                              | The file/skill catalog is a fixed list; no validation                                                                                                      |
| Checks                           | Build/Test selectors; saved checks shown as configuration with "Saved · not run"                                                                                                                                              | Commands are display strings                                                                                                                               |
| Review                           | Facts, 8 unknown statements (condensed wording), expected permissions, details; acknowledgment unchecked by default; Start disabled until ticked; sticky bar                                                                  | The digest and "since your last run" text are fixed strings                                                                                                |
| Running                          | Timed step progression; Cancel with confirmation; live region announcements                                                                                                                                                   | Timing, durations and "0 min ago" are fake; no real work happens                                                                                           |
| Permission                       | "Needs you" strip on every destination; permission block with tool and target or command; **Review in conversation** opens a mock native conversation; radio options with arrow keys; Confirm; focus moves to **Back to run** | The conversation is a mock labelled _simulated_; Allow only changes prototype state. In the product the answer is a native action and Graph never sends it |
| Result: pass                     | Approval block with reviewer decision, required comment, Approve / Reject enabled only with a comment; approved/rejected outcome text                                                                                         | No commit, merge or publish exists                                                                                                                         |
| Result: reviewer output rejected | Cause, "still true", actions; Evidence tab shows the rejected raw output with the offending part marked; decision reads **Not requested**                                                                                     | The output is a fixed synthetic string                                                                                                                     |
| Result: Test failed              | Cause, failing assertion in Checks, no reviewer step, **Not requested**                                                                                                                                                       | The assertion text is fixed                                                                                                                                |
| New request                      | **Run again** and the failure action pre-fill the form and start nothing                                                                                                                                                      | Prefill copies the seeded/synthetic run                                                                                                                    |
| Checks destination               | List + one editor, ordered argument fields, dirty state, Save/Revert, other checks unchanged                                                                                                                                  | Add check, Run this check now and scan/.NET are disabled placeholders                                                                                      |
| Workflows destination            | —                                                                                                                                                                                                                             | Labelled stub; see `DESIGN_DIRECTION.md`                                                                                                                   |
| Theme / language                 | Dark and light; English and Simplified Chinese for all Runs and Checks strings                                                                                                                                                | Chinese copy was written for the prototype and needs product review                                                                                        |
| Responsive                       | Single pane with back action under 1000px; no horizontal scroll at 390px                                                                                                                                                      | Narrow layout stacks the context bar; a production version needs a collapsed summary                                                                       |

## Interaction checks that ran (42, all passing)

`tools/prototype-check.json` records each assertion. They show the prototype behaves as described; they are not product tests. Notable ones:

- Acknowledgment and Start are visible **without scrolling at 1280×720** on Review (measured after resizing to that size: acknowledgment bottom 640, Start bottom 704, viewport 720).
- All 8 unknown statements are present on Review and nothing is pre-acknowledged.
- The permission alert names the tool and target before the user leaves Graph; the conversation has a way back and focus lands on it after Allow.
- Reviewer failure reads "no approval was requested" and the decision reads "Not requested".
- Tabs follow the arrow-key pattern; editing one check leaves the other unchanged.
- Keyboard focus changes border colour and fill while `outline` and `box-shadow` stay `none` (mirroring the product's global reset).
- No console or page errors.

Added after an independent exercise of the first prototype found four defects, each now fixed and covered by a check (12 new checks):

1. Agent-assisted approval no longer says "Build and Test passed" for a workflow with no checks.
2. Unsaved check edits survive selecting another check; the row is marked Unsaved; runs read only saved checks.
3. "Tell the model what to do instead…" is disabled and labelled "not available in this prototype" instead of acting as Allow.
4. Arrow keys move the permission choice (Allow / Deny, wrapping); Enter on Deny denies.

The prototype is a design reference only. The implemented product behaviour, and where it differs, is in [IMPLEMENTATION_SPEC.md](IMPLEMENTATION_SPEC.md) section 8.

Not checked: automated colour-contrast measurement (contrast was chosen from the tokens: labels stay in `--color-foreground`; `--color-warning` is used for icons and low-alpha surfaces, not text), screen-reader output, or real touch devices. The video `screenshots/prototype/journey-1280x720.webm` was recorded by the same script but was not played back frame by frame; the still frames are the inspected artifacts.

## Screenshot index

All at 1280×720 unless a 1920×1080 file exists. All files are in `screenshots/prototype/`.

| File                                     | Shows                                                                              |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| `p01-compose-returning` (+1920)          | Returning user: Needs-you strip for an old approval, runs list, empty new-run form |
| `p02-compose-context-picker`             | Inline context picker                                                              |
| `p03-compose-filled` (+1920)             | Request typed, context chip added, saved checks as "Saved · not run"               |
| `p04-review` (+1920)                     | Review step; commit bar visible                                                    |
| `p05-review-scrolled`                    | Review scrolled to the end                                                         |
| `p06-running`                            | Run in progress                                                                    |
| `p07-permission-wait` (+1920)            | Permission interruption in Graph                                                   |
| `p08-conversation-permission` (+1920)    | Mock native conversation with the permission card and Back to run                  |
| `p09-failure-reviewer-output` (+1920)    | Reviewer output rejected                                                           |
| `p10-failure-evidence`                   | Raw rejected output                                                                |
| `p11-new-request-prefilled`              | New run pre-filled from the failed run                                             |
| `p12-approval-gate` (+1920)              | Approval block                                                                     |
| `p13-failure-test` (+1920)               | Test failure                                                                       |
| `p14-checks` (+1920)                     | Checks list + editor                                                               |
| `p15-compose-zh`, `p16-review-zh`        | Simplified Chinese                                                                 |
| `p17-compose-light`, `p18-failure-light` | Zai Light tokens                                                                   |
| `p19-narrow-compose-390x800`             | 390px layout                                                                       |

## Known limits of the prototype

- The mock conversation is a stand-in. Whether Graph can show permission details outside the conversation is an open ownership question.
- Only one workflow's steps are modelled in depth.
- The unknown-behaviour text is condensed and labelled as such; production must keep the exact statements.
- The 390px layout works but spends most of a phone screen on chrome; a collapsed context summary is part of the implementation plan.
