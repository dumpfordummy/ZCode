# Implementation plan (approved; implemented, see IMPLEMENTATION_REPORT.md)

Contract, state derivations, layouts and event order are in [IMPLEMENTATION_SPEC.md](IMPLEMENTATION_SPEC.md). This file orders the work. Batches are internal checkpoints, not approval gates; the ordering below follows dependencies.

## Ground rules

- Reuse existing authoritative operations; no second owner, schema, persistence or engine. No permission-policy change, relaxed validation, new dependency, live model, commit or push.
- Focused tests while iterating; one integrated acceptance pass on the final build. Build order matters: `pnpm typecheck` (which emits into `out/host`) is run **before** `pnpm --filter @zcode/desktop build:no-runtime-assets`, and nothing emitting runs during native acceptance.
- Keep test ids stable except the removal of `graph-view-workflows` (drivers updated).
- Localise every visible string (en-US, zh-CN) in the same change.

## Batch A — correct states, failure actions, focus, inline preflight

Dependencies: none. Everything later builds on these.

1. Gate/human states `not-reached`, `not-requested`, `unknown` derived from gate facts (`graphRunSummary.ts`, `graphRunSummaryTypes.ts`, aggregate in `human.state`); labels in `graphRunClarity.ts`; tests in `graphRunSummary.test.ts`.
2. One result block replacing the duplicated status line + alert (`GraphRunOverview.tsx`, `GraphRunActions.tsx`, new `GraphRunResultBlock.tsx`): correct labels for reviewer output vs machine evidence, "still true" from captured facts, actions _Inspect reviewer output_, _Open reviewer conversation_, _Start a new request from this one_.
3. Inline Review (`GraphRunConfirmation.tsx`): no dialog; grouped content; sticky acknowledgment/Start; identical `onConfirm` payload.
4. Focus and semantics: `graphFocusClass` on the panel root (header included), `aria-current="page"` on destination buttons, ≥28px targets on touched controls.

## Batch B — Runs, new run, context and checks

Dependencies: Batch A (Review and result block are rendered inside Runs).

5. Store and navigation: destinations Runs / Workflows / Checks; `pane: "new"`; legacy `workflows` mode mapped; default destination.
6. Runs master-detail: activity list with _New run_ button, _Needs you_ / _Running_ / _Recent_ from complete `view.runs`, pagination kept; Needs-you strip across destinations.
7. New-run form: request first, compact workflow selector, Context section without the outer disclosure and with a selected-context summary, Checks section with "Saved · not run", **Review and run** using the fingerprint rule; explicit _Save as workflow_ kept as secondary if a case cannot be made safe.
8. Run again: seed the form from the frozen `definition.template` of a run (parameters and bindings), validated against the current checks by the existing `templateBindingErrors`; never starts anything.
9. Checks: list + one selected editor, one noun, consistent save label; scan and .NET under _Add_; existing conflict detection and Advanced JSON kept.

## Batch C — return path, approval, Workflows, localisation, polish

Dependencies: Batch B for the run selection model.

10. Back to run: resolve the owning run/node/attempt of a graph-owned session; SessionPane link with focus style; shell callback restores workspace, run and step.
11. Approval and permission information placed in the run's result column; permission block read-only per spec §3.
12. Step trail as the primary Runs view; _View run graph_ (read-only, frozen definition); branch/repair-aware.
13. Workflows destination as specified: label, _Review and run_, header cleanup; capabilities untouched.
14. Localisation of touched strings and built-in workflow display names by UI-owned ids; empty states with a next action.

## Integrated acceptance (final build only)

Serialised build: `pnpm typecheck` → `pnpm lint` → `pnpm architecture:check --changed` → Desktop `build:no-runtime-assets`. Then focused UI tests, then the native scenarios (`pass`, `test-failure`, `prose-fence`, `unbound-report`, `needs_changes`, `needs_human`) plus new native checks for first use, Back to run, Run again, draft preservation and pagination. Record which artifacts were freshly built and which reused. Screenshots before/after at 1280×720 and 1920×1080, Zai Dark and Light, en and zh-CN.

## Explicitly deferred

Chat composer "Run as a workflow…"; reviewer retry; permission-policy changes; parallel workflows; packaging; non-Windows and mobile-web qualification; Z8.
