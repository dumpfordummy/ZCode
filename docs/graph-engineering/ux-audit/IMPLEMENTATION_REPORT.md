# Implementation report

Date: 2026-09-30. Branch `claude/zcde-graph-ux-audit-be80d8` on `558347d`. **Nothing was committed, pushed, tagged or published; Z8 was not started; no permission-policy change, relaxed validation, new dependency, credential, live model call or company repository.** The changes are uncommitted in the working tree.

Contract, state derivations, layouts and recorded deviations: [IMPLEMENTATION_SPEC.md](IMPLEMENTATION_SPEC.md) (section 8 is authoritative where it differs). User flow: [USER_GUIDE.md](USER_GUIDE.md). Screenshots: [BEFORE_AFTER.md](BEFORE_AFTER.md).

## What now exists

| Approved item                                | Implementation                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runs / Workflows / Checks; New run prominent | View store modes `runs` (with a `new` pane), `design` (labelled Workflows), `setup` (labelled Checks); default is Runs → New run; `graph-new-run` button; `aria-current` on navigation                                                                                                                                 |
| Correct result states                        | Gate state derived from gate facts and run outcome: `pending`, `not-reached`, `not-requested`, `approved`, `rejected`, `unknown`; aggregate priority documented and tested                                                                                                                                             |
| Failure actions                              | One result block (`GraphRunResultBlock`): what was rejected, persisted diagnostic, what is still true from captured facts. Reviewer-output failure, Test failure, invalid evidence and other stops are separate kinds. Actions: Inspect reviewer output, Open reviewer conversation, Start a new request from this one |
| Inline preflight                             | `GraphRunConfirmation` is an inline step (no dialog): review summary, statements to acknowledge first, sticky acknowledgment + Start. Acknowledgment explicit, per run, initially unchecked; same `onConfirm` payload                                                                                                  |
| Needs-you                                    | `GraphNeedsYou` strip on every destination, derived from the complete `view.runs`; run rows carry a badge                                                                                                                                                                                                              |
| Back to run                                  | Graph-owned conversation banner has **Back to run**; owner lookup by exact session id; restores workspace, run and step; answers nothing                                                                                                                                                                               |
| Permission information                       | Read-only block; Graph-known configured command labelled as configuration. Exact pending request is **not** shown (see limits)                                                                                                                                                                                         |
| Step trail; View run graph                   | Actual visits in execution order, repair iterations labelled, unvisited nodes grouped apart; read-only frozen-definition graph toggle                                                                                                                                                                                  |
| Review and run                               | Existing instantiate + preflight; unchanged form/design is recognised (no new definition, and the redundant revision-bumping save is skipped); **Save as workflow only** kept                                                                                                                                          |
| Run again                                    | Seeds the new-run form from the run's frozen template parameters/bindings; starts nothing                                                                                                                                                                                                                              |
| Context / Checks in the form                 | Context section (no outer disclosure); Checks section marked "Saved · not run"; context bar with model, mode and check status                                                                                                                                                                                          |
| Checks destination                           | List + one selected editor; scan and .NET preset moved below                                                                                                                                                                                                                                                           |
| Workflows destination                        | Label, Review and run, experimental toggle to a footer line; everything else untouched                                                                                                                                                                                                                                 |
| Focus and semantics                          | `graphFocusClass` extended to the whole panel and the Chat return-link banner                                                                                                                                                                                                                                          |
| Localisation                                 | New strings en/zh-CN; built-in workflow, parameter, reference and step names shown in Chinese by a UI-owned id map                                                                                                                                                                                                     |
| Prototype defects                            | Four defects fixed, 12 checks added (42 total passing)                                                                                                                                                                                                                                                                 |

## Changed components

**New** (`packages/ui/src/graph-engineering/`): `GraphContextBar`, `GraphNeedsYou`, `GraphRunPermissionBlock`, `GraphRunResultBlock`, `GraphRunTrail`, `GraphRunsDestination`, and models `graphCommandLine`, `graphInstantiationMemo`, `graphNeedsYouQueue`, `graphPermissionInfo`, `graphRunAgain`, `graphRunResult`, `graphRunTrailModel`, `graphSessionOwner`, `graphTemplateText`.

**Modified UI**: `GraphEditor` (split; the runs destination moved to `GraphRunsDestination`), `GraphEditorNavigation`, `GraphEditorSurface`, `GraphEngineeringPanel`, `GraphLibrary`, `GraphProjectRecipes`, `GraphRecipeForm`, `GraphReferenceBindings`, `GraphReferenceField`, `GraphRunActions`, `GraphRunConfirmation`, `GraphRunHistory`, `GraphRunOverview`, `GraphTemplateBindings`, `GraphTemplateRecipeBindings`, `GraphWorkflowProvenance`, `GraphWorkflowSummary`, `graphFocus`, `graphRunSummary(+Types)`, `useGraphRunActions`, view store `graphEngineeringViewStore`, hooks `useGraphEngineering` and `useGraphSessionOwnership`, locales `en-US`, `zh-CN`, `graphPreZ8`, `graphRunClarity`.

**Threading for Back to run**: `WorkspaceShellLayout` → `V4WorkspaceChatArea` → `WorkbenchPane` → `SessionPane` (one optional callback, following `onOpenAutomationsMain`).

**Tests**: `graphRunSummary.test.ts` updated; new `graphRunResult`, `graphNeedsYou` (includes run-again and the pagination case), `graphRunTrail` (trail, command line, permission info), `graphSessionOwner`, `graphInstantiationMemo`.

**Harness**: `reviewer-native-ui.mjs`, `reviewer-native.mjs` (evidence now under `ux-audit/evidence/`), `z6-native-ui.mjs` migrated to the new flow; new `ux-audit/tools/tour-after.mjs`, `final-pipeline.ps1`.

**Not changed**: `packages/services`, the CLI/runtime, architecture policy, lockfiles, dependencies.

## Built fresh vs reused

| Artifact                                                 | Status                                                                                               | SHA-256         |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------- |
| Desktop Main `out/main/index.js`                         | **Fresh** (this run, 12:41)                                                                          | `8fededbc…17f1` |
| Desktop Host `out/host/index.js`                         | **Fresh**                                                                                            | `375f23e0…88c3` |
| Desktop preload `out/preload/index.cjs`                  | **Fresh** (identical bytes to the accepted closeout's)                                               | `edb7a8c0…0b49` |
| Desktop renderer `out/renderer/assets/index-5x3HtLQH.js` | **Fresh**                                                                                            | `e4bf82f7…ba1a` |
| CLI runtime `apps/zcode-cli/packages/cli/dist/zcode.cjs` | **REUSED** (copied from the sibling checkout, built 2026-09-27; hash equals the accepted closeout's) | `a60c0ba4…66ee` |
| Root dependencies                                        | Installed offline from the existing pnpm store, no downloads                                         |                 |
| Electron 41.0.3                                          | Extracted from the local cache                                                                       |                 |

The CLI sub-workspace lockfile does not match its `package.json` (pre-existing), so the CLI was not rebuilt. No CLI source changed. Full hashes: `results/artifact-hashes.json`. Build order followed the closeout: `pnpm typecheck` (which emits into `out/host`) runs **before** the Desktop build; the earlier session lost a native run by breaking that order.

## Results (final build, serialized)

Compact receipts are in `results/`. The raw command logs (`evidence-logs/`, UTF-16) and per-run native summaries (`evidence/`) contain machine paths and stay on the original machine; see [CLOUD_HANDOFF.md](CLOUD_HANDOFF.md).

| Check                                              | Result                                                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `node scripts/check-workspace-freshness.mjs`       | exit 0, ahead 0 / behind 0                                                                           |
| `pnpm typecheck`                                   | exit 0                                                                                               |
| `pnpm lint`                                        | exit 0, **75 warnings, 0 errors** (same as the closeout baseline)                                    |
| `pnpm architecture:check --changed`                | exit 0, violations 0 / baseline 0 / new 0; no exceptions or thresholds changed                       |
| Graph UI tests (`packages/ui/test/graph*.test.ts`) | **138 pass, 0 fail**                                                                                 |
| Graph services tests (all `*.test.ts`)             | 358 pass, 0 fail, **2 skipped** (genuine-TRX replay needs `PRE_Z8_TRX_FIXTURE_MANIFEST`, not set)    |
| U2/z6 helper tests                                 | 19 pass, 0 fail                                                                                      |
| `oxfmt --check` on all changed and new files       | pass. `pnpm fmt:check` on the whole repo fails in this CRLF working tree (pre-existing, ~3980 files) |
| Desktop `build:no-runtime-assets`                  | exit 0                                                                                               |

Native, built Desktop app, controlled loopback provider, real native Edit/Build/Test/permissions/artifacts:

| Run                                                                                                                                           | Result                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Reviewer harness (existing assertions, migrated to the new flow): pass, prose-fence, unbound-report, needs_changes, needs_human, test-failure | **6/6 PASS**                                 |
| After-tour, English dark: same six scenarios                                                                                                  | **6/6 PASS** (7 assertions each; 9 for pass) |
| After-tour, English **light**, prose-fence                                                                                                    | PASS                                         |
| After-tour, **zh-CN**, pass and test-failure                                                                                                  | PASS                                         |

Behaviours asserted natively by the after-tour: first entry lands on Runs/New run with no design draft; the new-run draft survives navigation; Review and run saves the workflow with **zero native inputs and zero model requests**; the commit bar is inside the 1280×720 viewport, acknowledgment unchecked, Start disabled; **repeating Review and run with an unchanged form creates no new definition revision and no run**; Needs-you appears on other destinations; Back to run restores the run and step and **the permission is still waiting** afterwards; permissions answered one at a time through the existing Allow; Run again pre-fills and starts nothing; approval requires the comment and records the exact request id, version and digest (pass only). Human decision reads _Not requested_ for prose-fence, unbound-report and test-failure and _Pending_ for pass, needs_changes and needs_human.

Screenshots were inspected in the real window at 1280×720 and 1920×1080, Zai Dark, plus Zai Light and zh-CN (see [BEFORE_AFTER.md](BEFORE_AFTER.md)).

## Findings that changed during implementation

1. **The audit's focus finding was wrong.** Graph already had a visible border-and-fill focus style; my first probe read styles mid-transition. Corrected in UX_AUDIT B7.
2. **Every review used to bump the definition revision.** `saveDefinition` increments the revision even for identical content, and the preflight preparation called it each time. Caught by the native assertion; fixed renderer-side by skipping the save when the draft equals the Host's current definition at the same revision.
3. **Case-insensitive filename collisions** (`GraphNeedsYou.tsx` vs `graphNeedsYou.ts`, `GraphRunTrail` likewise) broke type-checking on Windows; the model files were renamed to `…Queue` / `…TrailModel`.
4. The "repeat request in four interactions" figure remains a **target**. The native tour did it in more steps (it also asserts extra things); no human usability measurement was made.

## Limitations and not done

- **Exact permission request is not shown in Graph.** Reading it needs a lease on the session projection from the Graph panel: an ownership review. Only the configured command is shown, labelled as configuration.
- **Historical native drivers are not migrated or re-run:** `pre-z8-u1-boundaries`, `-u1-recipe-independence`, `-u1-ui`, `-u2-template`, `-u3-editor`, `-u3-native`, `-u3-references`, `-u4-native`, `-u5-native`. They reference the removed `graph-view-workflows`, the Design "Save and run" flow or the removed Workflows summary. The reviewer harness, `z6-native-ui` and the new tour were migrated. The full historical matrix was not run, as instructed.
- **Pagination is verified by a unit test** (a pending run behind 60 settled runs is surfaced), not natively with more than 25 runs. Needs-you covers what the Host returned in `view.runs`; no wider queue is claimed.
- **Draft preservation** was verified natively for navigation (Workflows and back) and by existing unit tests for workspace-keyed drafts; workspace switching and instantiate failure were not exercised natively.
- The new-run form is fully disabled (draft kept) while a run is unresolved.
- Context chips / inline picker, the "since your last run" line, and the Chat composer "Run as a workflow…" are not implemented (the last was deferred by decision). Reviewer retry deferred.
- Non-Windows, mobile web, live models, a packaged build, screen readers and any human usability testing were not run. Contrast was not measured with a tool.
- Localisation covers built-in workflow names, parameter/reference labels and common step names; other Host-authored text stays English. Captured run definitions keep their original (English) names.

## Short manual checklist

1. Fresh disposable workspace with two saved checks. Open Graph: you should land on New run, not a design draft.
2. Enter `Modify zz-demo.txt file content to after`, choose the saved Build and Test, press **Review and run**. Nothing should run; confirm no conversation appears.
3. In the review, confirm the acknowledgment is unticked and **Start run** is disabled and visible without scrolling at 1280×720. Press Back to design, then Review and run again: no new run appears.
4. Tick, Start. When Needs-you appears, open **Open conversation**, use the normal Allow, then **Back to run**: you should return to the same step. Switch to Workflows and Checks: the strip should still be there.
5. At the end (reviewer decision + pending gate): **Review captured approval request**; Approve should need a comment.
6. Repeat with a reviewer that answers with prose around JSON (or a failing Test): one block, "Not requested", no duplicate message; **Start a new request from this one** pre-fills and starts nothing.
7. Switch language to 中文 and theme to Light and repeat 1–2.
8. Tab through the header, tabs, run list and review: every control shows a focus change.
