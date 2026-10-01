# Z8.1 packaged-baseline follow-up

**Status: Z8.1 PACKAGED BASELINE RESTORED — UPGRADE, SECURITY AND INSTALL ACCEPTANCE PENDING.**

All 13 current packaged scenarios (the 12 existing ones plus one new current sequential journey) pass against the unchanged `b1` binary, and the full-suite release gate is satisfied by the generated supplement. This does not approve the candidate for installation, release or real-credential use, and it is not production network-egress acceptance. Z8.2–Z8.5 are not started. Earlier results in [Z8_1_REPORT.md](Z8_1_REPORT.md) stay as written; this document supersedes only the statements it names.

Evidence: [evidence/packaged-followup/](evidence/packaged-followup/). The generated supplement is [PACKAGED_VALIDATION_SUPPLEMENT.json](evidence/packaged-followup/PACKAGED_VALIDATION_SUPPLEMENT.json); the original `RELEASE_MANIFEST.json` of b1 is untouched.

## 1. What was tested, and which source built it

| Item                                         | Value                                                                                                                                                          |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Binary under test                            | `dist-graph-b1`, candidate `3.14.3-z8.1`, **not rebuilt**                                                                                                      |
| Build-source SHA (what built the binary)     | `e555d800906d7ca76d43aa22e186ba8d8baedc24` (clean at build start)                                                                                              |
| Harness-source SHA (what the tests ran from) | `13254f1e55fc216be37715ae248ad1fb33aa4d0b` for the final run; `dce3e5beffc493550c0113ab2a5d8eebffaed1c2` for the first full pass. Working tree clean for both. |
| Branch                                       | `claude/z8-1-release-package` (not the stale local UX branch)                                                                                                  |
| b1 installer SHA-256                         | `e7698bc9866596163f3f07b8b34479692f930e967ffb66a04d5c2392dd2ca1e6`, before and after                                                                           |
| b1 manifest SHA-256                          | `38ec708287c2ccd67b24f332b41cb371a0e45e0c87fab3e7672f2063e4463fec`, unchanged (the docs copy `evidence/RELEASE_MANIFEST.b1.json` has the same hash)            |

The binary is **not** relabelled as built from the harness commit: the supplement records `buildSource` and `harnessSource` as separate fields. The harness changes are test scripts, a tooling module, evidence and docs; no product, packaging or build-configuration file changed since `e555d80` (`git diff e555d80 HEAD` touches only `scripts/graph-engineering/`, `.github/workflows` test lists and `docs/`).

Hash verification (`verify-package-hashes.mjs`, read-only, against the original manifest) ran immediately before and after the suite: installer, the 8 manifest components, the `win-unpacked` tree digest and all 86 files matched both times, and the two observations are identical ([before](evidence/packaged-followup/packaged-hash-check.before.json), [after](evidence/packaged-followup/packaged-hash-check.after.json)). The suite also hashes the executable, `app.asar` and the embedded identity of its detached copy against the manifest before launching anything.

## 2. The original result, described accurately

The earlier packaged run on b1 was 2 PASS (`ordinary-chat`, `telemetry-canary`) and 10 FAIL. It is retained as `packaged-smoke-history/2026-10-01T07-22-37-936Z/` in b1 and summarized in [retained-attempts.json](evidence/packaged-followup/retained-attempts.json). Its accurate description is:

> **Blocked at stale harness navigation; downstream behavior not exercised.**

Each of the ten cases timed out (30 s) looking for a Design-destination control (`graph-name` or `graph-upgrade`) while the app was on its default Runs destination. Nothing past that first step ran, so those ten runs say nothing, good or bad, about the product behavior behind it. The earlier wording "a stale harness, not a product failure" was an inference from the UI source and is superseded by the actual re-run below.

## 3. Driver repairs

The real route in the current UI (read from `GraphEditorNavigation.tsx` and `GraphEditor.tsx`, then exercised in the packaged app): opening Graph Engineering lands on the **Runs** destination; the legacy/sequential editor (`graph-name`, node canvas, Save, Run) is the **Workflows** destination, reached with `graph-view-design`. There is no tab literally named "Design" in the UI; the test ID kept that name. Runs of a restarted app also default to the New-run pane, so a run's recovery panel exists only after the run is selected in the list.

| File                             | Change                                                            | What the scenario still proves                                                                                                   |
| -------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `z2-native-helpers.mjs`          | new `openGraphDesign()`; `createSequentialGraph` uses it          | the Z2 editor journey (add/remove/rename tasks, bindings, keyboard layout)                                                       |
| `native-smoke.mjs` (no-provider) | open the design destination at both entry points                  | editing, save, layout persistence after leaving and returning, Run unavailable and zero model requests with no provider          |
| `z2-z1-regression.mjs`           | open the design destination                                       | the unversioned Z1 definition, its literal template token, real Read/Edit/Bash, completed Z1 history reopening without migration |
| `z2-native-restart.mjs`          | select the Interrupted run in the list before inspecting recovery | restart keeps interruption, identities and pending successors, no native replay, release stays disabled                          |

Not weakened: no assertion was removed or altered in these four files (the only removed line containing a wait is the same `waitFor`, refactored). The legacy Z1 scenario was not replaced by a modern workflow: it still creates an unversioned Z1 definition and asserts `definition.version === undefined`. The one assertion deliberately removed anywhere is in `reviewer-native.mjs`: the guard that forbade running the reviewer journey against a packaged app, replaced by an explicit packaged mode (item 4).

Intermediate attempts, kept in the record: before the fix, `no-provider` and `z1-literal-compatibility` failed as shown above. After navigation was fixed, on a detached copy of b1 with uncommitted drivers, all but two cases passed on first try; `z2-restart-interrupted` and `z2-restart-permission` then failed at `graph-reconcile` (the interrupted run was never selected) and passed once the run was selected. These iteration runs used a throw-away copy of the same files and are not part of the evidence set; the committed-harness runs are.

## 4. The full suite

Run by `run-packaged-acceptance.mjs 3.14.3-z8.1 --dist-dir dist-graph-b1`: detached copy of b1, fresh synthetic homes/workspaces, controlled loopback provider, Chromium proxy to the fixture, keep-going so every case is recorded, final exit code nonzero if any case failed. **Process exit code 0**; summary `scope: full`, `status: PASS`, passed 13, failed 0, not run 0, `satisfiesFullReleaseGate: true`. It was run twice at two harness commits, both 13/13; the earlier is retained in b1's history ([retained-attempts.json](evidence/packaged-followup/retained-attempts.json)).

| Case                                    | Exit | Assertions       | Notes                                                                      |
| --------------------------------------- | ---- | ---------------- | -------------------------------------------------------------------------- |
| `ordinary-chat`                         | 0    | 2                | identity `ZCode Graph` `3.14.3-z8.1`, `isPackaged: true`, own home/profile |
| `no-provider`                           | 0    | 3                | Run unavailable, zero model requests                                       |
| `telemetry-canary`                      | 0    | 2                | 0 canary hits, ARMS initialization not attempted (see section 7)           |
| `z1-literal-compatibility`              | 0    | 2                |                                                                            |
| `z2-complete`                           | 0    | 9                |                                                                            |
| `z2-question`                           | 0    | 10               |                                                                            |
| `z2-cancel-question`                    | 0    | 5                |                                                                            |
| `z2-cancel-permission`                  | 0    | 5                |                                                                            |
| `z2-cancel-progress`                    | 0    | 4                |                                                                            |
| `z2-restart-interrupted`                | 0    | 5                |                                                                            |
| `z2-restart-permission`                 | 0    | 5                |                                                                            |
| `z2-persistence-recovery`               | 0    | 7                |                                                                            |
| `sequential-engineering-reviewer` (new) | 0    | 2 + proof record | section 5                                                                  |

Suite semantics (unit-tested in `packaged-suite.test.mjs`): a case passes only with exit 0 and status PASS; any failed or never-run selected case makes the suite FAIL with a nonzero exit; keep-going cannot hide a failure; a filtered run writes `packaged-smoke.subset.json` and `smoke-evidence-subset/`, is labelled `SUBSET`/`SUBSET-PASS`, and `satisfiesFullReleaseGate` is never true for it. Re-running archives earlier results under `packaged-smoke-history/` instead of overwriting them.

## 5. The one current sequential workflow, in the package

Case `sequential-engineering-reviewer`, implemented by letting the existing `reviewer-native.mjs` journey run against the packaged executable (`Z1_PACKAGED_EXE`) — no second harness. Packaged mode skips the UX audit (resize matrix, check-editing screenshots) and keeps every product assertion. It uses an isolated disposable profile and workspace, the controlled loopback provider, the built-in **Sequential Engineering** template (generic, version 2) instantiated through the library UI, saved Node Build/Test checks written as configuration only (the driver never runs them), real native Read/Edit, Graph Tool execution through the native runtime, and a strict reviewer JSON response. The driver approves only native tool permissions; it never decides the final gate.

Recorded proof (from the passing run, [supplement](evidence/packaged-followup/PACKAGED_VALIDATION_SUPPLEMENT.json), case `sequential-engineering-reviewer`):

- Packaged identity `ZCode Graph` / `3.14.3-z8.1` / `isPackaged: true`; tested executable, `app.asar` and identity hashes equal the manifest's.
- Expected source edit: `zz-demo.txt` content is exactly `after` (workspace `.gitignore` keeps it untracked; the check declares it).
- Build: operation `cd68a799-…` Completed, exit 0, process exit observed. Test: operation `72a69429-…` Completed, exit 0, 1 test, acceptance passed, named passing assertion **`zz-demo contains after`**.
- Matching evidence: test source digest equals build source digest (`faee973b…`), test build digest equals build output digest (`c98797b6…`), report operation equals the test operation.
- Reviewer: Completed, output validation `valid`, outcome `pass`, `evidenceReferences` = the one bound verification artifact `06b9542d-…`.
- Run status `WaitingForApproval`; final gate `WaitingForApproval`, **no decision recorded**.
- 3 native agent inputs and 2 native tool operations; 9 controlled-provider model requests.

Limits: model responses are controlled fixtures, not live-model behavior. Test-environment overrides (`ZCODE_ENV=test`, loopback origins, Chromium proxy) are explicit in the harness. This is not production network-egress acceptance. The negative reviewer scenarios, failing Test, final-gate decisions and repair routing remain development-evidence only.

## 6. Evidence accounting reconciled (from the retained b1/b2 comparison; no new comparison)

Generated by `reconcile-comparison.mjs` from [build-comparison.json](evidence/build-comparison.json) → [build-comparison.accounting.json](evidence/packaged-followup/build-comparison.accounting.json).

**Correction.** The earlier report said "27,562 are byte-identical; 9 members differ". 27,562 is the number of paths present in **both** builds, which includes the 9 changed ones. The corrected accounts are disjoint:

| `app.asar` members                               | Build A (b1)             | Build B (b2)             |
| ------------------------------------------------ | ------------------------ | ------------------------ |
| Total members                                    | 27,573                   | 27,573                   |
| Byte-identical same path                         | 27,553                   | 27,553                   |
| Changed same path                                | 9                        | 9                        |
| Present only in this build (renamed chunk files) | 11                       | 11                       |
| Check                                            | 27,553 + 9 + 11 = 27,573 | 27,553 + 9 + 11 = 27,573 |

Paths present in both builds: 27,562 = 27,553 + 9. The 9 changed and the 11 renamed are disjoint sets; the 11 renamed chunks are not among the 9. `win-unpacked` (86 files): 84 byte-identical, 2 changed (`ZCode Graph.exe`, `resources/app.asar`), 0 only-in-one-side. Installer: not identical.

**Raw byte comparison (what was measured):** installer differs; `ZCode Graph.exe` same size with 62 differing bytes in one contiguous range; `app.asar` same size, 2,417,880 differing bytes (the tool records at most 50 contiguous ranges and recorded 50, so the real count of ranges is at least 50); the 9 changed members and 11 one-sided chunks differ in raw bytes.

**Normalized diagnostic comparison (kept separate; localization only):** with `chunk-XXXXXXXX` name tokens and ISO timestamps replaced by placeholders, 9 of 9 changed members are equal and all 11 one-sided chunks pair up with an equal counterpart (11/11). This localizes where the builds differ. It is **not** byte reproducibility and **not** a behavioral-equivalence claim; the installer hashes differ.

**Executable integrity region — now verified directly, with a new finding.** [asar-integrity.json](evidence/packaged-followup/asar-integrity.json) (`verify-asar-integrity.mjs`) reads the executables: the 62 differing bytes (offsets 221,572,463–221,572,526) are exactly the `value` of the `ELECTRONASAR` integrity resource `[{"file":"resources\\app.asar","alg":"SHA256","value":"…"}]` in each build (verified for both). The earlier explanation "consistent with the embedded ASAR integrity digest" is therefore confirmed as to what the bytes are. What is **not** established: why the values differ per build is still inference (they follow the differing archives), and neither recorded value equals the SHA-256 of that build's current `app.asar` header JSON (b1 records `0502727f…`, header hash is `d0018764…`). The `EnableEmbeddedAsarIntegrityValidation` fuse is **0** (disabled) in the executable, so the mismatch is not enforced at startup — consistent with the packaged apps launching normally. It is an observation for Z8.3/Z8.4 (it would matter if that fuse were ever enabled); no change is made or proposed here.

## 7. Telemetry positive controls, per path

Records: [telemetry-positive-controls.json](evidence/packaged-followup/telemetry-positive-controls.json) (every control run, including failed ones). Control = ordinary non-Graph flavor development build with the same inherited variables pointed at loopback canary paths. The packaged Graph canary (`telemetry-canary`, 0 hits) is only informative for a path whose control can be shown to produce a hit.

| Path                        | Positive control                                                                                                                                                                                         | Packaged canary reading                                                                                                                                                                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Warehouse / report          | **Ran successfully:** hits to `/telemetry-canary/report` in all 6 passing control runs (13–14 hits)                                                                                                      | 0 hits — meaningful                                                                                                                                                                                                                                   |
| OTLP (agent traces/metrics) | **Not established for the current source.** `/telemetry-canary/otlp/v1/metrics` was seen in 2 early runs; in the 4 later runs (every run from the build-source commit onward) only `/report` was hit     | 0 hits — **not validated by a current positive control**                                                                                                                                                                                              |
| ARMS RUM                    | **Did not run successfully.** The one control with the ARMS endpoint set stalled at startup (SDK threw "Failed to get 'userData' path"; no window in 30 s; 0 hits). No control with ARMS traffic exists. | "initialization not attempted" is a log-pattern check (`rum-electron`/`startArmsRum`/`[arms]`), not a traffic observation, and the pattern itself had a regex defect in the first control runs (a false positive on `armsInitAttempted`, later fixed) |

No broader telemetry or security work is authorized here and none was done. Why OTLP traffic appeared only in early controls was not investigated.

## 8. Coverage — what the packaged evidence covers

Derived mapping: [capability-coverage.json](evidence/packaged-followup/capability-coverage.json). A capability is listed as packaged-verified only if every mapped case passed in the supplement.

| Capability                                                | Packaged cases                                                                                                                                                                                                                                                                                                             | Packaged-verified                           |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Ordinary Chat                                             | `ordinary-chat`                                                                                                                                                                                                                                                                                                            | yes                                         |
| Startup without provider, no model request                | `no-provider`                                                                                                                                                                                                                                                                                                              | yes                                         |
| Legacy (unversioned Z1) sequential compatibility          | `z1-literal-compatibility`                                                                                                                                                                                                                                                                                                 | yes                                         |
| Multi-session sequential handoff incl. questions          | `z2-complete`, `z2-question`                                                                                                                                                                                                                                                                                               | yes                                         |
| Cancellation leaves unrelated Chat usable                 | `z2-cancel-question`, `z2-cancel-permission`, `z2-cancel-progress`                                                                                                                                                                                                                                                         | yes                                         |
| Restart and conservative recovery                         | `z2-restart-interrupted`, `z2-restart-permission`, `z2-persistence-recovery`                                                                                                                                                                                                                                               | yes                                         |
| Built-in Sequential Engineering template instantiation    | `sequential-engineering-reviewer`                                                                                                                                                                                                                                                                                          | yes                                         |
| Build/Test through the native runtime, matching evidence  | same                                                                                                                                                                                                                                                                                                                       | yes                                         |
| Strict reviewer output bound to the verification artifact | same                                                                                                                                                                                                                                                                                                                       | yes                                         |
| Final human gate presented and left pending               | same                                                                                                                                                                                                                                                                                                                       | yes (presented/pending only)                |
| Automatic telemetry, inherited settings                   | `telemetry-canary`                                                                                                                                                                                                                                                                                                         | yes for the report path only; see section 7 |
| Not exercised in the package                              | final-gate approve/reject and freshness; bounded repair routing; library save/version/archive, import/export, historical pins; failing Test and negative reviewer outputs; parallel (disabled by policy; Host rejection is unit-tested only); installer, upgrade, uninstall, signing; production egress; Feedback uploader | —                                           |

The original manifest's per-capability `packageVerified` lists (2 packaged cases) are preserved as historical; this supplement is the current packaged record for b1. Evidence from b1 is not a runtime test of b2; no packaged scenario was run against b2.

## 9. Validation for this follow-up

Run with the repo toolchain (Node 24.14.0, pnpm 10.33.2) by `run-validation.mjs`; the repo-wide formatter was not run (scoped content check only).

| Check                                                             | Result                                                                                                                                        |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                                                  | exit 0                                                                                                                                        |
| `pnpm lint`                                                       | exit 0, 75 warnings, 0 errors (a first attempt failed on a `max-lines` error in a test file I had grown to 425 lines; split into three files) |
| `pnpm architecture:check --changed`                               | exit 0                                                                                                                                        |
| Script tests (now including `package-evidence`, `packaged-suite`) | 65 pass, 0 fail                                                                                                                               |
| Graph + agent-service tests                                       | 372 pass, 0 fail, 2 skipped                                                                                                                   |
| Services + registry tests                                         | 17 pass                                                                                                                                       |
| UI tests                                                          | 227 pass                                                                                                                                      |
| Scoped format check                                               | 0 nonconforming                                                                                                                               |
| Packaged suite on b1                                              | 13/13 PASS, process exit 0, twice                                                                                                             |

New focused tests: packaged-suite scope/exit semantics (6), package hash verification pass/fail on a tampered component, retained-data accounting that must sum, and the existing manifest/inspection tests (now split across `release-manifest.test.mjs` and `package-evidence.test.mjs`).

## 10. Remaining blockers and what this does not establish

- **Still pending, unchanged:** installing the NSIS installer anywhere, upgrade/uninstall/rollback, real older-profile upgrade fixtures, signing, production-egress measurement, Feedback uploader review, the credential-key derivation decision (Z8.3), retention/deletion and backup/support-bundle capabilities, and every real-credential use.
- **Not established by the packaged suite:** that unseen product paths are defect-free; live-model behavior; b2 behavior at runtime.
- **CI:** the release workflow still runs `packaged-smoke.mjs` unfiltered, so its gate now has a chance to pass. It has not been run on GitHub in this work.
- **Observation for later:** the embedded ASAR integrity record does not match the shipped archive's header hash (fuse disabled).

## 11. Reproduce

From the build-source commit's binary (`dist-graph-b1`) with the harness commit checked out and a clean tree: `node scripts/graph-engineering/run-packaged-acceptance.mjs 3.14.3-z8.1 --dist-dir dist-graph-b1` (runs hash check → full suite with keep-going → hash check → writes the supplement; exit 0 only if the full gate holds). `node scripts/graph-engineering/collect-followup-evidence.mjs dist-graph-b1 <asar-integrity.json> <profiles dir>` regenerates the evidence directory.
