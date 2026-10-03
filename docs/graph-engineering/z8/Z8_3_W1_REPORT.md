# Z8.3-W1 — consolidated local Windows validation report

Scope: one hands-on-ready validation of the merged Z8.3-A (ASAR integrity), N1 (automatic-network gates, Feedback blocking), S1 (support bundle) and R1 (native-runtime capability gate) on real Windows x64 packages. **This is not Z8.4 installer acceptance and not Z8.3 release approval.** The installer artifact was produced but never run. Nothing was merged, tagged, signed or published.

**Headline.** Candidate 1 exposed a real N1 regression: the packaged Graph app sent two automatic `/api/v1/client/configs` requests on cold start. A minimal fix was made, verified by a new candidate 2, and everything except the operator click-through passed on candidate 2. The operator checklist is **OPERATOR-PENDING**.

## 1. Identity

| Item                       | Value                                                                                                                                                                                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Integration base           | `claude/zcde-graph-ux-audit-be80d8` @ `a3fa06358633f570fce9cf26fe21f2442a6ccd19` (fetched; unchanged by this task)                                                                                                                                             |
| Branch                     | `feature/z8-3-w1-windows-validation-21dcde` (fresh worktree, no other worktree touched)                                                                                                                                                                        |
| Candidate 1 source SHA     | `b43e25c2f32791395c8d7b23a35057757ab77a0a` (the plan commit; clean tree at build start)                                                                                                                                                                        |
| Candidate 2 source SHA     | `aa1870d337fa1ef90cb437396aab0f8c6a24ea8c` (product fix commit on top of harness commit `3c0e886`; clean tree at build start)                                                                                                                                  |
| Harness SHA                | the harness commit `3c0e886…` plus the later harness-only commit(s) on this branch (the report PR tip). The smoke recorder wrote `harness.dirty=true` for both runs because the W1 files or a later harness edit were uncommitted while it ran (details in §9) |
| Toolchain                  | Node 24.14.0, pnpm 10.33.2 (pinned copies from the main checkout's gitignored `.tmp/z1-toolchain`; global Node is 24.11.1 and was not used), Electron 41.0.3, electron-builder 26.8.1, zcode CLI 0.16.9                                                        |
| Install                    | `pnpm install --frozen-lockfile --ignore-scripts --offline` from the local store + cached Electron zip; `pnpm-lock.yaml` unchanged                                                                                                                             |
| Version labels             | candidate 1 `3.14.3-z8.301` → `packages/desktop/dist-graph-w1`; candidate 2 `3.14.3-z8.302` → `packages/desktop/dist-graph-w2` (valid under the existing `-z8.<n>` policy; no tag)                                                                             |
| Build entry                | existing `scripts/graph-engineering/build-windows.mjs <version> --dist-dir <dir>` (runtime assets, desktop build, `bundle:desktop`, NSIS installer, manifest). No typecheck or other emitting step ran while a build or a native test was running              |
| Retained Z8.1/Z8.2 outputs | `dist-graph-a1-*`, `dist-graph-b1`, `dist-graph-b2` and their evidence were not touched                                                                                                                                                                        |

### Candidate component hashes (SHA-256)

| Component                                 | Candidate 1 (`3.14.3-z8.301`)                                                     | Candidate 2 (`3.14.3-z8.302`)                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `ZCode Graph.exe`                         | `2ec326d92dc159c5ce6b8d434fb2128ba053e52ce1b5cd5eec864fa6db023d19`                | `1ecb69daf2cf952a5b435488d2f9bacec687a5256647ab74b2fb522da7471a8a`                |
| `resources/app.asar`                      | `17ebed43bbd1039852f9b2c9516dd26a7bbce47de8df9a29e5e901e1649b29f6`                | `6e796d1634ad9795d63bc0fb7519f32d0f36d0a2769ae1b74e014a57793dfc32`                |
| `resources/glm/zcode.cjs` (bundled agent) | `0a3b4e841bfd6bd94adb98e3a36b17dc8f57aefa411af89c5bb14d70232852b9`                | `875a139d88a940d55731bca799acb8deaf9b433f454058cd16ecdc570af3967b`                |
| `resources/graph-build-identity.json`     | `1da43d4493595ab3e2af96276263b47f7b87ba64f45093e532924af959901ed7`                | `956771405cf4f41e9c35951c2ecbf567e8bb377d4bc0d73e67cd18da76a98b3c`                |
| Installer (never run)                     | `fceefa725c30d14cbc41522ffb3abc1c7d036e3a12f2cf523cce88b658ad2bc3`, 149 901 791 B | `fd40e4eec88565e0b42340d039b23e9c392eea802a8fd203de8d561c129b8d50`, 149 907 975 B |
| ASAR header hash = embedded record        | `249b2d4864d2e855e3d39c6b9367355d85265d123bbbce3a1c431cd67142e77e`                | `c867d6ed8188396a11ca2f0276372bf3877b333b47f599ca2f3a5bb3e0aaf197`                |

The agent bundle is at `resources/glm/zcode.cjs` (the plan's first draft said `resources/agent/glm/…`; corrected in the plan). The embedded build identity names flavor `graph`, version, source commit and `dirty:false`. Every case ran from a hash-verified **detached copy** of `win-unpacked`; before and after each suite the retained package was re-verified against its manifest (`retainedUnchanged: true` in every `suite.json`).

## 2. Source, type and build checks (actual results)

| Check                                                                                                                                                                    | Result                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck` (before candidate 1; again after the fix)                                                                                                               | exit 0 both times (about 75 s)                                                                                                                                                                  |
| `pnpm lint`                                                                                                                                                              | exit 0, 0 errors, 75 warnings (same as the integration baseline); the harness files add none                                                                                                    |
| `pnpm architecture:check --changed`                                                                                                                                      | OK, 0 violations                                                                                                                                                                                |
| Windows workflow source tests (the same commands as `.github/workflows/graph-windows-release.yml`; the Linux Cloud selector with its fixed skip counts was **not** used) | scripts 65/65; services graph+agent 441 tests (439 pass, 2 skipped, 0 fail); `services/test` + registry 63 → 66 after the fix tests, 0 fail; UI 240/240                                         |
| `pnpm fmt:check`                                                                                                                                                         | not run (known to fail on Windows for CRLF reasons, per earlier acceptance notes); no repository-wide formatting was applied                                                                    |
| Native build                                                                                                                                                             | both candidates built to completion with exit 0; the Z8.3-A `artifactBuildStarted` assertion ("ELECTRONASAR matches the archive header and the integrity fuse is on") passed inside both builds |

The CLI build re-dirties eight `node-repl-host/dist-types/*.d.ts` files (line endings); they were restored with `git checkout` and never committed. `build-record.json` therefore lists them under `sourceAfterBuild` (candidate 2: 9 paths including uncommitted harness files at build time; the build-start state was clean).

## 3. Case results

Status words: PASS / FAIL / UNVERIFIED / OPERATOR-PENDING. "C1"/"C2" = candidate. Raw evidence stays under `packages/desktop/dist-graph-w*/w1-evidence/` (not committed); the reviewed, path-sanitized JSON is in [`Z8_3_W1_EVIDENCE/`](Z8_3_W1_EVIDENCE/).

| ID   | Case                                                                                        | C1 (`z8.301`)                                    | C2 (`z8.302`)        | Evidence                                                                            |
| ---- | ------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------- | ----------------------------------------------------------------------------------- |
| A-1  | ASAR header hash equals the embedded `ELECTRONASAR` record                                  | PASS                                             | PASS                 | `w1-inspect.mjs` on retained and detached copies (uses the Z8.3-A module itself)    |
| A-2  | Integrity fuse on; `RunAsNode` and the other fuses as intended                              | PASS                                             | PASS                 | §5                                                                                  |
| A-3  | Packaged app launches under the fuse; bundled agent runs through the real runtime path      | PASS                                             | PASS                 | smoke subset, Tool-only and normal runs                                             |
| R-1  | Real bundled agent returns `nativeContract`; admission succeeds                             | PASS (with scope note below)                     | PASS                 | `admission-record`, plus admission success inside every packaged Graph run          |
| R-2  | Tool-only Graph workflow, no provider, owned harmless fixture command                       | PASS                                             | PASS                 | `tool-only-support`                                                                 |
| R-3  | Small normal Graph workflow against the loopback model fixture                              | PASS (`z2-complete`; legacy driver FAIL, see §9) | PASS                 | `normal-graph-loopback-model`                                                       |
| R-4  | Ordinary Chat regression                                                                    | PASS                                             | PASS                 | smoke `ordinary-chat`; chat in the N1 case                                          |
| R-5  | Sequential engineering: real Build/Test evidence, final gate pending                        | PASS (run `WaitingForApproval`)                  | PASS                 | smoke `sequential-engineering-reviewer`                                             |
| R-6  | Process-backed negative fixture rejected at admission                                       | PASS (3 modes)                                   | PASS (3 modes)       | `admission-negative-*` — **source-level Host path, not the packaged Host** (§4)     |
| N-1  | Cold start, Help, Plugin Store: covered automatic requests blocked; Feedback entries absent | **FAIL**                                         | PASS                 | `n1-network-wiring`; C2 also with a 70 s idle window                                |
| N-2  | Explicit catalog action reaches loopback; user-selected model traffic works                 | PASS                                             | PASS                 | recorder lists                                                                      |
| S-1  | Real Help menu → dialog stays open, categories + full preview                               | PASS                                             | PASS                 | Playwright on the packaged app                                                      |
| S-2  | Displayed byte count = saved UTF-8 bytes through the real OS Save dialog                    | PASS (2545 = 2545 B)                             | PASS (2545 = 2545 B) | real Windows "Save As" dialog driven by UI Automation                               |
| S-3  | Cancelling the real Save dialog writes nothing                                              | PASS                                             | PASS                 | before/after tree of Desktop/Documents/Downloads identical, no "saved" confirmation |
| S-4  | No Feedback upload during generation/saving; canaries and original paths absent             | PASS                                             | PASS                 | recorder: zero requests; 13 needles absent                                          |
| OP-1 | Operator click-through                                                                      | —                                                | **OPERATOR-PENDING** | §10                                                                                 |

## 4. R1 — real agent, admission, negative fixtures

**What is real.** The agent is the package's own `resources/glm/zcode.cjs`, started through the packaged executable in `ELECTRON_RUN_AS_NODE` mode (A-3 exercises the `RunAsNode` fuse state). In every packaged Graph run the packaged Host's admission probe asked that agent for `runtime/capabilities` and evaluated it; the Tool-only run, the three-task normal run and the reviewer run were all admitted and executed.

**Scope limits that matter (read before trusting "PASS").**

- The packaged Host's _own_ connection could not be tapped. The only existing agent-command seam (`ZCODE_AGENT_SERVER_COMMAND`) is refused by the packaged Host: on launch it showed "Startup preparation failed — The configured Agent does not support storage preparation" (observed in the first dev run; the override path never sets `supportsStorageStartup`). I did not add a production bypass. So the capability metadata below was **recorded from a separate probe** of the same hash-verified bundle, using the Host's real stdio transport, protocol client, `readRuntimeCapabilities`, runtime gate and the production composition root `createGraphEngineeringService` — Host-side TypeScript run from source with `tsx` ("`w1-admission.ts`"). Session, model and setting services in that harness are counting stubs. Evidence that the _packaged_ Host admitted the real agent is functional (the packaged runs started), not a captured wire message.
- The three negative modes are **synthetic process-backed fixtures around the real agent** (`w1-agent-recorder.cjs` rewrites or answers only the `runtime/capabilities` response). They are **not** an actual historical packaged agent.

**Real agent's `runtime/capabilities` as delivered to the Host** (candidate 2 bundle; candidate 1's is identical in shape): `independentPlanState: true`; `nativeContract.protocol = {"name":"ZCode Protocol","version":1,"v4WireVersion":3}`; methods `runtime/capabilities, session/create, session/recipe/start, session/recipe/inspect, session/recipe/cancel, workspace/updateInteractionPreferences, v4/conversation/subscribe, v4/command`; 34 commands (including `sendText`, `stop`, `resolveInteraction`); features `["interaction.protectedSessions"]`. Admission did not reject it, and the flow proceeded past the probe.

| Mode (all on candidate 2; same on candidate 1) | Host verdict (real admission path)                                                                                    | Run persisted | Native session / `v4/command` / recipe start / subscribe                      | Model input / tool execution |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------- | ---------------------------- |
| `record` (unmodified real agent)               | admitted; flow continued                                                                                              | n/a           | n/a (stubs)                                                                   | n/a                          |
| `strip-contract` (`nativeContract` deleted)    | `GraphRuntimeIncompatible`: `capabilities-unavailable: expected runtime/capabilities.nativeContract, observed absent` | 0             | agent received only `runtime/capabilities`; stub `createSession` never called | none                         |
| `wrong-wire` (`v4WireVersion` +1000)           | `GraphRuntimeIncompatible`: `wire-version: expected 3, observed 1003`                                                 | 0             | same                                                                          | none                         |
| `method-missing` (JSON error `-32601`)         | `GraphRuntimeIncompatible`: `capabilities-unavailable … observed absent`                                              | 0             | same                                                                          | none                         |

Packaged-app execution (not just advertisement): the Tool-only case ran a real native recipe operation (permission shown by the real native UI, approved once like the existing smokes; `processStarted: true`, exit code 0, acceptance passed), the fixture's receipt file carries that exact `operationId`, **zero model requests and zero agent input admissions**. The normal workflow (`z2-complete`) ran three distinct native sessions with real Read/Edit/Bash events against the loopback model fixture, and an app restart preserved the run with zero new inputs. The reviewer case ended with real Build/Test evidence and the final human approval gate left pending (`WaitingForApproval`); native permission handling was not loosened.

## 5. A — packaged integrity and launch

| Check (both candidates, retained and detached copies)                                     | Result                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recorded `ELECTRONASAR` value vs archive header hash                                      | equal (values in §1); exactly one record (`resources\app.asar`)                                                                                                                                                                                                                                                                  |
| Fuse wire (9 states)                                                                      | `RunAsNode=1`, `EnableCookieEncryption=0`, `EnableNodeOptionsEnvironmentVariable=1`, `EnableNodeCliInspectArguments=1`, **`EnableEmbeddedAsarIntegrityValidation=1`**, `OnlyLoadAppFromAsar=0`, `LoadBrowserProcessSpecificV8Snapshot=0`, `GrantFileProtocolExtraPrivileges=1`, unnamed ninth `=1` (not identified, not changed) |
| Launch with validation on                                                                 | the packaged app launched on every case; no fuse was changed to work around anything                                                                                                                                                                                                                                             |
| Selected smoke subset (`ordinary-chat`, `no-provider`, `sequential-engineering-reviewer`) | SUBSET-PASS 3/3 on each candidate, packaged identity `ZCode Graph`, `isPackaged: true`, matching version; **a subset, not the full release gate**                                                                                                                                                                                |

The full 13-case historical matrix was not rerun (no concrete failure made a historical case relevant).

## 6. N1 — packaged wiring, including the failure and the fix

**Observation method.** Synthetic profile; every inherited endpoint, `HTTP_PROXY`/`HTTPS_PROXY` and Chromium's `--proxy-server` point at the loopback fixture, which records method + path (+ user agent and arrival time) of cleartext requests and the target of every HTTPS-proxy `CONNECT` (answered 502, never tunnelled, so no live traffic can leave through that route). **Positive controls** ran at the start of each network case: a harness request and a harness `CONNECT` were both recorded, then removed from the application readings. The explicit Plugin Marketplace refresh produced `GET /api/v1/client/configs` and `CONNECT cdn-zcode.z.ai:443`, which also shows that application traffic of both shapes is visible to the recorder.

**Candidate 1 — FAIL (original evidence retained in `dist-graph-w1/w1-evidence/c1-attempt1`).** Before any user action the packaged Host sent two automatic requests, 150 ms apart, both from the Host utility process (attributed by client TCP port in a diagnostic run):

1. `GET /api/v1/client/configs?...&platform=windows-x86_64` — the built-in provider catalog download. Root calls `providerSettingsService.refresh("root-provider-state-refresh")` at startup; the Host's `refreshSources` always used `refreshZCodeBuiltin({ force: true })`, and `force` is the N1 "explicit" signal. A startup call was therefore labelled explicit. **Regression inside the approved N1 behavior.**
2. `GET /api/v1/client/configs?...&platform=win32-x64` — the coding-plan provider's dynamic-workflow (and Off-Peak) client-config read at Host start. Same endpoint and class as `IClientConfigService`, but a second client the N1 table did not list.

Attribution of 1 and 2 to those code paths is by code reading plus the Host log line `coding-plan-subscription.getDynamicWorkflowClientConfig OK` and by the fact that the two requests disappeared exactly when each path was gated; no stack trace was captured.

**Fix (explained in the plan addendum before it was made; commit `aa1870d`).** `NodeProviderConfigRuntime.refreshZCodeBuiltin` takes `automatic`; when the runtime's `automaticZCodeBuiltinRefresh` is denied it skips. `ProviderRuntime.refreshSources` marks every reason except the settings refresh button (`settings:settings-manual`) as automatic. `BigModelCodingPlanSubscriptionProvider.getDynamicWorkflowClientConfig` and `getOffPeakClientConfig` read the existing `clientConfig` policy: a non-forced read under Graph returns the closed/default configuration with no request; `forceRefresh` and the settings-page plan reads are unchanged. No new policy class, no hostname logic; Production and Preview behave as before (positive-control tests). Tests added to the already-selected `packages/services/test/graphAutomaticNetworkConsumers.test.ts` (3 tests); a by-hand mutation (the four product files reverted) turns exactly the two Graph tests red, and they pass with the fix.

**Candidate 2 — PASS.** Cold start, Help menu and Plugin Marketplace entry produced no application request (`coldStart`/`helpMenu`/`pluginStoreOpened` stage lists empty), including in a second run with a 70 s idle window that spans the 60 s background timer. The Tool-only/support case recorded zero requests over its whole life. After that, the explicit refresh button produced `GET /api/v1/client/configs` + the `CONNECT` to the CDN host (separately observed), and the user-selected loopback model received two `POST /v1/chat/completions`. The real Help menu lists exactly: Product docs, User community, Graph support bundle…, Resource manager, About ZCode — no Feedback/report/feature-request entry.

**Not claimed.** All-egress coverage; Windows confinement (a temporary profile is not an OS sandbox); raw sockets; MCP, hooks and tools; direct Node connections that bypass both the redirected base URL and the proxy variables (the recorder cannot see a request to a hard-coded production host from Node `fetch`); OTLP/ARMS beyond the existing Z8.1 telemetry canary limits; the other Feedback entry points (error banner, quick-pick, task menu, remote-connection entry) were **not** exercised in the packaged app (UNVERIFIED there; they remain covered only by N1's unit/source guards). The first 70 s is the longest quiet window observed.

## 7. S1 — actual dialog, IPC and Save boundary (automated UI evidence)

Real packaged app, real Help menu, real Windows "Save As" dialog (`#32770`, driven by UI Automation restricted to the launched process tree; no `ZCODE_GRAPH_DIALOG_CONTROL`, no fake Main save handler):

- Help → "Graph support bundle…" opened the dialog; the menu content unmounted within ~90 ms; the dialog was still open and usable after a further 1.5 s wait.
- 8 included categories rendered (identity, runtime/protocol, OS, capability flags, network/telemetry policy, data shape, 1 workspace hash, 1 run) with the "Not included" paragraph and the full JSON preview.
- Displayed byte count 2545 = UTF-8 length of the preview = length of the saved file; saved bytes are byte-identical to the preview (SHA-256 equal).
- Cancel on the real dialog: no file appeared in Desktop/Documents/Downloads, no saved confirmation. Save on the real dialog wrote the file.
- Zero requests recorded during generation and saving (so no Feedback upload), with the positive control in place.
- 13 needles absent from the saved bytes: four synthetic canaries (workflow name, a planted `credentials.json`, a planted log line, a planted source file), the profile, workspace and package folders in three separator spellings, `AppData`, `credentials`, and no drive-letter path.

These are **automated** observations. They do not replace the operator's click-through (§10).

## 8. Fixes and exactly which evidence was rerun

| Change                                                                                                                                                  | Why                                                              | Evidence rerun on candidate 2 (all PASS)                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Product fix `aa1870d` (§6)                                                                                                                              | N-1 failure on candidate 1                                       | N-1 (twice, second with 70 s idle), Tool-only + support bundle, `admission-*` ×4, normal-graph, A inspection, smoke subset, hashes |
| Harness: `provider-fixture.mjs` gained an opt-in `recordConnect` option (default off, existing runs unchanged); W1 drivers/launcher/collector; recorder | observe `CONNECT`, user agent and arrival time; Windows evidence | n/a                                                                                                                                |

Candidate 1's failed evidence, exit codes and identity were not overwritten (`c1-attempt1`, `c1-attempt2-normal-graph`, and the smoke history).

## 9. Failures, adaptations and caveats (honest list)

1. **N-1 on candidate 1: FAIL** (§6). Fixed in candidate 2.
2. **Legacy `native-smoke.mjs` graph mode FAIL on candidate 1** (exit 1; `graph-effective-model` stays hidden after the UX-M1–M4 changes) — a stale harness driver, not a product regression; the maintained `z2-native-smoke.mjs --scenario=complete` passes and is used for R-3. The failing run is retained.
3. **First harness attempt** to route the packaged Host through the recorder failed at startup (override refused, §4); the packaged-app recorder wiring was removed and the admission check moved to source-level.
4. **Mid-run harness fixes** (all harness-only): the recorder's synthetic method-not-found answer must not carry a `jsonrpc` key (the protocol schema is strict); the agent needs `ZCODE_BUILTIN_PROVIDER_CONFIG_FILE` / `ZCODE_PERSONAL_PROVIDER_CONFIG_FILE` exactly as the Host passes them; the Help menu is only in the workspace header (leave the Graph panel first); the Plugin Marketplace is a page (use "New task" to return).
5. The smoke recorder wrote `harness.dirty: true` for both candidates (W1 files untracked on candidate 1; candidate 2's run had the later `--idle-seconds` edit and the launcher uncommitted). The binaries are unaffected (clean-tree builds); the smoke scripts themselves are the existing ones.
6. The saved bundle's hash differs between runs only because the profile/run ids differ.
7. R-1's capability record is a separate probe of the same bundle, not a tap of the packaged Host (§4); R-6 is source-level.
8. Cold-start observation covers the redirected base URL and proxy-aware stacks only (§6, "Not claimed").
9. No live provider or account request was made: the CDN `CONNECT` was answered 502 by the loopback recorder.

## 10. Remaining manual checklist (OP-1) — OPERATOR-PENDING

One combined session on candidate 2, about 10 minutes. **Not marked passed.** Report each line OK / NOT OK / could not do, plus anything surprising.

Start (PowerShell, repository root of this worktree; fresh synthetic profile, never your own; do **not** run the installer):

```powershell
. C:\Users\USER\Desktop\Personal\ZCode\.tmp\z1-env.ps1
$env:Z1_PACKAGED_EXE = "C:\Users\USER\AppData\Local\Temp\zw1-operator-c2\ZCode Graph.exe"
node scripts/graph-engineering/w1-launch-manual.mjs
```

(`zw1-operator-c2` is a hash-identical copy of `dist-graph-w2\win-unpacked`; recreate it with `robocopy packages\desktop\dist-graph-w2\win-unpacked <dest> /E` if the temp folder was cleaned.) The script prepares one completed Tool-only run, prints the profile folder, leaves the app open, and prints the recorder's request list when you quit.

1. Title bar and Help → About show "ZCode Graph", version `3.14.3-z8.302`.
2. Help menu (the "?" in the workspace header) has Product docs, User community, Graph support bundle…, Resource manager, About — and no feedback, report-issue or feature-request entry. Also look at the application menu bar → Help.
3. Help → Graph support bundle…: the dialog opens, the menu is gone, the dialog stays open for 5 s, the preview scrolls, Tab/Escape behave normally.
4. It lists 8 included categories, a "Not included" paragraph, an exact byte count, the whole JSON and a "nothing is sent" line. No Upload/Send/Submit button.
5. Save… opens a real Windows "Save As" dialog. Cancel: nothing saved, dialog still usable.
6. Save… again, choose any folder you can inspect, Save. In Explorer the file exists and Properties → Size (bytes, not "on disk") equals the dialog's byte count.
7. Open the file in a text editor: same text as the preview; search for `W1_CANARY`, your user name, `C:\Users`, the profile folder the script printed, `credentials` — none present.
8. Plugin Marketplace (sidebar): the page opens; click refresh once. "Failed to fetch marketplace" is expected (HTTPS is refused by the recorder). Anything else odd?
9. New task → send a short message: the loopback model answers with its fixed fixture behaviour (it asks for a tool permission); you may deny it.
10. Quit the app. The printed recorder list should contain only requests you caused (the marketplace refresh = one `GET …/client/configs` + one `CONNECT` to the CDN host; the chat's `POST …/chat/completions`) and **no** `client/configs` request before you opened the Plugin Marketplace.

## 11. Deliverables and next steps

- This report, the plan (with its addendum), the W1 drivers (`scripts/graph-engineering/w1-*`), the product fix and tests, and the reviewed synthetic evidence in `Z8_3_W1_EVIDENCE/`. Raw evidence, binaries, screenshots and profile folders stay local.
- One PR into `claude/zcde-graph-ux-audit-be80d8`; not merged and no auto-merge.
- Open points for a decision, not acted on: (a) whether the remaining Feedback entry points should get a packaged check; (b) whether the other automatic Host-side readers outside the N1 table (none were observed on candidate 2 in the recorded windows) deserve a standing packaged guard; (c) whether to run the full 13-case packaged matrix on candidate 2 before any release step. Z8.4 installer acceptance and release approval remain separate and untouched.
