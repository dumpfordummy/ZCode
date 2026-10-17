# ENG-P1: measured verification costs and reproducible native-owner tests

## Outcome

Delivered a narrow development-build/test entry that resolves the independent
review's clean-checkout native module prerequisite, plus reproducible phase/I/O
diagnostics. No production verification optimization was justified by this pass.
All production owners, public contracts, permission boundaries, byte policies,
formats and R1 tests are unchanged. No performance improvement is claimed.

Depends on #23; not independently mergeable to integration yet.
Integration-targeted final-head CI is **PENDING**, not green or waived.

## Source and completed R1 evidence

- Repository: `dumpfordummy/ZCode`.
- New isolated branch: `codex/z8-5-eng-p1-verification-cost`.
- Common source and child PR base: `67e570228aa8a48f96fdbbe6c89eb54023879745`.
- Parent integration base: `f7279c79824e518abc6f4fdeb2c6cf66b86bac31`.
- R1 implementation: `43a031a2fce2399d1a02da26d587e19fbfc02002`; the common
  commit has exactly the same tree, `bec8c719607dd7bb88aa049f6b55204a7a25ae18`.
- Parent tested merge: `f76915ed72e88baf535dee0016edb558b8900781`.
- Parent CI [38786638753](https://github.com/dumpfordummy/ZCode/actions/runs/38786638753):
  four jobs passed; 1,041 pass, four expected skips. This is parent evidence only.

Read the complete R1 final report (Library `libfile_d122a386285c81919cafde5937ab390d`,
version 2) and independent review (`libfile_c720d0b032bc8191b97a2694db76ca5b`)
through supported Library text reading. No old helper was modified, and no old
report or retained native evidence was rewritten. R1 is closed, not reopened.
The final delivery record/PR identifies the full child head after this report is
committed; a self-referential commit hash is not fabricated inside this file.

A new clone with `--no-hardlinks`, long paths and a new branch was made in the
task workspace. The original checkout and other lane's outputs were untouched.
Git fetch and workspace freshness completed. Only locked JavaScript packages
were copied from the approved cache (`--offline --frozen-lockfile --ignore-scripts
--package-import-method copy`); no packages were downloaded. Node 24.14.0 and
pnpm 10.33.2 were explicitly used. Root/CLI AGENTS and architecture-governance
instructions were read; initial architecture check had zero violations.

## Measurements and interpretation

Every retained operation has a UUID, a single process's monotonic clock,
disjoint fingerprint phase spans, I/O counters, sampled RSS and lifetime peak RSS.
Raw sanitized records are in [evidence/eng-p1](evidence/eng-p1/).
The total includes phases and harness overhead; API-duration sums overlap and
are not wall time. Calls count selected JavaScript filesystem APIs, not kernel
syscalls; internal Dir iteration is excluded. `streamBytes` is included in
`readBytes`, not an additional byte count. Stream close callbacks can re-enter
the close method. Expected ENOENT ancestor probes appear as API errors and are
not failed verification results.

All repeats were serialized after this lane's prerequisite compilation finished.
No other benchmark, build or test was launched by this lane during measurements.
Other applications/system workloads were uncontrolled; uncontended operation is
not claimed. OS caches were not flushed; generating fixtures warms them. The
large fixture is the existing v2 fixture, not a 5,000-input Web execution proof.

| Unchanged owner / fixture      | Observations (ms)                    | Scope                                              |
| ------------------------------ | ------------------------------------ | -------------------------------------------------- |
| Small preparation              | 86.031                               | 2 projects, 40 C# inputs, solution; 43 input files |
| Small fresh fingerprint        | 193.345 / 185.111 / 182.578          | Same fixture, three fresh operations               |
| Large preparation              | 5,430.618                            | 100 projects, 5,000 C# inputs; 5,101 input files   |
| Large fresh fingerprint        | 14,800.913 / 14,519.397 / 14,646.864 | 986,311 source bytes per content pass              |
| Exact installed Web provenance | 32,153.085 / 8,911.258 / 8,857.109   | 7,713 files, 949,303,459 bytes each time           |

Large fingerprint disjoint spans:

| Repeat | Membership before (ms) | Content (ms) | Membership after (ms) |
| ------ | ---------------------- | ------------ | --------------------- |
| 1      | 5,425.144              | 4,047.078    | 5,328.475             |
| 2      | 5,288.465              | 4,025.881    | 5,204.785             |
| 3      | 5,353.179              | 3,991.531    | 5,301.867             |

Each large membership pass makes 27,325 lstat, 20,410 realpath and 1,000 opendir
calls, and reads 1,366,622 metadata bytes. The content pass makes 63,909 lstat
and 48,606 realpath calls and reads all 986,311 bytes. Peak observed in-flight API
calls are one in each membership phase and four in content, matching the existing
four-worker source budget. Large sampled RSS peaks range 237.75–255.95 MiB during
fingerprinting; preparation peaks at 190.80 MiB. This shows substantial path and
membership work; it does not isolate CPU hashing or establish removable checks.

The exact installed provenance owner accepted the frozen
`web-static-net8-win-x64-v1` policy on all three repeats. No policy expansion,
SDK invocation, restore or feed access occurred. Every repeat performed 7,713
opens, 22,318 lstat, 22,318 realpath and 6,894 readdir calls. Initial cumulative
open API time was 20,695 ms, then 618 / 608 ms; bytes and calls stayed identical.
This is consistent with cache/system effects but does not prove their cause.
Sampled RSS peaks were 218.96 / 181.74 / 174.57 MiB. Provenance traversal remains
serial; the observed peak of two API calls includes nested stream-close activity,
not a newly parallel hash worker. No cold-cache or code-speedup claim is made.

Preliminary small/large runs were followed by final runs after the diagnostic
added opendir accounting. Their local records are retained separately; the table
uses the final counter set only. The diagnostic self-test initially exposed two
incorrect expectations about Node streams (read bytes include delegated reads;
close may be re-entered); the expectations and reporting were corrected before
the provenance measurement. No production assertion was changed.

## Freshness/ownership trace and decisions

| Boundary / owner                                      | Required work and decision                                                                                                                                                                                                         |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preparation / ProjectScanJob, Web preparation         | Fresh project/import/input membership; v3 also exact installed provenance and private proof. Keep complete scans.                                                                                                                  |
| Save / createGraphRecipeStore                         | Lock, config conflict read, private proof/recipe match, pre-expiry, fresh fingerprint, post-expiry, conflict recheck and atomic replacement. Keep all R1 guards.                                                                   |
| Reviewed admission / checks-preflight, project-checks | Capture complete current review identity across asynchronous creation/persistence boundaries. Same content at different times is not the same observation.                                                                         |
| Source fingerprint / recipe-sources                   | Before membership, actual byte capture, after membership, shared deadline and budgets. The two Web provenance observations bracket byte capture; reusing one would remove a race window.                                           |
| File capture / artifact-files                         | Worker preflight reserves bytes; stream capture rechecks path/ancestor and file identity before and after opening/reading. Many queries are costly but are separated by awaits and mutation opportunities. No path-cache shortcut. |
| Native request / NativeRecipeOperations               | One operation map, exact request digest, active/uncertain-work guard, persisted parent session, GraphRecipe ordinary always-ask permission. inspect only clones retained snapshots.                                                |
| Post-permission / GraphRecipe                         | Recheck cwd/inspection or exact Web provenance after permission, then execute through the existing ExecutionPort. No cross-boundary fingerprint reuse.                                                                             |
| Polling / GraphTools                                  | Inspect existing operation; serialized terminal guard prevents re-accepting an already terminal retained operation. No evidence that a passive status read duplicates expensive work.                                              |
| Post-exit / GraphToolEvidence                         | Fresh source and copied Content/output association, generated-output freshness, exact process result. Keep observations separate from process spans.                                                                               |
| TRX / captureToolReport                               | Capture/parse/persist preview, then fresh source/output/copied-content validation before normalized evidence. Reusing pre-capture evidence would lose mutation-during-capture coverage.                                            |
| Persistence and successor / GraphState, GraphRouting  | Persist decisions and owned reservations before dispatch; each successor re-enters admission checks. No automatic replay of uncertain work.                                                                                        |

The smallest safe change established here is the reproducible prerequisite/test
entry. A metadata-oriented optimization may be worth a later bounded experiment,
but eliminating checks or sharing results across these awaits is not proven
equivalent. No global cache, extra concurrency, larger byte/deadline limit,
duplicate execution owner, timestamp shortcut or public contract change was added.
There is no before/after production speedup comparison because production code
is identical. The historical 720.842-second Web continuation and its approximately
4.345-second process spans remain historical overlapping/cross-clock observations;
their residual is not assigned to hashing and was not used as a benchmark baseline.

## Reproduce from an isolated checkout

Use the pinned toolchain and a separate locked dependency installation. The
approved cache may be shared; node_modules and emitted outputs must not be shared.
From the repository root, with pinned Node on PATH:

```powershell
node scripts/graph-engineering/eng-p1-native-tests.mjs --pnpm-cli <existing-pnpm-10.33.2>/bin/pnpm.cjs
node --import tsx scripts/graph-engineering/eng-p1-profile.mjs --mode small
node --import tsx scripts/graph-engineering/eng-p1-profile.mjs --mode large
node --import tsx scripts/graph-engineering/eng-p1-profile.mjs --mode provenance --executable <approved-dotnet.exe> --package-root <approved-package-root> --system-root <Windows-root>
```

Provenance mode requires exact existing policy bytes. If absent or mismatched,
stop that mode; do not install/restore/retarget. It is read-only runtime provenance,
not native Web execution or full workspace preparation. Results/fixtures are placed
under a newly named `.tmp/eng-p1/` directory; retained evidence is not overwritten.

The native entry verifies Node/pnpm versions, then uses `pnpm -r
--workspace-concurrency=1 --filter @zcode/adapters... --filter @zcode/core... run
build`. The existing package graph selects nine workspaces, of which seven have
build scripts: model-option-map, dynamic-workflow, shared-types, contracts,
provider, adapters and core. Existing tsc/build scripts establish the compiled
exports; no aliases, runtime replacements, bootstrap bundle or installer are used.
It then invokes the original native-recipe and native-process-limit modules with
tsx and Node's serial test runner. Any prerequisite or test failure stops nonzero.

On this clean checkout the build took 31.820 s and the tests 8.134 s:
**15 tests, 14 passed, 0 failed, 1 expected non-Windows skip**. Actual Windows
argv, immediate-descendant prevention, cancellation/timeout, executor-death owned
process cleanup, ordinary permission, rejection, persistence and unknown-exit
assertions executed. See `native-owner-tests.json` for exact test names. These are
the two previously unloadable modules; no claim that this is the entire native
test inventory or a new installed-app Build/Test acceptance sequence.

## Final local validation

| Check                                            | Actual result                                                                            |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Native compiled-owner entry                      | 14 pass / 1 expected non-Windows skip / 0 fail; two formerly unloadable modules executed |
| Focused service/shared/diagnostic selection      | 35/35 pass, no skips; 60.936 s                                                           |
| Six unchanged R1 Save/read tests                 | All six exact names passed in focused TAP and again in complete selector TAP             |
| `pnpm typecheck`                                 | PASS, exit 0                                                                             |
| `pnpm lint`                                      | PASS, 75 baseline warnings / 0 errors                                                    |
| Direct changed-file `pnpm exec oxfmt --check`    | PASS; same formatter, no policy changes                                                  |
| Architecture changed-file check                  | PASS; zero violations, zero baseline/new violations                                      |
| CI selector/aggregator self-tests                | 18/18 pass                                                                               |
| Unmodified complete portable selector on Windows | **1,046 total: 1,042 pass / 2 fail / 2 skip**, no cancellation; exit 1                   |
| Missing-provenance prerequisite negative control | Expected exit 1, operation and summary FAIL with ENOENT; no partial success              |

The focused selection is `eng-p1-io-observer`, `f1-provenance-reader`, adapter
`web-profile-save`, `web-profile-proof`, `recipes`, `web-profile-inputs`,
`project-declarative`, `project-large`, `web-trx-association`, and app
`web-profile`, `recipe-compatibility`. It retains existing expiry, Content-byte,
membership/add/remove/rename, imports, copied-output mutation, cancellation and
legacy behavior coverage; it is not new coverage of unmodified production code.
The diagnostic failure-report path was tightened after measurement so a limited
preparation or final equality failure cannot leave an overall PASS. That reporting
change was checked with a deliberately absent executable, not a new SDK run.

The complete selector ran once without selector/exclusion/expectation changes.
Scripts: 162 pass / 2 fail; services: 632 pass / 2 skip; UI: 248 pass. Inventory
problems are empty. The two script failures match the retained Windows baseline:
`z8-3-a-windows-asar-integrity.test.mjs:47` accesses an undefined forward-slash
header-hash key, and `z8-3-a-windows-asar-lifecycle.test.mjs:80` imports a raw
Windows path as an ESM URL. The Linux selector also expects four service skips
where Windows has two. These failures and skip qualifications remain failures;
no repair, suppression, relaxation or repeated full selector was performed.
The one additional portable test is the diagnostic observer test, automatically
selected by the existing directory rule. This is not a green Windows full suite.

Production source, UI, public contracts, CI and dependency files have zero diff
against the common source. Build outputs and private raw logs remain local and
uncommitted. Sanitized validation counts and all six R1 PASS names are retained
in `evidence/eng-p1/validation.json`.

## Delivered files

- `docs/graph-engineering/z8/Z8_5_ENG_P1_SPEC.md`
- `docs/graph-engineering/z8/Z8_5_ENG_P1_REPORT.md`
- `scripts/graph-engineering/eng-p1-native-tests.mjs`
- `scripts/graph-engineering/eng-p1-profile.mjs`
- `scripts/graph-engineering/eng-p1-io-observer.mjs`
- `scripts/graph-engineering/eng-p1-io-observer.test.mjs`
- `docs/graph-engineering/z8/evidence/eng-p1/small.json`
- `docs/graph-engineering/z8/evidence/eng-p1/large.json`
- `docs/graph-engineering/z8/evidence/eng-p1/provenance.json`
- `docs/graph-engineering/z8/evidence/eng-p1/native-owner-tests.json`
- `docs/graph-engineering/z8/evidence/eng-p1/missing-prerequisite.json`
- `docs/graph-engineering/z8/evidence/eng-p1/validation.json`

## Integration handoff and stop

One draft child PR targets `codex/z8-5-u5-realworld-dotnet-projects`; #23 remains
unchanged. The existing workflow targets only
`claude/zcde-graph-ux-audit-be80d8`, so child CI is pending by the stacked-PR
dependency. Do not change workflows, enable Actions, manufacture empty pushes,
mark ready, auto-merge or reuse parent CI as child CI.

After the owner merges #23, obtain its actual integration merge; a later authorized
continuation must normally merge it into this branch without rewriting, retarget,
and verify a supported PR event runs unchanged final-head CI. The exact UI head
must be supplied for a separately authorized combined checkout/check. Individual
branch checks do not certify the combined tree. No UI file or public-contract
dependency is requested by this pass. No indefinite monitoring was started.

No Claude work was started, no parent branch/PR change, merge, release, tag,
installer/.309, installed .308/profile change, SDK installation, package-feed
access or company-source access occurred. Stop at bounded source delivery.
