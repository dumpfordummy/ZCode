# G1 bounded test-only repair: local candidate

## Verified identity and scope

Remote and authenticated API identify `dumpfordummy/ZCode`; the extra `d` in the
original Pro attachment is preserved as supplied in Library
`libfile_ae6056b9f830819198a682f09b65a2ba`, not used to switch repositories.
Engineering parent: `690af6eb94b19197d16e327a788185ae9370b862`.
Integration: `ac5907e2e37c544843eb7f9ede25422290785309`.
Frozen UI: `79fa0bbf54c329fdb9674408be5fbe2b69ec0373`.
Both PRs unmerged, #24 ready, #25 draft; auto-merge off. Reviews/threads empty,
active required gate unchanged, no bypass. Existing engineering checkout used.

Only executable change is `packages/services/test/graphAutomaticNetworkConsumers.test.ts`.
The other two files are this report and `Z8_5_INT_P1_G1_SPEC.md`. No production,
Renderer, policy, persistence, package, native, CI or public-contract bytes change.

## Root cause and correction

The existing runtime intentionally starts refresh in the background. The fixture
incremented its call counter before the asynchronous HTTP request, but the old
positive test waited only for that counter. A deterministic test-only gate inserted
after the increment demonstrated calls=1 with recorder=[]; the old exact assertion
fails there. Releasing the gate then produced the actual expected loopback GET.
This proves the synchronization defect; it does not reconstruct every scheduling
detail of the historical CI failure or claim that arbitrary failures are harmless.

The positive test now awaits actual recorder evidence and settlement of the original
refresh, then asserts exactly one GET `/builtin-release` and one fetchRelease call.
The fixture tracks the original refresh promise without initiating another refresh,
forwards the owner's AbortSignal, checks HTTP 200 and consumes the response body.
Transport/background errors are retained and thrown as an AggregateError. Disposal
joins the same refresh including lease IO before closing the recorder/removing the
temporary directory. The original five-second bounded wait is unchanged.
An added regression gates the request after call-start and releases it in finally.
Graph no-start/no-timer/no-retry and explicit force-refresh assertions remain intact.

## Local verification

Toolchain: Node 24.14.0 / pnpm 10.33.2, existing locked dependencies. No install.

| Check                                                   | Result                                                                                                |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Original gated call-start ordering diagnostic           | 1 passed; old predicate true while original HTTP assertion fails; genuine HTTP observed after release |
| Consumers + automatic-network policy + telemetry policy | Five serialized runs, each 32 passed / 0 failed / 0 skipped                                           |
| Suppress real fetch block                               | Positive test fails at original five-second observation deadline                                      |
| Change real request method to POST                      | Positive test fails exact request comparison                                                          |
| Change real request path to /wrong-release              | Positive test fails exact request comparison                                                          |
| Throw synthetic loopback transport error                | Positive test fails with retained original transport error                                            |
| Real recorder responds HTTP 503                         | Positive test fails response-status assertion                                                         |
| `pnpm typecheck`                                        | Pass (repository project references; tests execute through tsx)                                       |
| `pnpm lint`                                             | Pass, 75 existing warnings / 0 errors                                                                 |
| `pnpm architecture:check --changed`                     | Pass, 0 violations; services is legacy/unmanaged; no source boundary changes                          |
| Exact changed-file `oxfmt --check`                      | Pass                                                                                                  |
| `git diff --check`                                      | Pass                                                                                                  |

Negative controls used disposable sibling test copies, one isolated positive test per
variant, bounded child deadlines, and real loopback HTTP. No tracked-source mutation,
fabricated recorder entry, weakened assertion, or retained mutant. Scripts and logs
are preserved in the owned checkout's `.tmp/g1/` (original-ordering.log,
control-\*.log, control-summary.json, focused-1.log through focused-5.log).
The mutation replacements target only the fixture fetch block (or recorder status);
all corrected observation/assertion code remains intact.

The first sandbox attempt had environment-constrained failures and was stopped;
its partial log and diagnostic timeout remain preserved, not counted as passing.
The same bounded diagnostic and full focused runs passed in the authorized native
execution environment. A freshness fetch initially failed sandbox DNS, then the
approved network-enabled freshness check passed. No performance comparison is made;
typecheck overlapped some stability verification. Historical Windows ASAR/ESM failures
are neither fixed nor relabelled green by this narrow task.

## Historical failed gate remains evidence

https://github.com/dumpfordummy/ZCode/actions/runs/38956773120

Tested head `690af6eb94b19197d16e327a788185ae9370b862`, merge
`c58aacb92ebc835eafbbcd2d48e25e00cffe1e01`, tree
`a101dd621c15464088db2aa386a09d61244a669a`.
typecheck/static-checks success; graph-tests/graph-cloud-required failure.
1,048 total / 1,043 pass / 1 fail / 4 expected skips.
Failure: `positive control: Production policy built-in sync downloads in the background after start`.
At old line 401 expected `[{ method: "GET", path: "/builtin-release" }]`, actual `[]`.
Full retained receipt/log: Library `libfile_403fe784bc088191bcb4004120d0c7d5`.

## Delivery and later coordination

This report precedes the one normal fix push. New-head CI and exact proposed combined
tree will be recorded in the final Library G1 receipt; no old CI is substituted.
The old accepted combined tree `c272b4f00fad7dc3acf1f04621d134a8ee0573be`
is historical after test bytes change. Even when product/UI bytes match, a new
same-tree owner-relayed Claude acceptance is required before any later merge.
Neither PR is merged in G1; #25 is not updated, pushed or marked ready. No installer,
.309, release, tag, publication, installed .308 change or company code access.
