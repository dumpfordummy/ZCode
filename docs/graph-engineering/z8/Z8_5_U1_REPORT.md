# Z8.5-U1 — run-view usability

Implemented against integration `claude/zcde-graph-ux-audit-be80d8` at
`1df2770c9d01e66df627d752a5b1fc6df92e3a96`, on feature branch
`codex/z8-5-u1-run-view`. Original local implementation commit:
`c75c6889fa4d3269b4279bf13172da62f5530212`.
[Source digests](evidence/u1/source-digests.json) identify the rendered UI and harness
sources. [Contract](Z8_5_U1_SPEC.md) precedes the implementation.

Source upload and one draft PR were explicitly authorized on 2026-10-05. The
original local head was `9c42a5d022392b660b81004b7b34d21bfd87765c`. Four check logs
contained six local checkout-path occurrences; these were replaced with `<repo>`
for public upload, preserving all other log text. The original commits remain on
a local backup branch; the upload commit excludes their unredacted history.
Product source, tests, screenshots and measurements are unchanged. The final PR
head, base, tested merge identity and actual required CI results are recorded in
the PR description. No release publication or merge is authorized.

The graph-width fix looks materially improved. Information reduction still needs
review in step-list mode, where Routing inspection, Persisted route checkpoints
and Export metadata manifest remain visible. Word counts alone do not establish
overall usability acceptance.

The operator reports successful installed-pilot connectivity to the intended LLM.
This is operator-reported connectivity, not independently observed Graph workflow
or test evidence. W1 and Z8.4-I1 remain accepted within their recorded scopes.

## Cause and change

At the integration source, Runs capped the detail area at `max-w-5xl`. At a 1600px
viewport, Steps put its first child into a `minmax(14rem,22rem)` column and gave the
rest to the inspector. The graph was that first child: the rendered canvas was
only 352px wide. Its 0.85 minimum zoom also prevented Fit from containing long
graphs. Before screenshots reproduce these source observations with synthetic data.

Graph mode now occupies the complete detail width. A content-container query
accounts for the app sidebar and history, which can be collapsed. Below 54rem of
available Runs width, history becomes a bounded list above the detail. Only the
step-list mode uses the two-column trail/inspector layout. Step details open below
the graph on demand and return keyboard focus when closed. Height is
`clamp(20rem,60vh,42rem)`; typography sizes are unchanged.

Explicit Fit contains the captured sequential/branch/repair graph. Focus selected
step restores at least 85% zoom. First reveal waits for measured nodes and a
nonzero viewport. The canvas mounts on first graph use, stays mounted across
detail tabs and graph hide/show, and resets by run identity when changing runs.
Host refreshes do not recenter it. The existing view store owns selection;
React Flow owns the transient viewport. No execution or persistence owner changed.

## Rendered evidence

[Full before/after gallery](evidence/u1/GALLERY.md) contains 52 paired views plus
two additional interaction frames (106 PNGs). Each frame has a same-name JSON
record of viewport, sidebar, detail and canvas rectangles, selected run/history
IDs, canvas transform and visible text. Both sides use identical synthetic
records and the same fixture Host. The baseline renderer reads the exact integration
UI source in an isolated local source snapshot; it does not change the checkout.

| CSS viewport | Before canvas (px) | After canvas (px) | After detail width (px) |
| ------------ | ------------------ | ----------------- | ----------------------- |
| 1366 × 768   | 809.8 × 320        | 828.8 × 460.8     | 828.8                   |
| 1600 × 900   | 352 × 784.1        | 1020 × 540        | 1020                    |
| 1920 × 1080  | 352 × 784.1        | 1340 × 648        | 1340                    |
| 1093 × 614   | 561 × 320          | 793 × 368.4       | 793                     |

All cases reserve a 268px application sidebar, use browser zoom 100% and DPR 1.
The 1093 × 614 case is an equivalent reduced CSS viewport for approximately
1366 × 768 at 125% scaling; real Windows display scaling was not exercised.
Graph captures use the same scroll-to-canvas action, so their headers can be above
the viewport. State captures start at the top. Fit can reduce graph zoom to show
all nodes; selected-node captures retain readable zoom without smaller font tokens.

At 1600 × 900, English default-view word counts changed as follows. This measures
the active Graph view's DOM `innerText` (including content below the viewport,
excluding hidden tabs and collapsed disclosures), not only screenshot pixels.

| State                   | Before | After | Reduction |
| ----------------------- | ------ | ----- | --------- |
| Running                 | 477    | 371   | 22%       |
| Permission waiting      | 506    | 391   | 23%       |
| Failed Test             | 491    | 393   | 20%       |
| Completed without tests | 414    | 334   | 19%       |
| Awaiting final approval | 452    | 350   | 23%       |

English/dark and Chinese/light frames cover all five states at every viewport.
Visual review confirmed readable labels, reachable controls, the full-width graph,
separate execution/evidence/human facts, failure and permission actions, and the
completed fixture's explicit lack of tests and human approval. The full gallery
also includes New run at every viewport. [Measurements](evidence/u1/measurements.json)
provide the unrounded rectangles and counting method.

## Information map

| Stays visible                                                                                             | Moved or removed                                                                                                        |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Exact task title, captured workflow, current status and next action                                       | Duplicate selected-workflow header and next-run context removed from selected runs                                      |
| Execution, test evidence, reviewer result when present, human decision and current step as separate facts | Facts arranged in a compact responsive grid                                                                             |
| Captured file-change count and literal result preview                                                     | Full original request/output remain in Request and result; check/file details remain in Evidence                        |
| Permission wait, configured command label, Open conversation                                              | Duplicate permission explanation removed; exact permission stays in its conversation                                    |
| Failure headline, original diagnostic, no-approval reason, inspection/recovery actions                    | Supporting retained-result facts in Result details; stop explanation remains when stop is requested or recorded         |
| Active workspace in the application header                                                                | Full path remains in Technical details and the captured-workflow tooltip                                                |
| Selected node/attempt and routing stop/continue reason                                                    | Full resolved instructions in a disclosure; routine admission/deadline/usage facts in the existing iteration disclosure |
| New run fields, configured checks, blocked reasons, review, acknowledgment and explicit Start             | Workflow description in Workflow details; redundant routine workflow help removed                                       |

No model prompt, generated response, evidence classifier, acceptance rule,
runtime/protocol, credential, dependency, check setup or installer changed.

## Validation

Repository-pinned Node 24.14.0 and pnpm 10.33.2 were used. The rendered tests use
installed Chrome 154.0.8037.95 on Windows x64 through the existing Playwright/Vite
component harness. Its real components and hooks use synthetic run records,
fixture service boundaries and the existing labelled configuration/design stubs.
This is rendered browser evidence, not Electron/native execution acceptance.

| Check                                     | Result                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| Focused `packages/ui/test/graph*.test.ts` | 233 passed; zero failures/skips                                           |
| U1 paired render runs                     | Before 3/3; after 4/4                                                     |
| UX-M1 browser suite, unchanged tests      | 30 scenario entries passed, zero failed                                   |
| UX-M2 browser suite, unchanged tests      | 18 scenario entries passed, zero failed                                   |
| UX-M4 browser suite, unchanged tests      | 22 scenario entries passed, zero failed                                   |
| `pnpm typecheck`                          | Passed                                                                    |
| `pnpm lint`                               | Zero errors; 75 existing warnings retained                                |
| Changed-file formatting                   | Passed with repository oxfmt                                              |
| `pnpm architecture:check --changed`       | Zero violations, zero baseline entries, zero new                          |
| Required PR CI                            | Recorded against the final PR head in the draft PR description and checks |

The existing browser suites were run without their optional screenshot flags;
their capture-only entries return without producing images. Those entry counts
are not additional visual evidence. U1 produced the complete gallery above.
Logs and JSON summaries are in [evidence/u1](evidence/u1/).

The new interaction scenario exercises Fit containment, focus zoom, keyboard node
and repair-group selection, opening/closing details, historical attempt choice,
exact prompt expansion, pan/zoom, a completed Host refresh, detail-tab return,
resize, history collapse and run switching against a deliberately different
current workflow. It asserts unchanged captured records and zero save/run/model/
tool/approval admissions from view interactions. Existing suites retain their
permission, malformed/stale evidence, rejection, explicit review/Start and
historical-run checks. No existing fixture, test assertion, CI selector,
aggregator or historical evidence was rewritten.

To reproduce U1 with the repository-pinned toolchain in PowerShell:

```powershell
$env:TSX_TSCONFIG_PATH = 'packages/ui/tsconfig.json'
$env:U1_BASELINE = '1'
node --import tsx scripts/graph-engineering/u1-browser.mjs --chromium='C:/Program Files/Google/Chrome/Application/chrome.exe' --shots=.tmp/u1-before --summary=.tmp/u1-before/summary.json
Remove-Item Env:U1_BASELINE
node --import tsx scripts/graph-engineering/u1-browser.mjs --chromium='C:/Program Files/Google/Chrome/Application/chrome.exe' --shots=.tmp/u1-after --summary=.tmp/u1-after/summary.json
```

## Review boundary and operator check

No merge, auto-merge, release publication, tag, signing, NSIS build or installed
pilot replacement. This PR is a bounded pilot improvement, not full Z8.5 completion
or release approval. Build/Test quick setup, credential redesign, Sandbox/Task
Manager investigations and previously accepted gaps remain deferred.

For a separately identified candidate, the brief operator check is:

1. Open a captured run, choose View run graph, Fit, select a step, and open/close
   Step details. Confirm graph width, labels, selection and history at the usual
   window size; use Hide run history if useful.
2. Read one run screen and confirm the task, status, next action, actual test
   evidence and human decision are clear. Expand the original result if needed.

Installation/connectivity need not be repeated for this review. Company-PC visual
acceptance and any distribution of a newly identified candidate remain separate.
