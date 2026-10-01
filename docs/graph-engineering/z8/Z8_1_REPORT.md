# Z8.1 report — local candidate built and inspected

**Final Z8.1 status: Z8.1 PACKAGED BASELINE RESTORED — UPGRADE, SECURITY AND INSTALL ACCEPTANCE PENDING.**

**The superseding packaged evidence is in [Z8_1_PACKAGED_FOLLOWUP.md](Z8_1_PACKAGED_FOLLOWUP.md).** This report is the historical first report and is kept as written, with "Update" notes where the follow-up corrects it. "Packaged" here means the unpacked application run from a detached copy by the existing smoke harness. **This is not installer or install acceptance:** the NSIS installer was never executed, and upgrade, uninstall, security (egress, credential-key derivation, Feedback uploader) and signing remain pending.

Source distinction: the **b1 binary** was built from `e555d800906d7ca76d43aa22e186ba8d8baedc24`. Everything committed after that (test drivers, tooling, evidence, documentation) is later harness/documentation source and is not what built the binary.

Standing exceptions that remain visible: the CLI lint failure (turbo aborts, counts vary per run) and the repo-wide `pnpm fmt:check` failure (about 4,150 paths; on Windows oxfmt prefers CRLF, so it flags LF files at the baseline too). Neither was suppressed, fixed or reformatted; a scoped content-level format check covers the files this milestone changed.

**Status (as first reported): Z8.1 LOCAL CANDIDATE BUILT AND INSPECTED — UPGRADE, SECURITY AND INSTALL ACCEPTANCE PENDING.**

> **Follow-up (packaged baseline).** [Z8_1_PACKAGED_FOLLOWUP.md](Z8_1_PACKAGED_FOLLOWUP.md) repaired the packaged drivers and ran all 13 packaged scenarios, including a new current sequential journey, against the unchanged b1 binary: 13/13 PASS, process exit 0, full release gate satisfied, hashes unchanged before and after. Current status: **Z8.1 PACKAGED BASELINE RESTORED — UPGRADE, SECURITY AND INSTALL ACCEPTANCE PENDING.** The sections below are the historical first report; where the follow-up supersedes a statement, an "Update" note says so and the original text is kept.

This is not an internal-release approval. Nothing was merged, tagged, signed, published or installed (the branch was pushed for integration review only after the checkpoint was accepted). Z8.2–Z8.5 were not started. Spec: [Z8_1_SPEC.md](Z8_1_SPEC.md). Plan and decisions: [Z8_PLAN.md](Z8_PLAN.md). Audit record: [Z8_DELTA_AUDIT.md](Z8_DELTA_AUDIT.md) (unchanged). Raw evidence: [evidence/](evidence/).

## 1. Source and artifacts

| Item                        | Value                                                                                                                                                                                                                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch                      | `claude/z8-1-release-package` (local only)                                                                                                                                                                                                                                                            |
| Build-source SHA            | `e555d800906d7ca76d43aa22e186ba8d8baedc24`                                                                                                                                                                                                                                                            |
| Started from                | `51f6ed67f63ff3500abca1bd86023f40bb29543d`. The _local_ branch `claude/zcde-graph-ux-audit-be80d8` is stale at `8bf69e5` (UX-M2); the remote-tracking ref `origin/claude/zcde-graph-ux-audit-be80d8` is at `51f6ed6`, which is what was used.                                                         |
| Candidate version           | `3.14.3-z8.1` (root `package.json` is now `3.14.3`)                                                                                                                                                                                                                                                   |
| Source state at build start | clean for both builds (`dirty: false`). After each build the CLI build had rewritten line endings of 8 generated `apps/zcode-cli/packages/node-repl-host/dist-types/*.d.ts` files; they were restored with `git checkout`, never committed, and are recorded in each manifest as `source.afterBuild`. |
| Toolchain actually used     | Node 24.14.0, pnpm 10.33.2 (both equal to `mise.toml`), Electron 41.0.3, electron-builder 26.8.1, CLI 0.16.9, protocol `zcode` 1 / V4 wire 3                                                                                                                                                          |
| Lockfile hashes             | `pnpm-lock.yaml` `e30f59a8dbd8563bb34bd766f3391036a8858fc0a8fcd16a7604ad9308efe3d6`; `apps/zcode-cli/pnpm-lock.yaml` `d4c6acd20e979070b7d5b5610a4466f8ac2b3ea4c7d6dbb785a4cf7c13531733`                                                                                                               |

Artifact locations (ignored by Git, under `packages/desktop/`, so they exist only in this checkout):

| Directory                                | Contents                                                                                                                                                                                              |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dist-graph-b1/`                         | Build 1: installer, `SHA256SUMS.txt`, `RELEASE_MANIFEST.json`, `package-inspection.json`, `build-record.json`, `unpacked-file-hashes.json`, `win-unpacked/`, `smoke-evidence/`, `packaged-smoke.json` |
| `dist-graph-b2/`                         | Build 2 (same files except packaged smoke, which was run on b1 only)                                                                                                                                  |
| `dist-graph-a1-b1/`, `dist-graph-a1-b2/` | Retained **first pair** of builds from commit `da3a3a8`; superseded because their recorded metadata had defects (section 8). Kept as evidence.                                                        |

Installers (unsigned, `NotSigned`):

| Build | File                                  | Bytes       | SHA-256                                                            |
| ----- | ------------------------------------- | ----------- | ------------------------------------------------------------------ |
| b1    | `ZCode Graph-3.14.3-z8.1-win-x64.exe` | 149,891,508 | `e7698bc9866596163f3f07b8b34479692f930e967ffb66a04d5c2392dd2ca1e6` |
| b2    | `ZCode Graph-3.14.3-z8.1-win-x64.exe` | 149,890,252 | `5ceb3a86bef9dd97657f8ff9a0cf929e782c38b898e09bf5b8731618ae979db1` |

The two installers have **different hashes**; see section 6. Manifests: [b1](evidence/RELEASE_MANIFEST.b1.json), [b2](evidence/RELEASE_MANIFEST.b2.json).

Packaged component hashes (b1; the embedded identity, notices, default config, provider config, `glm/` agent bundle and `tools/` trees are identical in b2):

| Component                                      | SHA-256 / tree digest                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| `ZCode Graph.exe`                              | `2bba8a7cef2325df47f6a3c3078e3f8dfccb380a431ba9e13b596ca7ea6b891e` (b2: `fc09d279…`) |
| `resources/app.asar`                           | `7cc48ab284e050d0c1592200c35f5385cf145716b20957d94187122c5d279e48` (b2: `b61811ab…`) |
| `resources/graph-build-identity.json`          | `19f4332405002fad4459a7680a57745c29537d7c6a5932b9f6e09b5a67ed2359`                   |
| `resources/THIRD-PARTY-NOTICES.md`             | `874bf7c10bdcadd0df0b50fc782f39f077669c6e41bbdbccd868409cd714dec3`                   |
| `resources/config/default.json`                | `71e4ed4ab9fab16d6643f674272bef3557d7a0fa4133e2dd08d116117af6d723`                   |
| `resources/config/provider/zcode-builtin.json` | `c239da43e00e3e212ca874fe48a13ebbb3896ebc59ebeb28e003bd29856e38f9`                   |
| `resources/glm/` (agent bundle, 32 files)      | tree digest `35f1e7f80c41ac4eebd1a8ddf3388bf2f85d7c0c2671a2a6bbc91e9342819c83`       |
| `resources/tools/` (search tools, 8 files)     | tree digest `64defa546d9426ecf5d0be9d1ded4796e87dade03fb3076900cd115bf460ba49`       |

The embedded `graph-build-identity.json` (inside the package) has no installer hash, no timestamp and no build-machine path. The installer's own hash exists only in the external `RELEASE_MANIFEST.json`.

## 2. Upstream identity (decision 1)

Reproducible with `node scripts/graph-engineering/upstream-identity-check.mjs <out> <commit>`; result: [evidence/upstream-identity.json](evidence/upstream-identity.json), computed for the build-source SHA.

- Pinned content reference: tag `v3.14.3` = `29628c9acdb81b703bbd4080c207a0e7ce5e276e` (`scripts/graph-engineering/upstream-reference.json`). Actual merge-base: `872ad960de7ec172591f7e1952f7849229f94521` (upstream 3.14.0). The build source does **not** contain `29628c9` in its history; no ancestry is claimed or fabricated.
- Upstream changed **283 paths** between the merge-base and the pinned SHA. At the build source, **266 are byte-identical**, **15 contain the upstream change plus named fork edits** (three-way merge reproduces the fork file unchanged), and **2 are not contained**: `README.md` and `README.en.md` (the fork rewrote them; upstream's change there was an update note). The root `package.json` version was the one non-code upstream change the fork lacked; it is now `3.14.3`. No upstream-deleted path is still present.
- Against the pinned SHA the whole tree has 0 deleted, 58 modified and 3,650 added paths. This is a path-level comparison. It is **not** whole-tree equality and **not** ancestry. The content finding from the audit is therefore substantiated for the scope above.
- The manifest keeps `mergeBase` and `contentReference` as separate labelled fields.

## 3. Changes made (decisions 2–4 and deliverables A–E)

| Area                     | Change                                                                                                                                                                                                                                                 | Where                                                                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Version policy           | `z8` accepted; `z1/z2/z7` preserved; `z3–z6`, `z9`, `z10`, `z18`, leading zeros, missing numbers, upper case still rejected                                                                                                                            | `desktop-product-identity.mjs`; tests in `distribution.test.mjs`, `publish.test.mjs`; also used by builder, packaged smoke, publisher and the CI workflow's validation step (same function)                    |
| Parallel capability      | One resolver in `@zcode/shared`; Host rejects `save(enabled)`, `preview`, `prepare`, approving `decide`; allows `get`, `control`, rejecting `decide`; UI projects `view.policy`; omitted policy fails closed; supported package ignores the opt-in env | `graph-capabilities.ts`, `parallel-service.ts`, `node.ts` (graph), `GraphEngineeringPanel.tsx`, `GraphParallelPanel.tsx`, `GraphParallelRun.tsx`; tests `parallel-policy.test.ts`, `graphParallelView.test.ts` |
| Z7 development harness   | The two Z7 scripts set the explicit development opt-in; not re-run                                                                                                                                                                                     | `z7-native-smoke.mjs`, `z7-launch-fixture.mjs`                                                                                                                                                                 |
| Telemetry (Graph flavor) | Entry removes inherited ARMS/warehouse/`OTEL_*`/`ZCODE_TELEMETRY_*` variables before importing the app; shared policy zeroes the flags and endpoints for the Graph flavor; agent spawn env is `{}` for Graph                                           | `graph-profile.mjs`, `graph-entry.mjs`, `env.ts`, `agentTelemetryEnv.ts`; tests `distribution.test.mjs`, `graphTelemetryPolicy.test.ts`                                                                        |
| Builder                  | `--dist-dir`, embedded identity, external manifest, package inspection, build record                                                                                                                                                                   | `build-windows.mjs`, `release-manifest.mjs`, `finalize-release.mjs`, `package-inspect.mjs`, `electron-builder.config.js`                                                                                       |
| Tools                    | validation runner, build comparison, upstream identity check, evidence collector                                                                                                                                                                       | `run-validation.mjs`, `compare-builds.mjs`, `upstream-identity-check.mjs`, `collect-z8-evidence.mjs`                                                                                                           |
| Packaged harness         | `telemetry-canary` case; `ZCODE_GRAPH_SMOKE_CASES` and `ZCODE_GRAPH_SMOKE_KEEP_GOING` (default behavior unchanged)                                                                                                                                     | `packaged-cases.mjs`, `packaged-smoke.mjs`, `native-smoke.mjs`, `isolation.mjs`                                                                                                                                |
| Release notes            | Per-version notes with fallback to the historical file                                                                                                                                                                                                 | `release-notes/3.14.3-z8.1.md` (unpublished), `graph-windows-release.yml`                                                                                                                                      |
| Docs                     | `PROGRESS.md`, `WINDOWS_SETUP.md`, `PUBLISH.md` updated narrowly; historical reports untouched                                                                                                                                                         |                                                                                                                                                                                                                |

z7.6 (decision 4): `bca9a73` changes only `WINDOWS_RELEASE_NOTES.md`. Its reviewer-contract statements and known limitations are carried into the candidate notes, labelled as other-build statements, not Z8.1 results. Its "all 11 packaged cases passed", count and live-pilot claims were not carried as evidence. z7.6 was not released and `origin/main` was not merged.

## 4. Validation — exact results

Run with the repo toolchain at the build-source SHA (`e555d80`) by `run-validation.mjs` (commands, exit codes and logs retained under the ignored `.tmp/z8-1/`; summary [evidence/validation.json](evidence/validation.json), all attempts [evidence/validation-attempts.json](evidence/validation-attempts.json)). The `cli-lint`, `format-check` and the final assembly were re-run at a later docs/tooling commit because the runner's counting was corrected (section 8); product source is identical.

| Check                                | Command                                                                                                                                   | Exit | Result                                                                                                                                                                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck                            | `pnpm typecheck`                                                                                                                          | 0    | PASS                                                                                                                                                                                                                                  |
| Lint                                 | `pnpm lint`                                                                                                                               | 0    | PASS: **75 warnings, 0 errors** (my first version added 2; fixed)                                                                                                                                                                     |
| Architecture                         | `pnpm architecture:check --changed`                                                                                                       | 0    | PASS, 0 violations                                                                                                                                                                                                                    |
| Script tests                         | `node --test scripts/graph-engineering/{distribution,publish,publish-git,acceptance-paths,z2-provider-fixture,release-manifest}.test.mjs` | 0    | **57 pass**, 0 fail                                                                                                                                                                                                                   |
| Graph + agent-service tests          | `node --import tsx --test packages/services/src/graph-engineering/{app,adapters}/*.test.ts` + 2 agent tests                               | 0    | **372 pass**, 0 fail, 2 skipped (`PRE_Z8_TRX_FIXTURE_MANIFEST` unset)                                                                                                                                                                 |
| Services + registry tests            | `packages/services/test/*.test.ts` + `interaction-registry.test.ts`                                                                       | 0    | **17 pass**, 0 fail                                                                                                                                                                                                                   |
| UI tests                             | `packages/ui/test/*.test.ts` (`TSX_TSCONFIG_PATH=packages/ui/tsconfig.json`)                                                              | 0    | **227 pass**, 0 fail                                                                                                                                                                                                                  |
| Scoped format check                  | oxfmt on LF copies of the 48 files this milestone changed (audit record and generated evidence excluded)                                  | 0    | PASS, 0 nonconforming                                                                                                                                                                                                                 |
| Package inspection (b1)              | `finalize-release.mjs`                                                                                                                    | 0    | PASS, 21 checks (section 5)                                                                                                                                                                                                           |
| Two-build comparison                 | `compare-builds.mjs`                                                                                                                      | —    | section 6                                                                                                                                                                                                                             |
| Packaged smoke on b1                 | `packaged-smoke.mjs` (controlled loopback provider, disposable profiles)                                                                  | —    | **2 PASS, 10 FAIL** (section 7)                                                                                                                                                                                                       |
| Telemetry positive control           | `native-smoke.mjs --chat --telemetry-control`, ordinary-flavor dev build                                                                  | 0    | PASS, 13 canary hits                                                                                                                                                                                                                  |
| Baseline exception: CLI lint         | `pnpm --dir apps/zcode-cli lint`                                                                                                          | 1    | **FAIL (baseline)**: 42 warnings / 56 errors in the packages that completed this run; 4 packages failed and turbo aborted the rest, so the count varies per run (an earlier run in this session counted 53/78; earlier reports 53/85) |
| Baseline exception: `pnpm fmt:check` | `pnpm fmt:check`                                                                                                                          | 1    | **FAIL (baseline)**: 4,150 paths flagged. Unusable as a signal on Windows: oxfmt there prefers CRLF, so the same check flags even LF files at `51f6ed6` (4,148). The scoped content check above replaces it for this milestone.       |

Required focused cases:

- Accepted/rejected version labels — covered (`distribution.test.mjs`, `publish.test.mjs`).
- Correct Graph package identity — covered by tests and by the real package (section 5, and `packagedIdentity` `name: ZCode Graph`, `version: 3.14.3-z8.1`, `isPackaged: true` from the packaged ordinary-chat run).
- Parallel disabled at the Host boundary through direct calls; historical parallel data readable without dispatch; `control` (cancel) still works; restart reads Interrupted with zero sends; ordinary sessions and the sequential Graph not gated — `parallel-policy.test.ts` (6 tests) plus the 14 existing Z7 behavior tests still passing under the explicit experimental fixture.
- Ordinary Chat not disabled — the policy is only consulted inside `GraphParallelService`; ordinary Chat passed in the packaged build.
- Inherited telemetry settings cannot enable Graph telemetry — unit tests for the entry scrub, shared policy and agent spawn env, **and** a runtime canary in the packaged app (section 7).
- Manifest/artifact consistency — `finalizeRelease` refuses to write a manifest if `SHA256SUMS.txt`, the embedded identity hash/version/commit or the installer disagree; unit-tested.

**Not run (explicit):** installing the NSIS installer anywhere; upgrade, uninstall or rollback; production-environment network-egress measurement and the Feedback-uploader review (Z8.3); signing; packaged Z3–Z7 and UX-M1–M4 acceptance; the Z7 development smoke after the policy change; live-provider, company-project, mobile/remote/non-Windows runs.

## 5. Package inspection ([evidence/package-inspection.b1.json](evidence/package-inspection.b1.json))

Inspected the real `win-unpacked` tree and the real `app.asar` (27,573 members extracted; 27,659 files and 336.6 MB of text scanned, 559 binary files skipped by extension/NUL). **21 of 21 checks PASS**:

- `ZCode Graph.exe` present; ASAR `package.json`: `main` = `out/main/graph-entry.mjs`, `version` = `3.14.3-z8.1`, `zcodeProductFlavor` = `graph`; `graph-entry.mjs` and `graph-profile.mjs` present.
- Required resources present: embedded identity, `THIRD-PARTY-NOTICES.md`, default and built-in provider configs, icon, agent bundle `glm/zcode.cjs` (plus the 8-file search-tools tree hashed in the manifest).
- Embedded identity: product `ZCode Graph` / `dev.dumpfordummy.zcode.graph`, parallel policy `disabled`, automatic telemetry `false`.
- No source maps (0 beside the asar, 0 inside), no `.env` files.
- Content scan: 147 hits, **147 classified benign by exact exceptions, 0 unexplained, 0 unused exceptions.**

No hit for: the build checkout path, the build user's name, fixture identifiers (`z1-local-fixture`, `Z1_ALLOW_PROVIDER_NETWORK`, `scripts/graph-engineering`), API-key/JWT/token shapes. The 147 benign hits by rule:

| Rule                     | Hits | Context (each reviewed; reasons are in `scripts/graph-engineering/package-scan-exceptions.json`, 35 entries, one per rule+exact file)                                                                                                                                                                                                                                      |
| ------------------------ | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `private-address`        | 127  | RFC 1918/loopback CIDR base constants in first-party tables (`out/main/index.js`, the agent bundle `glm/zcode.cjs`) and third-party guards; documentation `@example` values (OpenTelemetry semantic conventions, ip-address, highlight.js RouterOS, linkify-it, ssh2); third-party test strings; a UI placeholder "e.g. 192.168.1.100" in the SSH host field's locale text |
| `windows-user-directory` | 13   | Mock paths in third-party unit tests shipped inside `msw` (`C:\Users\mock\…`) and `node-pty` (another person's example path). Not the build user.                                                                                                                                                                                                                          |
| `private-key-block`      | 5    | PEM header strings in third-party code (`jose`, `ssh2` generator/parser), a truncated placeholder in `dotenvx` help text, and one throwaway Ed25519 key literal hard-coded by `ssh2` for a crypto feature test (public npm content, belongs to no user or service)                                                                                                         |
| `profile-directory-name` | 2    | The intended `.zcode-graph-engineering` constant in `graph-profile.mjs`                                                                                                                                                                                                                                                                                                    |

Observations that are not defects of Z8.1: the existing packager ships third-party `node_modules` including test files, benchmarks and TypeScript sources inside `app.asar` (about 27.5 thousand members); one exception names a content-hashed first-party chunk (`IntlProvider-*.js`), so that entry must be re-reviewed whenever the chunk hash changes. The scan found a rule bug during development (an SVG path coordinate `10.142.22.65.442` matched as an address); the rule now ignores digits inside longer numbers (unit-tested). A content scan is not evidence of zero network egress or isolation.

## 6. Two-build comparison ([evidence/build-comparison.json](evidence/build-comparison.json))

Same source commit (clean), lockfiles, toolchain and build environment; built serially into separate directories. **Not byte-for-byte reproducible**; no reproducibility claim is made.

- Installer: different hashes and sizes (149,891,508 vs 149,890,252 bytes).
- Identical in both builds: the embedded identity, notices, default and provider configs, the `glm/` agent bundle tree (32 files) and the `tools/` tree (8 files), and 84 of 86 files in `win-unpacked`.
- Different: `ZCode Graph.exe` (same size; **62 bytes** differ, in one contiguous 64-byte region — consistent with the embedded ASAR integrity digest, since the asar differs; not further verified) and `resources/app.asar` (same size).
- Inside `app.asar` (27,573 members): 27,562 are byte-identical. **9 members differ**: _(Update: this line mis-stated the count — 27,562 is the number of paths present in both builds, which includes the 9 changed ones. The reconciled, disjoint accounts are 27,553 byte-identical + 9 changed same-path + 11 only in each build = 27,573; see follow-up section 6 and [build-comparison.accounting.json](evidence/packaged-followup/build-comparison.accounting.json).)_ four `out/.*-build-ready` marker files and `out/metadata/build-meta.json` (ISO timestamps), and `out/host/index.js`, `out/host/tasksStorageWorker.js`, `out/main/index.js`, `out/main/storageScanWorker.js`. In addition **11 chunk files exist under different content-hash names** in each build. After replacing `chunk-XXXXXXXX` name tokens and ISO timestamps with placeholders, all 9 differing members and all 11 renamed chunks become identical (11/11 paired). So every measured difference reduces to the bundler's chunk filename hashes plus embedded timestamps. Why the chunk hashes change between runs was not investigated.
- The first pair (`a1`, commit `da3a3a8`) shows the same pattern ([attempt 1](evidence/build-comparison.attempt1.json)).
- The packaging toolchain was not changed to remove these differences.

## 7. Packaged evidence on b1 versus development evidence (kept separate)

Existing detached packaged smoke: the whole `win-unpacked` tree copied to a temp directory, launched without the dev bootstrap, fresh synthetic homes and workspaces, controlled loopback provider, Chromium proxy to the fixture; no real credentials, no upstream service. Sanitized summary: [evidence/packaged-smoke-summary.b1.json](evidence/packaged-smoke-summary.b1.json).

| Case                                                          | Result                                                                                                                       |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `ordinary-chat`                                               | **PASS** (identity `ZCode Graph` `3.14.3-z8.1`, `isPackaged: true`)                                                          |
| `telemetry-canary` (new)                                      | **PASS**: ARMS, warehouse and OTLP variables pointed at loopback canary paths; **0 hits**, ARMS initialization not attempted |
| `no-provider`, `z1-literal-compatibility`, the 8 `z2-*` cases | **FAIL** — see below                                                                                                         |

_Update: the ten failures are described more accurately as "blocked at stale harness navigation; downstream behavior not exercised". After the drivers were repaired, all of them passed against this same binary — see [the follow-up](Z8_1_PACKAGED_FOLLOWUP.md). The paragraph below is the original text._

**The ten failures are a stale test harness, not a product failure, and they are a release blocker for the CI gate.** These drivers (`native-smoke.mjs` graph mode, `z2-z1-regression.mjs`, `z2-native-helpers.mjs`) reach the Graph editor with old test IDs (`graph-name`, `graph-upgrade`) that exist in the UI but sit behind the Design tab introduced by UX-M1–M4; the drivers never switch tabs, so they time out after 30 s. The elements exist (`GraphDesignPanel.tsx`, `GraphAddNodes.tsx`). The UX milestones restored other native drivers but not these. The release workflow runs this smoke and publishes only if it passes, so the current HEAD **cannot be published through that workflow** until these drivers are updated. This was not fixed in Z8.1 (it is Z8.4 harness work); the failures are retained as evidence.

Telemetry positive control (development build, ordinary non-Graph flavor, same method, ARMS endpoint omitted — with it set, the ARMS SDK throws "Failed to get 'userData' path" in this harness and startup stalls; that is upstream behavior, observed only in the dev harness): **13 hits** (this run: all to `/telemetry-canary/report`; an earlier control run also showed the OTLP metrics path). The canary method therefore can see telemetry, and the Graph package produced none for the same inherited settings. _(Update: that sentence over-generalized. Per path, the positive control ran successfully only for the warehouse/report path; the OTLP control was seen in two early runs and not reproduced in later ones, and no ARMS control produced traffic. See follow-up section 7 and [telemetry-positive-controls.json](evidence/packaged-followup/telemetry-positive-controls.json).)_ [Control summary](evidence/telemetry-control.dev.json). Scope: three inherited-setting paths only; not a claim of zero egress.

## 8. Enabled versus verified (from the manifest)

_Update: the `Packaged evidence` column below is the original manifest's record (two packaged cases). The current packaged record for b1 is the generated supplement and the derived [capability-coverage.json](evidence/packaged-followup/capability-coverage.json); both are summarized in follow-up section 8. The original manifest is unchanged._

`packageVerified` lists only packaged-run cases that passed; `devVerified` points to development documents, unchanged by Z8.1.

| Capability                                                  | Enabled in package          | Development evidence | Packaged evidence (this candidate)                |
| ----------------------------------------------------------- | --------------------------- | -------------------- | ------------------------------------------------- |
| Ordinary Chat                                               | yes                         | yes                  | **ordinary-chat PASS**                            |
| Startup with no provider, no model call                     | yes                         | yes                  | none (`no-provider` failed on the stale driver)   |
| Sequential Graph                                            | yes                         | yes                  | none                                              |
| Build/Test checks                                           | yes                         | yes                  | none                                              |
| Reviewer / bounded repair                                   | yes                         | yes                  | none                                              |
| Final approval                                              | yes                         | yes                  | none                                              |
| Workflow library, sequential import/export, historical pins | yes                         | yes                  | none                                              |
| Restart and conservative recovery                           | yes                         | yes                  | none                                              |
| Parallel Fork/Join                                          | **no (disabled by policy)** | yes (Z7; A12 FAIL)   | none                                              |
| Remote / mobile / scheduled / background Graph              | no                          | none                 | none                                              |
| Automatic telemetry                                         | **no (disabled by policy)** | none                 | **telemetry-canary PASS** (three inherited paths) |

## 9. Retained failed attempts and corrections

- A dirty-tree trial build used to learn the package layout; its first inspection had 152 unexplained hits, which produced the narrow exception file and the address-rule fix; the trial directory was deleted.
- First pair of candidate builds (`a1`, `da3a3a8`) had metadata defects found by reading the real manifest: the V4 wire version was `null` (wrong source file), Electron/electron-builder versions were blank (wrong resolution path) and the first dirty path was truncated (an over-eager `trim`). Fixed (with tests) and both builds redone; the pair is kept.
- The first packaged smoke run stopped at the first failing case, which hid the others; a keep-going option was added (default unchanged) and all 12 cases recorded.
- The first control run (all three endpoints set) never opened a window because of the ARMS SDK behavior above; the control now omits ARMS.
- The runner's first CLI-lint attempt could not find `turbo` (PATH); the first scoped-format runs found three files to format; the CLI-lint counter originally read only the first package. All corrected; the runner keeps every attempt.
- During development two new tests failed once each (an un-awaited `asar.createPackage`; a secret literal leaking into a neighbouring context snippet) and were fixed.

## 10. Blockers and remaining Z8 work

Blockers before any internal release (not new work for Z8.1, but now known):

1. ~~Packaged harness is stale against the UX-M1–M4 UI~~ _(Update: resolved by the follow-up — drivers repaired, 13/13 packaged cases pass on b1. Original text kept for the record: 10 of 12 packaged cases failed and the CI gate would have blocked publication.)_
2. The installer has never been run: install, upgrade, uninstall, rollback and OS side effects are all unverified.
3. Real-profile upgrade fixtures (z2.2/z7.5-produced data) do not exist; only Z1 has a real historical record (Z8.2).
4. Default credential-key derivation (`platform:homedir:username`, or `ZCODE_CREDENTIAL_SECRET`) is a named **Z8.3 security decision**; it is not OS-protected storage and no credential migration is authorized.
5. Production-environment egress with no provider, and the native Feedback uploader, remain unreviewed (Z8.3).
6. No Graph backup, retention/deletion, or support-bundle capability. A Graph-data backup is not a profile or native-session backup; retention/deletion UI stays deferred with its acceptance requirement open; support bundles are allowlisted metadata only (Z8.2/Z8.3 design).
7. Baseline exceptions remain visible: CLI lint and `fmt:check` (section 4); no migration framework is planned without a schema need.
8. The z7.6 notes commit is not merged; the candidate notes carry its relevant statements.
9. Signing, reputation and any publication remain separate operator decisions.

## 11. How to reproduce

From a clean checkout of the build-source SHA with the pinned toolchain: `node scripts/graph-engineering/run-validation.mjs <dir> emitting|tests|baseline`, then `… assemble`; `node scripts/graph-engineering/build-windows.mjs 3.14.3-z8.1 --dist-dir dist-graph-b1 --validation <dir>/manifest-validation.json` (and `-b2`, serially, never while typecheck runs); `ZCODE_GRAPH_DIST_DIR=dist-graph-b1 ZCODE_GRAPH_SMOKE_KEEP_GOING=1 node scripts/graph-engineering/packaged-smoke.mjs 3.14.3-z8.1`; `node scripts/graph-engineering/compare-builds.mjs dist-graph-b1 dist-graph-b2 <out>`.
