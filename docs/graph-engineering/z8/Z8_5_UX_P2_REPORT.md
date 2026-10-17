# Z8.5-UX-P2 report — operator-first New run and Run/step surfaces

**A separate, additive UI proposal. Not part of the currently approved combined tree.** Stacked
draft PR on the frozen UX-P1 head `79fa0bbf54c329fdb9674408be5fbe2b69ec0373` (PR #25, branch
`claude/z8-5-ux-p1-operator-view`); #24/#25 and the integration branch are untouched. Presentation
only: no service, shared, CLI, Host, native-permission, RPC/protocol, store, role/decision,
evidence, root package/lockfile or workflow change. Not merged, no installer, nothing published.

Spec: [Z8_5_UX_P2_SPEC.md](Z8_5_UX_P2_SPEC.md) · Gallery: [evidence/ux-p2/GALLERY.md](evidence/ux-p2/GALLERY.md) ·
Metrics: [evidence/ux-p2/metrics.json](evidence/ux-p2/metrics.json)

## What changed

| Surface                 | Result                                                                                                                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run, agent work running | Banner names the step and whether it is agent work or a configured check, and says nothing is needed from the operator. A session that is only running is no longer the accent-filled primary action; permission/question/uncertain sessions still are.       |
| Run, executor uncertain | Human decision reads "Undetermined — the run's outcome is unconfirmed" when no approval request, decision or gate exists (it used to say the approval record was incomplete). Real unresolved/stale approval records keep the original wording.               |
| Run, stale evidence     | The banner states why (evidence or graph changed; historical request preserved), reusing the approval inspector's existing sentence.                                                                                                                          |
| Run, completed          | No `end · Inspect step` button and no `Current step: end` fact when the run completed at the End node ("No action required" instead). Stopped/failed runs keep the button so that line never appears on them.                                                 |
| Build/Test step         | Verdict → cause → `N discovered · N passed · N failed · N skipped` (Test steps) → conversation. The six Yes/No facts, classification and the generic explanation sit under an "Evidence checks" disclosure that is open in every state (see "Blocked").       |
| Human-gate step         | The opaque "Request and version" row and the optional-comment row moved into the existing "Request identity and frozen digests" disclosure. Required comment policy, review text, workspace, successor, evidence, comment field and Approve/Reject unchanged. |
| New run                 | Checks status and Refresh/Set up share one row with a shorter sentence; the single-Build "Build relationship" line is hidden; with no saved checks the footer route is **Set up project checks** instead of "Go to first field".                              |
| Review (authorization)  | **Unchanged**, byte-identical visible text before/after at all three variants.                                                                                                                                                                                |

Files: production `GraphRunOverview`, `GraphRunActions`, `GraphToolInspector`, `GraphApprovalInspector`,
`GraphRecipeReadStatus`, `GraphTemplateBindings`, `GraphTemplateRecipeBindings`, `GraphNewRunActions`,
new pure `graphRunStage.ts`, locale keys in `graphRunClarity.ts` and one `graphPreZ8.ts` sentence;
tests `graphRunStage.test.ts`, `graphRunStageLocale.test.ts`; `scripts/graph-engineering/ux-p2-*.mjs`;
this spec/report and `evidence/ux-p2/`. 47 files, +3,001 / −59: production code +207 / −59, the rest is tests, scripts, spec/report and
22 gallery images; nothing outside Graph UI, Graph locale copy, their tests, `ux-p2-*` scripts and docs.

## Information density (measured, deliberate)

99 paired captures, 75 changed, 24 identical (inspection states, native-permission wait, final-approval
wait, review). Total visible characters 124,893 → 122,963 (−1.5%). The change is mostly clarity, not
volume, and two states got **longer on purpose**:

| Capture (1366×768)         | Visible chars | Scroll height | Why                                                       |
| -------------------------- | ------------- | ------------- | --------------------------------------------------------- |
| New run, valid             | 1162 → 1080   | 1225 → 1173   | one checks row; relationship line gone                    |
| New run, no saved checks   | 881 → 885     | 1059 → 1033   | same reason text; the footer route is now the next action |
| Step, human gate           | 2520 → 2448   | 1777 → 1689   | identifiers moved to Details                              |
| Run, completed with checks | 1318 → 1301   | 1259 → 1203   | End-node button and fact removed                          |
| Step, failed Test          | 2027 → 2014   | 1578 → 1597   | verdict-first, count sentence added; facts remain open    |
| Run, running               | 1336 → 1400   | 879 → 908     | + stage sentence and "nothing needed"                     |
| Run, stale evidence        | 1314 → 1440   | 1172 → 1222   | + explanation that the banner lacked                      |

Zero horizontal overflow before and after in all 99 captures (EN/ZH, dark/light, 1366×768, 1600×900,
1093×614).

## Still visible for operator decisions (verified by the behaviour suite)

Failed-Test banner and "No approval was requested / nothing to approve or reject"; invalid evidence is
a different banner, tone and action from a failed Test; invalid reviewer output keeps its own banner;
native permission wording ("Graph does not grant it separately") with exactly one accent action;
final approval's banner, gate action and Approve/Reject; stale evidence can never be approved
(Approve disabled); the exact command review, checks, acknowledgment and Start gating; the unsaved-check
notices; blocked reasons (`data-blocked-by`) and their routes.

## Blocked: asserted contracts kept, reported as future dependencies

| Wanted                                                          | Why not here                                                                                                                                                                                              |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Collapse passing "Evidence checks" by default                   | `z4-native-presentation.mjs` reads `graph-tool-reportFresh/reportParsed` with `innerText` on a completed Build step; text in a closed `details` reads as empty (reproduced). Needs a driver change first. |
| Single unsaved-check notice                                     | UX-M2.2 asserts both the block and the row marker; native drivers read `Unsaved edits in Checks`.                                                                                                         |
| One blocked-fields explanation (footer vs list)                 | UX-M1/M4 assert `Not ready to review: N …` and `graph-template-unresolved` text.                                                                                                                          |
| Hide/shorten Needs-you scope note; collapse "Not visited" chips | UX-M1.3 contract; native drivers click `graph-select-node-<id>` and cannot click inside a closed disclosure.                                                                                              |
| Reword "Review captured approval request" on a stale run        | Label is read through `graph-run-review-gate`; changing it needs a mapped driver update.                                                                                                                  |

## Local results (Node 24.14.0, pnpm 10.33.2, Linux, Chromium 1194 via `--chromium`)

| Check                                                     | Result                                                                                                                                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI unit tests, CI environment (`packages/ui/test`)        | 267 passed, 0 failed, 0 skipped (baseline 257; +10 new: stage helper, locale parity)                                                                                                  |
| UX-P2 behaviour suite (real components, 30 scenarios)     | 30/30 on this branch; **13/30 on the untouched baseline** (17 fail exactly where behaviour changed)                                                                                   |
| UX-P2 capture suite (27 scenarios, 99 pairs)              | 27/27 on both trees, identical fixtures, 0 overflow                                                                                                                                   |
| `pnpm typecheck`                                          | exit 0                                                                                                                                                                                |
| `pnpm lint`                                               | 0 errors, 75 warnings (= baseline)                                                                                                                                                    |
| `pnpm architecture:check --changed`                       | OK, 0 violations, 0 new                                                                                                                                                               |
| `oxfmt --check` (changed files)                           | clean                                                                                                                                                                                 |
| Existing rendered suites, compared **by exact case name** | u1, u2, u4, u5, u5-f1, ux-m3, ux-p1-behavior, ux-p1-focus: pass on both. ux-m1 23/30, ux-m2 11/18, ux-m4 19/22, context-picker 13/14: **identical failing case names on both trees**. |
| u3 "Advanced border ownership…"                           | Intermittent on **both** trees (`Element is not attached to the DOM`): baseline failed 3 of 7 reruns, P2 2 of 3. It is the Checks page; not caused by this lane.                      |

Behaviour suite also asserts (EN and ZH where relevant): running/permission/approval/Test FAIL/invalid
evidence/stale/interrupted/completed/agent-only/invalid-reviewer truth; Tab reaches the one next action
within four stops before any other action; every visible control has an accessible name; **negative
controls**: passive viewing, expanding every disclosure and changing tabs create no Save, instantiate,
prepare, run, conversation open, file dialog or inspection command, and the run records are untouched.

Not run: native .NET Build/Test, the 5,013-input verification, Windows/Electron rendering, installer or
packaging, the full CI manifest, a real screen reader, the unrelated historical U3/UX audits.
Not claimed: operator, Windows, native or whole-app accessibility acceptance.

## Side effects and known limitations

- `GraphRecipeReadStatus` is shared: the Checks recipe editor's status line also becomes
  "N saved checks loaded." and one row. The Checks-setup page text was compared before/after: identical
  at all three widths.
- The density gain is modest (−1.5%); the value is mainly clearer stage, cause and next action.
- Running and stale-evidence states are intentionally longer.
- Stale: the Human decision still says the approval record is unresolved (true) and the primary action is
  still labelled "Review captured approval request".
- Fixtures are synthetic captured records, not native executions. The harness asserts only what is
  true on both trees; semantics live in the behaviour suite.
- `assertClean` of the shared helper rejects the read-only `inspection-history` call that visiting
  Checks makes; the P2 scripts use a local variant that allows exactly that one operation.
- Locale/theme changes remount the page (by design), so review captures run the whole flow per variant.

## Selector and driver mapping (Codex drivers read-only)

No `data-testid`, `data-state`/`data-status`/`data-tone`, exact button label or serialized value was
removed or renamed. Differences a driver could see: `graph-run-show-step` and `graph-run-current-step`
are absent for a run that completed at the End node; `graph-go-to-first-field` is replaced by
`graph-new-run-setup-checks` only when the saved checks were read and none exist;
`graph-run-open-native` is `data-variant="outline"` while the run is only running; the human fact text
for an interrupted run with no approval record; `graph-tool-*` fact cells moved inside
`graph-tool-evidence-checks` (open, readable by `innerText`); `Request and version` and an optional
comment-policy row are inside `graph-approval-correlation`. New ids: `graph-run-nothing-needed`,
`graph-run-stale-explanation`, `graph-tool-counts`, `graph-tool-evidence-checks`,
`graph-approval-correlation`, `graph-new-run-setup-checks`.

## Requested coordination with Codex

1. Add `inspection-history` to `ALLOWED_OPS` in `ux-m1-helpers.mjs` (13 inherited failures; unchanged
   from the UX-P1 request), and make the ux-m2 recipes-JSON `details:has(...) > summary` selector unique.
2. Decide whether `z4-native-presentation.mjs` may read the evidence facts without relying on `innerText`
   of open content; only then can passing "Evidence checks" collapse by default.
3. Confirm no native driver depends on `graph-run-show-step` / `graph-run-current-step` for a completed
   End step.

## State and CI

Stacked **draft** PR targeting `claude/z8-5-ux-p1-operator-view`. Required integration CI is **PENDING**
(the Graph workflow runs only for PRs targeting integration); nothing here is green by CI and no parent CI
is claimed as child CI. No merge, auto-merge, installer, tag or publication.
