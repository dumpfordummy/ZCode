# ENG-P1: verification observations and native-owner test readiness

Start source: `67e570228aa8a48f96fdbbe6c89eb54023879745`.
Depends on #23; not independently mergeable to integration yet.

## Scope and ownership

First measure the unchanged owners. The proposed files are this spec, an ENG-P1
report, sanitized `evidence/eng-p1/` observations, and uniquely named
`scripts/graph-engineering/eng-p1-*` development diagnostics/test entry helpers.
Production changes require a measured equivalence argument before implementation.
No UI, package, public contract, policy, permission or format change is proposed.

GraphState retains serialized admission/persistence and successor ownership;
GraphToolEvidence retains pre/post-exit evidence; recipe-sources retains complete
membership-before/content/membership-after; native operations, GraphRecipe and the
execution adapter retain permission and process ownership. No new runtime owner.

```text
review/preparation -> fresh scope + bytes -> private proof / Save
admission -> persisted reservation -> source verification -> native permission
permission -> native freshness -> execution -> observed exit -> fresh evidence
fresh evidence -> persistence -> successor admission with its own fresh checks
```

## Diagnostics

Use existing small and 100-project/5,000-source deterministic fixtures, the real
project preparation and recipe fingerprint owners, and existing phase callbacks.
Every operation has a UUID and a process-monotonic start/end. Phase intervals are
disjoint inside a fingerprint; their parent total is explicitly inclusive.
Count actual asynchronous filesystem calls, returned read bytes and peak concurrent
calls in a standalone diagnostic process; cumulative API durations overlap and must
not be added as wall time. Sample RSS and retain process peak RSS separately.
Do not log filesystem paths or contents in the sanitized JSON.

OS caches are not flushed. Fixture generation warms caches; serialized repeats do
not establish an uncontended machine. No SDK process, install, restore or feed call.
Optional provenance mode uses only explicit installed executable/package/system
roots and the existing byte-pinned capture owner, failing on any policy mismatch.
It is not native Web Build/Test proof. The historical 720.842-second continuation
is motivation only and is not a benchmark baseline.

## Native test entry

Require Node 24.14.0 and an explicit existing pnpm 10.33.2 CLI. From a dedicated
checkout with locked dependencies, use existing workspace package build scripts
for the transitive `@zcode/adapters` and `@zcode/core` prerequisites. Then run the
two existing native recipe/process-limit test modules, serially, with tsx.
Never bypass compiled package exports with aliases or a second implementation.
Build/load/test failures must return nonzero; do not report file-load failures as
passing native assertions. Windows-only skips retain their original conditions.
This is a development build, never an installer or desktop bundle.

## Acceptance and stop

Record focused measurements, exact prerequisites and native assertion counts.
Retain all six R1 Save/read tests unchanged and run the existing relevant selection.
Run pinned typecheck, lint, formatting, architecture and unchanged portable suite
on the final local candidate. Report platform failures and skip differences.
If no production optimization is proven safe, deliver that finding and the test
entry without manufacturing speedup or native execution claims. One draft child
PR targets the unchanged parent branch. Integration-targeted final-head CI remains
pending until #23 merges and an authorized normal merge/retarget can occur.
