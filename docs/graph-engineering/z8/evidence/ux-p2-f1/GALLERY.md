# UX-P2-F1 gallery — before / after

Real Graph components in the synthetic Host harness, identical fixtures on both trees. **Before** is
the actual merged integration `3806cdb49d85e6017f17524019abb2a2aa49b344` (tree `ecb71be…`, includes
UX-P2). **After** is the tested F1 tree `4cd5b76e315b34b0d5e2ce2320c64586a3fdba3d`. Synthetic records
only: not native, Windows, Electron or installer evidence.

Full matrix: 30 captures × 6 variants = **180 pairs** (English/Chinese, dark/light; 1366×768,
1093×614, 900×640): 126 changed, 54 identical, **0 horizontal overflow** after
([metrics.json](metrics.json)). The committed images below are a bounded selection; identical
controls are included on purpose.

| Finding                          | Capture (variant)                                                                                                                                                           | What to see                                                                                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1+2 duplicate / multi-blocker    | `new-run-no-checks-many-end-1366` ([before](before/new-run-no-checks-many-end-1366.png) · [after](after/new-run-no-checks-many-end-1366.png))                               | Two `Set up project checks` → one (outlined, in Checks). Footer `Go to first field`; count "10 to complete or correct" and the full list unchanged. |
| 1 duplicate, Chinese, narrow     | `new-run-no-checks-end-1093-zh` ([before](before/new-run-no-checks-end-1093-zh.png) · [after](after/new-run-no-checks-end-1093-zh.png))                                     | Same, only checks left: the footer locator leads focus to the one setup button.                                                                     |
| 2 progression, 900px             | `new-run-no-checks-filled-end-900` ([before](before/new-run-no-checks-filled-end-900.png) · [after](after/new-run-no-checks-filled-end-900.png))                            | Three open (context + two checks): one setup command, locator in the footer.                                                                        |
| 3 mismatch (question)            | `run-mismatch-question-1093-zh` ([before](before/run-mismatch-question-1093-zh.png) · [after](after/run-mismatch-question-1093-zh.png))                                     | Spinner + "nothing is needed" beside "needs you" → warning banner naming the pending question.                                                      |
| 3 mismatch (unconfirmed)         | `run-mismatch-unknown-1366` ([before](before/run-mismatch-unknown-1366.png) · [after](after/run-mismatch-unknown-1366.png))                                                 | "agent work is running" with an Unknown attempt → "native status is “Unknown” while the run says Running. Treat it as unconfirmed."                 |
| 3 mismatch (permission), 900px   | `run-mismatch-permission-900` ([before](before/run-mismatch-permission-900.png) · [after](after/run-mismatch-permission-900.png))                                           | Permission block unchanged; the Execution fact now names the native attempt status.                                                                 |
| 5 End cursor, failed             | `run-end-failed-1366` ([before](before/run-end-failed-1366.png) · [after](after/run-end-failed-1366.png))                                                                   | `end · Inspect step` was shown without its `Current step`; both are shown now.                                                                      |
| 5 End cursor, interrupted, zh    | `run-end-interrupted-900-zh-dark` ([before](before/run-end-interrupted-900-zh-dark.png) · [after](after/run-end-interrupted-900-zh-dark.png))                               | Recovery and conversation actions stay; the End cursor is shown, not hidden.                                                                        |
| 5 control, Completed             | `run-end-completed-1366` ([before](before/run-end-completed-1366.png) · [after](after/run-end-completed-1366.png))                                                          | **Identical.** A Completed run still shows no End button or fact.                                                                                   |
| 4 counts, invalid evidence       | `step-invalid-evidence-1366` ([before](before/step-invalid-evidence-1366.png) · [after](after/step-invalid-evidence-1366.png))                                              | "1 discovered · 1 passed" → "Reported by the test runner, not accepted: …" in the subtle tone. Still invalid evidence, not a failed Test.           |
| 4 counts, zh, dark               | `step-invalid-evidence-1093-zh-dark` ([before](before/step-invalid-evidence-1093-zh-dark.png) · [after](after/step-invalid-evidence-1093-zh-dark.png))                      | Same in Chinese: 测试运行器的报告，未被接受。                                                                                                       |
| 4 no reported counts, 900px      | `step-invalid-no-counts-900` ([before](before/step-invalid-no-counts-900.png) · [after](after/step-invalid-no-counts-900.png))                                              | The `— discovered · — passed · — failed · — skipped` row is gone.                                                                                   |
| 4 control, accepted failing Test | `step-failed-test-1366` ([before](before/step-failed-test-1366.png) · [after](after/step-failed-test-1366.png))                                                             | Counts keep their unlabelled form (accepted evidence). The run-level difference is the End-cursor fact of this fixture.                             |
| 1+2 control, saved checks        | `new-run-checks-saved-fields-open-end-1366` ([before](before/new-run-checks-saved-fields-open-end-1366.png) · [after](after/new-run-checks-saved-fields-open-end-1366.png)) | **Identical.** With saved checks nothing about the footer or the checks row changes.                                                                |

Checks-setup page text with **Advanced expanded** (finding 6, JSON in [checks-page/](checks-page/)):
UX-P1 head `p1-*`, UX-P2 head `p2-*`, F1 `f1-*`. `p1` ≠ `p2`; `p2` = `f1` in both languages.

Keyboard behaviour (Tab/Enter/Space/Escape, focus after a route, no action from navigation) and the
passive no-admission rules are asserted by `scripts/graph-engineering/ux-p2f1-behavior.mjs`, not by
these images.
