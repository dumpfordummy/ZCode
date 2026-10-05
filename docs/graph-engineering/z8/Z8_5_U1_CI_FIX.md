# Z8.5-U1 PR #18 CI repair

This bounded repair follows the failures on PR head
`dc34aacb303100ce9679841b920fbcb04d343ac0`, including workflow
[37263456507](https://github.com/dumpfordummy/ZCode/actions/runs/37263456507).
The final head, tested merge and required CI results are recorded in
[draft PR #18](https://github.com/dumpfordummy/ZCode/pull/18).

## Native-driver compatibility

The old driver compared the exact English text of `graph-run-verification`.
U1 intentionally removed that duplicate explanatory paragraph. The underlying
assertion was that completing and approving an agent-led workflow must not
manufacture verified Tests when no Test evidence exists.

The driver now waits for the Completed execution fact, then uses a shared
assertion to require the exact run's summary, visible Completed execution and
visible `graph-run-evidence` with state `agent-reported`. The native scenario
retains its zero Tool attempts, zero test/native-test artifacts, unchanged test
source, separate human decision, negative success-label and restart/no-replay
checks. No removed product copy is restored.

The driver-selector guard still scans every existing driver. The removed
identifier is explicitly rejected, with a regression test proving a broad
template prefix cannot make it valid. New native assertion tests reject
verified/failed/missing evidence, hidden facts, another run and incomplete
execution. The same assertion runs against real U1 React components in English
and Chinese through the existing synthetic Host browser harness.

## Reviewer-request cleanup

The ENOTEMPTY failure did **not** reproduce locally: the affected test passed
once in isolation and 20/20 repeated runs before the fix. Source inspection
found a pre-existing cleanup ordering race: its directory-removal `t.after`
hook was registered before the fixture's service-disposal hook. The test releases
the controlled reviewer response at its end, so artifact writes can still be
in flight when directory removal begins. The reviewer test, fixture and service
were unchanged by the U1 implementation.

The four-line test-only fix captures the existing fixture disposer and awaits
it in the directory-removal hook before `rm`. That disposer calls the existing
`disposeAndWait`, draining in-flight writes. It also runs if a request assertion
fails. There are no retries, sleeps, ignored cleanup errors or runtime changes;
all reviewer-request assertions are unchanged. The affected test passed 20/20
repeated runs after the fix, and all three tests in its file passed.

## Local validation

Node 24.14.0 and pnpm 10.33.2 were used.

| Check                                            | Result                                                      |
| ------------------------------------------------ | ----------------------------------------------------------- |
| Driver selector guard                            | 3 passed                                                    |
| Native U1 assertion tests                        | 2 passed, including negative controls                       |
| Existing native U1 provider / record-fault tests | 6 / 5 passed                                                |
| Reviewer-request repetitions                     | 20/20 before and 20/20 after; isolated baseline also passed |
| Full reviewer-decisions test file                | 3 passed                                                    |
| Focused Graph UI tests                           | 233 passed, no failures/skips                               |
| U1 rendered component scenarios                  | 4 passed, no failures; no new screenshots                   |
| `pnpm typecheck`                                 | Passed                                                      |
| `pnpm lint`                                      | 0 errors, 75 existing warnings                              |
| Changed-file formatting                          | Passed                                                      |
| `pnpm architecture:check --changed`              | 0 violations, 0 baseline, 0 new                             |

These are native-driver assertion/provider tests and rendered-component tests,
not a fresh full Electron run. Existing local Desktop build outputs predate U1;
the working pilot was not rebuilt or replaced. Packaged/company-PC behavior
remains untested by this repair. The existing [gallery](evidence/u1/GALLERY.md)
is unchanged, and overall usability acceptance still requires review of the
visible Routing inspection, Persisted route checkpoints and Export metadata
manifest in step-list mode.

No CI workflow, selection, exclusion, required check, expected skip count,
aggregation, branch rule or permission is changed. PR #18 remains draft with
auto-merge off; no merge or release is authorized by this repair.
