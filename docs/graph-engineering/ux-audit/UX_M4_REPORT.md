# UX-M4 report: Focus-page visual system (M4.2 – M4.4)

**Status: FUNCTIONAL CHECKS COMPLETE (automated, local) — VISUAL ACCEPTANCE PENDING (the user's).**

Direction **A — Focus page** with the review refinements was implemented on branch `claude/ux-m4-visual-clarity`. The M4.1 boards established the direction, not product acceptance; this report does not claim the user's visual or usability acceptance. Nothing was pushed, merged, released or tagged; no dependency, permission policy, reviewer retry or execution feature was added; Z8 was not started.

Spec (written before the code): [UX_M4_SPEC.md](UX_M4_SPEC.md). Rules: [DESIGN.md](../../../DESIGN.md) (Graph section rewritten). User guide: [USER_GUIDE.md](USER_GUIDE.md). Direction record: [UX_M4_DIRECTION.md](UX_M4_DIRECTION.md).

## 1. What changed

| Area | Change |
| --- | --- |
| Tokens (M4.2) | One Graph-only layer `.graph-ui` (`packages/ui/src/graph-engineering/graphUi.css`): four surface roles (shell / canvas / raised / overlay) and one restrained blue accent, in both themes. Applied to the Graph panel root and to each Graph dialog, select and popover (they portal out of the panel). The shared stylesheet gained exactly one line (the import). No shared component or shared token was changed. A scoped rule makes Graph textareas visible (the shared Textarea paints border and fill the same colour). |
| Header | One tab row (Runs / Workflows / Checks, accent underline, `aria-current`) and, at its end on every destination, the next-run context as inline text: model, mode, saved checks. The chip row and the second helper sentence are gone; the checks entry still opens Checks. |
| Runs list | Slim (`clamp(13rem,17vw,16rem)`), sticky, status icon + words, selection by surface + accent bar. |
| New run | Task-first form (hairline-separated Context / Checks / Steps), one action bar. "Ready to review. Nothing starts until you confirm." only when Review is possible; blocked Review shows its reason and View current run; the draft stays editable; nothing starts when the run resolves. Duplicate sentence removed ("Saved checks only…" is covered by the read status and each row's "Saved · not run"). |
| Run detail | **Banner** as the one focal element (warning / danger / success / progress / neutral tones, icon + words) owning the state explanation and the next action (one accent-filled action); step strip built from the steps actually visited (never a fixed sequence); compact outcome facts (Execution, Test evidence, reviewer output, Human decision; not-applicable rows are quiet lines); single-level tabs Steps / Request and result / Evidence / Technical details (Radix roving tabindex). The permission sentence now appears once. A failed Test is the danger treatment and says no approval was requested. |
| Preflight / approval | Preflight uses a readable column and the existing sticky bar. The final approval keeps comment, reason, Approve and Reject in **one** sticky bar. All consent-critical text is unchanged. |
| Checks | Full width as before; return bar spacing fixed; same tokens. |
| Library | One dialog, master–detail: workflow list (Yours / Built-in), selected workflow, tabs Versions / Use / Share / Advanced, fixed footer (Open in Runs, Load into design with its reason). Failures sit directly above the tabs with Refresh; a previous success is cleared when a new operation starts or fails. Panels stay mounted (hidden) so drafts and reviewed previews survive a tab change. |
| Type | Nothing made smaller; `text-ui-xs` sentences in Graph became `text-ui-sm` (canvas furniture excluded). |
| Docs | DESIGN.md Graph section, USER_GUIDE.md, this report. |

## 2. How each refinement was applied

| Requirement | Where |
| --- | --- |
| No permanent right inspector; no third information column | None added. Node inspector remains the existing contextual panel; Steps tab uses two columns only at ≥1600px. |
| Width not a blanket 780px | New run `max-w-3xl`, run `max-w-5xl`, preflight `max-w-4xl`; canvas, Checks, evidence, file changes full width. Checked: no horizontal overflow, task column ≥ 30rem at 1280px, rail ≤ 17rem (M4 browser suite). |
| One action instance; sticky only when needed | One bar per decision (New run, preflight, approval, Checks return bar); short forms keep it in flow. |
| Remove repetition, not meaning | Banner owns the state; the Needs-you strip becomes a quiet pointer when that run is open; disclosures (permission, frozen provenance, captured-run meaning, agent-led note, stop meaning) kept. Execution / evidence / reviewer / human stay distinct rows. |
| Real state | Review is disabled (never enabled beside a waiting run); readiness means "ready to review"; saved vs executed stay distinct labels. Model and mode are discoverable in the header line. |
| Unhidden blockers | Required parameters/context and invalid configurations are in the form, with "Go to first field". |
| No hard-coded six steps | The strip reuses the visit model of the Steps tab (real iterations, repairs, unvisited nodes). |
| Library failure/recovery beside the operation | Notice area directly above the tabs; success cleared on a new operation (tested). |
| Shared-token rule | Verified: `git diff` shows one added import line in `styles.css` and no shared component edited; a test asserts shared tokens read the same outside `.graph-ui`. |

## 3. Verification actually run

| Check | Result |
| --- | --- |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0: 0 errors, 75 warnings (same count as before M4) |
| `pnpm architecture:check --changed` | OK, 0 violations |
| `pnpm knip` | exits 1 on entries unrelated to this change (unused scripts, Goal/Target exports, etc.); nothing in the Graph UI files changed here is reported |
| `pnpm fmt:check` (whole repo) | not clean repo-wide (line-ending noise in 4k files); the files changed here were formatted with `oxfmt` |
| UI unit tests (`packages/ui/test/graph*.test.ts`, module-name collision) | 219 passed, 0 failed (incl. new `graphM4Locale.test.ts`) |
| Browser harness (real components, fixture Host, Edge) | UX-M1 30/30, UX-M2 18/18, UX-M3 31/31, context picker 14/14, **UX-M4 17/17** (10 functional checks, the contrast measurement, 6 capture scenarios) |
| Contrast on the implemented surfaces | all floors met in both themes (section 5) |
| Native Electron, final build, Windows 11 | see section 4 |

Functional evidence only: fixture Host for the browser suites; the real Host, a real native session, the controlled loopback provider and a disposable workspace for the native runs. No credentials, live model or company repository was used.

### 3.1 Test changes (intentional, not weakened)

Copy/structure changes that the earlier suites asserted were updated, each keeping its intent: the Request/Result panel is now reached through its tab (UX-M1 states); the library sections scenario now asserts the list + four tabs + footer instead of five stacked sections (UX-M3); Share / Advanced open by tab instead of `<details>`; duplicate-name / version picking first opens the Versions tab; `selectValue`/`optionLabels` read the workflow list in the dialog and the dropdown in New run; native drivers follow the same structure. The harness page now mimics the app shell (268px sidebar + panel header) and no longer caps the pane at 1200px, so 1920px captures are real.

## 4. Native pass on the final build

Build: `pnpm typecheck`, `pnpm lint`, architecture check, then `pnpm --filter @zcode/desktop build:no-runtime-assets`, then the journeys (Node 24.14.0). Results are in `.tmp/m4-evidence/native-all/` (raw, not committed).

| Journey | Result |
| --- | --- |
| UX-M1 `draft`, `checks`, `runs`, `states-en`, `states-zh`, `context`, `presentation-zh`, `scale-1.25`, `scale-1.5` | PASS |
| UX-M1 `presentation-en` | first run failed on the welcome-screen reload flake (below); re-run PASS |
| UX-M2 `history`, `checks`, `failures`, `presentation-en`, `presentation-zh`, `scale-1.25`, `scale-1.5` | PASS |
| UX-M3 `share`, `pins` | PASS (re-run after the driver update: PASS) |
| UX-M3 `library`, `presentation-en`, `presentation-zh` | first run failed because the **drivers** still expected a dropdown, `<details>` and always-visible panels; drivers updated for the list/tabs, re-run PASS |
| UX-M4 `states` (New run while a run waits, banner and tabs, Checks, design canvas + node inspector) and `approval` (real final approval reached, banner action opens the inspector, one Approve/Reject bar) | PASS |
| UX-M4.1 baseline script (same states as the "before" captures) | PASS on the final build |

Observed flake (pre-existing, unrelated to Graph): after a page reload the isolated app sometimes lands on the "Welcome to ZCode — connect your account" screen first; a second reload returns to the workspace. The native drivers now retry the reload up to three times and fail if it never returns. Earlier milestones' "graph-engineering-open not visible after reload" timeouts are very likely the same thing.

The real Windows file dialogs were not re-driven in this pass (UX-M3's real-dialog journeys use the same library code path; the `library`/`share` journeys above ran with the controlled-dialog seam). Windows display-scale emulation (`scale-1.25`, `scale-1.5`) is a Chromium switch inside the test process, not a real Windows DPI setting.

## 5. Contrast (measured in the running page, computed styles)

Script `scripts/graph-engineering/ux-m4-scenarios-contrast.mjs`; numbers in `ux-m4/after/m4-contrast.json`. Minimum over the four surfaces unless stated:

| Pair | Dark | Light | Floor |
| --- | --- | --- | --- |
| Foreground | 11.68 | 14.77 | 7 |
| Secondary text | 6.87 | 7.46 | 4.5 |
| Tertiary text | 4.90 | 4.62 | 4.5 |
| Accent text | 5.70 | 4.66 | 4.5 |
| Warning / danger / success text | 7.49 / 5.82 / 7.17 | 4.84 / 5.34 / 4.75 | 4.5 |
| Warning / danger / success on their 10% tints | 6.66 / 5.40 / 6.41 | 5.13 / 5.53 / 5.04 | 4.5 |
| Primary / destructive / secondary button label | 7.70 / 8.20 / 10.85 | 5.70 / 6.54 / 14.25 | 4.5 |
| Input border vs canvas | 3.50 | 3.67 | 3 |
| Focus border vs raised | 6.25 | 5.70 | 3 |

Tertiary and accent text on the light shell (4.62, 4.66) are the tightest values. Real Windows DPI, ClearType and Chinese glyph rendering affect perceived contrast beyond these numbers.

## 6. Before / after captures

Same script (`ux-m4-baseline.mjs`), same request, same context, same saved checks, same controlled runtime; before = UX-M3 build, after = final UX-M4 build, both themes, 1280×720 and 1920×1080.

- Boards: `ux-m4/compare/compare-<state>-<theme>-<size>.png` (16): New run, Workflow library, Run waiting for a native permission, Run whose Test failed.
- Raw: `ux-m4/before/native/`, `ux-m4/after/native/`.
- After-only native states: New run while a run waits, run banner + Steps tab, Evidence tab, Checks, design canvas with node inspector, final approval and the approval inspector (dark 1280×720 and light 1920×1080).
- After, browser harness (fixture data; English all four variants, Simplified Chinese dark 1280×720 and light 1920×1080): `ux-m4/after/browser/`, including the stress state (a 100-character workflow name, a multi-paragraph request, four required fields missing, 9 blockers, long history titles).

Every image committed here was looked at. The earlier M4.1 prototype frames are not evidence of the product.

## 7. Limitations and open points

- **Visual acceptance is the user's.** I judged the captures for overlap, clipping, contrast and hierarchy; I did not judge taste.
- The Workflows destination (graph canvas, node inspector, routing/bounded-repair editors) only gets the new surfaces, accent and tab style; its structure is unchanged. It is the least redesigned area. The "Workflow library" button and inspector tabs were adjusted; legacy controls there still use the shared look.
- Preflight and the approval evidence still contain nested disclosures from earlier milestones (provenance sections, source changes); they were not restructured, only re-skinned, to avoid moving consent-critical content.
- The wide-screen (1920px) New run column is centred with a large gap to the list; this follows direction A but is a judgement call for the user.
- `text-ui-xl` (18px at the default size) is the page title; the prototype's 22px title was not added as a new type step.
- The dialog footer repeats the New-run reason text ("…Review and run is available once that run is resolved") because the shared action bar is reused there; the copy is pre-existing.
- Not exercised: real Windows DPI, real Windows file dialogs for M4, non-Graph screens (Chat, Settings, plugin store) beyond confirming that no shared token or component changed.
- Native reload flake described in section 4.

## 8. Manual launcher and visual / usability checklist (for the user; separate from the automated results)

```
node scripts/graph-engineering/ux-m4-launch-manual.mjs [--theme=zai-light|zai-dark] [--locale=zh-CN] [--seed-runs=3]
```

Needs the built Desktop (`pnpm --filter @zcode/desktop build:no-runtime-assets`). It opens the app in a new isolated profile with a disposable workspace and the controlled loopback provider (no credentials, no network, real Windows file dialogs), prints the profile paths and the sentence every request must contain. It changes no global display setting; `--seed-runs=N` starts and cancels N real runs so the list is populated. Answer every permission and approval yourself.

Short checklist (tick what you see):

1. **Header.** One row of tabs; model, mode and saved checks at its end on every tab. Is the model/mode easy to find?
2. **New run.** Title, workflow line, then the task field. Do you know what to do first? Is "Ready to review. Nothing starts until you confirm." clear, and does it avoid implying tests passed?
3. **Start a run, then look at New run again.** Review is blocked with its reason and View current run; your draft is still there.
4. **Permission wait.** One banner, one accent button (Open conversation); the permission sentence appears once; Execution / Test evidence / Human decision read as quiet facts.
5. **Tabs.** Steps, Request and result, Evidence, Technical details: anything you needed hidden in a tab?
6. **Approval.** The banner's primary action opens the approval; comment, reason, Approve and Reject are in one bar that stays visible.
7. **Failed Test** (optional: edit a Test check in Checks so its command fails, then run): red banner, says no approval was requested, next action is prominent.
8. **Workflows → Workflow library.** List on the left, tabs on the right, footer always visible; try a duplicate, a failed/conflicting save and a tab change with half-typed text.
9. **Both themes, English and Chinese, both window sizes**, including long names: anything clipped, overlapping, too faint, or too small?
10. **Chat, Settings, Plugin Marketplace** look exactly as before.

## 9. Commits

Scoped local commits on `claude/ux-m4-visual-clarity` (spec, tokens, header/rail/run detail, New run + library, preflight/approval, checks/contrast/docs, panel chrome, native scripts and drivers, this report). Not pushed.
