# Z8.5-B1 combined pilot native verification

**BLOCKED — do not publish this candidate.** Read the complete owner prompt and confirmed its final line: END OF Z8.5-B1 AUTHORIZATION. No product code, permission defaults, acceptance thresholds, package bytes or CI gates were changed.

## Candidate identity

- Version: **3.14.3-z8.304**, Windows x64, unsigned.
- Refreshed integration: 3591c5824dbede731917869341ecdd36693e3b02; U1 dbe6c51ca0ea54f3afa92867b66a1fd2aeb6f045 and U2 3591c5824dbede731917869341ecdd36693e3b02 are ancestors.
- Clean build source: c92740c5430322a08702bb4801c5abbe93671516; tree c9275d8ff96fc9abe9c590148908cafc6bcc996b.
- Build entry: node scripts/graph-engineering/build-windows.mjs 3.14.3-z8.304 --dist-dir dist-graph-b1. One build; exit 0.
- Node 24.14.0, pnpm 10.33.2, Electron 41.0.3, electron-builder 26.8.1, bundled CLI 0.16.9.
- Installer: ZCode Graph-3.14.3-z8.304-win-x64.exe, **150269110 bytes**, SHA-256 **3eed32c399364f3d26e780bdd3b4a0dc95b6ddbcf9afac9904f9c544a0f6500b**.
- Retained output: packages/desktop/dist-graph-b1/. Detached copy verified against all 87 original file hashes before/after tests.
- Build record reports eight generated declaration files dirty after build. They were line-ending-only rewrites with no content diff; index normalization left no source change.
- Tested clean harness: Q1 592558367d060486bb7eb5e1dd4d1d51033bdc3b; Q2 d3b9239f51b64e109d0e23e0e62d335c16a3e3c6; U1/Chat 3e50de09f7ac0655c4490c2f8641d36133250c5e. Later documentation does not change embedded source.

| Case                             | Result            | Actual observation                                                                                                                                                                                                        |
| -------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package construction             | PASS              | Existing entry created one NSIS artifact; installer never executed.                                                                                                                                                       |
| Hashes and ASAR integrity        | PASS              | Before/after installer and eight component checks; all 87 detached files unchanged. Header equals embedded record, integrity fuse enabled.                                                                                |
| Package content inspection       | FAIL              | 124 checkout/user-path hits in optional ssh2 build metadata; two additional benign SSH placeholder hits lack current exact exceptions.                                                                                    |
| B1-Q1 Save only                  | PASS              | Real Quick Detect/Save; request/context retained, sole Build/Test selected, byte-identical config after reopen. Zero runs, model requests and native commands throughout.                                                 |
| B1-Q2 native passing assertions  | FAIL              | Real Quick Save-and-run, review and two native permissions. Build exit 0 and accepted. Native Test exit 0, three passing xUnit tests. Graph rejected genuine TRX duration consistency; no accepted normalization receipt. |
| B1-Q3 failing assertion          | BLOCKED           | Not executed after supported-project Q2 defect. No fixture mutation to hide it.                                                                                                                                           |
| B1-Q3 recovered pass             | BLOCKED           | Not executed; cannot claim recovered accepted evidence.                                                                                                                                                                   |
| B1-U1 packaged run view          | PASS              | Eight-step native reviewer run; 1600x900 and 1093x640; width, Fit, Focus, details, Technical/Steps return and history collapse. No run/model changes from viewing. Approval pending.                                      |
| Ordinary Chat                    | PASS              | Same package; loopback conversation with native read/edit/test.                                                                                                                                                           |
| Company PC / installer lifecycle | UNVERIFIED for B1 | Deliberately not repeated. Previous pilot reports are not B1 evidence.                                                                                                                                                    |

## Native setup and product blocker

Fresh owned profiles/workspaces use the existing redirected loopback provider, without real configuration or secrets. This is process-level test isolation, not an OS sandbox or whole-app egress certification. Q1/Q2 produced zero model requests. U1 used nine local synthetic model requests; its Build/Test evidence came from native processes.

Actual child environment: .NET SDK **8.0.425**, Git **2.56.0.windows.1**. Literal Microsoft.NET.Sdk, net8.0, global.json with disabled roll-forward. Exact packages: Microsoft.NET.Test.Sdk **17.8.0**, xUnit **2.5.3**, xunit.runner.visualstudio **2.5.3**. Native output reports VSTest **17.11.1**. Explicit bootstrap restored public packages from existing local cache into isolated NuGet home, with cleared feeds and no network. Quick kept --no-restore; Test also kept --no-build.

Q2 run: 9ab2f332-a363-4d25-9885-fbf2ecd28790. Build output digest equals Test build digest; source digests match. Native assertions AddPositive, AddNegative and AddZero: **3 total, 3 passed, 0 failed, 0 skipped**. Graph displayed invalid evidence rather than accepted verification.

Original unchanged local TRX SHA-256: **535dd4c20bea3ee2b7bc09705370200c9a7e4879edb4ba7244e38eb22ccccc8b**. It is not uploaded. The reviewed JSON is a separate representation, not a redacted file claiming that original hash.

The duration check in packages/services/src/graph-engineering/domain/trx-report.ts (lines 184–185 at build source) rejects AddNegative: duration **3.5573 ms**, start 2026-10-05T20:43:35.9949992+08:00, end 2026-10-05T20:43:35.9950067+08:00. Parsed millisecond timestamps differ by 1 ms, violating the less-than-1-ms agreement requirement. Two read-only replays of original bytes with the captured native window, assembly and scope reproduce **TRX report: test duration does not match result times.**

**Proposed focused follow-up, not implemented:** establish the supported adapter's duration/timestamp contract using this genuine report, add a regression retaining the mismatch, and correct the invalid duration assumption. Preserve independent freshness, native operation window, assembly, source/build, scope and assertion-count protections. Do not blindly widen tolerance or fabricate reports. Then rerun Q2/Q3 on a separately authorized candidate.

## Packaging setup blocker

Frozen offline installation reused 1739 packages, downloading zero, but allowed lifecycle scripts. This differs from the release workflow's --ignore-scripts followed by explicit Electron preparation. ssh2 optional crypto installation generated local MSBuild projects, later bundled in app.asar.

124 local-path matches occur in six ssh2 crypto build files: sshcrypto.node.recipe, Cl.items.tlog, link.secondary.1.tlog, sshcrypto.lastbuildstate, sshcrypto.vcxproj and sshcrypto.vcxproj.filters. Rules: windows-user-directory 52; build-user-path 53; build-checkout-path 19. This is build-setup contamination, not evidence that U1/U2 introduced the paths. Two 192.168.1.100 hits in the new IntlProvider chunk are existing SSH placeholder examples; exact exceptions were not relaxed.

**Proposed build correction:** after separately authorizing a product fix/version, use the existing release workflow's controlled install/native preparation on a fresh checkout and rerun inspection. Do not repair this frozen archive or treat a scanner exception as path removal.

The build downloaded public NSIS 3.0.4.1 tooling and nsis-resources 3.4.1. No .NET network restore or paid/live model response. Git fetch/push and GitHub PR/CI access are separate source-collaboration operations.

## U1 and preserved harness failures

Final reviewer run: ba0eb232-04e5-483c-af30-337d1730290d. Its native Node Build/Test and reviewer outputs are separate from blocked .NET acceptance. Final human status remained WaitingForApproval; no decision recorded.

Canvas/detail widths match: 999.203125 px at 1600x900; 772 px at 1093x640. The reduced height respects the native minimum. Fit included all nodes, selected reviewer could be focused and inspected, Technical/Steps returned with the same viewport, history collapsed, and routine manifest/empty checkpoints were absent from ordinary Steps. Approval/native permission actions and Q2 invalid Test evidence remained visible. Genuine failed-assertion presentation remains blocked under Q3.

Preserved failed attempts distinguish harness errors: hidden Advanced-ready marker versus visible checks row; absent first-run history; redundant context-picker interaction already covered by Q1; collapsed U1 artifact disclosure; arbitrary 1000-pixel threshold versus 999.203125 available; requested height below native minimum. Corrections changed only test observation/setup. Final cases ran from committed clean harness sources. Original attempt logs remain local.

## Evidence and checks

[Reviewed receipt](evidence/b1/reviewed-receipt.json) contains field-allowlisted identities, counters, commands, native relationships, geometry and package integrity. Raw TRX, profiles, ledgers, native logs and screenshots remain local. Representative local screenshot links appear in the operator handoff.

Pre-build typecheck/lint passed (75 lint warnings, zero errors). Focused Quick compiler, selector and distribution tests: 10 passed, zero failed/skipped. Architecture: zero new violations. Final typecheck passed; lint passed with 75 warnings and zero errors; architecture --changed passed with zero baseline/new violations; all nine changed harness/spec/report files passed oxfmt. Actual PR head/base/tested-merge/CI are recorded in the operator handoff.

## Publication hold

Release preparation stopped on the product defect as required. **No publication folder was assembled**: this installer also contains rejected build-path metadata and must not be uploaded. Retained build output is for investigation. [Draft notes](Z8_5_B1_RELEASE_NOTES_DRAFT.md) are not a release announcement.

Planned tag pilot-v3.14.3-z8.304 was available when checked and would identify build source c92740c5430322a08702bb4801c5abbe93671516, never a later documentation head. No tag created/pushed, release workflow dispatched, installer uploaded/executed, release created, PR merged, installed pilot changed, Sandbox repeated or prior asset replaced. A corrected product/build requires an explicit new candidate/version decision.
