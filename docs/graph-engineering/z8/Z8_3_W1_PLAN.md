# Z8.3-W1 — plan: consolidated local Windows validation

Scope: validation of the merged Z8.3-A, N1, S1 and R1 changes on one real Windows x64 package. This is **not** Z8.4 installer acceptance and **not** Z8.3 release approval. Product code changes only if a concrete regression in A/N1/S1/R1 behavior is exposed (explained first, then a new identified candidate).

## Candidate

| Item                | Value                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Integration base    | `claude/zcde-graph-ux-audit-be80d8` @ `a3fa06358633f570fce9cf26fe21f2442a6ccd19` (fetched; unchanged)                                                          |
| Feature branch      | `feature/z8-3-w1-windows-validation-21dcde` (fresh worktree; no other worktree touched)                                                                         |
| Source SHA          | the commit that carries this plan (recorded in the build manifest by `build-windows.mjs`; the build starts from a clean tree)                                   |
| Harness SHA         | later commit(s) on the same branch that only add `scripts/graph-engineering/w1-*` files, tests and the report; recorded separately by the harness            |
| Toolchain           | Node 24.14.0, pnpm 10.33.2 (pinned copies from the main checkout's gitignored `.tmp/z1-toolchain`), `--frozen-lockfile`, no lockfile change                    |
| Version label       | `3.14.3-z8.301` (matches the existing `-z8.<n>` policy; not a release, no tag)                                                                                  |
| Output directory    | `packages/desktop/dist-graph-w1` (new; `dist-graph-a1-*`, `dist-graph-b1/b2` and all Z8.1/Z8.2 evidence untouched)                                              |
| Build entry         | `node scripts/graph-engineering/build-windows.mjs 3.14.3-z8.301 --dist-dir dist-graph-w1` (existing). The NSIS installer is produced as an artifact and **never run** |
| Executed copy       | hash-verified detached copy of `win-unpacked` in a fresh temp directory (done by the existing `packaged-smoke.mjs` / the new W1 driver); the retained output is never patched |
| Component hashes    | `ZCode Graph.exe`, `resources/app.asar`, `resources/glm/zcode.cjs` (actual bundled path is recorded in the report), `resources/graph-build-identity.json`, installer |

## Build order (serialized; nothing else emits while a step runs)

1. `pnpm install --frozen-lockfile --ignore-scripts --offline` (store from the main checkout) + `node_modules/electron/install.js` (cached zip). **Done**, lockfile unchanged.
2. `pnpm typecheck`, `pnpm lint`, `pnpm architecture:check --changed`. **Done before the plan commit** (results in the report).
3. Focused source tests for A/N1/S1/R1 on Windows (existing commands only; the Linux Cloud selector and its fixed skip counts are not used and not changed).
4. `build-windows.mjs` (prepare runtime assets: native search tools, agent CLI + bytecode; desktop build; bundle; installer; manifest). No typecheck during this step.
5. Freeze: record hashes, then never rebuild that directory. A product fix means a *new* label and directory.

## Safety boundaries

- Fresh synthetic profiles in new temp directories only (`createIsolation` + `createGraphProfile`); disposable fixture projects; no operator profile, credentials, company project or real provider.
- Existing redirected-endpoint mode: fixture origin is the base URL for every inherited endpoint, `HTTP_PROXY/HTTPS_PROXY` and the Chromium `--proxy-server` both point at the loopback fixture, which records every proxied request (its recorder is the observation mechanism; positive control required before a zero is trusted).
- No workspace/user MCP servers or hooks are present in the fixture; no permission-policy change; native permission requests are answered one at a time exactly as the existing smokes do.
- A temporary profile is **not** an OS sandbox; no containment, firewall, proxy/DNS/cert or AV change, no VM. If a case cannot be made safe inside this setup it is stopped and reported as BLOCKED; there is no silent production-profile fallback.
- No live provider/account calls. The installer is not executed.

## Cases and evidence

Status words: PASS / FAIL / UNVERIFIED / OPERATOR-PENDING. An unavailable observation is UNVERIFIED.

| ID    | Case                                                                                                                        | Evidence (automated unless noted)                                                                                                        |
| ----- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| A-1   | app.asar header hash equals the embedded `ELECTRONASAR` record                                                              | `package-inspect` / `verify-asar-integrity` on the retained output and the detached copy                                                  |
| A-2   | `EnableEmbeddedAsarIntegrityValidation` on; `RunAsNode` and other fuses as intended                                         | fuse wire read from the executable                                                                                                        |
| A-3   | Packaged app launches under the fuse; bundled agent launched through the real runtime path                                  | smoke subset `ordinary-chat`, `no-provider`, `sequential-engineering-reviewer`                                                            |
| R-1   | Real bundled agent returns `nativeContract` on `runtime/capabilities`; admission succeeds                                   | W1 driver reads the Host-to-agent result through the packaged app (not reconstructed); bounded metadata only                              |
| R-2   | Tool-only Graph workflow, no provider, owned harmless fixture command, really executed                                      | fixture side-effect file + persisted run record + no model request                                                                        |
| R-3   | Small normal Graph workflow against loopback model fixture                                                                  | fixture request log + run record                                                                                                          |
| R-4   | Ordinary Chat regression                                                                                                    | existing `ordinary-chat` case                                                                                                             |
| R-5   | Sequential engineering scenario: real Build/Test evidence, final human gate left pending                                    | existing `sequential-engineering-reviewer` case                                                                                           |
| R-6   | Process-backed negative fixture: missing/incompatible capability metadata through the real Host admission path              | an actual process answering `runtime/capabilities` without/with wrong `nativeContract`; counters prove no run record, no session, no model input, no tool execution. Labelled **not** a historical packaged agent |
| N-1   | Cold start + Help/Plugin Store surfaces: covered automatic config/catalog requests absent; Feedback entry points unavailable | fixture proxy recorder + DOM checks; positive control for the recorder                                                                    |
| N-2   | Explicit catalog action reaches loopback separately; user-selected loopback model traffic still works                       | recorder paths                                                                                                                            |
| S-1   | Real Help menu opens the Graph support-bundle dialog; it stays open after the menu closes; categories + full JSON preview   | Playwright on the packaged app (automated UI evidence)                                                                                    |
| S-2   | Displayed byte count equals the exact saved UTF-8 bytes; real OS Save dialog writes the previewed payload                   | real Windows Save dialog driven by `ux-m2-os-file-dialog.ps1`, restricted to the launched process tree; compared with the preview        |
| S-3   | Cancelling the real Save dialog writes nothing                                                                              | same driver, cancel path; destination checked                                                                                             |
| S-4   | Generation/saving trigger no Feedback upload; canaries and original paths absent                                            | recorder + byte scan of the saved file against synthetic canaries                                                                         |
| OP-1  | Operator click-through (one combined list)                                                                                  | OPERATOR-PENDING until the operator reports                                                                                               |

Not claimed (carried over): all-egress coverage, Windows confinement, raw sockets, MCP/hooks/tools, OTLP/ARMS positive controls beyond what the recorder actually shows; this is a selected regression subset, not the full release gate; the full historical-data matrix is not rerun unless a concrete failure makes a case relevant.

## Failure handling

The original failure, exit code, candidate identity and logs are kept. Small harness adaptations and focused regression tests are authorized. A product fix needs an explanation first, a new identified candidate, and a rerun of affected cases plus the smoke subset; earlier failed evidence stays.

Raw evidence stays local (gitignored output directory / temp). Only reviewed, path-sanitized, synthetic evidence and the report are committed.

## Addendum 1 (written before the product fix): what candidate 1 showed

Candidate 1 (`3.14.3-z8.301`, source `b43e25c2f32791395c8d7b23a35057757ab77a0a`) passed A (ASAR record = header hash, integrity fuse on), the selected smoke subset, the Tool-only workflow, the normal model workflow and the support-bundle dialog/Save/Cancel path. The N-1 case **failed**: on cold start with synthetic profile and redirected endpoints the packaged Host (utility process; attributed by client port) sent two automatic `GET /api/v1/client/configs` requests, 150 ms apart, before any user action:

1. `platform=windows-x86_64` — the built-in provider catalog download. The Root component calls `providerSettingsService.refresh("root-provider-state-refresh")` at startup; the Host's `refreshSources` always calls `refreshZCodeBuiltin({ force: true })`, and `force` is the N1 "explicit" signal. This is a **regression inside the approved N1 behavior** (class `builtinProviderCatalog`): a startup call arrived under the explicit label.
2. `platform=win32-x64` — the coding-plan provider's dynamic-workflow (and Off-Peak) client-config read, an automatic read of the same endpoint that `IClientConfigService` gates (class `clientConfig`) but through a second client the N1 table did not list.

Intended minimal fix (no new policy class, no hostname logic, Production/Preview unchanged):

- `NodeProviderConfigRuntime.refreshZCodeBuiltin` accepts `automatic: true`; when the runtime's `automaticZCodeBuiltinRefresh` is denied it skips. `ProviderRuntime.refreshSources` passes `automatic` for every reason except the settings refresh button (`settings:settings-manual`).
- `BigModelCodingPlanSubscriptionProvider.getDynamicWorkflowClientConfig` / `getOffPeakClientConfig` read the existing `clientConfig` policy: under Graph a non-forced read returns the default/closed configuration without a request; `forceRefresh` and the settings-page plan reads keep their paths.
- Regression tests in the already-selected `packages/services/test/graphAutomaticNetworkConsumers.test.ts` (Graph: zero requests, explicit path reachable, Production positive control) and a by-hand mutation (the new tests fail without the fix).

Then: new candidate `3.14.3-z8.302` in `dist-graph-w2`, rerun of N-1, the Tool-only/support case, admission cases and the smoke subset. Candidate 1 and all its evidence stay.
