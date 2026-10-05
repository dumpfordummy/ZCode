# PR #18 final bounded U1 information cleanup

The normal Steps view now omits ordinary routing diagnostics, empty checkpoint
sections and empty artifact headings. Nonempty retained artifacts show a collapsed
count. Manifest export is reached through Technical details. Accepted graph
layout, viewport, Fit/Focus and history behavior are unchanged.

## Exact presentation changes

- `GraphRoutingInspector` returns no ordinary single-iteration record section
  without feedback, fingerprint, stop reason or an unconsumed resume checkpoint.
  Stop reasons and the exact guarded Continue action remain visible. Multiple
  iterations or feedback/fingerprint show a compact repair summary, with a literal
  feedback preview. Raw admissions/deadline/repair-budget/iteration/checkpoint
  facts are available in Technical details and explicit repair-region inspection.
  Zero checkpoints render neither a checkpoint facts row nor a raw-record row.
  Raw JSON uses separate collapsed rows, preserving the existing one-level
  Technical tab disclosure rule.
- `GraphArtifactInspector` preserves the existing exact run/node/attempt artifact
  selection. An empty list renders nothing; a nonempty list has a localized count
  and on-demand metadata/content inspection. The existing read errors and exact
  identity mismatch checks remain. `GraphArtifactManifest` retains the read-only
  export hook and workspace/run scope invalidation in Technical details, including
  zero-artifact runs. English and Chinese singular/plural counts use the existing
  formatter's supported placeholders.
- `GraphRunTechnicalPanel` receives the existing selected run and hook actions;
  `GraphEditorSurface` only supplies those props. `GraphRunPanel` enables diagnostic
  routing only for explicit region selection. No service, Host, runtime, protocol,
  persistence, permission, admission or evidence-classification implementation
  changed. The Host remains the authoritative record/execution owner; disclosure
  state remains local UI state.

The spec was updated before implementation. The native verification assertion
from `65ca1b6b04d2dd1f8e98c7b4c769e1b893d50802` is unchanged: Completed
agent-led execution without configured Test evidence must visibly report
`agent-reported`, never verified Tests.

## Evidence and tests

[Five representative before/after states plus running footer](evidence/u1-density/GALLERY.md).
Before uses an immutable snapshot of `65ca1b6`; both sides use the same fixture
records and selection. Only 12 PNGs were added; no repeated graph screenshot
campaign or pilot rebuild. Rendered evidence is based on operator relevance,
not word-count reduction. Overall usability acceptance remains a human review.

The existing U1 suite gained a semantic operator-view scenario. The fixture Host
now supports only the two read-only artifact actions needed to exercise real
inspection hooks; record equality and zero admission/save calls are asserted.
The scenario covers five states, both locales/themes, two CSS viewports, exact
resume identity, keyboard disclosures, manifest/artifact reads and additional
failure/reviewer/question/stale/unknown states. It first failed against the old
UI's default routing section, then passed after the change.

Existing UX-M4 disclosure/native drivers now navigate to Technical details for
routing; their assertions were retained. The no-nested-disclosure assertion
caught a candidate regression, fixed by placing raw rows alongside fact rows.
Artifact native drivers open the new count disclosure and export via Technical
details, preserving all content/digest/error assertions. The selector compatibility
guard additionally covers both artifact drivers; its removed-verification-ID
rejection is unchanged. A small typed ID catalogue exposes the existing read
state/error IDs to the guard without broadening its selector matching.

Final local checks used Node 24.14.0 and pnpm 10.33.2:

| Check                                                      | Actual result                                            |
| ---------------------------------------------------------- | -------------------------------------------------------- |
| Focused Graph UI tests (`packages/ui/test/graph*.test.ts`) | 233 passed, 0 failures/skips                             |
| Full U1 rendered suite                                     | 5 passed, 0 failures                                     |
| Paired density baseline / candidate                        | 1 / 1 scenario passed, same synthetic records            |
| Full UX-M4 rendered suite                                  | 22 passed, 0 failures; no optional screenshot campaign   |
| Driver selector compatibility guard                        | 3 passed, 0 failures                                     |
| Native U1 semantic assertion tests                         | 2 passed, 0 failures; assertion implementation unchanged |
| Existing U1/U4 provider tests                              | 10 passed, 0 failures                                    |
| Existing manifest readiness locator tests                  | 4 passed outside restricted process sandbox              |
| `pnpm typecheck`                                           | Passed                                                   |
| `pnpm lint` (also through pre-push)                        | 0 errors, 75 retained warnings                           |
| Changed-file formatting                                    | Passed                                                   |
| `pnpm architecture:check --changed`                        | 0 violations, 0 new violations                           |
| `pnpm verify:pre-push`                                     | Passed                                                   |

The unchanged Edge locator tests initially could not run in the process sandbox:
Edge's GPU processes exited and closed the browser before assertions. The exact
same four tests passed with normal process access, without changing tests or flags.
An accidentally empty focused-file argument also caused a broader repository-wide
test discovery run: 1,496 tests, 1,467 passed, 25 failed, 4 skipped. That broad
attempt is **not** recorded as passing. Its failures included Windows absolute-path
ESM imports, unavailable native fixture inputs and the same restricted Edge launch;
not every unrelated failure was classified within this bounded UI task. The
correct explicit focused file list was rerun successfully. No gate, assertion,
skip count or CI selection was changed to conceal those results.

These checks validate rendered components and native driver/provider contracts,
not a fresh full Electron native journey, packaged candidate or company-PC
behavior. The existing pilot and build outputs were not rebuilt or replaced.

The upload contains bounded source/tests/spec/report and reviewed synthetic PNGs
with synthetic measurement JSON. The user's untracked `before and after.zip`
is preserved locally and excluded. Credentials, company code, private home paths
and personal profile material are not part of this change. No workflow, required
check, aggregator, exclusion, branch rule or CI permission was changed. Final
GitHub head, tested merge and required-check results are recorded in the PR
description after the live CI run. PR remains draft with auto-merge off; no merge,
tag, installer build/upload or release publication is authorized or performed.
