# Z8.5-UX-P2-F1 report — operator-clarity follow-up to UX-P2

A separate, additive, **presentation-only** follow-up to UX-P2 (PR #26, merged). It changes what the
Graph UI says and which control leads, never what is true or allowed. No service, shared, CLI,
native, Host ownership/admission, RPC, store, evidence-generation, permission, timeout/freshness,
workflow, CI, root-dependency or lockfile change. Not merged, no installer, no `.309`, nothing
published. This is **not** a release claim and **no** native, Windows, Electron, installer or
screen-reader acceptance is claimed (synthetic records, Linux Chromium only).

Spec: [Z8_5_UX_P2_F1_SPEC.md](Z8_5_UX_P2_F1_SPEC.md) · Gallery:
[evidence/ux-p2-f1/GALLERY.md](evidence/ux-p2-f1/GALLERY.md) · Metrics:
[evidence/ux-p2-f1/metrics.json](evidence/ux-p2-f1/metrics.json)

## Identity

| Item                           | Value                                                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Integration base (PR target)   | `claude/zcde-graph-ux-audit-be80d8` @ `3806cdb49d85e6017f17524019abb2a2aa49b344`, tree `ecb71be2af9ecb0804e7602f362921a2bdfd1fe8` |
| Original F1 commit (preserved) | `021147758cef9e745d7da2d858f8b9fdad4cee11`, parent = frozen P2 head `bfd80aadfc542011ba33752273a25c3b0415c23f`                    |
| Normal merge of integration    | `dc5ae84d54afbcc5f4b3bb07fde64ff148d3d6c3` (`--no-ff`, no rebase, no force)                                                       |
| **Tested source tree**         | `4cd5b76e315b34b0d5e2ce2320c64586a3fdba3d` = the projected `git merge-tree` tree                                                  |
| Final PR head                  | the tested merge plus this report and the gallery (documentation and evidence only; the tested tree's source is unchanged)        |

Both the F1 commit and integration are ancestors of the merge. `git diff integration...HEAD` touches
only: F1 spec/report/gallery, ten `packages/ui` source, locale and test files and `scripts/graph-engineering/ux-p2*`.
Toolchain: Node 24.14.0, pnpm 10.33.2, `pnpm install --frozen-lockfile --ignore-scripts`, Linux,
Chromium 1194. The old 18 inherited harness failures were fixed by #24 and are **not** accepted as a
baseline: the integration baseline has zero failures in UX-M1/M2/M4/context-picker.

## The six findings

| #   | Finding                             | Disposition           | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ----------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Duplicate `Set up project checks`   | **Fixed**             | The Checks row keeps the only command (`graph-template-setup-checks`, used by native drivers even with zero saved checks). With no saved checks it is outlined and leads; Refresh steps back. The footer copy and its P2-only id `graph-new-run-setup-checks` are removed. The footer now locates, with `Go to first field`. "No project checks are configured." is unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2   | Multi-blocker next action           | **Fixed**             | P2 had replaced `Go to first field` in every no-checks case, so with 10 open fields the footer's only route resolved 2. The route is restored and targets the first field that can be acted on now; a check field with no saved check redirects focus to the Checks row's setup button (also for the unresolved-list entries). Count, reason and full list unchanged; focus only, no Save/edit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 3   | Run vs native-attempt status        | **Fixed (defensive)** | A run saying `Starting`/`Running` while a current attempt is `WaitingForPermission`, `WaitingForUser`, `Unknown`, `Interrupted` or `CancelRequested` no longer says "Nothing is needed". The banner follows the attempt (permission block unchanged; question title; or "…the native status is “X” while the run says Running. Treat it as unconfirmed."), is a warning with no spinner, and the Execution fact names the attempt status. No approval is invented, no action added or hidden. **Reachability:** the Sequencer and tool writers assign `run.status` from the attempt in the same persisted record (except when the run is already `Interrupted`), so `Running` beside a waiting attempt is _not produced by current code_; it guards restored/imported/inconsistent records. The reachable opposite case (run `Interrupted`, attempt later waiting) already rendered truthfully and is asserted unchanged. |
| 4   | Invalid-evidence counts             | **Fixed**             | Counts under anything but accepted passing/failing evidence read "Reported by the test runner, not accepted: …" (subtle tone, `data-accepted="false"`). A row with no reported count (previously a row of dashes) is not shown. Accepted passed/failed counts are unchanged. Invalid evidence is still not a failed Test; `observationValid` is untouched and the raw verification JSON is unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 5   | End cursor / completion consistency | **Fixed**             | One predicate (`graphSettledAtEnd`: status `Completed` and cursor End) now hides both `end · Inspect step` and `Current step: end`. Every other status keeps both, so a stopped, failed, cancelled, interrupted or NeedsHuman run is never "No action required" and an End cursor is never read as completion. Verified over all 17 `GraphRunStatus` values (unit) and six rendered statuses (browser).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 6   | Documentation precision             | **Corrected here**    | See the correction below. The historical P2 report and its evidence are not edited.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

### Prospective correction of the UX-P2 report (finding 6)

`Z8_5_UX_P2_REPORT.md` states: _"`GraphRecipeReadStatus` is shared: the Checks recipe editor's status
line also becomes "N saved checks loaded." and one row. The Checks-setup page text was compared
before/after: identical at all three widths."_ The first half is accurate; the second is **not**.
With **Advanced expanded** the Checks setup page text differs between the UX-P1 head and the UX-P2 head
(rendered on both, in English and Chinese; JSON in `evidence/ux-p2-f1/checks-page/`). The only
difference is the status sentence:

| Tree           | Status sentence in the expanded Advanced section                                 |
| -------------- | -------------------------------------------------------------------------------- |
| UX-P1 head     | "5 project checks loaded. Configuration alone does not mean they ran or passed." |
| UX-P2 head, F1 | "5 saved checks loaded."                                                         |

(Chinese: 已加载 5 个项目检查。配置本身不表示已执行或通过。 → 已加载 5 个已保存的检查。) The comparison
in the P2 report was presumably made with Advanced collapsed. The same page still says "Saving
configuration does not execute commands", so no safety statement was lost, but the claim of identical
text was wrong. F1 leaves this sentence exactly as P2 has it (UX-P2 = F1 text in both languages).

## Before / after (measured)

Baseline = the actual integration tree; after = the tested F1 tree; identical fixtures and scripts.
180 pairs: **126 changed, 54 identical, 0 horizontal overflow (measured)** (1366×768, 1093×614,
900×640; English/Chinese; light/dark). Overflow is the only layout fact measured for all 180; I
visually reviewed the 4 images behind findings 1, 2 and 3 (English 1366 and Chinese 1093) and no
clipped control was seen there, but clipping was not measured separately. Total visible characters 208,545 → 211,488 (**+1.4%**):
this lane removes duplicate or contradictory information but deliberately adds three short facts, so
the net is slightly longer, not shorter. Clarity and decision correctness outrank density here.

| Capture (1366×768)                                                              | Visible chars | Height                                                         | Reason                                                                                |
| ------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| New run, no saved checks (all 3 fixtures)                                       | −4            | 0                                                              | footer button `Set up project checks` (21) → `Go to first field` (17); duplicate gone |
| New run, saved checks / valid                                                   | 0             | 0                                                              | **identical**                                                                         |
| Run, Running / question / interrupted+question / Completed / accepted-pass step | 0             | 0                                                              | **identical** controls                                                                |
| Run, non-Completed with End cursor                                              | +17           | +54 (Failed, Cancelled, Interrupted, Running), +3 (NeedsHuman) | `Current step` fact shown again                                                       |
| Run, failed Test / invalid evidence (End-cursor fixtures)                       | +17           | +21                                                            | same fact; these fixtures park the cursor on End                                      |
| Run, attempt disagrees with run                                                 | +39 … +156    | +31 … +39                                                      | warning title, attempt-status note, `inspectUnknown` guidance                         |
| Step, invalid evidence with counts                                              | +60           | +21                                                            | "Reported by the test runner, not accepted:" label                                    |
| Step, invalid evidence without counts                                           | −30           | −9                                                             | dash row removed                                                                      |

States **intentionally made longer**: a run/attempt disagreement, a non-Completed run with an End
cursor, and counts under unaccepted evidence. The first is defensive and not produced by current
writers; the second returns one line that P2 had hidden; the third adds one label.

## Tests (real counts; Node 24.14.0, pnpm 10.33.2, actual tsx configuration)

| Check                                                                                                                         | Result                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CI-selected UI unit group (`TSX_TSCONFIG_PATH=packages/ui/tsconfig.json node --import tsx --test packages/ui/test/*.test.ts`) | **278 pass, 0 fail, 0 skipped** (267 existing + 11 new)                                                                                                                                                                  |
| F1 behavior suite (24 cases, `ux-p2f1-behavior.mjs`)                                                                          | **24/24** on F1 · **4/24** on the integration baseline (the 20 failures are exactly the changed behaviours; the 4 passes are the "unchanged" controls)                                                                   |
| UX-P2 behavior suite (30 cases)                                                                                               | **30/30** on F1 and on the baseline (two scenarios' assertions updated, below)                                                                                                                                           |
| UX-P1 behavior / focus                                                                                                        | 14/14 and 6/6 on F1 · baseline 13/14 in 2 of 6 runs, 14/14 in the other 4 (intermittent, below) · focus 6/6 on both                                                                                                      |
| UX-M1 / UX-M2 / UX-M4 / context-picker                                                                                        | **30/30, 18/18, 22/22, 14/14** on F1 and on the baseline                                                                                                                                                                 |
| UX-M3, U1, U2, U4, U5, U5-F1                                                                                                  | 31/31, 5/5, 7/7, 3/3, 3/3, 2/2 on both trees                                                                                                                                                                             |
| U3 `Advanced border ownership…`                                                                                               | passed once on F1, failed once on the baseline, then intermittent on both (below)                                                                                                                                        |
| `pnpm typecheck`                                                                                                              | exit 0                                                                                                                                                                                                                   |
| `pnpm lint`                                                                                                                   | exit 0: 0 errors, 75 warnings (unchanged from the P2 report)                                                                                                                                                             |
| `node scripts/ci/architecture-changed.mjs`                                                                                    | OK, 0 violations, 0 new                                                                                                                                                                                                  |
| `node --test scripts/ci/*.test.mjs`                                                                                           | 18/18                                                                                                                                                                                                                    |
| `oxfmt --check` on the changed files                                                                                          | clean (exact list in the PR checks)                                                                                                                                                                                      |
| Full local `node scripts/ci/graph-cloud-suite.mjs`                                                                            | **1,075 pass, 0 fail, 4 skipped** of 1,079 (scripts 166/166, services 631 + 4 expected skips, ui 278/278). The accepted P2 CI run had 1,064 passes and the same 4 skips: the difference is exactly the 11 new unit tests |

Exact scenario-name comparison, baseline vs F1, across all 15 rendered suites: identical pass/fail
sets for 12; the three that differ are `ux-p2f1-behavior` (by design) and the two intermittent
cases below. Nothing else differs.

**Retained intermittence, reproduced on both trees before attribution** (not a waiver; the reruns
used the same command on both trees):

- U3 `Advanced border ownership, keyboard disclosure, English/Chinese and light/dark` fails with
  `locator.scrollIntoViewIfNeeded: Element is not attached to the DOM` at `u3-browser.mjs:40`. It
  locates the Context disclosure right after a locale/theme switch remounts the page. Across 21 runs
  per tree: **baseline 10 failed, F1 13 failed**, the same single scenario and message every time
  (difference not significant; F1 changes nothing in that component). This is the same intermittence
  the P2 report recorded.
- UX-P1 `inspection keyboard, Escape and focus return` (`focus returns` false !== true): baseline
  2 of 6 runs, F1 0 of 6. F1 does not touch the inspection panel.

**P2 assertions updated for intentionally superseded rules** (the four case names are unchanged; no
other semantics were relaxed): `UX-P2 run: a genuine Test FAIL stays distinct and never implies an
approval` (en-US, zh-CN) now expects the End-cursor `Current step` of that stopped fixture (was
absent); `UX-P2 new run: no-checks:no saved checks route to Checks setup` (en-US, zh-CN) now expects
one setup command in the Checks row, a footer locator, and focus landing on it. Run unchanged on the
F1 code before the integration merge (the merge touches none of these files), the original P2 suite
failed exactly these four names and nothing else.

What the new suites assert (EN and ZH where relevant): one `Set up project checks` in the whole
pane; the 10-blocker footer reason and full list; the locator's focus targets and progression;
Escape/Enter/Space/Tab behaviour; draft retention; Review/Save gating; the mismatch matrix (five
attempt statuses × banner, tone, no spinner, attempt note, accent action, no approval, record
untouched); consistent runs unchanged; the End-cursor matrix; reported-not-accepted counts,
`observationValid` and the raw JSON; native-driver `innerText` of `graph-tool-reportFresh/Parsed`
with Evidence checks open; and negative controls (routing, expanding every disclosure and tab changes
cause no Save, instantiate, prepare, run, conversation open, answer or inspection start).

## Contracts and selectors

Kept: every `data-testid`, `data-state`/`data-status`/`data-tone`/`data-blocked-by` value, exact
native-driver labels, command review text, the unsaved-check notices, the Needs-you note, the
"Not visited" chips, Evidence checks **open by default** (native `innerText` reads), native step
navigation and draft retention. Differences a driver could see: `graph-new-run-setup-checks` (a
P2-only id) is **removed**; `graph-go-to-first-field` is **present again** with no saved checks;
`graph-run-current-step` and `graph-run-show-step` are present again for a non-Completed End cursor
(they remain absent for Completed); `graph-tool-counts` gains `data-accepted` and is absent when
unaccepted evidence reports no count; the Checks row's setup/refresh buttons swap `data-variant`
(`outline`/`ghost`) when no checks are saved. New: `graph-run-attempt-status`. Nothing here changes
a native-driver label; any driver that clicked the removed P2-only footer id must use
`graph-template-setup-checks` (the same control the existing drivers already click).

## Not done / limits

- No native, Windows, Electron, installer, packaging or screen-reader run. Windows EOL: every file
  this change adds is LF in the index and the working tree (`.mjs` is `eol=lf`); nothing was relabelled.
- The End-cursor fixtures park a _stopped_ run's cursor on End; real stopped runs normally keep the
  cursor on the failing step. A non-Completed End cursor in real records means the final gate was
  approved and the run never settled, which is why the fact is kept.
- Finding 3 is defensive: no live disagreement was observed or is producible by current writers.
- Deferred (driver or owner dependencies unchanged from UX-P2): collapsing passing Evidence checks by
  default, a single unsaved-check notice, shortening the blocked-fields explanation, the Needs-you
  scope note. Separate and not touched: the global/non-Graph focus indicator and the conflicting
  light-hover contrast measurements.

## CI

The PR targets the integration branch, so the Graph workflow's required jobs (`typecheck`,
`static-checks`, `graph-tests`, `graph-cloud-required`) run on a draft `pull_request` event. This
report is committed in the head it describes, so it cannot cite that head's own run: the exact
final-head run id, its commit and per-job results are recorded in the PR description and a PR comment
after the run completes. Local results above are not CI and are not presented as CI.
