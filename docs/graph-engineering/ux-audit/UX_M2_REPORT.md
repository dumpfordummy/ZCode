# UX-M2 report: pick up where you left off

Date: **2026-09-30**. Plan: [UX_M2_MILESTONE.md](UX_M2_MILESTONE.md). Contract and as-built notes: [UX_M2_SPEC.md](UX_M2_SPEC.md). Current user flow: [USER_GUIDE.md](USER_GUIDE.md).

**Status: CLOUD DEVELOPMENT COMPLETE — WINDOWS ACCEPTANCE PENDING.** UX-M2.1, UX-M2.2 and UX-M2.3 are implemented and verified in the Cloud. Everything below ran on Linux in Chromium with a fixture Graph Host. It is not Electron, not the native session owner, not real permissions and not Windows. **Windows acceptance has not been run and is not claimed.** The UX-M1 BLOCKED / NOT RUN items ([UX_M1_WINDOWS_REPORT.md](UX_M1_WINDOWS_REPORT.md) sections 6 and 8) are unchanged: this milestone neither closes nor waives them.

## 1. Identity

| Item         | Value                                                                                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Branch       | `claude/graph-ux-m2`, pull request targeting `claude/zcde-graph-ux-audit-be80d8`                                                                                                                                         |
| Baseline     | `3c5cff4` (merge of PR #4: UX-M1 Windows acceptance; its defect fix `f5d610b` is an ancestor)                                                                                                                            |
| Code tip     | `6134b19` (the final Cloud pass ran on this commit; the later commits are documentation only)                                                                                                                            |
| Tooling      | Node v24.14.0 (nvm, checksum-verified), pnpm 10.33.2, Chromium 141.0.7390.37 through the repository's `playwright-core`, linux-x64                                                                                       |
| Dependencies | `pnpm install --frozen-lockfile --ignore-scripts`; none added; lockfiles, engine requirements, `architecture-policy.yaml`, lint thresholds and permission policy unchanged. Product source changed only in `packages/ui` |

The Cloud container still has no working Electron runtime (dependency-only `--ignore-scripts` install), no .NET SDK and no Microsoft Edge. The Desktop **renderer** was built with the repository's Vite (`vite build` in `packages/desktop`) only to supply CSS to the historical `pre-z8-u4-history` driver; no Desktop app was launched.

## 2. Checkpoints

| Checkpoint  | What the user gets                                                                                                                                                                      | Spec      | Commits                            |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------- |
| Plan        | approved milestone saved                                                                                                                                                                | —         | `aed7ede`                          |
| **UX-M2.1** | history newest first; Start / Go to run / View current run / Back to run show the run's page; refreshes move nothing; Newer/Older; app-locale times                                     | `819f3d9` | `1b58848` feature, `abad33c` tests |
| **UX-M2.2** | unsaved check edits marked where they matter and never used by Review; Save explains its whole-list scope; Discard names the whole list and is confirmed; Back stays immediate          | `58bf0ae` | `b7b421e` feature, `49c67bc` tests |
| **UX-M2.3** | failures on Context, Checks and the New-run/review bars are framed above the verbatim diagnostic; only admission-path failures appear beside Review; no duplicate or unhandled failures | `a996840` | `2c2fb4e` feature, `93962e3` tests |
| Polish      | notices use icon plus foreground text (DESIGN.md); the Save button reads "Save checks"                                                                                                  | §5        | `0d4773c`, screenshots `6134b19`   |

Each spec section was committed before the behaviour it describes.

## 3. What was implemented

**UX-M2.1.** History is a renderer projection, `graphRunsNewestFirst`: the reverse of the Host's append order. That order _is_ creation order, because the Host appends each admitted run and never reorders its record (`app/service.ts`, `app/state.ts`). `createdAt`, `updatedAt` and progress are not sort keys, so ties and clock changes cannot reorder rows, and the Host array is never mutated. Every `selectRun` (the one path used by rows, Start, Go to run, View current run and Back to run) increments a navigation-only `reveal` counter. `GraphRunHistory` shows the selected run's page when the counter changes, even for an already selected run after the user browsed away; if the run is not yet projected, it waits for it, once. Refreshes and Host events never change the counter, so the page, selection and focus stay put. The paging buttons read **Newer runs / Older runs**. Five Graph timestamp sites (history, captured details, approval decisions, release, routing deadline) use the app locale through `graphTimestamp`; an invalid, missing or non-positive value reads "Time not recorded". The sixth, the captured ISO-8601 text in the preflight provenance, keeps its exact format and no longer throws on an invalid value.

**UX-M2.2.** `graphRecipeChanges` compares the saved list a draft started from (`baseText`) with the whole draft (`text`) by stable id:

- It reports added, changed and removed checks, and order changes. Key order is ignored.
- A draft it cannot summarize completely (invalid JSON, a missing id, duplicate ids) is reported as such, never as a partial list.

Where this shows:

- **Checks editor.** Changed and new rows are marked. A summary block sits above **Save checks** and describes it: what changed, "not used by the next run", and that Save writes the whole list, including earlier visits.
- **Back bar.** It says unsaved edits stay and are not used. Back is still immediate.
- **New run.** It says the saved checks shown are what Review and the next run use, and marks affected selected checks. The saved name, kind and "Saved · not run" stay; draft values are never substituted.

**Discard all unsaved check edits…** opens an inline confirmation that names the whole list (focus on **Keep editing**). It then reuses `acceptRecipes` with a ready, non-conflicting snapshot, and is disabled with a reason while the saved checks are not loaded. The conflict flow is unchanged and remains the only discard path during a conflict. Save authority, validation, digest handling and the refusal while a run is unresolved are unchanged.

**UX-M2.3.** Action errors are tagged `review`, `start` and `design` besides `checks`. The New-run bar and the review commit bar now show only admission-path failures, as UX-M1 section 9 already required:

- `review` (and instantiate): "Review could not be prepared. Nothing was started; …".
- `start`: "Start did not complete. Check the run list …". It does not claim nothing started, because a lost response can have admitted a run.

A failed **Save checks** is framed once near Save ("The saved checks were not changed. Your unsaved edits are kept."). The generic alert no longer repeats it.

The Context picker:

- It names the attempted file: the search result, or the file name of the path the native chooser returned, with the full path as the title.
- It says "previous selection … kept" only when there was one, otherwise "Nothing is selected for this slot".
- It treats a cancelled chooser as no failure and clears any earlier failure message.
- It catches a chooser error, which used to be an unhandled rejection.

Host diagnostics are shown verbatim beneath every framing.

### Boundaries preserved

The following are untouched:

- Graph Host ownership and admission (one unresolved run), native permission ownership.
- Preflight acknowledgment, reviewer parsing, approval, evidence validation, recovery, concurrency.
- Stored timestamps, captured definitions and diagnostics.

Also: no queue, auto-start, history search or filtering, draft persistence across restarts, `html lang` change, workflow-library redesign, reviewer retry, packaging or Z8. No credentials, no live model call, no company project.

## 4. Verification actually run (final combined Cloud pass, code tip `6134b19`)

From `/home/user/ZCode`, Node v24.14.0 / pnpm 10.33.2. Exit codes are the real ones.

| Command                                                                                                     | Exit  | Result                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node scripts/check-workspace-freshness.mjs`                                                                | 0     | fresh; ahead 36 / behind 1 of `origin/main` (threshold 50)                                                                                                                                                                                                                                                        |
| `pnpm typecheck`                                                                                            | 0     |                                                                                                                                                                                                                                                                                                                   |
| `pnpm lint`                                                                                                 | 0     | 0 errors, **75 warnings**, none in a changed file (the pre-existing baseline)                                                                                                                                                                                                                                     |
| `pnpm architecture:check` (full)                                                                            | 0     | violations 0, baseline 0, new 0                                                                                                                                                                                                                                                                                   |
| `oxfmt --check` on the 61 changed source, test, script and doc files (`git diff --name-only 3c5cff4..HEAD`) | 0     | all correctly formatted                                                                                                                                                                                                                                                                                           |
| `node --import tsx --test test/*.test.ts`, cwd `packages/ui` (40 files)                                     | 0     | **197 pass, 0 fail, 0 skipped** (184 before; 13 new)                                                                                                                                                                                                                                                              |
| `node --import tsx --test <59 packages/services/src/graph-engineering/**/*.test.ts>` (package unchanged)    | 0     | 360 tests: **358 pass, 0 fail, 2 skipped** (genuine-TRX replay needs `PRE_Z8_TRX_FIXTURE_MANIFEST`, not set)                                                                                                                                                                                                      |
| `node --import tsx --test scripts/graph-engineering/context-picker-roundtrip.test.mjs`                      | 0     | 6 pass                                                                                                                                                                                                                                                                                                            |
| `node --import tsx --test scripts/graph-engineering/*.test.mjs` (22 files)                                  | **1** | 120 tests: **109 pass, 11 fail, 0 skipped**. All 11 are environment limits in files this branch did not touch (nor their imports): 7 need the .NET SDK (`pre-z8-dotnet-fixture`, `z4/z5/z6-fixture`), 4 launch Microsoft Edge (`pre-z8-u4-manifest-wait`, `channel: "msedge"`). They passed on Windows in UX-M1.4 |
| `node --import tsx scripts/graph-engineering/context-picker-browser.mjs --chromium=…`                       | 0     | **14 pass, 0 fail**                                                                                                                                                                                                                                                                                               |
| `node --import tsx scripts/graph-engineering/ux-m1-browser.mjs --chromium=…`                                | 0     | **30 pass, 0 fail** (24 behaviour; the 6 screenshot scenarios return immediately without `--shots` and are not counted as behaviour evidence)                                                                                                                                                                     |
| `node --import tsx scripts/graph-engineering/ux-m2-browser.mjs --chromium=… --shots=<dir>`                  | 0     | **18 pass, 0 fail**: 16 behaviour scenarios (5 history, 6 checks, 5 failure framing) and 2 screenshot scenarios (22 images)                                                                                                                                                                                       |
| `pre-z8-u4-history.mjs` (historical 500-row history driver), as an **uncommitted temporary copy**           | 0     | `PASS` (23 interactions, 4 screenshots). The committed driver hard-codes the Windows Edge channel and Chromium's sandbox; the temporary copy changed only those two launch options (`executablePath` Chromium, `chromiumSandbox: false`, needed as root in this container) and was deleted after the run          |

Temporary `.tmp/` output from these runs was removed afterwards (it is gitignored).

### Fixture boundaries (disclosed in every result)

These are unchanged from UX-M1 section 4. **Real:** the Runs/Checks/Context UI, the draft and view stores, i18n, the real `useGraphEngineering` and `useGraphReferencePicker` hooks, and the Host's `instantiateTemplate`, recipe store (`.zcode/config.json`, schema validation, digest conflicts) and reference validation. **Fixture:** the Graph engineering service (view, run list, admission, change events, and a mirror of the "recipe edits are blocked while a graph is unresolved" rule), the workflow preflight (built from the real recipe store and reference validation), the run records (the UI tests' `summaryRun()` variants), file search, the native chooser and the transport. **Labelled stubs:** the composer's model/mode hook, the Workflows design-panel body, `useSettings`.

Two fixture changes, both recorded in the spec: the fixture Host now **appends** admitted runs like the real Host (it prepended before), and the fixture chooser can be made to throw.

## 5. Mutation checks (do the tests fail when the behaviour is broken?)

Each defect was applied to the working tree, the suite was run, and the file was restored byte-identically (checked every time).

| Checkpoint | Mutation                                                                       | Result                                                                                       |
| ---------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| M2.1       | newest-first projection removed                                                | detected (4 scenarios)                                                                       |
| M2.1       | page not moved on explicit navigation                                          | detected (Start; Go to run / View current run)                                               |
| M2.1       | page follows the selection on every render                                     | detected                                                                                     |
| M2.1       | page follows the selection whenever the runs change (a refresh moves the page) | detected, after the refresh scenario was strengthened to browse a page without the selection |
| M2.1       | `selectRun` does not increment `reveal`                                        | detected                                                                                     |
| M2.1       | timestamps in the OS locale without invalid handling                           | detected                                                                                     |
| M2.2       | summary drops removed checks                                                   | detected                                                                                     |
| M2.2       | New-run marker missing                                                         | detected (English and Chinese)                                                               |
| M2.2       | Discard without confirmation                                                   | detected (3 scenarios)                                                                       |
| M2.2       | Discard enabled without a ready snapshot                                       | detected                                                                                     |
| M2.2       | Back bar does not disclose unsaved edits                                       | detected                                                                                     |
| M2.2       | a second discard path offered during a conflict                                | detected                                                                                     |
| M2.3       | "previous selection kept" without one                                          | detected                                                                                     |
| M2.3       | chooser path not named (UX-M1 behaviour)                                       | detected                                                                                     |
| M2.3       | cancel keeps the earlier failure: one of two clearing paths removed            | **not detected**, and correctly so: the other path still clears it                           |
| M2.3       | cancel keeps the earlier failure: both clearing paths removed                  | detected                                                                                     |
| M2.3       | chooser error not caught (UX-M1 behaviour)                                     | detected (unhandled page error)                                                              |
| M2.3       | non-admission (checks) errors shown beside Review                              | detected (UX-M2, UX-M1 regression, unit)                                                     |
| M2.3       | checks error repeated by the generic alert                                     | detected                                                                                     |

## 6. Defects and findings

Fixed, each reproduced before the change:

1. **The just-started run was off the shown page** once history passed 25 runs (oldest-first, and page state set only on mount). This is Windows observation 3.
2. **Unsaved check edits looked applied.** New run showed the saved check with no sign of the edit; Review silently used the saved one.
3. **A failed Save checks was shown twice** on the Checks destination (probe: 2 alerts).
4. **A native-chooser error was an unhandled rejection** with nothing shown (probe: page error, 0 alerts).
5. **A chooser path failure named no file** and a cancel left an earlier failure on screen (Windows observation 4).
6. **Non-admission errors could appear beside Review**, although UX-M1 section 9 limited that bar to the admission path.
7. **Fixture fidelity:** the browser fixture Host prepended admitted runs.

Found during screenshot inspection and fixed: new notices in warning-orange text (below 4.5:1 in Zai Light), and the Save button reading "Save recipes" while everything else says "Save checks".

## 7. Screenshots

In [screenshots/ux-m2](screenshots/ux-m2/): Linux Chromium, fixture services, synthetic data. **All 22 images were opened and inspected by eye** after the final capture. Names are `<surface>-<locale>-<theme>-<size>`.

| Surface              | Variants                                    | Shows                                                                                                                                   |
| -------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `m2-new-run`         | en/zh × dark/light × 1280x720/1920x1080 (8) | newest-first history with app-locale times; "Checks has unsaved edits…" and the row marker; a failed preflight framed in the action bar |
| `m2-checks-summary`  | en/zh × dark/light × both sizes (8)         | the Back bar note, the change summary above **Save checks**, Discard, a failed save framed once                                         |
| `m2-discard-confirm` | en dark 1280, zh light 1920                 | the inline whole-list confirmation                                                                                                      |
| `m2-context-failure` | en dark 1280, zh light 1920                 | a chooser path outside the workspace: file named, previous selection kept, Host text verbatim                                           |
| `m2-history`         | en dark 1280, zh light 1920                 | the newest run selected at the top of the history                                                                                       |

The workspace header shows the fixture path `C:/synthetic`. The run inspector's 1970 deadline is the fixture's stored value (spec §5 item 8).

## 8. Known gaps (recorded, not fixed)

- **Windows and Electron are untested** for everything above.
- The replace dialog's design-save error path has no interaction test (the harness stubs the Workflows design panel).
- The UX-M1 native driver steps changed here are updated but **not executed**: `ux-m1-native-runs.mjs` E3/E4 (browse to an older page first; Go to run reveals the page) and `ux-m1-native-checks-occupied.mjs` (the disclosure is now the change summary). They stay pending until run on Windows.
- Four positional `graph-run` `.first()` selectors in historical drivers (`native-smoke`, `ux-m1-native-draft`, `ux-m1-native-states`, `z5-native-smoke`) operate on a single-run history and are order-independent. That was checked by reading, not by running.
- A mouse-chosen picker option can leave focus outside the search field, so Escape then needs the field focused; seen in the harness only.
- `<html lang>` is still `en` in Chinese: app-wide, out of scope, unchanged.
- Carried over unchanged from UX-M1: 3 blocked historical drivers, the un-run historical matrix, and the other BLOCKED / NOT RUN items of the Windows report.

## 9. Combined Windows acceptance checklist (UX-M2), not yet run

Run once, on the **exact** proposed integration commit, with the UX-M1.4 procedure: fresh CLI/runtime and Desktop builds with recorded provenance, emitting checks before the build, disposable workspaces, a controlled loopback provider, and no live credentials.

| #   | Step                                                                                                                                                                                                                                                                                                                                                               | Cloud evidence already shown                 | Only Windows can show                      | Result |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------ | ------ |
| 1   | Emitting checks (typecheck, lint, architecture, UI/services/script tests) on the Windows checkout, then build. Record fresh versus reused artifacts                                                                                                                                                                                                                | section 4 on Linux                           | the same on Windows (CRLF, .NET, Edge)     | ☐      |
| 2   | Run the scripts tests that need .NET and Edge (`pre-z8-dotnet-fixture`, `z4/z5/z6-fixture`, `pre-z8-u4-manifest-wait`) and the committed `pre-z8-u4-history.mjs` on Edge                                                                                                                                                                                           | 109/120 (11 environment) and a Chromium copy | the real environment                       | ☐      |
| 3   | Re-run `ux-m1-native.mjs` journeys `draft`, `context`, `checks`, `runs`, `presentation-*`, `states-*` and the six `reviewer-native` scenarios. `runs` (E3/E4) and `checks` (occupied) contain M2 edits                                                                                                                                                             | fixture scenarios                            | real native runs                           | ☐      |
| 4   | **History:** with more than 25 real runs, page 1 holds the newest; browse Older, then **Start**: the new run is on page 1, selected and visible; **Go to run**, **View current run** and **Back to run** reveal the run; a real Host progress event while browsing an older page moves neither page, selection nor focus                                           | 5 fixture scenarios                          | real history, real events, Electron focus  | ☐      |
| 5   | **Timestamps:** Windows display language different from the app language (for example Windows English, app Chinese): history, approval and captured-detail times follow the app                                                                                                                                                                                    | Chromium locale test                         | Electron's OS locale versus the app locale | ☐      |
| 6   | **Unsaved checks:** Edit check → change → Back is immediate; the New-run marker shows; **Review** lists the saved check (native preflight provenance); edits on two visits appear in the Save summary; Save writes exactly them; Discard names the whole list and needs confirmation; Save refused while a run waits; a real external edit gives the conflict flow | fixture scenarios over the real recipe store | the real Host rule and preflight           | ☐      |
| 7   | **Failure framing:** the **real OS file chooser** with a file outside the workspace (named, previous kept), a cancel (nothing shown), and an empty slot (no "previous" sentence); a real digest conflict on Save framed once; a real preflight failure framed in the bar                                                                                           | fixture chooser and injected failures        | the real dialog and Host messages          | ☐      |
| 8   | **Presentation:** 1280x720 and 1920x1080, Windows scaling 100/125/150%, Zai Dark and Light, English and Chinese on New run, Checks (summary, Discard), Context failure and history                                                                                                                                                                                 | 22 inspected Linux screenshots               | real chrome, DPI, fonts                    | ☐      |
| 9   | Short human usability check of the journey: open Runs, newest on top, Start a new request from a run, adjust a check (keep, discard or save knowingly), adjust context, Review, Start                                                                                                                                                                              | —                                            | a person                                   | ☐      |

Nothing in this checklist closes a UX-M1 BLOCKED / NOT RUN item unless that item is executed and recorded as such. Main merge, packaging and publication remain separately authorized.

## 10. How to reproduce

```
# root, Node 24.14.0 / pnpm 10.33.2 (mise.toml)
pnpm install --frozen-lockfile --ignore-scripts
pnpm typecheck && pnpm lint && pnpm architecture:check
(cd packages/ui && node --import tsx --test test/*.test.ts)
node --import tsx scripts/graph-engineering/context-picker-browser.mjs --chromium=/opt/pw-browsers/chromium
node --import tsx scripts/graph-engineering/ux-m1-browser.mjs --chromium=/opt/pw-browsers/chromium
node --import tsx scripts/graph-engineering/ux-m2-browser.mjs --chromium=/opt/pw-browsers/chromium --shots=<dir> --summary=<file.json>
```
