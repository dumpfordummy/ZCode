# Z8.5-U3 large .NET repository report

Integration base: `90eebe6d34ab8dea2ffce14db590aff7b7573f39`. One feature branch:
`codex/z8-5-u3-large-dotnet-repositories`. This report covers source review and synthetic
source-harness acceptance. It does not establish packaged-app or company-repository acceptance.
The `.306` installer, release, retained profiles and local archives were not modified.

## Behavior and capacity

The [specification](Z8_5_U3_SPEC.md) was written before implementation. Discovery now lists
readable metadata independently of verification eligibility. Selecting a Build target starts
its own bounded closure preparation. An incomplete global scan remains incomplete even when
an independently prepared subtree is usable. Required unreadable, missing, ambiguous, cyclic,
dynamic or unsupported dependencies block that target. Detection and preparation produce no
execution evidence and never save or execute automatically.

| Owner / resource                       | Previous                               | Final U3 budget / behavior                                                                 |
| -------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------ |
| Inventory metadata                     | 64 KiB/file, 512 KiB total, 64 records | 4 MiB/file, 64 MiB total, 2,048 records                                                    |
| Traversal / references                 | 2,048 entries, depth 8                 | 250,000 entries, depth 32, 16,384 reference edges                                          |
| Selected preparation                   | Global first 32 source paths           | Complete selected solution/project closure; 20,000 unique inputs                           |
| Source fingerprint adapter / schemas   | Independent 32-path caps               | 20,000 paths, 32 MiB/file, 512 MiB total, four streaming readers                           |
| Time / diagnostics                     | No explicit selected job contract      | 120 seconds/job; 128 diagnostics, 1,000 characters each; 20 detail rows/page               |
| Metadata parser                        | Evidence XML parser reused             | Separate 4 MiB project parser; 32,768 elements, 65,536 attributes, depth 16                |
| DTO / IPC                              | Repeated candidate inventories         | 2 MiB accumulated metadata/candidates, 4 MiB response; progress carries counts only        |
| Recipe validation / save               | 256 KiB file, 4,096 JSON members       | 32 MiB file, 700,000 members; compact immutable scope descriptor                           |
| Preview / capture / routing / evidence | Literal filename freshness             | Re-enumerate supported membership, then stream bytes, then revalidate membership           |
| Run repository                         | Unbounded full-file read               | Streamed 64 MiB read/write cap; retained excess is rejected without alteration             |
| Outputs / tests / receipts             | Independent existing limits            | Unchanged: 32 outputs, 32 recipes, seven Test scopes, 1,000 TRX results, 256 KiB artifacts |

Count and byte limits are independent; long paths or complex metadata can hit a byte/parser
budget first. Such results are explicitly limited and carry no authoritative prepared manifest.
Selected metadata is reread under a separate 64 MiB recheck budget within the same deadline.
Directory identity/membership and file identity checks are conservative, not an atomic snapshot.
The 32 MiB per-source cap retains the existing per-file contract; four readers bound concurrency.
The larger inventory and source budgets pass the representative fixtures below without changing
output, runner, receipt, approval or pass/fail semantics.

## Coverage and compatibility

Selected solution coverage includes every literal supported project in that solution, transitive
ProjectReferences, project subtree inputs and applicable ancestor metadata. Only `.git`, `.zcode`,
`bin` and `obj` are excluded by contract. `.gitignore` does not authorize exclusions. Single-quoted
XML references are parsed correctly; duplicate references deduplicate, while cycles/case aliases
and unsafe links fail closed. Tests must be reachable from their declared Build.

Applicable Directory.Build/Packages metadata and unknown imports remain explicit blockers.
Directory.Solution metadata and before/after solution targets apply to solution scope, not an
unrelated direct project. Ancestors outside the workspace are checked rather than assumed absent.
Unrelated sibling metadata and source changes do not stale an independent supported scope.
Standard solution folders are recognized as organization metadata, consistent with the
[MSBuild solution parser](https://github.com/dotnet/msbuild/blob/main/src/Build/Construction/Solution/SolutionFile.cs).
Source additions/removals/renames and relevant configuration/reference changes invalidate the
descriptor. Changed bytes beyond the former first 32 paths invalidate preview/evidence.

New descriptors are additive version 1 recipe configuration, with selected target, membership
digest and count. They do not point to a mutable cache or embed source content. Legacy literal
recipes retain their digest scheme; historical records/receipts are not rehashed or migrated.
The old `.306` strict schema cannot read new descriptors or arrays over 32: **downgrade requires
the original configuration/profile**, not conversion of U3 history. Historical record files over
64 MiB now return a retained-bytes diagnostic and remain untouched.

Verified Quick remains restricted to the existing literal default `Microsoft.NET.Sdk` contract
with supported VSTest output. SDK.Web, MTP/custom runners, custom SDK resolvers, conditional or
dynamic references/properties, imports, custom items/output paths and ambiguous assembly mapping
remain unsupported for automatic verification. Inventory may still display those projects.
No complete MSBuild interpreter or passive MSBuild invocation was introduced.

## Synthetic workload and measurements

`project-large.fixture.ts` generates 100 projects, 5,000 C# files, 101 metadata files and a
669,406-byte solution using 36 real configuration mapping sets. Total metadata exceeds 512 KiB;
selected scope contains 5,101 inputs, over 2,048 entries and a source below nine nested folders.
Fixtures are disposable; thousands of source files are not committed.

Reference host: Windows 10.0.26300, AMD Ryzen 7 9800X3D (16 logical processors), 33,407,352,832
bytes RAM, Node 24.14.0, pnpm 10.33.2. Three fresh scanner/store instances, no application discovery
cache; OS cache was not flushed. These are cold application jobs, not claimed cold-disk results.
Other source-build validation overlapped, so the range includes local contention.

| Stage                                    | Observed range, three repeats |
| ---------------------------------------- | ----------------------------- |
| Inventory                                | 789–1,207 ms                  |
| Selected preparation                     | 4,852–5,328 ms                |
| Membership/content fingerprint           | 13,836–18,610 ms              |
| Atomic save                              | 12.6–41.0 ms                  |
| Reload using new store                   | 2.72–3.09 ms                  |
| Active scan cancellation acknowledgement | 0.36–1.12 ms                  |

Peak sampled process RSS: 262,160,384 bytes (250 MiB), sampled every 10 ms including fixture
generation. Inventory response: 49,098–49,106 bytes; prepared response: 121,971 bytes; two compiled
recipes: 1,472 bytes. Browser cancellation cleared the proposal in 29 ms on the same workload.
An outstanding filesystem IO may delay cancellation; neither measurement is a universal guarantee.
CI asserts correctness and boundedness, not these stopwatch values.

Boundary regressions pass at/above 4 MiB metadata, 64 MiB aggregate metadata, 2,048 records,
20,000 physical inputs, depth 32, 32 MiB sources, 512 MiB aggregate sources, 32 MiB configuration
and 64 MiB records. The 250,000-entry counter boundary is injected near its limit rather than
creating 250,000 filesystem entries. EACCES is injected deterministically; actual unsafe aliases,
concurrent membership changes, cancellation and interrupted jobs are exercised. Oversized files
are rejected before authorization. Explicit legacy-format 5,000-path recipes also save/reload.

## Native and regression proof

The native fixture reuses already restored synthetic public dependencies and .NET SDK 8.0.425.
It adds 5,000 small C# inputs to the existing two-project B1 solution: **5,002 C# files / 5,007
total scoped inputs**. No restore, private feed, SDK installation or paid model call is required.
This is native execution at the requested source scale, not native execution of the separate
100-project fixture.

Both source-harness sequences completed genuine pass (3/3), genuine assertion FAIL
(2 passed, 1 failed; valid report, exit 1) and recovered pass (3/3). Build/Test required the normal
preview acknowledgement and native permission; no command started before permission. Save-only
and process restart preserved recipes and the New-run request with zero runs/model calls.
Final-source Save-only/restart also passed with zero runs and zero model calls; see
[Save-only evidence](evidence/u3/native-save.json). The full native rerun and stale-preview proof execute source
`a6ef2e8d883bb291c3b925d6f60e78c42d11f68a`. The only later production change recognizes the
standard solution-folder GUID; a dedicated selected-scope regression covers it. That metadata
shape is absent from the native fixture, and no evidence/execution code changed after its build.
All four final native cases passed: genuine pass, valid assertion FAIL, recovered pass and
stale-preview rejection after changing `Library/Scale/Input04999.cs`. The stale check created
zero new runs; all six native commands started only after permission, and model calls remained
zero. See [native sequence evidence](evidence/u3/native-sequence.json).

End-to-end runs took 226.8, 240.6 and 229.4 seconds, including the existing repeated freshness
and UI permission boundaries. On the first pass, native Build took 4.9 seconds and Test 1.3
seconds. This is conservative verification overhead, not a throughput promise.

Earlier unsuccessful harness attempts are retained locally: missing cached CLI runtime,
typecheck overwriting the source host bundle, and a 30-second harness wait shorter than large
freshness preparation. Those attempts are not passing evidence. The fixed harness extends only
its UI wait and avoids waiting on absent optional controls; native execution/acceptance budgets
and verifier assertions are unchanged.

Validation commands use the repository's existing owners:

```text
node --import tsx --test packages/services/src/graph-engineering/adapters/project-large.test.ts
node --import tsx --test packages/services/src/graph-engineering/adapters/project-boundaries.test.ts
node --import tsx --test packages/services/src/graph-engineering/adapters/project-structure-budgets.test.ts
node --import tsx scripts/graph-engineering/u3-measure.mjs
node --import tsx scripts/graph-engineering/u3-browser.mjs --chromium=<existing Chromium>
node scripts/graph-engineering/u3-native.mjs --source --save-only
node scripts/graph-engineering/u3-native.mjs --source
node scripts/ci/graph-cloud-suite.mjs
pnpm typecheck
pnpm verify:pre-push
pnpm exec oxfmt --check <changed files>
```

The unchanged portable runner is Linux-oriented. Local Windows runs expose existing packaging
tests that import an absolute Windows path as an ESM URL and expect a platform-specific ASAR
hash, plus its Linux skip-count expectation. Dependency-link interruptions and transient fixture
cleanup failures from early local runs are retained as failures; no exclusions, baselines or
gates were changed. Final local portable counts: scripts 155 tests / 153 pass / 2 fail; services 584 / 582 pass /
0 fail / 2 skip; UI 243 / 243 pass. Total 982 / 978 pass / 2 fail / 2 skip. The 10-test filesystem boundary suite, four additional parser/structure-budget regressions
and three browser scenarios pass with no skips. Earlier U2 browser regressions pass 7/7.
Full typecheck and final UI typecheck pass; pre-push lint (75 existing warnings, zero errors)
and architecture (zero violations) pass. The source commit `a6ef2e8d883bb291c3b925d6f60e78c42d11f68a` passed all four required Linux
jobs at tested merge `a5652730d28db58b162bc04bb65c46bf39351e3a`: 982 tests, 978 passed,
zero failed, four expected skips. See [source CI evidence](evidence/u3/source-ci.json).
Final report/test-only head CI is linked in the PR delivery record.

## Focused gallery

The owning Advanced disclosure had a bottom border immediately above the next container's top
border. Only that bottom border was removed. Keyboard Enter/Space, focus, open/closed state,
English/Chinese, light/dark and reduced viewport are checked in the existing browser harness.
The gallery uses only synthetic workspace names.

| Case                               | Evidence                                                                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Advanced, before / after           | [Before](evidence/u3/gallery/before-advanced-closed-en-1366x768.png) · [After](evidence/u3/gallery/after-advanced-closed-en-1366x768.png)                                                  |
| Chinese, light, open               | [Before](evidence/u3/gallery/before-advanced-open-zh-CN-1093x614.png) · [After](evidence/u3/gallery/after-advanced-open-zh-CN-1093x614.png)                                                |
| Large selection                    | [1366×768](evidence/u3/gallery/large-selection-1366x768.png) · [1600×900](evidence/u3/gallery/large-selection-1600x900.png) · [1093×614](evidence/u3/gallery/large-selection-1093x614.png) |
| Progress                           | [Counts and Cancel](evidence/u3/gallery/large-progress-1366x768.png)                                                                                                                       |
| Partial inventory / usable subtree | [Primary view](evidence/u3/gallery/partial-independent-1366x768.png) · [Details](evidence/u3/gallery/partial-details-1600x900.png)                                                         |
| Unsupported chosen scope           | [Visible blocking cause](evidence/u3/gallery/unsupported-selected-1093x614.png)                                                                                                            |

## Delivery status

[Draft PR #21](https://github.com/dumpfordummy/ZCode/pull/21) targets
`claude/zcde-graph-ux-audit-be80d8` at base `90eebe6d34ab8dea2ffce14db590aff7b7573f39`.
Native serialized configuration: 2,266 bytes; largest compact preview: 4,883 bytes; retained three-run record: 94,749 bytes.

Native execution and browser evidence identify source `a6ef2e8d883bb291c3b925d6f60e78c42d11f68a`;
the later production delta is the tested solution-folder GUID correction described above.
Source CI tested merge `a5652730d28db58b162bc04bb65c46bf39351e3a` and passed all required jobs.
The final delivery head and its tested merge are recorded in the PR body and final relay after
this report/evidence commit completes the same required CI. This avoids a self-referential commit
SHA inside its own contents.

The PR stays draft, auto-merge off. No merge, tag, release workflow, installer or company-repository
collection is part of this assignment. Remaining acceptance is a later packaged build and the
user's specific company scope; neither is claimed by these synthetic source-harness results.
