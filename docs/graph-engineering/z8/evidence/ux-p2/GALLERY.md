# UX-P2 illustrative gallery (real components, synthetic records)

Real Graph components in the existing Chromium Host harness, **identical synthetic fixtures** before
(the untouched #25 head `79fa0bbf54c3`, harness files only) and after (the P2 branch). Not native,
Windows, Electron or operator acceptance. The full set is 99 paired captures (27 scenarios × 3
variants: 1366×768 dark EN, 1600×900 light EN, 1093×614 light ZH); `metrics.json` has every pair's
visible-character count, scroll height, overflow flag and whether the visible text changed. This
gallery keeps only the pairs that tell the story.

| State                                 | Before                                         | After                                         | What changed                                                                                                                                          |
| ------------------------------------- | ---------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent work running                    | ![](before/run-running-1366.png)               | ![](after/run-running-1366.png)               | Banner names the step and says nothing is needed; the conversation button is no longer accent-filled while nothing waits on the operator.             |
| Executor uncertain (interrupted)      | ![](before/run-interrupted-1366.png)           | ![](after/run-interrupted-1366.png)           | Human decision reads "Undetermined — the run's outcome is unconfirmed", not "the approval record is incomplete". Primary action stays the owned work. |
| Stale evidence                        | ![](before/run-stale-review-1366.png)          | ![](after/run-stale-review-1366.png)          | The banner now says why (evidence or graph changed; historical request preserved). Human decision keeps its original unresolved wording.              |
| Successful Build/Test, approved       | ![](before/run-passed-checks-1366.png)         | ![](after/run-passed-checks-1366.png)         | No `end · Inspect step` button, no `Current step: end` fact; "No action required" instead.                                                            |
| Genuine Test FAIL (step)              | ![](before/step-failed-test-1366.png)          | ![](after/step-failed-test-1366.png)          | Verdict, cause and `1 discovered · 0 passed · 1 failed · 0 skipped` first; the six Yes/No facts sit under "Evidence checks" (open).                   |
| Human approval pending (step)         | ![](before/step-approval-with-checks-1366.png) | ![](after/step-approval-with-checks-1366.png) | Opaque request id and the optional-comment row moved into "Request identity and frozen digests". Review text, successor, Approve/Reject unchanged.    |
| New run, valid                        | ![](before/new-run-valid-end-1366.png)         | ![](after/new-run-valid-end-1366.png)         | Checks status and its two actions share one row; the single-Build "relationship" line is gone.                                                        |
| New run, no saved checks              | ![](before/new-run-no-checks-end-1366.png)     | ![](after/new-run-no-checks-end-1366.png)     | Same blocker and reason; the route is **Set up project checks** instead of "Go to first field" (an empty select).                                     |
| Running, narrow Chinese (1093×614)    | ![](before/run-running-1093-zh.png)            | ![](after/run-running-1093-zh.png)            | Same change at the narrowest width in zh-CN, light theme; no overflow.                                                                                |
| New run no checks, narrow Chinese     | ![](before/new-run-no-checks-end-1093-zh.png)  | ![](after/new-run-no-checks-end-1093-zh.png)  | Same route change in zh-CN.                                                                                                                           |
| Run review (authorization), unchanged | ![](before/review-1366.png)                    | ![](after/review-1366.png)                    | **Byte-identical visible text** (compared in `metrics.json`): the exact command, checks and acknowledgment are untouched.                             |

Unchanged on purpose (also identical in `metrics.json`): the four inspection states (source
verification, awaiting permission, denied, executor lost), the native-permission wait, the
final-approval wait and the review screen.
