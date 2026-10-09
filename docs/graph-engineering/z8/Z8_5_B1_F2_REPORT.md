# Z8.5-B1-F2 report — .306 targeted acceptance PASS

The corrected 3.14.3-z8.306 candidate passed the required prebuild proof and targeted packaged acceptance. Local publication preparation is authorized; merge, tag creation, release creation, installer upload and installation are not performed. PR #20 remains draft with auto-merge off. Working .303 is not replaced.

## Source identities and sequencing

- Integration: 3591c5824dbede731917869341ecdd36693e3b02 (ancestor of build source).
- Clean build and native harness source: **203ecea873631e896a0db4031aa9934e9ef66d91**; tree c6638ce53152a7b567bcfceea1259a628393199c.
- Later external scanner classification: **41e5298beca57d745c1213127ee171865b6a952c**.
- The final PR head is a later documentation commit. Its exact head/base/tested merge SHAs and live CI results are recorded in the local operator handoff and PR description after that commit is checked. This report does not equate the build source with a later report commit.
- Any future distribution tag must identify **203ecea873631e896a0db4031aa9934e9ef66d91** and use the tested binary. Do not trigger a graph-v\* rebuilding workflow.

Both original report replays, portable regressions, adverse mutations, a fresh source-level native pass/fail/recovery sequence, focused/integrated checks, typecheck, lint, formatting, architecture and pre-push completed successfully before packaging. The final production/test/harness changes were committed first. One .306 build followed in a new checkout with new dependencies.

## Narrow parser correction

The [F2 decision/spec](Z8_5_B1_F2_SPEC.md) cites the actual producer sources. The adapter package 2.5.3 references runner-reporters 2.5.2. Its default reporter emits a failure echo containing the escaped display name; the adapter prefixes the elapsed clock and forwards Error severity; VSTest retains this independently in RunInfo.

After validating results/definitions/entries, counters, identities, assembly and timing, the parser permits only an exact supported Error echo that maps to exactly one already validated Failed result using the xUnit netcore adapter identity. It includes all result names in ambiguity checks, handles only documented escaping, and rejects repeated echoes. There is no trimming, substring/partial matching or broad diagnostic bypass. Logger elapsed time is not wall-clock evidence.

Mixed known echo plus testhost, adapter, fatal or cleanup diagnostics remains invalid, even with reconciled 2/1 counters. Unknown diagnostics, wrong severity/producer, unmatched or passing names, escaping collisions, extra text, duplicate echoes and stale timestamps remain invalid. Absence of the echo remains valid. RunInfo cannot create or change a test result. Duration syntax/range, native/report chronology, source/Build/operation binding, freshness, counts, required tests and zero/all-skipped protections remain intact.

GraphToolEvidence is still the single evidence owner. A complete failed assertion yields observationValid=true, outcome=fail, acceptancePassed=false and a valid immutable normalization receipt. Cold reads and old rejected records are not migrated.

## Retained original and portable proofs

Both unchanged original F1 failed TRX files replayed successfully through real secure capture with their OWN captured operation, scope, expected assembly, file timestamp and native window. No old run record was rewritten:

| Historical run                       | Native Test operation                | Original SHA-256                                                 |
| ------------------------------------ | ------------------------------------ | ---------------------------------------------------------------- |
| bb03b229-a4eb-4940-aff6-1d8cdfa1057e | 0239573b-0ff1-4d17-808d-a626a46809e6 | ce122c3ea43847154b859812443fd6ce076ea50ed266e8593b0cedcfb12372cb |
| 7ca7de3e-e04a-4caf-a330-1fcd54c90e03 | 5612f394-e380-453d-8f02-de58a40506a2 | 5837ff36657c0a81a627bdeb3ea492f161f9de1ba4e8cc4111e249e61a6e18f6 |

The derived failed fixture SHA-256 is **891240a16ef952e5e8af5231abdaec81a6f1676cddc008c05248eae1b6acfb1d**. The adjacent provenance JSON records original digest, native window and sanitization: synthetic user/machine/absolute-path metadata and LF, preserving diagnostic, failure, joins, counters and timings. Original raw TRX stays local. Existing passing fixture SHA-256 c446411e249290c99559674701d8046c0b32ba18fff0b5d1ddba1139f1ba4e60 remains unchanged.

The 24 new tests include actual derived XML -> secure capture -> parser -> GraphToolEvidence -> immutable normalization/verification receipts. Native facts in this portable owner fixture are explicitly injected; real process proof is separate below. Reinstating blanket rejection fails the genuine positive cases. Ignoring all diagnostics fails negative parser and capture/evidence cases. Restoring the implementation passes. These tests execute in the existing required Cloud services selector without an optional manifest.

[Prebuild proof](evidence/b1-f2/prebuild-proof.json) retains exact original replay identities and the source native sequence. Source run IDs: bb626982-b479-4362-9b25-7d8a78490c84 -> 1713bcb6-d912-42e5-aba7-194ed60546cc -> cd7e82ab-2cf8-4801-a244-458548942c36. All three acceptance cases passed before packaging. The sequence used the existing isolated development bootstrap and rebuilt source, not a second product execution mechanism.

## Controlled .306 build

Node 24.14.0, pnpm 10.33.2, Electron 41.0.3 and electron-builder 26.8.1. The new checkout initially had no node_modules or desktop output. Frozen offline --ignore-scripts install reused 1739 package-store entries, downloaded zero packages and added 1885 dependencies. Electron preparation was explicit. Existing Windows runtime/native preparation and build-windows.mjs were used. Six-class ssh2 contamination preflight passed before and after preparation.

Embedded/source-at-build identity is clean (dirty=false, zero dirty paths). Build output records eight generated node-repl-host declarations with line-ending-only differences; git diff --ignore-space-at-eol is empty. These output differences were preserved, not hidden by resetting the checkout.

Installer: **ZCode Graph-3.14.3-z8.306-win-x64.exe**, **149928073 bytes**, unsigned.

| Component               | SHA-256                                                          |
| ----------------------- | ---------------------------------------------------------------- |
| Installer               | 45304d192e1939bbe4566a3587b82983f444c7763ea7eb9ae950e6836a1f5933 |
| ZCode Graph.exe         | d631dd2434870c5569fc4341975a90e0b64fbc5971923a6e3894b278346a4cc9 |
| resources/app.asar      | ae16a7e8253f4fc20a9ee6b78d94632804566a17c101673753e8259ff8cda878 |
| resources/glm/zcode.cjs | 875a139d88a940d55731bca799acb8deaf9b433f454058cd16ecdc570af3967b |
| Embedded build identity | b1ff4d59b2b7c843697d49b20e2c18bcddf44dd3de222f4e45d6e962ab3c3673 |

Content scan: **147 raw / 147 explained / 0 unexpected**. Initial 147/145/2 scan and manifest are retained. The only new findings were exactly two English/Chinese ssh.hostPlaceholder literals (192.168.1.100) in IntlProvider-CNp1QlUN.js, member SHA-256 2a85213dd569a46ce81286f8584229be7b57276e61b41219f33e5aae4012bf17. Exact external classification and extra-count/wrong-address/wrong-asset/planted-path negative controls passed. No archive editing or rebuild occurred. No generated ssh2 metadata or local checkout/user-path hits remain.

ASAR recorded/header hash: **c835f52cb019f394cbd42951eca5ffc58b05b42b5dc1d538229a56ea519532a5**, equal before/after. Integrity fuse=1, RunAsNode=1; complete expected fuse map retained. Installer, all eight manifest components and all 86 detached files remain byte-identical after testing. Detached tree digest: **2812c27c250ef107887fd7de98274d538dab69568777bef40cf6303446f91069**.

## Packaged native acceptance

Actual pinned SDK 8.0.425, VSTest 17.11.1, Microsoft.NET.Test.Sdk 17.8.0 and xUnit/adapter 2.5.3. Fixture setup restored from the existing local public cache, with no external feed. Generated Build/Test retain --no-restore and Test --no-build. The unmodified detached package used fresh isolated profiles.

| Case                             | Result                                                                                                                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1 Save/reopen                   | PASS; request/context and selected checks preserved; zero runs/models/native ledger entries before Save, after Save and after reopen                                                           |
| Q2                               | PASS; Build/Test exits 0/0, three genuine passing assertions, valid receipt                                                                                                                    |
| Q3 intentional assertion failure | PASS as a failure-evidence case; Build/Test exits 0/1, two passed/one failed, observationValid=true, outcome=fail, acceptancePassed=false, valid receipt                                       |
| Fresh recovery                   | PASS; restored exact fixture source, new Build/Test operations/path/report identity, three passing assertions accepted                                                                         |
| U1 representative run view       | PASS at 1600x900 and native minimum 1093x640; Fit/Focus/details/tab viewport/history preserve authoritative records; final human approval remains WaitingForApproval with no recorded decision |
| Ordinary Chat                    | PASS; actual CLI Read/Edit/Bash events, synthetic file edit and independent node:test pass                                                                                                     |

Six distinct native Build/Test operations, three distinct report paths and report IDs, unchanged check configuration and immutable prior records. No model invocation in Q1 or the .NET Q2/Q3 sequence. U1/Chat use the existing local synthetic provider, not real credentials or paid models.

| Packaged run | Run ID                               | Original TRX SHA-256                                             |
| ------------ | ------------------------------------ | ---------------------------------------------------------------- |
| Q2           | 3beffe7b-806c-447c-bb91-4227158151d8 | ad15494534fed139526cbe670cf0f9935e57f6e9e5a6ec78d2b0f383a9b8c1f3 |
| Q3 failed    | 96a4ea1c-1b67-4db7-9168-e219f5a527f0 | 598aeb594a867a8f34459ea8b19d6a6d543e3141d0042db40ae19438372e07fa |
| Recovery     | 914b0652-3690-4193-9710-ddb415e10845 | 4d28d783e4c0107e67791ae9d5fd41cfd4e640330119258cf688ee5dd1162f7e |

[Reviewed final receipt](evidence/b1-f2/reviewed-receipt.json) contains exact operation windows, source/Build bindings, normalized receipt identities, hashes, scope and counts. Raw profiles, original reports, native logs and screenshots remain local.

## Commands, exits and counts

All final commands below exited 0; initial failing regression/mutation attempts are retained separately.

- pnpm exec tsx --test packages/services/src/graph-engineering/app/trx-runinfo.test.ts packages/services/src/graph-engineering/adapters/trx-runinfo-evidence.test.ts — 24 passed, zero failed/skipped.
- pnpm exec tsx --test packages/services/src/graph-engineering/app/trx*.test.ts packages/services/src/graph-engineering/adapters/trx*.test.ts — 133 passed, 2 optional-manifest skips, zero failed.
- pnpm exec tsx --test --test-concurrency=4 packages/services/src/graph-engineering/app/_.test.ts packages/services/src/graph-engineering/adapters/_.test.ts — 470 passed, 2 optional skips, zero failed.
- node --test scripts/graph-engineering/package-evidence.test.mjs scripts/graph-engineering/release-manifest.test.mjs — 18 passed, zero failed/skipped.
- node --test scripts/graph-engineering/acceptance-paths.test.mjs scripts/graph-engineering/packaged-suite.test.mjs — 9 passed, zero failed/skipped (additional post-build harness-boundary check).
- pnpm typecheck; pnpm verify:pre-push (includes pnpm lint and architecture:check --changed) — PASS; lint 75 baseline warnings, zero errors.
- PR-scope architecture and changed-file formatting — PASS; byte-preserved historical exclusions retained.
- pnpm --filter @zcode/desktop build:no-runtime-assets; node scripts/graph-engineering/b1-native.mjs --source — source compile and all three native cases PASS before packaging.
- pnpm install --frozen-lockfile --ignore-scripts --offline --store-dir [controlled local store]; node node_modules/electron/install.js — fresh dependency/Electron preparation PASS.
- node scripts/graph-engineering/build-windows.mjs 3.14.3-z8.306 --dist-dir dist-graph-b1-f2 — one build, exit 0.
- node scripts/graph-engineering/b1-native.mjs --save-only; node scripts/graph-engineering/b1-native.mjs — packaged Q1/Q2/Q3/recovery PASS with verified Z1_PACKAGED_EXE.
- B1_VERIFY_RUN_VIEW=1 node scripts/graph-engineering/reviewer-native.mjs --scenario=pass; node scripts/graph-engineering/native-smoke.mjs --chat — PASS.
- w1-inspect.mjs and verifyPackageHashes before/after, detached-tree comparison and historical-file rehash — PASS.

Build-source Cloud run [37328856539](https://github.com/dumpfordummy/ZCode/actions/runs/37328856539) passed typecheck, static-checks, graph-tests and graph-cloud-required. Tested merge a9e8657e00a6311d4803a35971824f10448425e1; head 203ecea873631e896a0db4031aa9934e9ef66d91, base 3591c5824dbede731917869341ecdd36693e3b02. Cloud groups: scripts 155/155; services 567 passed plus 4 documented skips; UI 243/243 (969 total, 965 passed, 4 skipped). New F2 cases visibly executed in logs. Final documentation-head CI is separately verified after push; CI is not substituted for native acceptance.

## Preservation and delivery boundary

All 14 retained historical files checked before/after are unchanged: .304/.305 installers, manifests, inspections, checksum and unpacked hash files, both failed originals and their summaries. Prior committed B1/F1 reports and receipts remain untouched. Source ownership remains graph-engineering/domain plus the existing capture/evidence owners; no protocol/state owner changes.

[Reviewed draft release notes](Z8_5_B1_F2_RELEASE_NOTES_DRAFT.md) and the exact tested installer/checksum are prepared in a LOCAL publication folder recorded in the operator handoff. This is an unsigned pilot result within targeted acceptance, not a new installer lifecycle, general UX, network-egress or security audit. No second .306, install, .303 replacement, merge, release tag, release workflow or upload occurred.
