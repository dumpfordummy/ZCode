# UX-M4.2 – M4.4 specification: Focus-page visual system for Graph Engineering

Status: written before implementation (AGENTS.md: spec first). Direction: **A — Focus page**, with the user's refinements of the M4.1 review. The M4.1 boards establish the direction, not final product acceptance; none of the prototype's synthetic content is a production assumption.

This is a **presentation and information-architecture** change. It changes no runtime, admission, permission, approval, reviewer, freezing, library or transfer contract. Anything in this document that reads like a behavior is one of: (a) a display ownership rule (which element explains a state), (b) a layout rule, or (c) a restatement of an existing contract that must survive the restyle.

## 1. Scope and non-goals

In scope: Graph-scoped semantic tokens and surface roles; the page structure of Runs (list, New run, run detail, preflight, final approval), Checks, Workflows (canvas, node inspector, library); copy de-duplication; DESIGN.md; user guide.

Out of scope (separate authorization required): push/merge/release, new dependency, permission-policy change, reviewer retry, new execution feature, Z8, a new global theme, changes to non-Graph screens. Chat, Settings and the plugin store must render unchanged; that is verified, not assumed (section 6).

## 2. Visual foundation

### 2.1 Token ownership (single owner, no second write path)

`packages/ui/src/styles.css` keeps the shared tokens. Graph gets **one additional scoped layer**, `.graph-ui`, declared in `packages/ui/src/graph-engineering/graphUi.css` and imported next to the shared stylesheet. The class is applied once on the Graph panel root and once on each Graph dialog content (Radix portals leave the panel subtree). The layer redefines existing Tailwind `--color-*` tokens **only under `.graph-ui`**, so every Graph utility (`bg-background`, `bg-card`, `text-foreground-subtle`, `border-border`, `bg-brand`…) re-skins and nothing outside Graph changes.

Surface roles (dark and light), each visibly different from its neighbour:

| Role      | Used for                                         | Token(s) redefined                          |
| --------- | ------------------------------------------------ | ------------------------------------------- |
| `shell`   | rail, tab strip, footer                          | `--color-sidebar`, `--color-header`         |
| `canvas`  | the main working area                            | `--color-background`, `--color-panel`       |
| `raised`  | panels, rows, inputs, selected row               | `--color-card`, `--color-input`, `--color-surface*` |
| `overlay` | dialogs, menus, popovers                         | `--color-popover`                           |

Accent: one restrained blue for the primary action, the current selection, the active tab and links (`--color-brand` and its derived focus/selection tokens, scoped). Warning and failure keep their own hues and always carry an icon and words. Status colour never tints body text that has to reach 4.5:1.

Contrast floor (measured on the implemented surfaces, not on the prototype): body 7:1, secondary text 4.5:1 on canvas **and** raised **and** rail, accent text 4.5:1, primary-button label 4.5:1, focus indication 3:1 vs resting. `foreground-subtlest` stays reserved for placeholders/disabled. The measurement script is part of the M4.4 evidence.

Type: the `text-ui-*` scale and `--ui-font-size` stay the only mechanism. No font is made smaller. Hierarchy: page title (`text-ui-xl`, semibold), section title (`text-ui-md` semibold, one per section), body (`text-ui-base`), secondary (`text-ui-sm` at secondary colour), label (`text-ui-sm` medium). Use of `text-ui-xs` is limited to numerals and badges, never to sentences that carry a decision.

Grouping order: whitespace and alignment, then a hairline divider, then a surface change, then a border. No box around a paragraph; at most one panel level inside a page; no panel inside a panel.

### 2.2 Width rule (not a blanket 780 px)

| Surface                                                   | Width                                   |
| --------------------------------------------------------- | --------------------------------------- |
| Task entry, concise summaries, banner, step strip, forms  | readable column, `max-w-3xl` (48rem)    |
| Graph canvas, node inspector, commands, file differences, detailed evidence, library tables | full workspace width |
| Runs rail                                                 | `clamp(13rem, 17vw, 17rem)`; never squeezes the task column below 30rem at 1280 px |

There is **no permanent right inspector** and no third permanent information column. Node inspection on the canvas is a contextual side panel that exists only while a node is selected, as today.

### 2.3 Action placement

One action instance per decision (never the same primary button twice in a view). Short forms: the action bar follows the form content (in-flow). Long forms, the preflight and the final approval: the same single bar is `sticky` at the bottom of the scroll container and always carries the blocker text and the acknowledgment beside the button. The blocking reason is text next to the disabled action, not a tooltip.

## 3. Information architecture

### 3.1 Shell

Header (existing) → **one tab row**: `Runs · Workflows · Checks` as a single segmented tab control (`role=tablist` semantics via the existing buttons + `aria-current`), trailing the compact context: `Model · Permission mode · Checks N` as inline text (still `graph-context-model|mode|checks`, the checks entry still opens Checks). The second helper sentence under the tabs and the "For the next run" chip row are removed; model and permission mode remain discoverable in the tab row, and on the run detail the **run's own frozen model/mode** is shown in the banner's metadata line (frozen facts are never mixed with next-run preferences: the tab row label reads "Next run" once, as a prefix).

### 3.2 Runs

List rail (slim) + one detail column.

- **Rail**: `New run` first (secondary, accent when selected), runs newest-first with a **status indicator glyph + short text** and title; selection marked by surface + accent bar, not border alone. Paging, range and the existing `graph-history-*` controls are unchanged in behavior.
- **New run**: task field first and largest. Below it one line naming the workflow and version (`Sequential engineering · version 2 · Built-in`) with **Change workflow** opening the existing library picker inline. Below that **two summary rows** — Context, Checks — each: label, value/count, quiet meta, single action (Add/Change, Edit checks). Required parameters, required context and invalid configurations are **never** placed under Advanced: they appear in the form at the position they are needed, with the existing "Go to first field" blocker affordance. The existing `Advanced` disclosure keeps only the raw fields that it holds today.
- **Readiness** means "ready for the next permitted action" (Review), never "tests passed". Checks rows read `Saved · not run` until a captured result exists; validated, configured, executed and approved remain distinct labels.
- **Admission**: when the workspace is occupied, **Review and run is not rendered enabled**; the action bar shows the blocked reason and `View current run`; the draft stays editable; nothing starts when the existing run resolves (display only; contract unchanged). A waiting run and an enabled Review never appear together.
- **Run detail** (selected run): a **status banner** is the focal element. It owns the one explanation of the state and the primary next action; secondary actions sit beside it. Below: a one-line **step strip** generated from the frozen graph's actual nodes (horizontal, wraps; arbitrary graphs and parallel groups render as a wrapped list with the current node marked, never a hard-coded sequence), then **outcome facts** and then **tabs**.
- **Outcome facts** keep execution, machine evidence, reviewer judgment and human approval distinct, but render compactly: one fact line per category that carries information, categories that do not apply are a single muted "Not requested / Not reached" line, not a tile. A failed Test shows the failure and the next action prominently and never implies that approval is pending when none was requested.
- **Tabs (single level)**: `Overview · Steps and checks · Evidence · Technical details`. The permission sentence is shown once, in the banner. Mandatory disclosures and authoritative diagnostics (frozen provenance, stale/unavailable evidence, captured-result meaning) move only where the contracts allow: anything a decision depends on is in the banner or the action bar, never only in a tab.

### 3.3 Preflight, acknowledgment, final approval

Same structure as the run banner: a title, the consent-critical text **unchanged**, the facts in a two-column definition list, and the single sticky action bar (action, blocker/acknowledgment, cancel). Final approval: the evidence the reviewer/user needs is full-width under the banner; Approve/Reject are the bar's actions. Existing freshness, scope and confirmation rules are untouched.

### 3.4 Checks

List of saved checks grouped by Build/Test/…; edit in place; a **change summary** and `Save / Discard` in a sticky bar that appears only when there are unsaved edits (existing draft contract: drafts are preserved across tabs; Save validates on the Host). Conflict and read-failure messages appear beside the triggering control.

### 3.5 Workflows and library

- Canvas and node inspector use full width; the inspector is the existing contextual panel.
- **Library**: one dialog, master–detail. Left: workflow list (Yours / Built-in). Right: name, revision badge and **tabs `Versions · Use · Share · Advanced`**; a **fixed footer** holds `Open in Runs` (primary) and `Load into design`. Import/Export/Save/Replace/revision-conflict failures and their recovery render **beside the operation that triggered them**; a previous success message is cleared when a newer operation starts or fails, so a stale success never competes with a failure. Reviewed previews are invalidated exactly where the existing contracts invalidate them (a selection change, a tab change that edits the subject); a plain tab change keeps drafts and previews.
- Unavailable historical pins render as a blocking notice in the Use tab with the existing recovery options, never collapsed.

## 4. Preserved contracts (must still pass)

All `data-testid` hooks used by the UX-M1/M2/M3 browser suites and native journeys are preserved; copy changes that break string assertions are updated deliberately in those suites and listed in the report. Host/API contracts, `workspaceIdentity`, draft ownership, admission, frozen provenance equality, focus management (Enter/Escape in the picker, return focus after a dialog), keyboard tab pattern (`role=tab`, roving tabindex) and `aria-current` remain. Chinese (zh-CN) strings are provided for every new or changed user-visible string.

## 5. Acceptance scenarios

Functional (automated, separate from the user's visual acceptance):

1. New run: write a task, see workflow/version, context and checks summaries, Review → preflight → acknowledgment → start (native, controlled provider).
2. Occupied workspace: Review not enabled, `View current run`, draft preserved, no auto start.
3. Permission wait and return; question wait; failure (Test failed: no approval implied); final approval; repeat request.
4. Library: save, import, export, replace, revision conflict, historical pin unavailable; failure beside operation; stale success cleared.
5. Checks: edit, change summary, save, discard, conflict.
6. Canvas: select node, inspector, design save.
7. Missing required parameter/context, invalid configuration: blocker visible without expanding anything.

Visual (for the user): both themes; English and Simplified Chinese; 1280×720 and 1920×1080; long names, multiple context/check entries, errors, active wait, final approval; before/after captured from the same request/context/checks/runtime state.

## 6. Verification plan

- Focused: existing `packages/ui/test/graph*.test.ts` plus new tests for any pure presentation helper added (step strip from arbitrary graphs, outcome fact compaction, library notice precedence).
- Browser harness (`ux-m1-browser` fixture Host): UX-M1/M2/M3 suites green after deliberate string updates; new `ux-m4-browser.mjs` capture suite.
- Contrast measured on the implemented surfaces by `ux-m4-contrast.mjs` (computed styles in the running page), both themes.
- Shared-token check: Chat, Settings and plugin store captured before/after the token change and compared; expected difference is none.
- `pnpm typecheck`, `pnpm lint`, `pnpm architecture:check --changed` before the Desktop build; one integrated native regression pass on the final build.
