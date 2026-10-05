# Z8.5-B1-F1 parser correction and controlled .305 candidate

**BLOCKED — do not publish .305.** Read the complete authorization and confirmed END OF Z8.5-B1-F1 AUTHORIZATION. The duration correction and clean build succeeded. Native passing evidence is now accepted, but genuine assertion failure exposes a separate RunInfo rejection. Recovery evidence does not turn the rejected failure into accepted failing evidence.

The original [B1 report](Z8_5_B1_REPORT.md), .304 installer, original TRX and invalid historical records remain unchanged. This report adds .305 evidence without replacing the B1 Q1/U1/Chat PASS, Q2 FAIL and Q3 BLOCKED history.

## Corrected contract and regression

xUnit independently populates Duration from ExecutionTime, substituting 1 ms for zero. It does not assign result timestamps. VSTest initializes StartTime and EndTime with separate UtcNow reads; the TRX logger copies those fields and Duration independently. Requiring duration to equal the timestamp difference is therefore invalid for this supported producer.

- [xUnit VS adapter 2.5.3, MakeVsTestResult](https://github.com/xunit/visualstudio.xunit/blob/2.5.3/src/xunit.runner.visualstudio/Sinks/VsExecutionSink.cs).
- [VSTest 17.11.1 TestResult constructor](https://github.com/microsoft/vstest/blob/58dbd027217ac035a4e9114c9213b11dc0e988bd/src/Microsoft.TestPlatform.ObjectModel/TestResult.cs). The Test SDK 17.8.0 ObjectModel constructor was also checked at [v17.8.0](https://github.com/microsoft/vstest/blob/v17.8.0/src/Microsoft.TestPlatform.ObjectModel/TestResult.cs).
- [VSTest TRX Converter.ToTestResult](https://github.com/microsoft/vstest/blob/58dbd027217ac035a4e9114c9213b11dc0e988bd/src/Microsoft.TestPlatform.Extensions.TrxLogger/Utility/Converter.cs).

The focused production change removes only the equivalence comparison and still calls the unchanged duration validator. Duration syntax/range, timestamp validity/order/windows, exact identity joins, assembly/scope, source/Build/operation binding, counters, required tests and conservative unsupported/incomplete evidence checks remain. No tolerance increase, report rewriting, timestamp synthesis or adapter upgrade.

The parser version remains dotnet-vstest-trx-v1: the normalized schema, deterministic names and receipt structure are unchanged. This corrects over-restrictive validation; no profile migration, read-path historical reparsing or renormalization was introduced. The .304 invalid receipt remains invalid.

Original local TRX SHA-256: **535dd4c20bea3ee2b7bc09705370200c9a7e4879edb4ba7244e38eb22ccccc8b**. Unchanged-byte replay with the actual captured operation window/scope/assembly produces three passing observations after the fix.

Portable derived fixture: packages/services/src/graph-engineering/app/fixtures/b1-xunit-derived.trx, UTF-8/LF SHA-256 **c446411e249290c99559674701d8046c0b32ba18fff0b5d1ddba1139f1ba4e60**. Machine/user/absolute-path metadata is sanitized; timing, identities and counters are retained. Its digest is deliberately distinct from the original. Ten new portable tests pass without an optional manifest. Reinstating the old guard makes the positive regression fail specifically on duration equivalence; restoring the fix passes. Existing tests that asserted that invalid equivalence now assert malformed/negative/oversized duration rejection.

Focused parser/capture/evidence suite: **109 passed, 2 optional manifest-dependent skips, 0 failed**. Integrated portable Graph app/adapter suite: **446 passed, 2 skips, 0 failed** (448 tests). Existing synthetic failing-evidence tests pass; they do not establish acceptance of the genuine RunInfo-bearing failure discovered below.

## Controlled build and scan

A new dedicated checkout began with no node_modules or outputs. Node 24.14.0 and pnpm 10.33.2 performed a frozen offline install with --ignore-scripts: 1739 cached packages reused, zero downloads, 1885 added. This reused the package store, not the .304 installed dependency tree. Explicit Electron preparation and the existing Windows runtime/native preparation followed.

The narrow read-only preflight rejects six exact generated ssh2 metadata names: sshcrypto.node.recipe, Cl.items.tlog, link.secondary.1.tlog, sshcrypto.lastbuildstate, sshcrypto.vcxproj and sshcrypto.vcxproj.filters. It correctly rejects the contaminated .304 dependency tree. Fresh dependencies contain none before or after runtime preparation. No packaging exclusion, file removal or binary editing was necessary. Runtime .node handling and all prescribed runtime checks were preserved.

Exactly one build used the existing entry:
node scripts/graph-engineering/build-windows.mjs 3.14.3-z8.305 --dist-dir dist-graph-b1-f1.

Clean source: **563f604f93baa0dc6d3bef7e8bf0499f3d741e2d**, tree **d3b1e6003235b2f99db4b631a0e48e0f165dfa56**. The build record reports zero dirty source paths at start. Eight generated declaration files show line-ending-only rewrites afterward; git diff contains no content change. Electron 41.0.3, electron-builder 26.8.1, bundled CLI 0.16.9. Local Windows assets use the existing ZCODE_SKIP_REMOTE_ASSETS=1 preparation path.

Initial .305 inspection retained **147 raw / 145 explained / 2 unresolved** findings. The two remaining hits are the existing English/Chinese ssh.hostPlaceholder examples, exactly 192.168.1.100 in app.asar/out/renderer/assets/IntlProvider-DyoQwIj1.js at lines 32 and 4. Source literals are en-US.ts and zh-CN.ts. External scanner commit **6cc59475ac298e6abbc3d8504e3121a90428aaf7** adds only this exact asset/literal/count classification; the build source remains 563f604.

The original inspection and manifest were retained. Running the existing finalizer with that reviewed external classification produced **PASS: 147 raw / 147 explained / 0 unexpected**. Installer and all component hashes were identical before/after; no packaging rerun or archive repair occurred. The former 124 local-path findings and six metadata files are absent. The other 145 matches retain reviewed exact classifications for shipped constants, documentation, test examples and key-format/feature-test literals; the sanitized receipt groups every finding by file/rule/reason. No actual credentials were classified.

Build/scanner regression: **18 passed, 0 skipped, 0 failed**. Extra occurrences, another IP, another file and seeded real checkout/user paths still fail. All six generated metadata classes fail preflight while a runtime .node file is preserved. No CI workflow, selector, aggregator or branch rule changed.

## Immutable candidate

| Item                            | Identity                                                                   |
| ------------------------------- | -------------------------------------------------------------------------- |
| Version                         | 3.14.3-z8.305, unsigned Windows x64                                        |
| Installer                       | ZCode Graph-3.14.3-z8.305-win-x64.exe                                      |
| Size                            | 149910882 bytes                                                            |
| Installer SHA-256               | 547188cea1218a9189556ba915b7d4a6cd567ae5e702c2fe4a66beb2a320ab08           |
| Executable SHA-256              | 0081d898e25f72d483611a23027701ad36b62ea4581f7c416a271d6bd2ab8cba           |
| app.asar SHA-256                | 555668767383daad1fdf1b79ee4a2d8891a8307056428defa5abde360b1d2d18           |
| Bundled agent SHA-256           | 875a139d88a940d55731bca799acb8deaf9b433f454058cd16ecdc570af3967b           |
| Build identity SHA-256          | c5eeea18926ee50a2a32b80235aa5fa8959e155ee0a84392ee8506f65db70159           |
| ASAR header / embedded resource | 11825784689dd8bdf990c2228076c0ed9dfc70228f21ddb2f75a4d9b11ed1ffe           |
| Detached tree                   | 86 files; 5a6a65e2737201f7d49fced5af135fd043137157d9b08e2473e3e855d620bf80 |

All eight manifest components and 86 detached files were checked before/after native testing. ASAR resource equals header, integrity fuse is enabled and RunAsNode remains 1. All other fuse states remain unchanged and are recorded in the receipt. The installer was never executed. Package identities are separate from later harness, scanner and documentation commits.

## Targeted native results

Owned temporary projects/profiles, isolated NuGet home, existing public package cache with cleared feeds and offline restore, and the existing loopback model were used. Actual SDK 8.0.425, runtime 8.0.31, VSTest 17.11.1, Test SDK 17.8.0, xUnit/adapter 2.5.3. Quick retains --no-restore and Test --no-build. Q1/Q2/Q3 submit zero model requests. This is process-level test isolation, not whole-app egress certification.

| Case                        | Result | Observation                                                                                                                                                                                                                                    |
| --------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1 Save only                | PASS   | Actual Detect/Save/reopen preserves request/context and sole Build/Test selection; configuration byte-identical, zero runs/model requests/native commands.                                                                                     |
| Q2 passing assertions       | PASS   | Actual preview, confirmation, native permissions, bundled agent, Build exit 0, Test exit 0; three passes accepted with valid original-report/normalized receipt association and current source/Build/operation relationships.                  |
| Q3 genuine failed assertion | FAIL   | Build exit 0, Test exit 1, two passes and one Assert.Equal failure; parser rejects the RunInfo diagnostic, no accepted normalization receipt. UI correctly shows evidence invalid, not PASS, but required accepted failing evidence is absent. |
| Q3 fresh recovery           | PASS   | Restored exact fixture; fresh Build/Test both exit 0 and three passing assertions are accepted. Six distinct native operations and three report paths across the sequence; prior run records and configuration unchanged.                      |
| U1 representative run view  | PASS   | Eight-step native reviewer scenario, 1600x900 and 1093x640, Fit/Focus/details/history collapse and viewport retention. No authority/model changes from viewing; final human approval pending.                                                  |
| Ordinary Chat               | PASS   | Real bundled-agent Read/Edit/Bash and independent native node:test; loopback provider only.                                                                                                                                                    |
| Content / integrity         | PASS   | 147 classified / 0 unexpected; installer/components/detached bytes unchanged.                                                                                                                                                                  |

U1 run b4fd8990-14c7-46ad-82ee-dd22cbc1810e used nine loopback model requests. Canvas/details widths match at 999.203125 and 772 pixels. Human gate stayed WaitingForApproval with no recorded decision.

The first native attempt failed before command admission because Playwright lost a screenshot context; its profile/logs are retained. The next attempt passed Q2 and exposed the Q3 product blocker. Evidence-only harness commit **05b9217826bc3c41649cf353bfd2c55059a1d317** retains the strict failed assertion as FAIL, then permits fresh recovery collection and asserts prior run records remain unchanged. It changes no proof assertions or packaged bytes. The overall harness remains FAIL.

## New concrete blocker and publication hold

The first genuine failure TRX SHA-256 is **ce122c3ea43847154b859812443fd6ce076ea50ed266e8593b0cedcfb12372cb**. Its exact captured-byte replay reproduces:
TRX report: run diagnostics cannot establish complete assertions.

The report contains AddPositive's genuine Assert.Equal failure (expected 6, actual 5), reconciled 3/2/1 counters and an Error RunInfo whose text identifies AddPositive [FAIL]. The current parser rejects every RunInfo when tests are present (trx-report.ts, lines 202–204). [VSTest TestMessageHandler](https://github.com/microsoft/vstest/blob/58dbd027217ac035a4e9114c9213b11dc0e988bd/src/Microsoft.TestPlatform.Extensions.TrxLogger/TrxLogger.cs) serializes error-level run messages as Error RunInfo entries. Thus this diagnostic is present alongside actual failing assertion evidence. The exact product rejection is confirmed; a safely bounded distinction between ordinary assertion diagnostics and incomplete/infrastructure execution remains follow-up work. No RunInfo rule was loosened in this assignment.

This is a separate defect exposed by the frozen candidate. No silent second .305 build or post-build fix was attempted. Distribution acceptance requires accepted pass → accepted failing evidence → accepted recovery; it is **BLOCKED**, regardless of green portable tests or CI.

[Reviewed receipt](evidence/b1-f1/reviewed-receipt.json) contains field-allowlisted synthetic identities, counters, provenance links and scan accounting. Raw TRX, profiles, native logs and screenshots remain local. Required source checks: typecheck PASS; lint PASS with 75 warnings/0 errors; architecture has zero baseline/new violations; changed-file formatting PASS. Final PR head/base/tested merge and actual CI job results are also in that handoff, distinct from the embedded build source.

[Draft notes](Z8_5_B1_F1_RELEASE_NOTES_DRAFT.md) are explicitly blocked. No publication staging folder is assembled because acceptance failed. The exact installer and checksum remain in the retained build output for investigation. PR #20 remains draft with auto-merge OFF. No merge, tag, release, workflow dispatch, installer upload/install, company-PC action, Sandbox lifecycle rerun or .303 pilot replacement.
