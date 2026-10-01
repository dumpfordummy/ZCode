# Z8.0 — release delta audit

Date: 2026-10-01. Baseline audited: `51f6ed67f63ff3500abca1bd86023f40bb29543d` (UX-M4 merge, branch `claude/zcde-graph-ux-audit-be80d8`), read in worktree `claude/z8-release-delta-audit-d7525f`.

**Status: AUDIT ONLY. No production source was changed.** Nothing was built, packaged, installed, signed, tagged, pushed, or merged. No credential, provider, or real application profile was read or contacted. The only network access was one read-only request for the public release list of `dumpfordummy/ZCode` (section A.5). No tests, typecheck or lint were run for this audit; every test/check count below is quoted from a named earlier report and labelled as such.

How to read evidence labels: **VERIFIED NOW** = I read the source/artifact in this checkout. **DOCUMENTED** = a repo report says so; not re-run. **INFERRED** = follows from code reading, no run. **NOT RUN / NOT VERIFIED** = no evidence exists.

---

## 0. Findings that change the Z8 plan

| # | Finding | Why it matters |
| --- | --- | --- |
| F1 | **The release identity is internally inconsistent.** Root `package.json` says `3.14.0`; the tree contains upstream `v3.14.3` content (HEAD is byte-identical to `upstream/main` for the upstream 3.14.3 delta, including `THIRD-PARTY-NOTICES.md` and `third-party/`); git ancestry only reaches upstream `872ad96` (3.14.0). Releases are labelled `3.14.0-zN.M`. | A manifest must state *which* upstream state the build is. Today a reader of `package.json` or a tag believes 3.14.0. How the 3.14.3 content entered without its commit is not recorded (INFERRED: a tree copy/checkout; the "pilot transfer" commit `558347d` is the likely carrier). |
| F2 | **The version resolver rejects any `z8` label.** `resolveGraphDistributionVersion` accepts only `-z[127].N`. | Z8.1 must change it deliberately (one small, tested edit), or choose a label scheme that is not a milestone name. |
| F3 | **The last published installer (`z7.5`, 2026-09-27) is 84 commits behind HEAD.** UX-M1…UX-M4 and the Windows native acceptance of M1–M4 were never packaged. `origin/main` carries one further commit (`bca9a73`, "prepare z7.6") that HEAD does not have, and no `z7.6` tag exists. | Packaged acceptance evidence (CI z2.2/z7.5) says nothing about the current UI. |
| F4 | **Packaged CI acceptance covers only Z1/Z2/ordinary Chat/no-provider (11 cases).** Z3–Z7, library, checks, reviewer, UX-M1–M4 are verified only in development-mode Electron. The release notes already say this. | Per the instruction, development Electron does not count as packaged acceptance. Most of A09 is therefore not proven in a package. |
| F5 | **Packaged-app network egress with no provider is unmeasured.** The packaged harness forces `ZCODE_ENV=test`, redirects `ZCODE_BASE_URL`/OAuth/BigModel origins to a loopback fixture, and sets `--proxy-server`. The shipped build is built with `ZCODE_ENV=production`, so its default endpoints are upstream `z.ai` hosts. The "no provider" check asserts zero *model* requests (`req.model` filter), not zero requests. | "Starts with no paid provider without executing a model call" is DOCUMENTED for model calls only. What else the production-env package contacts at startup is **NOT VERIFIED**. |
| F6 | **No backup, retention, deletion, support-bundle, or migration framework exists for Graph data.** Compatibility is by additive Zod unions with `.strict()` objects. | Z8.2/Z8.3 are real implementation, not testing of existing features. |
| F7 | **Parallel (Fork/Join) is visible in every build**, behind a footer disclosure titled "Advanced: experimental parallel workflows". It has no build or runtime flag. Z7-A12 (export/import) is recorded FAIL; no packaged parallel case exists. | It must stay experimental. The audit recommends hiding it from the supported package rather than relying on a label (section B). |
| F8 | **Build/Test recipes are stored in the project, not the profile** (`<workspace>/.zcode/config.json`, key `graphRecipes`). | They survive an app upgrade for free, but they are not part of any profile backup, and that file can hold unrelated project configuration. |
| F9 | **`credentials.json` lives in the same directory tree as Graph data** (`…/home/.zcode/v2/`), and its "encryption" key is derived from `platform:homedir:username` (or `ZCODE_CREDENTIAL_SECRET`). | A whole-folder copy is a credential copy. The cipher is obfuscation against a derivable key, not a protection. A restored profile at another path/user cannot decrypt it (re-entry is required), which is the correct restore story. |
| F10 | **Telemetry and the Feedback uploader are inert only because of configuration, not because the Graph flavor removes them.** Telemetry endpoints come from runtime environment variables that are unset by default; the Graph entry does not clear them. The native Feedback service still contains an upload client. | Cheap hardening available (Z8.3). Not a currently confirmed leak. |

---

## A. Current release identity

### A.1 Table

| Item | Value | Evidence |
| --- | --- | --- |
| Integration commit | `51f6ed67f63ff3500abca1bd86023f40bb29543d` | VERIFIED NOW (`git rev-parse HEAD`) |
| Fork | `https://github.com/dumpfordummy/ZCode` (`origin`) | VERIFIED NOW |
| Upstream | `https://github.com/zai-org/ZCode` (`upstream` remote); local ref `upstream/main` = `29628c9` "feat: update v3.14.3" (2026-09-23), tag `v3.14.3`. Not fetched during this audit, so it is only as new as the last fetch. | VERIFIED NOW |
| Git merge-base with upstream | `872ad96` ("feat: open source", 3.14.0). HEAD does not contain `29628c9` in its history. | VERIFIED NOW |
| Source content vs upstream | 57 upstream-existing files modified, 472 files added (excluding `docs/` and `scripts/graph-engineering/`). | VERIFIED NOW (`git diff --name-status upstream/main HEAD`) |
| Root `package.json` version | `3.14.0` (upstream main: `3.14.3`) | VERIFIED NOW |
| Installer/app version (Graph) | `ZCODE_GRAPH_VERSION`, e.g. `3.14.0-z7.5`, validated `^\d+\.\d+\.\d+-z[127]\.\d+$`; written to `extraMetadata.version` and used as `appVersion` | VERIFIED NOW (`desktop-product-identity.mjs`, `build-metadata.mjs`, `electron-builder.config.js`) |
| Electron | `41.0.3` (pinned exact) | VERIFIED NOW |
| electron-builder | `^26.8.1` (range) | VERIFIED NOW |
| Node / pnpm | `24.14.0` / `10.33.2` (`mise.toml`). This machine's global Node is 24.11.1 and pnpm is not on PATH; the repo-local toolchain in the main checkout `.tmp\z1-toolchain` is used for real work (see the toolchain memory note). | VERIFIED NOW |
| Native agent CLI | `apps/zcode-cli` package version `0.16.9`; bundled via `scripts/build-desktop-agent-cli.mjs` and `prepare:runtime-assets`; protocol constants `ZCODE_PROTOCOL_VERSION = 1`, `V4_WIRE_PROTOCOL_VERSION` | VERIFIED NOW |
| Graph record schema | `recordSchema.version` ∈ {1,2,3,4,5}; Z1 definitions/runs are *unversioned* (record version 1); definitions/runs 2–5 are explicit unions; `.strict()` | VERIFIED NOW (`domain/record.ts`) |
| Workflow library store | `workflow-library.json`, `version: 1`, integer `revision`, ≤ 16,000,000 chars | VERIFIED NOW (`adapters/workflow-store.ts`) |
| Portable workflow file | `format: "zcode-workflow"`, `version: 1`, ≤ 256,000 bytes | VERIFIED NOW |
| Parallel plan / record | plan `version: 1`; parent/child links optional on the same record | VERIFIED NOW |
| Windows builder | `node scripts/graph-engineering/build-windows.mjs <version>` (Windows x64 only; NSIS) → `packages/desktop/dist-graph/`. This is the Graph-specific builder and is still the supported path. | VERIFIED NOW |
| Publish path | `pnpm graph:release --version …` → pushes one annotated `graph-v<version>` tag; `.github/workflows/graph-windows-release.yml` builds, tests, publishes an unsigned prerelease. `gh` is not on this machine's PATH. | VERIFIED NOW |
| Package identity | `appId` `dev.dumpfordummy.zcode.graph`; `productName` `ZCode Graph`; main `out/main/graph-entry.mjs`; no `zcode:` protocol; no Explorer menu; recent-docs untouched | VERIFIED NOW |
| Profile | `%USERPROFILE%\.zcode-graph-engineering` (`home`, `appdata`, `localappdata`, `electron`); HOME/USERPROFILE/APPDATA/LOCALAPPDATA and the ZCode data env vars are overridden *before* Main loads | VERIFIED NOW (`graph-entry.mjs`, `graph-profile.mjs`) |
| Update behavior | `initAutoUpdater({ enabled: ZCODE_PRODUCT_FLAVOR === "production" })` → disabled for Graph; force-update gate production-only; `publish.url` is a placeholder `http://localhost:8081`. Updates are manual installer downloads. | VERIFIED NOW (`desktop/src/main/index.ts`, `electron-builder.config.js`) |
| Signing | none; `CSC_IDENTITY_AUTO_DISCOVERY=false` | VERIFIED NOW |

### A.2 Installer builds that exist

Public prereleases (GitHub API list, read-only, 2026-10-01): **z1.2** (2026-09-24), **z2.2** (2026-09-24), **z7.2** (2026-09-24), **z7.5** (2026-09-27). Each has one `.exe` (~149.6–149.8 MB) and `SHA256SUMS.txt`. Tags `z1.1`, `z2.1`, `z7.1`, `z7.3`, `z7.4` exist without a release (failed/skipped builds, retained deliberately). No `z7.6` tag. Local builds on this machine's main checkout: z1.1 and z1.2 only (not inspected beyond filenames).

### A.3 Document accuracy

| Document | Verdict | Detail |
| --- | --- | --- |
| `PRODUCT.md`, `DESIGN.md`, `PRODUCT_DIRECTION.md` | Principles accurate; status stale | `PRODUCT_DIRECTION` still says "Only Z1 is authorized". Ownership/session rules remain correct. |
| `future/ROADMAP.md` | Mostly accurate; baseline section stale | Z2 shown as "assigned"; Z8 can precede Z7 — still true. |
| `future/Z8_TASK.md` | **Partly stale** | Assumes startup native capability checks, a support-bundle generator, retention controls, migration tests — none exist. Dependency text ("Z6 minimum; Z7 only if shipped") now needs the experimental-parallel decision. Assumes the Z2-era build; ignores UX-M1–M4, the library UI, and F1–F10. Its A01–A12 table is usable as a skeleton. |
| `PUBLISH.md`, `PUBLISH_SPEC.md` | **Accurate for mechanism** | Z7 follow-up, `z[127]` allowlist, failed-tag policy and canonical-TEMP rule match the code and workflow. Examples use `z7.2`. |
| `PUBLISH_REPORT.md` | Accurate history for z2.2; **silent on z7.x** | z7.1–z7.5 outcomes are only in `WINDOWS_RELEASE_NOTES.md` and tags. |
| `WINDOWS_DISTRIBUTION_SPEC.md`, `…_REPORT.md` | Accurate as z1.2 history | Profile/identity/update contract still holds. Version policy superseded by `PUBLISH_SPEC`. |
| `WINDOWS_SETUP.md` | **Stale** | Install steps and build commands name `z2.2` and describe Z1/Z2 scope. Profile, identity and update sections are still accurate. |
| `WINDOWS_RELEASE_NOTES.md` | Accurate for z7.5 as written; **one file serves every release** | The workflow publishes this file verbatim. `origin/main` already holds a different "z7.6" version of it; HEAD has the z7.5 text. Notes claim CI covers Z1/Z2/Chat only — correct. |
| `PROGRESS.md` | **Stale** | Ends at Z7/A12 (2026-09-24 text); does not mention pre-Z8, UX-M1–M4, z7.x releases, or the Windows acceptance. |
| `ux-audit/UX_M1…M4_*`, `*_WINDOWS_REPORT.md` | Accurate, scoped | Establish supported UI behavior; explicitly NOT RUN: real DPI scaling, packaged installer, live model. |

Z8 should supersede `Z8_TASK.md` with a short `Z8_PLAN.md`-style update rather than editing history, and update `PROGRESS.md`/`WINDOWS_SETUP.md` narrowly.

### A.4 Baseline results quoted from earlier reports (not re-run)

| Check | Last recorded result | Source |
| --- | --- | --- |
| `pnpm lint` | 0 errors, 75 warnings | UX-M3 Windows report (2026-10-01) |
| UI tests | 223 pass | same |
| Graph service tests (60 files) | 363 tests: 361 pass, 2 skipped (`PRE_Z8_TRX_FIXTURE_MANIFEST` unset) | same |
| CLI lint | 85 errors / 53 warnings (baseline exception) | Z5/Z6 reports |
| `pnpm fmt:check` | fails on ~2,870 pre-existing paths (baseline exception) | Z5/Z6, PUBLISH_REPORT |
| Typecheck, architecture | pass | UX-M3 report |

CI treats CLI lint and full formatting as visible non-blocking exceptions; typecheck, root lint, architecture, and the listed tests block.

### A.5 Method note

The release list came from `api.github.com` via a read-only fetch. I did not authenticate and did not download or hash any installer.

---

## B. Supported capability boundary (proposed for a sequential-only internal release)

"Packaged-verified" means exercised in the packaged exe by the existing detached harness. Development-mode Electron evidence is listed separately and does **not** upgrade a row.

| Capability | Proposed class | What backs it | Gap |
| --- | --- | --- | --- |
| Ordinary native Chat (send, permissions, questions, history) | **SUPPORTED** | Packaged: `ordinary-chat` case (z2.2 and z7.5 CI, DOCUMENTED). Dev native Chat regressions through Z6 and UX-M1–M4. | Not re-run on HEAD in a package. |
| Sequential Graph run (Start → Agent Tasks → End), fresh session per task, explicit handoffs | **SUPPORTED** | Packaged: z2 cases (complete, question, cancel×3, restart×2, persistence-recovery), z2.2/z7.5 CI. Dev native Z2/Z6. | HEAD never packaged. |
| Build/Test deterministic checks (native Tool nodes, recipes, TRX capture, "failure stays failure") | **SUPPORTED (dev-verified)** | Dev native Z4/Z5/U2: real .NET fixture 8/8; z4 failures despite model PASS. | **No packaged case.** Needs a .NET SDK on the host; the installer does not ship one. State this boundary. |
| Reviewer / bounded repair routes | **SUPPORTED (dev-verified)** | Dev native Z5 (20 scenarios) and the six reviewer scenarios on Windows. | No packaged case. |
| Final human approval | **SUPPORTED (dev-verified)** | Dev native Z3 (12 scenarios), UX-M3/M4 Windows. | No packaged case; "restart with pending gate" never run against an upgraded binary. |
| Workflow library, immutable versions, instantiate | **SUPPORTED (dev-verified)** | Z6, UX-M3 Windows (real Save/Open dialogs, library conflict). | No packaged case. |
| Import/export of sequential workflows (`.zcode-workflow.json`) | **SUPPORTED, sequential only** | Z6 dry transfer, U5 6/6, UX-M3 Windows; secret/absolute-path regex on import. | Fork/Join not transferable (Z7-A12 FAIL). Regex check is a heuristic, not a secret scanner. |
| Historical run pins / "Open in Runs" | **SUPPORTED (dev-verified)** | UX-M3.3 Windows. | One shipped cloud fixture was rejected by product validation (UX-M3 §4.3, fixed in harness). |
| Recovery / restart (Interrupted, explicit audited inactive release, gate AwaitingContinuation) | **SUPPORTED with conservative semantics** | Packaged: `restart-interrupted`, `restart-permission`, `persistence-recovery` (Z2). Dev: Z3–Z6 restart/crash-boundary cases. | **Never run across an application upgrade.** See D. |
| Parallel Fork/Join (two workers, owned clones, reviewed integration) | **EXPERIMENTAL — keep out of the supported set** | Z7-A01–A11 dev evidence; U-series notes. | Z7-A12 FAIL (no export/import), no packaged case, expanded Z7 acceptance incomplete. It is reachable from the UI footer in every build today. **Do not promote; recommend a build-time default-off.** |
| Remote / SSH workspaces | **NOT SUPPORTED** | `useGraphEngineering` gates on `graph.local`; non-local shows "local only". | — |
| Mobile / web remote Graph | **NOT SUPPORTED** | Same gate; Desktop-only service registration. Roadmap defers it. UX-M reports mark mobile NOT RUN. | — |
| Scheduled / background / always-on execution | **NOT SUPPORTED** | No Graph code uses the native automation/cron services. Closing the owning window/Host stops work. | Native Chat automation exists separately; Graph does not use it. |
| MCP / plugins / hooks / skills **inside** Graph | **NOT VERIFIED (inherited)** | Graph sessions are ordinary native sessions, so workspace/user MCP, plugins, hooks and skills load as in Chat. Z6 records native configuration provenance and requires acknowledging "Unknown destinations". | Release notes already state zero Worker/Plugin/MCP activity is *inferred* from absence of unexpected inputs, not measured. Treat as "inherits native behavior; Graph neither adds nor blocks it". |
| Arbitrary workflow code / marketplace / auto-PR / push / merge | **NOT SUPPORTED** | Roadmap-deferred. | — |
| Live paid-provider run, company-project use | **NOT VERIFIED** | Every automated run uses controlled loopback providers. | Pilot (Z8.5) is the first place this can be evidenced. |
| Non-Windows, non-x64, signed/SmartScreen-reputable install | **NOT SUPPORTED / NOT VERIFIED** | Unsigned Windows x64 NSIS only. | — |

Recommended statement for the manifest: **supported set = Windows x64, local workspaces, sequential Graph with Build/Test checks, reviewer, final approval, library, sequential import/export, conservative restart.** Everything else is listed as excluded or experimental with the reason above.

---

## C. Data and upgrade model

### C.1 Storage map

Base `B = <profile>\home\.zcode\v2` where `<profile>` = `%USERPROFILE%\.zcode-graph-engineering` (`getAppConfigDir()` with `ZCODE_DATA_BASE_DIR` = private home). All paths VERIFIED NOW from source.

| Data | Location | Format / version | Scope | Notes |
| --- | --- | --- | --- | --- |
| Graph workspace record: definition (draft design), all runs, parallel plan/runs | `B\graph-engineering\<sha256(workspaceKey)>.json` | JSON, `version` 1–5, `.strict()`, integrity-checked on read; written with atomic private write; PID/token file lock held for the Host lifetime | **Profile-scoped, keyed by workspace identity** (one file per workspace) | Filename is a hash; the plain-text workspace path is inside the file. |
| Run artifacts and evidence (Build/Test output, structured outputs, TRX receipts, approval evidence) | `B\graph-engineering\artifacts\<sha256 ws>\<sha256 run>\<sha256 artifact>.json` | JSON `{artifact, content}`; content passed through `redactFeedbackText` when it changes nothing structural | Profile, per run | Bounded (256 KiB class limits). Can contain project source excerpts and command output. |
| Workflow library (templates + immutable versions) | `B\graph-engineering\workflow-library.json` | `version:1`, `revision`, ≤ 16 MB, revision-checked atomic writes | **Profile-wide** (all workspaces) | Built-in versions are code, not file. |
| Parallel owned clones | `B\graph-engineering\workspaces\…` | Git clones + external ownership marker | Profile | Retained until explicit cleanup. Contains project source. |
| Build/Test recipes ("checks") | `<workspace>\.zcode\config.json` key `graphRecipes` | JSON object, ≤ 256 KiB | **Workspace (project) scoped** | In the user's repo. Survives upgrade and uninstall; not in profile backup; the file may hold unrelated project config. |
| Drafts (New run form, unsaved editor buffers, library form drafts) | Renderer memory only (Zustand `graphDraftStore`, `graphEngineeringViewStore`); no `localStorage` use found | — | Window | **Lost on restart/upgrade by design.** Saved definition is the only persisted design. |
| Native conversation/session state referenced by runs | Native session store under the profile (`B\…` SQLite and logs), owned by the CLI/runtime | Native, not Graph | Profile | Graph stores `sessionId`, `inputId`, `commandId`, `runtimeIdentity` as references only. Deleting a Graph record does not delete the session. |
| Provider / model configuration | `B\credentials.json` (values `enc:v1:` AES-256-GCM, key derived from `platform:homedir:username` or `ZCODE_CREDENTIAL_SECRET`), personal provider config file in `B`, settings | Native | Profile | **Never copy as a credential backup.** Graph runs freeze the *provider/model identifiers and destination labels* in the run, not keys. |
| Electron state (window, caches, session storage) | `<profile>\electron` | Chromium | Profile | Not business data. |
| Main-process logs | `B\logs\YYYY-MM-DD.log`, 14-day retention (`LOG_RETENTION_DAYS`) | text | Profile | See F. |

### C.2 What survives what

| Event | Graph record / artifacts / library | Drafts | Recipes | Credentials | Sessions |
| --- | --- | --- | --- | --- | --- |
| App close and reopen | Yes (cold-load reconciles, see D) | **No** | Yes | Yes | Yes (native) |
| Installer upgrade (same Windows user) | **INFERRED yes**: profile path is independent of the install directory and derived from the original home; NSIS `oneClick:false`, default does not delete app data | No | Yes | Yes (same home path, same username → same derived key) | Yes |
| Uninstall | **NOT VERIFIED** (NSIS default keeps data; never run) | n/a | Yes | not verified | not verified |
| Profile copied to another user/path/PC | Graph JSON is portable (workspace keys are paths, so runs would point at paths that may not exist) | No | Per project | **Undecryptable → re-enter** | Native decides |
| Downgrade (newer data, older app) | Fails closed: `.strict()` + version literal union rejects it; the Graph surface reports an error and the file is untouched (INFERRED from `repository.read` throwing before any write; a "malformed metadata fails closed" test exists) | — | — | — | — |

### C.3 Existing migration/version mechanisms

- **No migration framework and no schema-upgrade step.** Compatibility is "old shapes remain valid members of unions"; new fields are optional (`CONTRACT.md` repeatedly: "optional fields preserve older data").
- On `write`, the record version is the **maximum** of the definition/run versions present — a record is never rewritten to a lower version, and an old run is never reinterpreted.
- `GraphState.load` is the only place old data is touched on startup (D). It **writes** (commit) when it converts live runs to Interrupted/AwaitingContinuation. No copy of the previous file is made first.
- Corrupt/malformed Graph JSON: read throws, nothing is overwritten, no quarantine copy (the shared `backupCorruptFile` helper is used by credentials, not by Graph).
- Library store, portable file and parallel plan each carry their own `version: 1`; there is no tested path for a version 2 of any of them.

### C.4 Historical format coverage in the repo

| Format | Real captured fixture | Synthetic fixtures built by current code |
| --- | --- | --- |
| Record v1 / unversioned Z1 completed and pending | **Yes**: `packages/services/src/graph-engineering/app/fixtures/z1-completed.json`, `z1-pending.json` (real isolated native runs at `cbb91b0`), with `legacy-persistence.test.ts` proving no dispatch | — |
| v2 sequential, v3 approval, v4 tools/artifacts, v5 routing, library, parallel | **No committed real record from a published installer** | `sequential.fixture`, `approval.fixture`, `routing.fixture`, tool and parallel fixtures (written by current code, so they cannot detect a field that current code writes differently from how a shipped build wrote it) |
| Native run evidence JSON (summaries) | Many under `docs/graph-engineering/evidence/**` (summaries and `retained-artifacts`), not whole-record files | — |
| Templates | `docs/graph-engineering/templates/*.v1.json` (4) | — |

Conclusion: **only Z1 has a real historical upgrade fixture.** For z2.2/z7.x the honest upgrade test needs profiles *produced by those published installers* in a throwaway home (Z8.2), not fixtures regenerated from HEAD.

### C.5 Backup guidance (what is safe)

Safe, after the app is closed: `graph-engineering\*.json`, `graph-engineering\artifacts\`, `workflow-library.json`, and exported `.zcode-workflow.json` files. Treat them as **confidential project content** (source excerpts, command output, prompts), not as secrets-free.
Never in a backup or bundle: `credentials.json`, the personal provider config, settings that may embed endpoints/keys, `electron\` session data, the whole `home` folder, `<workspace>\.zcode\config.json` without review.
Copying files while a Host owns the lock is unsafe; Graph's own lock is a PID/token file next to each record.

---

## D. Restart / recovery safety

Mechanics (VERIFIED NOW, `app/state.ts`, `app/recovery.ts`, `adapters/native.ts`, `expectedRuntimeClient.ts`): on first `load`, for every run that is not a *confirmed terminal*:
1. a persisted route checkpoint ⇒ `AwaitingContinuation`, `resumeRequired`;
2. else a resumable approval gate ⇒ `AwaitingContinuation`, `resumeRequired`;
3. else `Interrupted` with the message "pending tasks will not be submitted automatically".
A terminal status (Completed, Failed, Rejected, Cancelled, NeedsHuman, BudgetExhausted, NoProgress) counts as confirmed only if every attempt has inactivity proof (`routingInactive`); otherwise it is treated like step 3. Parallel runs not in Completed/Stopped/Interrupted/released become Interrupted. Nothing dispatches during load or view. Continuation, inspection and release are explicit commands; release requires matching terminal proof or a native "inactive" fact for the *original* runtime identity and never resumes unknown work. Native dispatch is bound to the expected runtime identity and never spawns a replacement (`expectedRuntimeClient`); a runtime change fails closed ("not resubmitted"). Graph sessions are excluded from automatic question resolution via `protectedSessionIds`.

| State at close/upgrade | Expected behavior after reopen | Already proven | Still needs Z8 testing |
| --- | --- | --- | --- |
| Idle (no runs / only completed) | No change, no write. Completed history opens unchanged. | Packaged z2 `complete` + completed restart; dev Z3–Z6 completed-history restart; real Z1 completed JSON test (zero creates/sends). | Same data opened by a **newer binary**. |
| Executing (native input active) | `Interrupted`; guard stays; session link still opens the same conversation; no resend. | Packaged `restart-interrupted`, `cancel-progress`; dev Z2–Z6 boundary cases (fault-injected "decision/dispatch crash boundaries" are labelled injection). | Upgrade-replacement of the running exe (Windows locks files; NSIS closes the app) — **never run**. |
| Waiting for native permission | `Interrupted`; the pending permission is gone with the runtime; nothing is answered. | Packaged `restart-permission`, `cancel-permission`. | After upgrade. Behavior of the *new* runtime if a stale runtime identity is presented. |
| Waiting for a question | `Interrupted`; question not auto-answered (protected IDs recomputed from `graph.protectedSessionIds` on load; `CONTRACT.md` requires restored questions not to auto-answer and `interaction-registry.test.ts` is the covering test file — not re-run here). | Packaged `question`, `cancel-question`; registry unit tests. | Restart-while-question as a *packaged* case; upgrade variant. |
| Waiting for final human approval | `AwaitingContinuation`; approval is **not** granted; explicit Continue re-verifies evidence freshness; stale/changed evidence → `StaleEvidence`. | Dev native Z3 (entry/intermediate pending restart, both decision/dispatch crash boundaries). UI mapped in UX-M3/M4. | **No packaged case; no upgrade case.** |
| `NeedsHuman` (and other non-completed terminals) | Stays terminal if inactivity proven; otherwise Interrupted. No automatic retry or repair. | Dev Z5 (no-progress, exhausted budgets, unknown accepted repair). | Packaged; upgrade. |
| Failed (run or Tool) | Same rule; failed Build/Test remains failed; never rerun automatically. | Dev Z4 (real failure despite model PASS; zero/missing/stale reports). | Packaged; upgrade. |
| Completed | Immutable. | As idle. | Upgrade. |
| Parallel run | Cold parent → Interrupted; no worker replay, integration or cleanup. | Dev Z7-A06/A07. Experimental. | Out of Z8 scope if parallel stays unsupported. |

Invariant "unknown or interrupted execution is never automatically replayed", and the specific bans (no model request repeat, no tool-call repeat, no Build/Test rerun, no permission answer, no gate approval, no guard release): **PROVEN by design review and dev-native evidence; PROVEN in packaged form only for Z1/Z2 interrupted/permission/question/persistence cases; NOT PROVEN across an upgrade.** The upgrade case adds three genuinely new risks to test: (i) a new binary meeting a **runtime identity string** produced by the old binary (`runtimeIdentity` format drift); (ii) first-load write on records whose shape the new code normalizes; (iii) the old CLI process still running when the installer replaces files.

One more observation (INFERRED, to test): because cold `load` writes the Interrupted state without a prior copy, a bug in a newer reconciler would be unrecoverable from the profile alone; Z8.2's "snapshot before first write after a version change" addresses it.

---

## E. Packaging

| Question | Finding | Evidence |
| --- | --- | --- |
| Supported build command | `node scripts/graph-engineering/build-windows.mjs <version>` (env: `ZCODE_GRAPH_DISTRIBUTION=1`, `ZCODE_ENV=production`, `ZCODE_SKIP_REMOTE_ASSETS=1`, `ZCODE_DESKTOP_DIST_DIR=dist-graph`, `CSC_IDENTITY_AUTO_DISCOVERY=false`). Steps: `prepare:runtime-assets` → `build:no-runtime-assets` → `bundle:desktop --os win --arch x64 --skip-prepare --skip-build`; expects exactly one `ZCode Graph-<v>-win-x64.exe`; writes `SHA256SUMS.txt` (installer only). | VERIFIED NOW |
| Entry point | `out/main/graph-entry.mjs` copied in `beforePack`; sets the private profile, `mkdir`s it, then `import("./index.js")`. | VERIFIED NOW |
| Private profile separation | Yes (A.1). Cross-profile import is deliberately absent. | VERIFIED NOW; DOCUMENTED packaged check "default profile isolation" |
| Runtime assets | agent bundle `resources/glm/…`, native search tools (`prepare-native-search-tools`), `config/default.json` (feedback form URL, community links — upstream Feishu/Discord links), `config/provider/zcode-builtin.json`, notices file, icons. Native search tools and the agent CLI are built from archives/sources on the build machine; the Windows CI downloads public mirrors at build time. | VERIFIED NOW (config), DOCUMENTED (z1.2 report: runtime closure/size gates) |
| Installer architecture | NSIS, `oneClick:false`, user-selectable directory, x64 only, unsigned. No ARP/registry/uninstall behavior tested. | VERIFIED NOW (config), NOT RUN (install) |
| Checksums | Only the installer is hashed. No manifest of commit, versions, toolchain, lockfile hash, or component hashes; build-meta (`out/metadata/build-meta.json`: appVersion, short commit, time, electron-builder version) exists but is not shipped as a release asset. Reproducibility is **not** claimed or tested (timestamps differ between builds; z1.2 local vs CI hashes differ). | VERIFIED NOW |
| Test-only resources | Fixtures live in `scripts/graph-engineering` and the harness injects env at runtime; the z1 reports state the ASAR was inspected for test/profile exclusion. For current HEAD this is **NOT RE-VERIFIED**: no ASAR/`win-unpacked` inspection has been done since z7.5. | DOCUMENTED / NOT RUN |
| Developer paths / fixture provider config | The harness sets `ZCODE_ENV=test`, loopback origins and proxy **outside** the package. A package-content scan for developer absolute paths, `127.0.0.1` fixture origins, `.env`, sourcemaps, keys was done at z1 time only. | DOCUMENTED (z1) / NOT RUN (HEAD) |
| Starts with no configured provider, no model call? | **DOCUMENTED yes for model calls**: packaged `no-provider` case asserts Run unavailable and zero fixture requests with a `model` field (z1.2, z2.2, and CI z7.5). Not shown: total outbound requests with the production environment (F5). Code reading: Graph Run is disabled without a model; the title-generation request is the known auxiliary model call, and native-recipe (Tool-only) sessions explicitly disable it. | DOCUMENTED / INFERRED |
| Version policy | `z[127]` only (F2). Manual `workflow_dispatch` builds artifacts without a release; tag builds publish only after all gates. | VERIFIED NOW |

Build ordering hazard recorded in memory and docs: root `pnpm typecheck` and the Desktop build share `packages/desktop/out/host`; they must be serialized.

---

## F. Security, privacy, diagnostics

### F.1 What exists

| Surface | Finding | Evidence |
| --- | --- | --- |
| Graph's own logging | None. `graph-engineering` has no logger calls. Diagnostics are the persisted record plus native logs. | VERIFIED NOW (grep) |
| Main-process log | `B\logs\<date>.log`, 14-day cleanup. Content is whatever main/host code logs; the project rule says `info`/`warn`/`error` only for lifecycle, `debug` not persisted in production. Whether native CLI logs contain prompts/tool I/O was **not** audited. | VERIFIED NOW (retention), NOT VERIFIED (content) |
| Evidence/artifacts | Contain command output and source excerpts; content is passed through `redactFeedbackText` only for obvious key/value secrets. They are not secret-free. | VERIFIED NOW |
| Run records | Contain full prompts/instructions (up to 100,000 chars per task), Start request, workspace paths, provider/model ids, destination labels. | VERIFIED NOW |
| Export | Portable file excludes run history and bindings, requires empty Start request and symbolic recipe slots; import is dry (no native/Tool/workspace calls), ≤ 256,000 bytes, fatal UTF-8, stat-unchanged check, secret/absolute-path regex warning. | VERIFIED NOW; DOCUMENTED (audit: zero native calls) |
| Existing feedback redaction | `redactFeedbackText` has a "diagnostic" mode that drops body-like keys (`prompt`, `messages`, `content`, `stdout`, `env`, `headers`, …). Reusable as the basis of a bundle redactor. | VERIFIED NOW |
| Native Feedback upload | `feedbackService`/`feedbackHttpClient` upload logs/attachments to a configured base URL on user action. Not Graph-related, but present in the Graph flavor. | VERIFIED NOW |
| Telemetry | ARMS RUM and warehouse reporting require `ZCODE_ARMS_RUM_ENDPOINT` / `ZCODE_TELEMETRY_REPORT_ENDPOINT` env values; unset ⇒ no init. The Graph entry does not clear them. The packaged harness also sets `ZCODE_MODEL_TELEMETRY_ENABLED=0`. | VERIFIED NOW |
| Auto-update | Disabled for the Graph flavor (initialisation with `enabled:false`; update-feed env override ignored). Manual check path also gated. | VERIFIED NOW / DOCUMENTED (log line in packaged run) |
| Account-based syncs (skills, MCP, plugins, settings), official MCP, catalog fetch, bots, CUA | Present in the shared service graph. Whether any fires without an account in the production-env Graph package is **NOT VERIFIED**. Upstream default hosts present in source: `api.z.ai`, `zcode.z.ai`, `cdn-zcode.z.ai`, `chat.z.ai`, `bigmodel.cn`/`open.bigmodel.cn`, plus bot-provider hosts. | VERIFIED NOW (hosts), NOT VERIFIED (behavior) |
| Hooks / MCP / plugin startup | Inherited from native workspace config; Z6 preview reads existing instruction/skill/plugin/hook/MCP resolution without installing/connecting. Native permission prompts remain the control for tool use. | DOCUMENTED |

### F.2 Boundaries to state, not to claim around

- A Graph worktree or clone, a permission prompt, and a prompt instruction are **not** an OS sandbox. Native tools can read any path the user account can; "selected workspace" is the working directory and Graph-side path validation for *its own* files (`assertWorkspaceFilePath`, link-safe reads), not a confinement of the agent.
- Permission ownership: Graph never answers permissions or changes permission mode; native interaction registry owns responses. Graph requires the native auto-answer-questions preference to be disabled and additionally protects its sessions.
- Same-user malware, administrators, and third-party model-provider retention are out of scope.
- Imported workflow content is untrusted data: it is schema-validated, size-bounded and previewed; it carries symbolic references only and cannot execute anything at import. A hostile *recipe* (a command in `.zcode/config.json`) is a project file the user must trust — recipe execution goes through native Tool admission and permission, not through import.

### F.3 Proposed default support bundle

**Include (default, previewed before save, written to a local file, never uploaded):** app/product identity, version, commit, build time; Electron/Node/CLI/protocol versions; OS and arch; manifest of enabled capability flags (including "parallel: off"); profile *shape* (which stores exist, byte sizes, record `version`s, counts of runs by status); per-run IDs, status, node ids/kinds, timestamps, error class and **sanitized** short messages; native runtime identity strings and session/input/command IDs (opaque); last N log lines passed through diagnostic-mode redaction; update/telemetry flags actually in effect; the provider *id/model id* only.
**Exclude by default:** prompts and instructions, Start request, assistant text, handoff text, tool input/output, Build/Test stdout/stderr, artifact `content`, source snippets, attachments, workspace absolute paths (replace with a stable hash or `<workspace-1>`), user name, `credentials.json`, provider config files, base URLs and endpoints, environment variables, headers, cookies, proxy settings, anything under `electron\`.
**Opt-in per section with a visible byte count:** raw run record, selected artifacts, raw log tail.
**Test with synthetic canaries** planted in each exclusion class and asserted absent from the bundle bytes (A06/A07).

---

## G. Upstream compatibility

### G.1 Fork delta (VERIFIED NOW, `git diff upstream/main HEAD`, excluding docs and harness scripts)

57 modified upstream files (≈2,350 added / 92 removed lines across services, CLI, desktop, UI) plus 472 added files, of which 214 are `packages/services/src` (almost entirely `graph-engineering/` plus `git/graphWorkspace*`, `git/sourceSnapshot*`, `zcode-agent/*Client.ts`), 190 `packages/ui/src`, 46 `packages/ui/test`. The files that actually touch native behavior:

| Integration point | Changed upstream files (size) | Nature |
| --- | --- | --- |
| Session/agent ownership guard | `services/src/zcode-agent/zcodeAgentService.ts` (+173/−12), `zcodeAgent.ts` (+35), `zcodeAgentProcessManager.ts` (+19/−5), `zcode-session/zcodeSession(.Service).ts` | `assertInputAllowed` on sendText/compact/goal/model switch; `startRecipe/inspectRecipe/cancelRecipe`; `getWorkspaceRuntimeRetirement`; `previewExecutionEnvironment`; `purpose:"native-recipe"` no-model creation; expected-runtime binding. **Highest rebase risk**: same hot file upstream edited in 3.14.3 (`zcodeAgent.ts`, `zcodeAgentService.ts` are in the upstream-touched set). |
| Service composition / registration | `services/src/node.ts` (+47/−5), `accessor.ts`, `index.ts` (+67), `shared/src/index.ts`, `channels.ts` | Registers `IGraphEngineeringService`, workflow and parallel services; storage dirs; guards wired into the agent service. Both files also churn upstream. |
| Permissions / questions | CLI `zcode-protocol-v4/interaction-registry.ts` (+35/−41), `interaction-response-race.ts`, `zcode-protocol/interaction-preferences.ts`, `server.ts` | `protectedSessionIds`: questions in Graph-owned sessions never auto-resolve. **Security-relevant**; has unit tests. |
| Native recipes (Tool nodes) | CLI `bootstrap/src/app/native-recipe*.ts` (added), `create-app.ts` (+10), `zcode-protocol/native-recipe.ts`, `execution-environment.ts`, adapters `exec/*`, `context/index.ts`; shared `native-recipe.ts`, `zcode-execution-environment.ts`, `zcode-protocol/index.ts` (+43) | New protocol methods `session/recipe/*`; `create-app.ts` and `zcode-protocol/index.ts` are upstream-touched. |
| Config/plugin adapters | CLI `config-factory`, `file-config.adapter`, `project-config.adapter`, `plugins/*`, `bootstrap/plugins.ts`, `subagents.ts` (small) | Read-only resolution used for provenance preview. |
| Git | `git/git.ts`, `gitService.ts` (+38), `shared/src/git.ts` | Graph workspace preparation / ownership validation (parallel). |
| UI entry/navigation | `WorkspaceSidebar.tsx` (+20), `app-shell/WorkspaceShellLayout.tsx` (+30/−5), `types.ts`, `v4/SessionPane.tsx` (+62/−5), `V4WorkspaceChatArea.tsx` (+4), `WorkbenchPane.tsx` (+2), i18n `en-US.ts` (+492), `zh-CN.ts` (+468), `styles.css` | Tab entry, session-ownership banner/disable, conversation navigation. i18n files collide with upstream edits every time. |
| Desktop packaging/identity | `desktop-product-identity.mjs`, `build-metadata.mjs`, `electron-builder.config.js`, `main/index.ts`, `desktopRuntimeEnv.ts`, `desktopOAuthDeepLink.ts`, `desktopWindowsOpenFolderContextMenu.ts`, `shared/src/env.ts`, `client/remoteServiceAccess.ts` | Graph flavor. |
| Persistence | none upstream-side: Graph owns its files; no change to the native SQLite schema | Good. |
| Adapter surface | `desktop` main/preload/host: **no changes** to preload or host adapters | The Graph service rides the existing generic service RPC. |

The fork chose a small, contract-first seam (`contract.ts` / `workflow-contract.ts` / `parallel-contract.ts`, enforced by `architecture-policy.yaml`). Good for rebase, with these likely breakers: (1) `zcodeAgentService.ts`/`zcodeAgent.ts`/`zcodeAgentProcessManager.ts` — any upstream change to session creation, send paths, or runtime identity; (2) `interaction-registry.ts` and the preferences sync; (3) V4 conversation wire (`V4_WIRE_PROTOCOL_VERSION`, hello capabilities, frame schema) that `adapters/observation.ts` parses strictly; (4) `zcodeProtocolMethods`/`zcode-protocol/index.ts` additions; (5) UI locale files and `WorkspaceShellLayout.tsx`; (6) `createSharedDefines` / build-define handling for `__ZCODE_PRODUCT_FLAVOR__`; (7) electron-builder/NSIS hooks.

Pending upstream: the local `upstream/main` is 1 commit (283 files) past the merge-base, but HEAD already carries that content (F1), so a merge of it should be near-empty — **test in a throwaway worktree, not here**. Anything newer than 3.14.3 is unknown until fetched.

### G.2 Proposed compatibility boundary (instead of testing every file)

A single `graph-upstream-contract` suite, runnable in seconds, that fails if upstream changes any of the following:
1. **Seam typing:** `pnpm typecheck` + `architecture:check` + a test asserting the exact exported surface of the three contract files and the guard hooks (`assertInputAllowed`, `getExplicitQuestionSessionIds`, `startRecipe/inspectRecipe/cancelRecipe`, `getWorkspaceRuntimeRetirement`).
2. **Agent-service contract tests** (already mostly present: `expectedRuntimeClient.test`, `runtimeRetirement.test`, `conversationCommandClient.test`, `sessionPurposeClient.test`, `executionEnvironmentPreview.test`): create-session-without-model, expected-identity send refusal, guard blocks every input type.
3. **Interaction-registry tests:** protected sessions never auto-answer; ordinary sessions still do.
4. **Protocol golden frames:** recorded V4 hello/subscribe/terminal frames parsed by `observation.ts` and `observer.test.ts` (including unsupported version ⇒ fail closed).
5. **Real-Z1 and one real-per-version record fixtures** loaded read-only (Z8.2).
6. **One packaged smoke** (existing ordinary-chat + one sequential complete + one restart), because the CLI bundle, protocol and Electron main only meet in the package.
7. **A written upstream-upgrade checklist** (diff-scan of the nine files above, NOTICE/third-party diff, run the suite in a separate worktree).

---

## H. Existing coverage mapped to Z8 scenarios

Classes: **ALREADY PROVEN** (exact evidence), **PARTIAL**, **NOT RUN**, **REQUIRES IMPLEMENTATION**. Development-mode Electron is never counted as packaged.

| ID | Class | What exists | What is missing |
| --- | --- | --- | --- |
| A01 manifest/baseline | **PARTIAL / REQUIRES IMPLEMENTATION** | Baseline numbers per milestone (A.4); `build-meta.json`; `SHA256SUMS.txt` for the installer; `build-windows.mjs` fixes toolchain env; frozen lockfile in CI. | No release manifest; identity inconsistency F1; baselines not re-run on HEAD for this audit; lint warnings 75, CLI lint 85/53 and ~2,870 format paths need an explicit accepted-exceptions list. |
| A02 packaged fresh launch | **PARTIAL** | CI z2.2 run `35985877508` (DOCUMENTED, 11 cases incl. `ordinary-chat`, `no-provider`, Z1 literal, 8 Z2 cases, 57 assertions); z7.5 CI per release notes. Packaged `no-provider` asserts zero model requests. | Not run on HEAD; harness uses test-env overrides + fixture proxy (F5); no total-egress capture; no ASAR content scan for HEAD; no clean-VM install. |
| A03 upgrade historical data | **PARTIAL (Z1 only)** | Real Z1 completed/pending fixtures + `legacy-persistence.test.ts`; additive-union design; synthetic v2–v5 fixtures; library versions test. | No real v2–v5/library/parallel profile from a published build; no old-binary→new-binary run; no run of the upgraded app over such a profile; no byte-identity-of-untouched-data assertion beyond Z1. **REQUIRES IMPLEMENTATION (fixture generation from tags + harness).** |
| A04 interrupted work across restart/upgrade | **PARTIAL** | Restart half is well proven (D): packaged Z2 `restart-interrupted/permission/persistence-recovery`; dev Z3–Z6 boundary matrix; unit tests (`recovery.test`, `release-validation.test`, `sequential-faults`, `approval-faults`). | The *upgrade* half is **NOT RUN**; approval/NeedsHuman/Tool restart never packaged. |
| A05 migration/backup failure | **REQUIRES IMPLEMENTATION** | Malformed-file fail-closed test (`repository.test`); atomic writes; lock tests. | No backup, no migration, no restore procedure, no failure-injection around a pre-write snapshot. |
| A06 retention/export/support bundle | **REQUIRES IMPLEMENTATION** (export of workflows is **PARTIAL**: proven) | Sequential workflow export/import proven (U5, UX-M3, Z6); artifact content redaction; `redactFeedbackText`. | No retention/deletion UI or service; no run export; no support bundle; no canary tests. |
| A07 path/import/network/permission review | **PARTIAL** | Path/link-safe reads (`assertWorkspaceFilePath`), artifact ownership checks, import validation tests, interaction-registry protection tests, Z7 owned-path cleanup tests, this audit's static review. | No dynamic egress capture; no assertion that telemetry env vars are neutralised; MCP/plugin/hook startup activity is inferred; no review of native CLI log content. |
| A08 unsupported protocol/runtime mismatch | **PARTIAL** | Strict Zod parse of the V4 hello/frames; expected-identity binding refuses a changed runtime; observer gap/epoch tests fail closed. | No startup capability probe for `session/recipe/*` methods or CLI version; no test with an old/new agent bundle mismatch; Graph `supported` is just "service registered". |
| A09 Chat + full Graph regression | **PARTIAL** | Dev-native: ordinary Chat Read/Edit/Bash at every milestone; full Graph scenario set Z1–Z6, U1–U5, reviewer, UX-M1–M4 Windows acceptance (real dialogs, 56 presentation images). Packaged: Chat + Z1/Z2 only. | The whole Z3–Z6/UX portion in a package. Parallel excluded. |
| A10 notices/signing/install effects | **NOT RUN** (notices **PARTIAL**) | `THIRD-PARTY-NOTICES.md`, `NOTICE.md`, `LICENSE`, `third-party/inventory.json` are in the tree and identical to upstream 3.14.3; notices file is an `extraResource`. | Not verified inside a built artifact; fork additions (zod, React Flow, etc.) and the Graph docs not reviewed for notice impact; no signing (stays NOT RUN); no install/uninstall/registry/shortcut/PATH inspection; no ARP entry check. |
| A11 history/load performance | **NOT RUN** | A U4 history harness exists (`pre-z8-u4-history.*`), UX-M2 seeded 26 runs. | No agreed fixture size/bounds; no measurements; `repository.read` validates the **whole** workspace record (all runs) on every read — size growth is unbounded by design. **REQUIRES a measurement first, not a cache.** |
| A12 internal pilot | **NOT RUN** | `PRIVATE_PROJECT_PILOT_CHECKLIST.md`, `HUMAN_PILOT*.md` exist as drafts. | Whole item; by definition a human step. |

---

## I. Proposed Z8 milestones

Principles: sequential-only supported set; package creation is local; no signing, publishing, tagging, installing over the live app, or deployment without a separate explicit instruction each time; no new storage engine, no speculative caches, no rewrite of Graph's persistence.

### Open decisions needed from you before Z8.1

1. **Upstream identity (F1).** Choose: (a) declare the fork as "upstream v3.14.3 content" and set the root version to `3.14.3`, giving release versions like `3.14.3-z8.1`; or (b) keep `3.14.0-…` and record the discrepancy in the manifest. I recommend (a), with the manifest recording that the history is not an ancestor.
2. **Parallel in the package.** Recommended: ship **disabled** (hidden unless an explicit build/runtime switch is on). Alternative: ship as today with the label. Not recommended: any statement that it is supported.
3. **Release label.** Extend the `z[127]` allowlist to `z8` (smallest) or move to a milestone-independent scheme. This changes the single policy owner; it needs a test.
4. **z7.6.** `origin/main` has an unreleased "prepare z7.6" notes commit. Fold it into Z8 (recommended) or release it first.

### Z8.1 — Reproducible package + release manifest

- **Problem.** Identity is ambiguous (F1/F2), no manifest, installer is the only hashed output, packaged content for HEAD has never been inspected, release notes are a single shared file.
- **Expected changes.** (a) version policy edit + test; (b) `RELEASE_MANIFEST` generator run by `build-windows.mjs`: commit, dirty flag, upstream base and its content statement, package/CLI/Electron/builder versions, Node/pnpm, lockfile hash, build command, supported OS/arch, capability flags (parallel off), known exceptions list, SHA256 of installer and of selected inner files (`app.asar`, agent bundle, notices), written next to `SHA256SUMS.txt`; (c) package-content scan (ASAR + `win-unpacked`) for fixture origins, developer paths (`C:\Users\`, repo path), `.env`, sourcemaps, `.zcode-graph-engineering`, keys-like strings, test resources; (d) a second build of the same commit to *measure* (not promise) reproducibility; (e) per-release notes file instead of one shared file; (f) Graph entry clears telemetry endpoint env vars (F10) with a test; (g) optional build default-off for parallel UI.
- **Acceptance.** Manifest matches the built artifact; scan passes with zero unexplained hits; two builds' differences listed; baseline suite (typecheck, lint, architecture, graph/UI tests) run and recorded with the exceptions list; existing `distribution.test.mjs` extended.
- **Risk.** Low–medium. Touching the version resolver and `build-windows.mjs` affects the CI release path; keep `z1/z2/z7` behavior unchanged. A build takes tens of minutes and needs the main checkout's toolchain.
- **Automatable.** All of it, including the scan and the two-build diff.
- **Needs you.** The four decisions above; approval to run a local build (disk/time); nothing else.

### Z8.2 — Upgrade, backup, conservative recovery

- **Problem.** No real v2–v5/library records from published builds; no pre-mutation copy; no restore procedure; no downgrade/unknown-version test; upgrade-with-active-run never exercised (F6, section D).
- **Expected changes.** (a) golden profiles produced by the *published* z2.2 and z7.5 installers (extract or run unpacked in a throwaway home) with scripted runs covering v2, v3, v4, v5, library, a pending gate, an interrupted run; stored as test fixtures with only synthetic content; (b) a `snapshot-before-write` step in the repository for the first write after a version/reconcile change (copy the single JSON atomically with a content-id name; bounded count) — one small adapter change, not a migration framework; (c) explicit "unsupported newer version" error with recovery text; (d) restore documentation verified on a fixture; (e) tests: no dispatch/create/send/approve/release on load of every fixture; byte-identical files when nothing is live; failed snapshot ⇒ no mutation and no agent start; (f) packaged **upgrade** harness: install z7.5 (or run its unpacked tree) in an isolated home, create the states in D, replace with the new build's tree, relaunch, assert no replay.
- **Acceptance.** Z8-A03/A04/A05 as defined above, with the new build against old-binary data and a counted zero of creates/sends/model requests/tool calls.
- **Risk.** Medium–high: it is the first time two binaries meet one profile; Windows file locking during real NSIS upgrade is only reachable in Z8.4.
- **Automatable.** Fixture generation, load/reopen tests, snapshot failure injection, the unpacked-tree upgrade harness.
- **Needs you.** Permission to download the z2.2/z7.5 installers (filenames, source = the fork's releases, ~150 MB each) and to extract/run them under a temporary directory only. No installation into your account.

### Z8.3 — Diagnostics, security, upstream compatibility

- **Problem.** No support bundle, no retention/deletion, egress and telemetry not measured, no upstream test boundary or checklist.
- **Expected changes.** (a) previewed, local-only **support bundle** per F.3 with canary tests; (b) retention: explicit, per-run "remove Graph record and artifacts" for *terminal, inactive* runs only, refusing active/uncertain evidence, with copy that native conversations/logs are separate stores and that deletion is logical in the profile, not in backups (sessions untouched); optional log-retention disclosure; (c) **egress observation**: run the packaged exe (or unpacked tree) with no provider under a local logging proxy that denies and records every host, and a DNS/process-level capture where possible; report the list; any unexpected host becomes a decision (disable for Graph flavor or document); (d) static review closure for F10 (feedback uploader entry hidden or documented), imported-workflow and path checks (already tested; add canary cases for the import regex limits); (e) `graph-upstream-contract` suite and `UPSTREAM_UPGRADE_CHECKLIST.md` per G.2; (f) startup capability check: Graph reports "unsupported agent runtime" when the agent lacks `session/recipe/*` or the protocol/hello shape differs, instead of failing mid-run.
- **Acceptance.** A06/A07/A08 with synthetic canaries absent from bundle bytes; egress report attached; capability mismatch test with a stubbed old agent; contract suite green on HEAD and demonstrably red against a seeded breaking change.
- **Risk.** Medium. The capability check and retention touch services/UI; retention is destructive, so it needs explicit confirmation UI and strict guards.
- **Automatable.** Nearly all; egress capture needs a Windows machine session.
- **Needs you.** Decide whether retention/deletion is in the internal release at all (it can be deferred with documented manual guidance); nothing credential-related.

### Z8.4 — Isolated Windows package acceptance

- **Problem.** Packaged evidence stops at Z2; HEAD never packaged; installer behavior never run.
- **Expected changes.** Mostly harness: extend `packaged-cases.mjs` with a minimal packaged set for Z3 gate + restart, Z4 Tool node (without .NET: a Node-based recipe), Z5 stop/NeedsHuman restart, library save/instantiate/import/export, ordinary Chat regression, no-provider egress; run NSIS install/upgrade/uninstall in an **isolated** environment (Windows Sandbox or a disposable VM, never your account); notices/license inspection inside the artifact; Authenticode status recorded as `NotSigned`; ARP/shortcut/registry/PATH side-effect list.
- **Acceptance.** A02, A09, A10, A11 (with agreed bounds, measured on a generated history fixture), plus the NSIS upgrade of z7.5 → new with a seeded profile.
- **Risk.** Medium. Windows Sandbox/VM availability is unknown; CI minutes grow; some Z3–Z6 flows need new harness code that must not alter product behavior.
- **Automatable.** Harness and measurements; sandbox/VM automation if available.
- **Needs you.** A disposable Windows environment (or confirmation Windows Sandbox is enabled on this machine) and authorization to run the real NSIS installer *inside it only*. Anything on your own machine stays untouched.

### Z8.5 — User internal pilot

- **Problem.** Nothing has been run with a live provider or a real project; package creation is not deployment approval.
- **Expected changes.** None to product code unless the pilot finds defects. Deliverables: `Z8_REPORT.md`, `RELEASE_MANIFEST.md`, `OPERATIONS_RUNBOOK.md` (install, upgrade, rollback = reinstall previous installer + restore snapshot, backup, what not to copy, support bundle), `UPSTREAM_UPGRADE_CHECKLIST.md`, known issues, an authorization record.
- **Acceptance.** A12: your recorded pilot on a non-confidential project with your own provider, then a separate recorded release decision.
- **Risk.** Provider cost and data flow; real behavior may differ from controlled fixtures.
- **Automatable.** Document assembly and checklists only.
- **Needs you.** Everything operational: choosing the project and provider, running it, signing off, any distribution, and any signing or tagging decision.

### Explicitly NOT to implement in Z8

Parallel/Fork-Join work of any kind (including A12 export/import — that is Z7); remote, mobile, web, scheduled or background Graph; marketplace, arbitrary workflow code, auto-PR/push/merge; a migration engine, new database, or cache layer; a second credential/provider store; credential or profile import/export/backup of any kind; automatic updater, update feed or update-on-launch; code signing or any real-credential step; telemetry or analytics additions; a Graph-specific logger framework; UI redesign (UX-M5); changes to ordinary Chat; a rebase/merge of newer upstream in this milestone (only the checklist and suite).

### Suggested order and dependencies

Decisions → Z8.1 → Z8.2 (needs the manifest's fixture identity) → Z8.3 (egress needs the Z8.1 package) → Z8.4 (needs everything) → Z8.5. Z8.2 and Z8.3's static parts can overlap; do not run two builds concurrently because they share `packages/desktop/out/host`.

---

## J. What I could not establish

- Whether any installed `z7.5` profile exists on this machine and what it contains (deliberately not inspected).
- Real SHA-256 or content of the published installers (not downloaded).
- Whether the z7.5 GitHub Actions run passed every gate (the release exists, which the workflow only creates after its gates; run logs were not read).
- Network behavior of a production-env package with no account (F5).
- Contents of native CLI logs and session SQLite beyond what Graph references.
- Why the 3.14.3 tree content lacks its upstream commit, and whether other upstream state past `29628c9` exists.
