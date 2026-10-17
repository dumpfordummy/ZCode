# G1 test synchronization repair

## Scope and ownership

Intended code file: `packages/services/test/graphAutomaticNetworkConsumers.test.ts` only.
Diagnostics/report files use the G1 prefix; existing historical receipts remain immutable.
The existing loopback HTTP recorder alone owns observed request evidence. The existing
provider runtime and synchronizer retain all production ownership, policy and disposal.
No production, UI, package, CI, public contract or persisted format changes.

## Event order and failure semantics

```text
runtime.start -> background refresh -> fetchRelease call counter
                                   -> optional test-only gate
                                   -> real loopback HTTP -> recorder observes method/path
                                   -> consume response -> refresh settles (including lease IO)
test: await actual observation + owned refresh settlement -> exact count/method/path
cleanup: reset fake timers -> dispose runtime -> join owned refresh -> close server -> remove temp dir
```

The call counter is not HTTP evidence. Keep the existing five-second observation
deadline. Preserve exact request equality and Graph zero-request/explicit-refresh
assertions. Surface transport/background errors; never accept a recorded hit alone
as successful fetch completion. Test-only tracking must return the original refresh
promise, invoke the existing owner once, and never initiate an extra refresh to drain.
Cleanup must await that same work before closing the server/removing its directory.
Respect the owner's abort signal; consume response bodies. A gated regression releases
its gate in a finally block, with no sleep as its correctness condition.

## Verification

Demonstrate calls=1 with recorder=[] behind a deterministic gate, then allow the real
request and require exact GET /builtin-release after completion. Suppressed request,
wrong method and wrong path mutation controls must fail the corrected positive test.
Run bounded serialized repetitions of the full consumer file plus policy/telemetry
safety tests; run pinned typecheck, lint, architecture and exact changed-file format.
Keep the previous failed CI 38956773120 and Windows ASAR/ESM limitations historical.
Push one reviewed test-only fix to #24 and verify all four new-head CI jobs.

## Coordination boundary

Compute a proposed combined tree with frozen UI 79fa0bbf54c329fdb9674408be5fbe2b69ec0373.
Prove product/Renderer bytes match old accepted combined tree c272b4f00fad7dc3acf1f04621d134a8ee0573be.
The old exact-tree UI receipt does not cover the new tree. Stop before either PR merge;
leave #25 draft and unchanged. Require a new owner-relayed same-tree UI receipt later.
