# Z8.5-UX-P1 report — operator-first Graph presentation

**Depends on #23; not independently mergeable to integration yet.** Child draft PR against
`codex/z8-5-u5-realworld-dotnet-projects` (head `67e570228aa8a48f96fdbbe6c89eb54023879745`,
unchanged). Presentation only: no service, shared, CLI, root package/lockfile, workflow,
persisted-store, handler, permission, admission or scope change. This pass does not expand engine
support (.NET 10, gRPC and unapproved packages remain unsupported) and does not make the product
release-ready.

Spec: [Z8_5_UX_P1_SPEC.md](Z8_5_UX_P1_SPEC.md) · Gallery: [evidence/ux-p1/GALLERY.md](evidence/ux-p1/GALLERY.md)

## What changed

| Surface                    | Result                                                                                                                                                                                                                                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Checks, unsupported target | One blocker block (target named, exact cause and next step, first status in the proposal). Four stacked paragraphs and the repeated "use Advanced" prefix are gone.                                                                                                                                      |
| Checks, details            | General test-selection and default-input explanations and the inventory count are in the existing Details disclosure. The inventory stays in the default view when it differs from the Build choices (grouped copies hide targets). The "several targets" hint shows only while a choice is outstanding. |
| Inspection                 | One pre-authorization notice, a compact SDK/framework row (one summary line once recorded or preset), a stage line with the one next action, one primary action per state. Disclosures use the shared `GraphDisclosure`.                                                                                 |
| Source verification        | Defect fixed in presentation: the old UI offered "Open permission conversation" while no permission existed. The conversation action and instruction now appear only in `awaiting-permission` / `running`.                                                                                               |
| New run                    | Only the Checks-page return note is shortened (its conditional second sentence duplicated the per-row flag). Request, context, saved-check rows and the verification label are unchanged (native drivers read them).                                                                                     |
| Run / step view            | **Unchanged.** See "Rejected candidate" below.                                                                                                                                                                                                                                                           |

Files: `GraphProjectInspection.tsx`, `GraphQuickSummary.tsx`, `GraphQuickDiagnostics.tsx`,
`GraphQuickDotnet.tsx`, new pure `graphInspectionView.ts`, locale keys in `graphM4.ts` (plus one
`graphM1.ts` string), new `graphInspectionView.test.ts`, `scripts/graph-engineering/ux-p1-*.mjs`,
this spec/report and `evidence/ux-p1/`. Original start/review/cancel/status handlers and their
arguments are untouched; visibility rules moved into the pure helper.

### Moved to Details (still reachable, nothing deleted)

Inventory count (when not hiding targets), test-selection explanation, default-input scope,
detected-target diagnostics, the operation session identifier (inside the command details),
read-scope list, observed-configuration JSON.

### Still visible for operator decisions

Selected-target blocker with cause and next step; Save disabled with its reason; the side-effect
disclosure before authorizing; exact executable, ordered arguments, read scope, file count, limits
and expiry at command review; stage and the one next action; status check and cancel for every owned
operation including `executor-lost`; expiry and failure as warning-toned stage lines; failed-Test and
invalid-evidence banners and the "No approval was requested" statement; human approval gate; native
permission ownership ("Graph never answers it for you").

### Rejected candidate (kept as a record)

I first removed the failed-Test banner's "nothing to approve or reject" sentence as a duplicate. The
existing UX-M4 suite asserts it (a stopped run must never imply an approval is pending), so I
reverted the change. The Needs-you scope note is likewise an asserted UX-M1.3 contract and was left
alone.

## Local results (Node 24.14.0, pnpm 10.33.2, Linux)

| Check                                                    | Result                                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| UI unit tests, CI environment (`packages/ui/test`)       | 254 passed, 0 failed, 0 skipped (includes 6 new `graphInspectionView` tests and locale parity)               |
| UX-P1 behaviour suite (real components)                  | 14 passed on this branch; 13 of 14 fail on the unchanged baseline (as intended: new stage/blocker behaviour) |
| UX-P1 capture suite                                      | 14 scenarios; 42 after / 40 before captures (keyboard focus is after-only); 0 horizontal overflow after      |
| `pnpm typecheck`                                         | exit 0                                                                                                       |
| `pnpm lint`                                              | 0 errors, 75 warnings (same count as the baseline)                                                           |
| `pnpm architecture:check --changed`                      | OK, 0 violations, 0 new                                                                                      |
| Changed source/test/script files, `oxfmt --check`        | clean (`docs/.../evidence/` is byte-preserved by the repo's own CI script)                                   |
| Existing rendered suites u1, u2, u4, u5, u5-f1, ux-m3    | all passed (5, 7, 3, 3, 2, 31)                                                                               |
| Existing rendered suites ux-m1, ux-m2, ux-m4, ctx-picker | 23/7, 11/7, 19/3, 13/1 failed: **identical failing scenario names on the untouched baseline** (below)        |
| u3                                                       | intermittent on both trees (failed in the baseline sweep and in some branch runs; passed in the final sweep) |

The 18 pre-existing failures (7 + 7 + 3 + 1): 13 `unexpected operation inspection-history` (the generic harness
allow-list predates F1's read-only inspection-history call), 4 ux-m2 strict-mode selector matches
(`details:has([data-testid="graph-recipes-json"]) > summary` resolves to two summaries), 1
context-picker `size error` timeout. I did not repair them (outside this
lane); they are reported, not hidden.

Not run: native .NET acceptance, installer/Sandbox, Windows rendering, the full CI manifest
(`graph-cloud-suite.mjs`), the other CI scripts' self-tests. Not claimed: Windows/Electron visual
acceptance, operator acceptance, performance.

## Interaction checks (asserted in `ux-p1-behavior.mjs`)

Enter toggles disclosures with no Host call; Escape closes the select and focus returns to its
trigger and keeps the selection; Tab order reaches the primary action first; the draft and request
survive Checks and back identically; the selected run persists across tab changes; viewing never
starts, replays, saves or admits (only the explicit confirmation produces one `start`); Save stays
disabled; English and Chinese both asserted for the inspection and unsupported states.

## Selector and driver mapping (Codex drivers read-only)

No test id, `data-status`/`data-state` value, exact English button label
(`Inspect with installed MSBuild`, `Confirm inspection and request native permission`,
`Check original operation`), or SDK-then-framework combobox order changed. Behavioural differences a
native driver could see:

- `graph-inspection-conversation` now exists only in `awaiting-permission` / `running`
  (drivers click it after `awaiting-permission`). `graph-inspection-permission-instruction` text no
  longer contains the session id (the id is in the command details).
- In `verifying-sources` / reserved states the SDK/framework comboboxes are replaced by one
  summary line (`graph-inspection-selection`), and the Inspect button is hidden while an operation is
  reserved. Settled records show no Cancel/Check buttons (the recovery panel keeps its own).
- The SDK/framework select labels were shortened ("Installed SDK", "Target framework").
- Inspection command/read-scope/observed and quick Details disclosures are now `GraphDisclosure`
  (still `details`/`summary`, `:scope > summary` and `details[open]` unchanged); new test ids
  `graph-inspection-command`, `graph-inspection-stage`, `graph-quick-blocker`.

## Dependency notes for the owner / Codex

1. **Focused primary Button contrast: fixed in UX-P1-F1 (see the last section).** The first
   observation attributed it to the shared Button; the cascade showed the owner is the Graph-scoped
   `graphFocusClass`.
2. **Rendered-suite harness gap (`ux-m1-helpers.mjs`):** add `inspection-history` to `ALLOWED_OPS`
   to clear 13 pre-existing failures; separately make the ux-m2 recipes-JSON selector unambiguous.
3. **History pager and Needs-you scope note:** both noisy at 1093×614 with a single run, but both are
   asserted UX-M1/M2 contracts read by native drivers; changing them needs an explicit mapping from
   Codex, so they are untouched.

## State and CI

Head/base: see the PR. Required integration CI is **PENDING** for this child PR (the Graph workflow
triggers only for PRs targeting integration); nothing here is green by CI, and no parent CI is
claimed as child CI. After the owner merges #23: merge the integration branch into this branch
(non-rewriting), retarget to integration, and verify a supported PR event runs final-head CI. No
merge, auto-merge, installer, tag or publication was performed.

---

# UX-P1-F1: focused primary-button readability (follow-up)

Scope: only the focus-visible readability defect reported in this report ("Dependency notes" 1).
The Checks/inspection simplification, run view, New run, history pager and Needs-you semantics are
unchanged.

## Reproduced cause

Real keyboard Tab to the Confirm button in `zai-dark` and `zai-light` (computed colours, composited
over the ancestors, with matched CSS rules from DevTools). Not the Button primitive: it defines no
focus-visible fill for `default`. The owner is the Graph-scoped selector `graphFocusClass`
(`packages/ui/src/graph-engineering/graphFocus.ts`, applied to the Graph panel roots, the context
dialog and the session-pane Graph strip). Its `[&_button:focus-visible]:bg-accent` and `:border-brand`
are written on an _ancestor_, so they match every descendant button and out-specify the Button's own
classes (and the global `outline/box-shadow: none !important` already removed the native ring). Inside
`.graph-ui` the accent is `#243553` (dark) / `#e1eafb` (light) while a filled variant's label stays
`--color-primary-foreground` (`#0a1322` / `#ffffff`): one half of the foreground/background pair was
replaced. The same rule also broke `destructive` and `warning`.

## Smallest fix

`graphFocusClass` only: filled variants (`data-variant` default / destructive / warning, an attribute
the Button already emits) keep their own fill, pinned to full strength so hover's `/80` cannot weaken
a focused control, and mark keyboard focus with a `border-foreground` border. Every other control
keeps the existing accent tint plus brand border. No `!important`, no theme token, no `button.tsx`
change, no handler, disabled, permission, store or contract change. Focus indication is not removed.

## Measured (WCAG 1.4.3 label ≥ 4.5:1; indicator vs page ≥ 3:1)

| Theme | State               | Before label | After label          | After indicator (border on page) |
| ----- | ------------------- | ------------ | -------------------- | -------------------------------- |
| dark  | normal              | 7.70         | 7.70                 |                                  |
| dark  | hover (mouse only)  | 5.44         | 5.44                 |                                  |
| dark  | focus-visible (Tab) | **1.51**     | 7.70                 | `#ececf0` on `#1b1c20` 14.45     |
| dark  | focus-visible+hover | **1.51**     | 7.70                 | 14.45                            |
| light | normal              | 5.70         | 5.70                 |                                  |
| light | hover (mouse only)  | **3.98**     | **3.98** (unchanged) |                                  |
| light | focus-visible (Tab) | **1.21**     | 5.70                 | `#15161a` on `#f5f5f8` 16.61     |
| light | focus-visible+hover | **1.21**     | 5.70                 | 16.61                            |

Matrix inside the Graph scope (focused label, before → after): destructive 1.58 → 8.20 (dark) and
1.21 → 6.54 (light); warning 1.50 → 10.00 and 1.21 → 5.93; outline/secondary/ghost unchanged (≥ 10.4).
All outside-scope controls are byte-identical in computed style before and after. Disabled stays at
`opacity: 0.5`, is skipped by Tab and never activates.

## Tests

| Check                                                                                                                           | Result                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `ux-p1-focus.mjs` (real Tab, both themes, reduced viewport, 7-variant matrix in/out of scope, Tab order, Enter/Space, disabled) | 6/6 pass; **0/6 on the pre-fix checkout** with the reported 1.51 / 1.21            |
| New `graphFocus.test.ts` (rule structure)                                                                                       | 3/3                                                                                |
| UI unit tests, CI environment                                                                                                   | 257 passed, 0 failed, 0 skipped                                                    |
| Existing 14 UX-P1 behaviours                                                                                                    | 14/14                                                                              |
| Existing ux-m1 keyboard-focus scenario, ux-m4 contrast scenario                                                                 | both pass                                                                          |
| `pnpm typecheck`                                                                                                                | exit 0                                                                             |
| `pnpm lint`                                                                                                                     | 0 errors, 75 warnings (= baseline; one transient new warning in my test was fixed) |
| `architecture:check --changed`, `oxfmt --check` (changed files)                                                                 | OK / clean                                                                         |

Not rerun: the full historical browser suites (Codex owns their inherited harness repairs). Not
claimed: Windows, Electron, native, company-PC or whole-app accessibility acceptance.

## Findings left for the owner (measured, not changed)

1. **Mouse hover on a light-theme primary is 3.98:1** (shared Button `hover:bg-primary/80` over the
   Graph light primary `#1e5fd8`). Alpha 0.90 would give 4.77:1 (dark stays 6.51). It is a shared
   Button change affecting every theme, so it is not folded into this focus fix.
2. **Outside the Graph scope a focused default / outline / secondary / ghost Button shows no focus
   indicator at all** (visible in the matrix's lower block): the global
   `*:focus-visible { outline/box-shadow: none !important }` removes the ring and the primitive adds
   none for those variants. Pre-existing and app-wide; needs an owner decision, not a Graph patch.

## Ownership handoff

Changed by F1: `packages/ui/src/graph-engineering/graphFocus.ts` (production),
`packages/ui/test/graphFocus.test.ts`, `scripts/graph-engineering/ux-p1-focus.mjs`, this report,
the spec note and `evidence/ux-p1/focus-f1/`. Codex-owned files (`ux-m1-helpers.mjs`, inherited
UX-M2/context-picker/U3 harness repairs, ENG-P1 scripts) were not touched.
