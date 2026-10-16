# ENG-P1-I1: parent integration and inherited harness repair

The 18 inherited rendered failures were reproduced by exact scenario name on Windows
and repaired in the generic test harness. Product verification, permissions, saved
stores and UI production code are unchanged. ENG-P1 still establishes **no speedup**;
R1 remains closed and its six real-store Save/read tests are untouched.

## Parent merge and source identities

- Repository: `dumpfordummy/ZCode`; integration: `claude/zcde-graph-ux-audit-be80d8`.
- Approved parent head: `67e570228aa8a48f96fdbbe6c89eb54023879745`.
- Approved integration base: `f7279c79824e518abc6f4fdeb2c6cf66b86bac31`.
- Historical parent CI remains run `38786638753`, synthetic merge
  `f76915ed72e88baf535dee0016edb558b8900781`.
- Marking #23 ready triggered run **38883964590**. All four jobs passed:
  typecheck `116917099934`, static-checks `116917099948`, graph-tests
  `116917099542`, graph-cloud-required `116918091000`. Actual graph logs confirm
  the exact head/base/synthetic merge and **1,041 pass / 0 fail / 4 expected skips**.
- Immediately before merging: exact head/base unchanged, review submissions and
  review threads empty, mergeable. The active integration ruleset required strict
  `graph-cloud-required`, allowed normal merge, and offered no bypass.
- Actual normal owner merge of #23: **`ac5907e2e37c544843eb7f9ede25422290785309`**.
  Its parents are the approved base and approved head, in that order. Tree
  **`bec8c719607dd7bb88aa049f6b55204a7a25ae18`** equals both the approved source
  tree and the tested synthetic merge tree. Actual and synthetic merge IDs are distinct.
- Child start: `2ff3884b510e8a5b664e35e8f8abca8ae2b0a514`.
- Normal integration merge in this child: `085f5000a5b3d13932a7b0ed6c3ce1a491e1e3e3`.
- Tested harness source: `0d0b81885acb3574c576d45178dff2283fe6f212`.
- #24 was retargeted to integration before the legitimate final delivery push.
  It stays **draft**, auto-merge off. #25 and its metadata were not edited.

## Repairs and guards

The real projectSetup facade answers `inspection-history` with
`{ kind: "inspection-history", records }` through `readProjectInspections`.
The generic fixture now supplies an explicit empty read-only history and the shared
UX allow-list admits only that exact operation. All other graph members still throw.
The previous fixture had thrown on the new history reader and assertClean subsequently
rejected its logged operation. This is fixture maintenance, not native inspection proof.

Four UX-M2 cases used a descendant selector matching both the raw-JSON disclosure and
its Advanced ancestor. The replacement requires the unique disclosure whose direct
content contains `graph-recipes-json`, then selects its own direct summary. It asserts
one editor/disclosure/summary, Enter expansion, Space collapse and retained focus.
No first-match shortcut, forced click or strict-mode disabling was added.

The size case already received a genuine rejection for the 103,425-byte synthetic file.
The current diagnostic is `Declared file is 0.10 MiB (103425 bytes) and exceeds the
0.10 MiB (102400-byte) limit.` The obsolete substring omitted the closing parenthesis.
The repaired case waits for the matching `big` search result and the actual Host
error event, asserts that exact diagnostic is rendered verbatim with the previous
selection framing, then verifies unchanged bindings and zero unintended operations.
No product limit, general timeout or retry policy changed.

Negative controls:

- On the real rendered passive Checks page, completed history is allowed. Injected
  `inspection`, `prepare-web-profile`, `unknown-inspection`, `FORBIDDEN`, recipe Save,
  and each existing admission operation independently make the guard fail. Each injected
  log item is removed exactly; the final original passive log passes.
- The real facade plus fixture rejects inspection start and cancel through the still
  forbidden `graph.inspectProject` member; assertClean also rejects the logged operation.
- Real temporary files prove 102,400 bytes accepted and 102,401 bytes rejected.
- Existing no-save/no-run/no-admission/model guards remain in their original scenarios.

## Local validation

Windows x64, Node **24.14.0**, pnpm **10.33.2**, installed Chromium **148.0.7778.96**.
Synthetic local workspaces, real components/hooks/store/reference validation, fixture
transport/native environment. These are rendered component checks, not Electron/native
execution or operator acceptance. No performance comparison is drawn from test timings.

| Check                               | Baseline              | Completed candidate    |
| ----------------------------------- | --------------------- | ---------------------- |
| UX-M1                               | 23 pass / 7 fail      | 30 pass / 0 fail       |
| UX-M2                               | 11 pass / 7 fail      | 18 pass / 0 fail       |
| UX-M4                               | 19 pass / 3 fail      | 22 pass / 0 fail       |
| Context picker                      | 13 pass / 1 fail      | 14 pass / 0 fail       |
| Focused fixture/byte-boundary tests | New coverage          | 2 pass / 0 fail        |
| Rendered passive negative controls  | New coverage          | 1 pass / 0 fail        |
| Typecheck                           | Prior ENG-P1 retained | exit 0                 |
| Lint                                | 75 existing warnings  | 75 warnings / 0 errors |
| PR architecture                     | No policy change      | 0 violations / 0 new   |

Baseline runs used the same existing runners without `--shots`, matching the reported
18 failure names; capture-only scenarios therefore returned early. Final runs enabled
`--shots` so capture scenarios also executed. Logs and JSON results are retained.

An executor transport disconnect interrupted the first final UX-M4 run before its
summary; its partial log remains `.tmp/eng-p1-i1/final-ux-m4.log`. The process was no
longer running. Only that interrupted suite was rerun (22/22); UX-M1/M2 and completed
static checks were not repeated. Context-picker/passive final runs had not started and
were then run normally. Recovery logs have separate names.

U3 is **separate from the 18**. Its prior intermittent result is retained, not called
fixed or green. It did not interfere with the affected suites here, so no U3 diagnosis
or large-project scan campaign was initiated. The supplied UX-P1 report identifies
the suite but does not name the intermittent scenario; no specific case is invented.

The prior ENG-P1 Windows portable result (1,042 pass / 2 baseline platform failures /
2 skips) remains historical; it is not relabelled green. No repeat native/installer,
provenance benchmark or full local portable campaign was needed for these harness edits.

## Supplementary pinned UI compatibility

One separate no-hardlinks clone, independent copied node_modules, temporary workspaces,
browser contexts and outputs. Offline frozen install: 1,739 cached packages reused,
zero downloaded, pnpm 10.33.2; no SDK, package-feed or runtime installation.

- Harness parent: `0d0b81885acb3574c576d45178dff2283fe6f212`.
- UI parent: **`2446d0c0e0a1e8189cad137fa36436b77bb0f9ea`**.
- Disposable detached merge: `bf46024b5bc1993365b0392f931ce02f69d8eff1`.
- Combined tree: `71521a6671f058aad50ad6e6759996d25c6019e1`.

The initial disposable checkout hit Windows filename length limits. Only that new
clone's Git long-path option was enabled; after verifying its expected HEAD, its index
was reconstructed and only missing tracked files materialized. No modified bytes or
other lane files were replaced. The combined merge had no source conflicts and is not
pushed. Final evidence below records compatibility results, not future combined-release
acceptance or Claude's subsequent focus-contrast change.

## Owned files and delivery boundary

Changed test code: `ux-m1-helpers.mjs`, `context-picker-host.mjs`,
`ux-m2-scenarios-checks.mjs`, `context-picker-scenarios.mjs`, new
`eng-p1-i1-harness.test.mjs` and `eng-p1-i1-passive-controls.mjs`, all under
`scripts/graph-engineering/`. Documentation: this report and I1 spec; sanitized evidence
under `docs/graph-engineering/z8/evidence/eng-p1/i1/`. Earlier ENG-P1/R1 files remain
immutable. Scripts are outside managed product modules; no contract or state owner changes.

Reproduction: with the pinned workspace tools and an installed Chromium executable,
run `node --import tsx scripts/graph-engineering/<suite>-browser.mjs
--chromium=<exe> --summary=<private-json-path> --shots=<private-directory>` for
`ux-m1`, `ux-m2`, `ux-m4`, `context-picker`. Run the two I1 entries with the same
Node loader (the `.test.mjs` via `node --import tsx --test`). Existing native prerequisites
remain documented by `eng-p1-native-tests.mjs`; they were not rebuilt for this pass.

This report is written before the final delivery push. Required final #24 checks are
pending until that push produces an actual supported PR event. The Library delivery
receipt will record the exact published head, base, tested merge and all four job results;
the parent green result above is not substituted for child CI.

Later definitive integration requires the owner to relay Claude's exact final SHA,
combine both final trees in a disposable checkout, resolve ownership conflicts with the
UI owner, then run combined checks. Neither individual PR nor this pinned snapshot
certifies that future tree. No child merge/ready transition, auto-merge, .309/installer,
release/tag, company repository or installed .308 change is authorized by this delivery.

## Named inherited-failure ledger

The following 18 names are from actual baseline JSON results, not inferred counts.

| Suite          | Exact scenario                                                                                                                                       | Baseline cause | Candidate / pinned UI |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --------------------- |
| ux-m1          | the draft survives the current run, Workflows, Checks and a workspace switch, and returns exactly                                                    | history        | fixed / fixed         |
| ux-m1          | Edit check opens that check in the one editor, keeps Back in view, and returns the identical draft                                                   | history        | fixed / fixed         |
| ux-m1          | missing, incompatible and unselected steps are explicit, block Review, and are never replaced                                                        | history        | fixed / fixed         |
| ux-m1          | a rename keeps the selection; a removal turns it unresolved and is not replaced (real saves through the real recipe store)                           | history        | fixed / fixed         |
| ux-m1          | cancel, a failed save and a digest conflict leave the request, workflow, references and check choices untouched                                      | history        | fixed / fixed         |
| ux-m1          | while a run is unresolved the draft and the checks editor stay usable, but saving checks is refused on every path                                    | history        | fixed / fixed         |
| ux-m1          | Simplified Chinese: new labels are localized; check names, ids and paths are not translated                                                          | history        | fixed / fixed         |
| ux-m2          | Edit check, then Back: Back is immediate, New run keeps showing the saved check and marks it, and Review's preflight uses the saved check            | selector       | fixed / fixed         |
| ux-m2          | Save summarizes the whole list by stable id, including edits retained from an earlier visit, and saves exactly that list                             | selector       | fixed / fixed         |
| ux-m2          | Discard names the whole list and needs confirmation; Keep editing changes nothing; confirming restores the saved checks                              | selector       | fixed / fixed         |
| ux-m2          | an invalid raw list cannot be summarized: the UI says so, Save is not newly enabled and still refuses, New run claims no per-row marker              | selector       | fixed / fixed         |
| ux-m2          | while a run is unresolved Save stays refused, but the summary, editing and a confirmed Discard still work                                            | history        | fixed / fixed         |
| ux-m2          | Chinese: the summary, markers and Discard are localized; check names and ids stay verbatim                                                           | history        | fixed / fixed         |
| ux-m2          | a failed Save checks is framed once near Save (not repeated by the generic alert) and never shown beside Review and run                              | history        | fixed / fixed         |
| ux-m4          | library footer: browsing Versions never shows New-run review language; a blocked Load into design is framed as that operation, with Open Use         | history        | fixed / fixed         |
| ux-m4          | one header: a single tab row with aria-current and the next-run context (model, mode, saved checks) on every destination                             | history        | fixed / fixed         |
| ux-m4          | New run: one action bar; ready text only when Review is possible; an occupied workspace shows a blocked Review, View current run and keeps the draft | history        | fixed / fixed         |
| context-picker | failed validation and cancelled chooser keep the previous binding; the Host error stays beside the slot                                              | size           | fixed / fixed         |

History: 13; selector: 4; size: 1. All 18 reproduced, all 18 pass on both trees.

## Completed supplementary results

| Pinned combined suite      | Pass | Fail |
| -------------------------- | ---- | ---- |
| ux-m1                      | 30   | 0    |
| ux-m2                      | 18   | 0    |
| ux-m4                      | 22   | 0    |
| context-picker             | 14   | 0    |
| ux-p1-behavior             | 14   | 0    |
| eng-p1-i1-passive-controls | 1    | 0    |

All capture cases in the four generic suites executed with screenshots enabled. UX-P1 behavior was read and executed unchanged; it was not edited. No definitive combined acceptance is claimed.
