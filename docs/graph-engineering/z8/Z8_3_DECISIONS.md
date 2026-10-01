# Z8.3 security decision brief (draft — written when the usage limit was reached)

Branch `claude/z8-3-security-decisions`, started from `origin/claude/zcde-graph-ux-audit-be80d8` at `c9752e876bba066bb7fa362c72ca8f9c3641a804` (contains the Z8.2 correction `7df4062` and closeout `4bbd81f`). No production code was changed. Only synthetic probes were run (temporary profiles, synthetic strings, loopback or reserved `.test` names that only reached a local recording proxy). Probe scripts and results: `.tmp/z8-3/evidence/` (local, not committed in this draft).

**Status: INCOMPLETE.** Decisions 1 and 3 are traced and probed. Decision 2 is traced to the point described below; its measurement design is a proposal, not a run. Sections marked **NOT DONE** were not written. Facts are tagged **[observed]** (read or measured here), **[source]** (read in the checkout) or **[inferred]**.

## Decision 1 — credential storage

### Current behavior
- **[source]** Two stores hold secrets. (a) `credentials.json` in the app config dir: values `enc:v1:` AES-256-GCM, key = SHA-256 of `ZCODE_CREDENTIAL_SECRET` or `zcode-credential-fallback:<platform>:<homedir>:<username>`. Two independent implementations of the same format: `packages/services/src/credential/providers/credentialCipherProvider.ts` (Host/Main) and `apps/zcode-cli/packages/adapters/src/auth/credential-cipher.ts` (agent). Both **pass through any value without the `enc:v1:` prefix as plaintext**. (b) `provider_config.json` (personal provider config, `packages/provider-node`): `access.apiKey` is stored **as plain JSON text** — there is no encryption in that codec. This is the larger exposure for an API-key pilot.
- **[source]** Consumers: Main (`createCredentialService()` for telemetry loaders), Host utilityProcess (service graph: oauth, usage, feedback, bots, etc.), the renderer through the registered RPC `ICredentialService` (it can `load` any credential), and the agent, which Host spawns as `ELECTRON_RUN_AS_NODE` with an env of `sanitizeZCodeRuntimeEnv(process.env)` plus provider-config path variables; the agent reads `credentials.json` and `provider_config.json` itself and refreshes OAuth tokens by writing the file under the shared file lock.
- **[source]** Writes: `atomicWritePrivateTextFile` (temp file in the same directory, `mode: 0o600`, rename with retry; the mode has no ACL effect on Windows) under `withFileLock`. A corrupt or schema-invalid file is copied to `credentials.json.corrupt-<hash>.bak` (a credential-bearing copy) and the read throws.
- **[source]** The only existing hint at OS protection is a comment in `credentialService.ts` saying Host would need to ask Main to encrypt/decrypt.

### Feasibility, pinned Electron 41.0.3 (Chromium 146, Node 24.14.0)
- **[observed, typings]** `safeStorage` is declared only in the `Main` namespace of `electron.d.ts`. **[observed, probe]** In a `utilityProcess`, `require('electron')` exposes only `net, systemPreferences`. So Host and the agent cannot call it; Main must be the only key custodian.
- **[observed, probe, Windows]** `isEncryptionAvailable()` true; ciphertext starts `v10`; the key lives in `<userData>\Local State` → `os_crypt.encrypted_key` with a `DPAPI` prefix (Windows user-scoped DPAPI). A different `userData` cannot decrypt it. A tampered blob throws.
- **[observed, probe]** **`decryptString` aborts the whole process** (exit 127, `out_of_range` in Chromium C++) for a `v10` blob shorter than about 15 bytes (3, 8 bytes and the bare prefix aborted; 15 bytes and half-length threw normally); an empty buffer returns `""` without throwing. Any design must validate the envelope (prefix, minimum length ≥ 3+12+16, our own length field) before calling `decryptString`, and treat empty plaintext as an error.
- **[inferred]** Boundaries: protects against another OS user, offline copy of the profile to another user/machine, and accidental copying in backups/bundles. It does **not** protect from malware or any tool running as the same Windows user (DPAPI is callable by it); a model-run tool in the agent runs as that user.

### Recommendation
Explicit re-entry into a **new** Graph-flavor store; no automatic transition of `enc:v1:`.
- New file (for example `credentials.v2.json`) written only in the Graph flavor, so older binaries find nothing instead of mis-reading values (an older reader would treat an `enc:v2:` string as plaintext and use the ciphertext as the secret).
- Key custody in Main: a random 32-byte data key generated once, stored as `safeStorage.encryptString(base64(key))` in a small private file. Values: AES-256-GCM `enc:v2:` with that key. Both existing implementations (Host and CLI) change together and share test vectors.
- Hand-off of the data key: Main → Host over the utility-process parent port; Host → agent through a start-up message on the existing stdio pipe, **not** environment variables (the agent's env reaches tool processes). Agent token refresh writes use the same key.
- Provider API keys move out of `provider_config.json` into the credential store by reference (schema field change in `packages/provider`), or are wrapped in the same envelope.
- Legacy: a Graph-profile `credentials.json`/plaintext `apiKey` is detected, never decrypted or used automatically, and shown as "stored in the old format — re-enter"; deleting the legacy files and `*.corrupt-*.bak` copies is an explicit user action. Anything entered under the old format should be rotated; copies may persist in backups/shadow copies, which the product cannot remove.
- Failure cases to specify: OS protection unavailable → refuse to store (no plaintext or derivable-key fallback); wrong key/corrupt blob → fail closed, preserve file, ask re-entry; two writers → existing file lock plus verify-after-write (decrypt a read-back before reporting success); downgrade → old binaries cannot read the new file (documented).
- Why not transition: the only legacy data would be from test builds; migration would copy secrets through the derivable key and leave old copies.
- **Operator decisions:** accept re-entry for any Graph test credential; whether provider API keys by reference is in scope for the first pilot.

### Acceptance tests (proposed)
Shared format vectors across both implementations; tampered/truncated/empty blob cases (including the abort case) never reach `decryptString`; no plaintext on disk after save (byte scan); legacy files are not decrypted; unavailable-protection path refuses; concurrent Host+agent writes; packaged probe with synthetic values only.

## Decision 2 — network egress and Feedback (PARTIAL)

### Source-confirmed paths
- **Automatic, Main:** `desktopContextPromptRollout`/`rendererActionTraceRollout` and `desktopHelpConfig` use Electron `net` to `<endpoint>/api/v1/client/configs` with source headers including a persistent `deviceMid`; `maybeBlockStartupForForceUpdate` runs only for the `production` flavor; the auto updater is initialised with `enabled: flavor === "production"` (so off for Graph). Telemetry: Z8.1 policy (ARMS/report/OTLP scrubbed for Graph).
- **Automatic, Host and agent:** `IClientConfigService` (`/api/v1/client/configs`, platform `<os>-<arch>`), `IClientScenesService` (`/api/v1/client/scenes`), built-in provider catalog refresh from the endpoint/CDN (platform string `windows-x86_64`).
- **[observed]** The packaged corrected candidate, fresh profile, no provider/account, endpoints redirected to the loopback fixture, made **7 startup requests**: `client/configs` ×6 (5 with `platform=win32-x64`/`windows-x86_64` variants) and `client/scenes` ×1 (in the upgrade-matrix evidence `configRequestPaths`). So "no model requests" is not "no outbound traffic". The default (unredirected) origins are `zcode.z.ai`, `chat.z.ai`, `api.z.ai`, `bigmodel.cn`, `cdn-zcode.z.ai` (`packages/shared/src/zcodeEndpoint.ts`, `plugin-marketplaces.ts`).
- **Explicit:** sign-in/account sync, usage, coding-plan, settings sync, bots, official MCP and plugin marketplace (default marketplace source on `cdn-zcode.z.ai`), conversation share; **Feedback**: `POST /feedback/ticket` and `/feedback/attachment/upload-credential`, with an attachment upload to a server-chosen object-storage location and optional log archives; the Feedback centre exists in the UI with no Graph gating found **[inferred]**; `config/default.json` also carries an upstream form URL.
- **User-selected model traffic:** the configured provider base URL(s) from the agent.
- **Unverified:** whether MCP servers or hooks declared in a workspace start automatically and contact the network at session start (measure with a loopback MCP server).

### Recommended Graph-flavor policy
1. **Forbidden automatic traffic:** telemetry, updates, any request that carries `deviceMid`, plugin/marketplace refresh.
2. **Automatic configuration fetches** (`client/configs`, `scenes`, catalog refresh): off by default in the Graph flavor, using bundled configuration; the force-update/rollout/help consumers are not started. Operator decision: whether stale built-in model lists are acceptable, or a user-triggered "refresh catalog" action is wanted.
3. **Explicitly requested catalog/account operations:** only on a user action, recorded destination.
4. **Model traffic:** only to the user-selected provider endpoints.
5. **Feedback:** disabled upload in the first internal release; the local previewed support bundle (below) replaces it. Operator decision: whether any upload endpoint should exist.

### Measurement design (proposal; one feasibility probe run)
- **[observed, probe: Electron 41.0.3/Node 24.14.0]** With `--proxy-server=<local recorder>` and `--proxy-bypass-list=<-loopback>`: Main `net.fetch` (HTTP and HTTPS as `CONNECT host:443`), renderer `fetch` and utility-process `net.fetch` were all recorded by the recorder and by `--log-net-log`, without any DNS. Node `fetch` in the utility process **bypassed** the proxy (reached a direct loopback listener); it was recorded only when `NODE_USE_ENV_PROXY=1` with `HTTP(S)_PROXY` was set. Raw TCP sockets were never recorded.
- So a Chromium proxy covers Main, renderer and `net` users only; the Host's Node stack and the agent (a Node process launched through `ELECTRON_RUN_AS_NODE`) are covered only for HTTP(S) through global fetch/http when the env-proxy variable is injected; custom agents, raw sockets, DNS, UDP and child processes (MCP servers, hooks, tools) are not.
- Add read-only OS observation (per-PID connection sampling, DNS-cache diff) as evidence, not as containment.
- **Prerequisite before any production-environment launch (endpoints not redirected):** a containment layer that does not exist yet without extra authorization — an operator-created outbound block rule for the test executables (admin) or an isolated VM/Sandbox (Z8.4). Until then only the redirected-endpoint mode (as in the existing harness) may run. No firewall, proxy, certificate or network setting was changed here.
- Positive control per path (instrument must record a known attempt): Chromium/renderer/utility (probe done), Node env-proxy (probe done), report telemetry (control exists), **OTLP (not established for the current source)**, **ARMS (no successful control)**, Feedback (explicit submission to a loopback endpoint), catalog/account (explicit action to loopback), MCP (loopback server).

### Acceptance tests (proposed) and implementation scope
**NOT DONE** in detail: gating of the Main rollouts/help config, client-config/scenes/catalog consumers and Feedback by the Graph flavor; a packaged start-up case asserting zero attempted external destinations; recorder tooling. Implementation scope should be limited to those gates plus the measurement harness.

## Decision 3 — ASAR integrity

- **[observed, read-only, corrected package `dist-graph-z82c`; original `dist-graph-z82` identical in kind]** Fuses: RunAsNode 1, CookieEncryption 0, NodeOptionsEnvironmentVariable 1, NodeCliInspectArguments 1, **EmbeddedAsarIntegrityValidation 0**, OnlyLoadAppFromAsar 0, BrowserProcessSpecificV8Snapshot 0, GrantFileProtocolExtraPrivileges 1, and a ninth fuse (value 1) that the repo's `@electron/fuses` 1.8.0 does not name. Embedded record `a5db15a7…1b29` ≠ archive header SHA-256 `32178ad0…cc0e` (z82: `91428e4b…c60e` vs `9d403788…2c93`). The two hashes use the same definition (verified on a synthetic archive: electron-builder `hashHeader` equals the verifier's value).
- **[source + build log]** Cause: in app-builder-lib 26.8.1 `doPack`, the integrity is computed and written into the exe (`addWinAsarIntegrity`) **before** `afterPack`; the repo's `afterPack` then rewrites `app.asar` twice (24 hoisted runtime modules injected, then 5,615 files stripped of sourcemap references — see the z82c build log), so the embedded record is stale. No `electronFuses` setting exists, so the fuse stays at Electron's default (off). `addWinAsarIntegrity` **appends** a resource entry, so calling it again would duplicate it.
- **Proposed correction:** after the last `afterPack` rewrite, recompute the header hash and **replace** the `ELECTRONASAR` entry (using the transitive `resedit`, no new dependency in `package.json` — operator decision on that coupling), then set `electronFuses.enableEmbeddedAsarIntegrityValidation: true` (builder flips fuses after `afterPack`, before signing). Add a build/inspection assertion: recorded value equals the archive header hash and the fuse is on. Keep `RunAsNode` on: the agent and CUA helpers are launched as `ELECTRON_RUN_AS_NODE`.
- **CLI/runtime launch path:** the agent script is `resources/glm/zcode.cjs`, outside `app.asar`; integrity validation covers `app.asar` only. Acceptance must prove the packaged agent still launches with the fuse on. The unpacked native files and the unsigned exe are not covered: integrity here is accident/tamper evidence, not a defence against a same-user attacker. Other fuses (NodeOptions, inspect, V8 snapshot) are separate operator decisions; none was changed.
- **Tests:** unit test of the replace-not-append function on a synthetic exe resource; inspection check; packaged smoke with the fuse on; unchanged retained binaries.

## Implementation order (outline)
A. 1) ASAR integrity (smallest, isolated build step) → 2) Graph-flavor network gates + measurement harness (redirected mode first; production-env launch only after containment) → 3) credential store (largest; protocol hand-off to the agent).
B. Local previewed support bundle from allowlisted metadata (identity, versions, capability flags, profile shape, run statuses and opaque ids, redacted log tail); logs, prompts, source, raw records, provider configuration and credentials excluded by default; canary tests per exclusion class; no upload.
C. Runtime capability probe and upstream-compatibility checks.

## NOT DONE / open
Full failure-case tables and acceptance lists for decision 2; exact file-level scope for A2/A3; B and C details; the MCP/hook start-up question; the ninth fuse's name; committing the probe evidence. No real credentials or profiles were read.
