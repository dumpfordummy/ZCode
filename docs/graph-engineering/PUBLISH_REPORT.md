# Graph publishing automation report

Date: 2026-09-24, Asia/Kuala_Lumpur.

Scope: the side-conversation request to implement a one-command publisher, followed by the user's explicit request to commit and publish it. This is a release follow-up to Z2, not another Graph implementation milestone. The initial automation work did not stage, commit, tag or publish; the authorized publication follow-up below records the subsequent Git and GitHub execution. Installed application credentials/configuration were not accessed or changed.

Current result: **PUBLISHED** — [ZCode Graph 3.14.0-z2.2 for Windows x64](https://github.com/dumpfordummy/ZCode/releases/tag/graph-v3.14.0-z2.2), from commit `55c5ad6d0c8d5dc464686ec4f1e1b7398cf2a1d3`. The verified release evidence and remaining manual checks are recorded at the end of this report.

## Result

`pnpm graph:release --version 3.14.0-z2.1` now validates a clean committed checkout, targets only `dumpfordummy/ZCode`, creates/pushes one annotated tag, waits for the exact tag/commit's existing Windows workflow, verifies the published prerelease and its installer/checksum assets, and prints the release URL. Offline `--dry-run`, explicit `--resume`, a bounded configurable wait and `--help` are implemented. Failed CI and missing assets cannot produce a success message. The script never commits or replaces a tag/release.

The existing workflow remains the sole build/publication owner. Z2 version validation, expanded source tests and eleven detached packaged scenarios are wired into it. Its manual dispatch remains artifact-only. Supplemental CLI lint/format diagnostics are retained as visible nonblocking baseline exceptions; existing root lint/typecheck/architecture and release acceptance remain blocking. Exact installer selection avoids uploading stale versions. Release-note source links use the immutable release tag, because publishing a tag does not update `main`.

The packaged acceptance helper now derives metadata/ledger paths from the newly created Graph profile when available. Previously the Z2 helper used development-only paths, which would fail against the packaged private home. Three reads/fault targets were changed; Graph runtime/session behavior, profile identity and all other existing Z2 implementation work were preserved.

Specifications were updated before implementation in [PUBLISH_SPEC.md](PUBLISH_SPEC.md). Exact operator instructions, prerequisites and recovery are in [PUBLISH.md](PUBLISH.md). Windows setup and upcoming release notes now describe Z2 while retaining the earlier Z1 release as historical evidence.

## Initial automation verification (before publication authorization)

This table records the initial automation task. The authorized publication sections below record later execution; their evidence supersedes the historical NOT RUN entries for GitHub and packaging.

Used the project-local Node 24.14.0 and pnpm 10.33.2 from `.tmp/z1-toolchain`, matching `mise.toml`. System Node/pnpm versions differ and were not used for required checks. The read-only freshness check used `--no-fetch` and reported 0 ahead/0 behind against the existing local tracking refs; it is not a fresh network fetch. Architecture-governance instructions and desktop/Graph context were read. Architecture passed before edits.

| Check                                                                     | Actual result                                                                                            |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Publisher/distribution/path/controlled-provider tests                     | PASS; 41 tests, including a real isolated temporary Git repository and injected GitHub command responses |
| Graph service/adapter/native runtime guards                               | PASS; 62 tests                                                                                           |
| Native interaction/services regressions                                   | PASS; 14 tests                                                                                           |
| UI regressions via existing test entry                                    | PASS; 20 tests                                                                                           |
| `pnpm typecheck`                                                          | PASS                                                                                                     |
| `pnpm lint`                                                               | PASS; existing 70 warnings, 0 errors                                                                     |
| `pnpm architecture:check --changed`                                       | PASS; 0 violations                                                                                       |
| Formatting of the changed publishing files                                | PASS; no repository-wide formatting applied                                                              |
| Workflow YAML parse and PowerShell block syntax                           | PASS; this is static validation, not a GitHub execution                                                  |
| Command help                                                              | PASS                                                                                                     |
| Offline dry-run in this checkout                                          | Expected refusal: existing uncommitted/untracked work; no remote access or Git write                     |
| Offline dry-run in clean synthetic Git fixture                            | PASS; no tag and no network; dirty/wrong-destination cases refused                                       |
| Supplemental CLI lint                                                     | FAIL / existing baseline exception; unchanged CLI files, actual diagnostics retained                     |
| Whole-repository `pnpm fmt:check`                                         | FAIL; 2,875 files in this checkout                                                                       |
| Authenticated GitHub push/workflow/publication                            | **NOT RUN**; GitHub CLI is not on this shell's PATH; installed authentication was not inspected          |
| Z2 Windows installer build and detached packaged matrix                   | **NOT RUN** in this follow-up; new workflow gate is configured, not claimed as executed                  |
| Actual installer install/upgrade/uninstall, second PC, signing reputation | **NOT RUN**                                                                                              |
| User-operated live-provider Z1/Z2 checks                                  | **NOT RUN**; unchanged from Z2_REPORT.md                                                                 |

Local verification logs are under ignored `.tmp/graph-publish-checks/`: `typecheck.txt`, `lint.txt`, `cli-lint.txt`, `format.txt`, `graph-tests.txt`, `native-regressions.txt`, `ui-tests.txt`, `publish-tests.txt` and `final-checks.txt`. Test fixtures use generated temporary repositories with empty global Git configuration and synthetic author identity; their commits are not commits in this checkout. No native model task was run by this publishing follow-up.

The initial Z2 formatting baseline had 2,869 flagged files. Comparing actual path sets shows eight supplied future handoff documents now flagged, while `package.json` and an already changed Z2 process-manager file are no longer flagged: net +6. This follow-up formatted only its publishing files; no CLI/source lint rules were suppressed. CLI lint stops across parallel package tasks, so this invocation's diagnostic count should not be treated as a complete replacement for the earlier baseline total.

## Review and remaining operator work

The reviewed diff is confined to release orchestration, the desktop build-version validator, the existing packaged test runner, the Z2 test helper's isolated paths, focused tests and publishing documentation. It adds no application service, provider, agent engine or updater. The temporary-repository test verifies local Git integration; injected remote results do not establish live GitHub behavior. The modified package.json adds only `graph:release`.

Change size relative to this side task's starting files: seven tracked release files +113/-43 lines, ten new publishing/test/documentation files (901 lines), and a net reduction of seven lines in the inherited untracked Z2 test helper: net +964 lines across 18 files. The main task's other Z2 changes are excluded from these counts. `git diff --check` passed, and the checkout's staged diff remained empty.

At the end of the initial automation task, the checkout was intentionally still dirty with pre-existing Z2 and handoff work plus this follow-up. The operator script requires an authenticated GitHub CLI and a clean release checkout as described in PUBLISH.md. The later user-authorized publication used Git directly and GitHub connector reads, as recorded below. Both paths use the same source/build/packaged gates before the installer appears in Releases; neither automatically updates installations on other PCs.

## Authorized publication follow-up

Later on 2026-09-24, the user explicitly requested committing the code and publishing it. Freshness was rechecked with an actual fetch: main remained 0 ahead/0 behind. Root typecheck and pre-push lint/architecture passed again. Publication uses Git directly and the existing tag-triggered workflow, with GitHub connector reads for monitoring; installing or configuring GitHub CLI locally is unnecessary for this operator path.

The reviewed staging manifest contains 257 native Z2/release files, including 157 controlled-test evidence files. Unrelated standalone/future handoff files remain untracked. Full staged whitespace checking reports trailing whitespace in ten preserved raw test/build-log artifacts; the staged code/documentation check excluding those evidence artifacts passes. The raw evidence was not rewritten to hide this exception. This is distinct from the earlier pre-staging whitespace check, which could not inspect then-untracked evidence.

### First tagged build and permission-test correction

Commit `5d7498bb892911651223669ec750b74a1161dd5c` was pushed to main and immutable tag `graph-v3.14.0-z2.1`. [Workflow 35984149336](https://github.com/dumpfordummy/ZCode/actions/runs/35984149336) passed the blocking source checks and built the Windows installer. Packaged ordinary Chat and no-provider cases passed. The literal Z1 compatibility case then timed out at its separate Bash approval, so publication was correctly skipped. [The captured failure](evidence/publishing/z2.1-packaged-failure.txt) shows an actual pending `node --test fixture.test.mjs` permission after the Edit.

The harness had treated the still-visible Edit Allow button as the next Bash permission and raced the native response acknowledgement. The test-only helper now captures the original Allow element, approves once and waits for that specific element to detach. Existing V4 interaction dialogs are keyed by interaction ID, so this is an acknowledgement boundary rather than a sleep or relaxed permission policy. Both the legacy Z1 regression and ordinary Chat fixture reuse it. No application UI/runtime policy or timeouts changed.

The corrected native regression passed locally with a fresh synthetic home, actual native Read/Edit/Bash, an independent fixture test, exact session identity and completed restart; [its summary is retained](evidence/publishing/z1-approval-regression.json). Root typecheck and pre-push lint/architecture passed again (70 existing lint warnings, zero errors). The next publication attempt uses a new `graph-v3.14.0-z2.2` tag; the failed z2.1 tag is not moved or deleted.

### Verified publication

Commit `55c5ad6d0c8d5dc464686ec4f1e1b7398cf2a1d3` and annotated tag `graph-v3.14.0-z2.2` were pushed atomically. [Workflow 35985877508](https://github.com/dumpfordummy/ZCode/actions/runs/35985877508) completed successfully and published the [non-draft Windows x64 prerelease](https://github.com/dumpfordummy/ZCode/releases/tag/graph-v3.14.0-z2.2) on 2026-09-24 at 10:28:39 UTC (18:28:39 Asia/Kuala_Lumpur).

Actual CI results:

- All 137 source tests passed: 41 publisher/distribution/provider/path, 62 Graph/native guards, 14 native interaction/services and 20 UI.
- Root typecheck passed; root lint reported 70 warnings and zero errors; architecture reported zero violations.
- The Windows installer built successfully. All eleven detached packaged cases passed: ordinary Chat, no provider, literal Z1 compatibility, Z2 completion, question, cancellation during question/permission/progress, interrupted restart, permission-boundary restart and persistence recovery. These include real native tools, independent fixture tests, exact existing session navigation and restart checks with controlled loopback responses.
- The eleven summaries record 57 assertions and 48 screenshots. Their summaries/screenshots and supplemental diagnostic logs are in the [Actions artifact](https://github.com/dumpfordummy/ZCode/actions/runs/35985877508/artifacts/10802254758), which is scheduled to expire on 2026-12-23. The durable [release evidence JSON](evidence/publishing/z2.2-release.json) records the result, assertions, screenshot paths and release metadata.
- Supplemental CLI lint and whole-repository formatting both exited 1. They remain visible baseline exceptions; GitHub's continue-on-error step presentation does not make those checks pass.
- The published installer is `ZCode.Graph-3.14.0-z2.2-win-x64.exe`, 149,654,458 bytes. The downloaded public `SHA256SUMS.txt` hash matches GitHub's installer asset digest: `d9fed73f6820f1f9e4022b2f2628c740f382858347fd79f3a9013ed1ea8e029e`. Both required assets are present and nonempty. Release-note source links point to the immutable z2.2 tag.

User-operated live-provider checks, second-PC/clean-VM installation, actual installer upgrade/uninstall and signing reputation remain **NOT RUN**. The publisher command itself was not run end-to-end locally because this shell has no GitHub CLI; the direct Git/tag workflow path above was executed and verified. No paid task, installed profile or company repository was used. Unrelated standalone/future handoff files remain local and untracked. Release tags were not moved, and Z3 was not started.

The publication report and operator examples were updated after release as documentation-only follow-up on main. The released executable remains tied to the immutable `55c5ad6` source commit. The next new Z2 release must use an unused version; the examples now use `3.14.0-z2.3`.
