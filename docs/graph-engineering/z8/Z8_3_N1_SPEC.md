# Z8.3-N1 — Graph automatic-network gates and Feedback blocking (spec)

Status: bounded implementation of the network/Feedback part of Decision 2 in `Z8_3_DECISIONS.md`. Authorized scope is exactly this document; the other Z8.3 proposals (credentials, support bundle, measurement harness, runtime-capability work) are **not** approved and not touched. This is not "Z8.3 complete" and carries no packaged, Windows or production-egress evidence.

## Product rules

1. Graph (`flavor === "graph"`) makes **no automatic upstream configuration or catalog request**. It uses the bundled/default configuration. Stale bundled catalogs are accepted.
2. **Explicit** user-triggered catalog/account operations that exist today stay reachable: the Provider Settings refresh (`refreshSources`, `force: true`), the Plugin Store top-bar/per-source refresh and "check for updates" (`marketplace/update`, `getSnapshot({ forceRefresh: true })`), sign-in/account/usage/etc. No new refresh UI is added, and no startup call is relabelled as a user action. At the Host client-config boundary `forceRefresh === true` is the existing explicit signal (the only caller is the Plugin Store refresh button); every non-forced read is automatic.
3. **Feedback submission and uploads are unavailable in Graph**: the service refuses, the UI entry points are removed or refuse with an explanation, and no local "support bundle" replaces them.
4. Model traffic to the user-selected endpoint, native tool permissions, configured MCP and hooks are neither disabled nor redefined. Credentials, tokens, provider secrets and settings are not read or modified by this change. No hostname denylist, no `fetch` interception.
5. Missing/unknown policy decisions deny the affected automatic action. Production and Preview behave exactly as before.

## Policy owner (single)

`packages/shared/src/env.ts`, next to `resolveAutomaticTelemetryPolicy`:

- `resolveAutomaticNetworkPolicy(flavor)` → `{ desktopRollout, helpConfig, clientConfig, clientScenes, builtinProviderCatalog, pluginMarketplace }` (all booleans). `production`/`preview` → all `true`; `graph` **and any other value** → all `false`.
- `resolveFeedbackSubmissionPolicy(flavor)` → `{ allowed }` (same rule).
- Agent transport (existing Host→agent spawn-env channel, no protocol change): Host writes `ZCODE_AUTOMATIC_NETWORK_DENY=<comma-separated denied classes>` (empty for non-Graph). `resolveAutomaticNetworkPolicyFromEnv(env)`: variable absent/empty → nothing denied (standalone CLI, not governed by a product flavor; Host always sets the variable, so a Host-launched Graph agent cannot be missing it); any unknown token → **deny all**.

Consumers read the decision from this owner. Services-level consumers take the flavor from the compile-time `ZCODE_PRODUCT_FLAVOR` (as `agentTelemetryEnv` does) with a test-only override option.

## Consumer behavior (Graph)

| Path                                                                                                            | Decision                          | Behavior when denied                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main desktop-context-prompt / renderer-action-trace rollouts (`/api/v1/client/configs`, `deviceMid` headers)    | `desktopRollout`                  | `refresh()` and `awaitFirstDecision()` return the default (disabled) snapshot immediately: no request, no timer, no 2 s first-host wait                                                                                                                                                  |
| Main help-config reader (`/api/v1/client/configs`)                                                              | `helpConfig`                      | reader resolves "no remote config"; feedback/community resolution falls back to bundled `config/default.json` through the existing contract                                                                                                                                              |
| Host `IClientConfigService`                                                                                     | `clientConfig`                    | non-forced reads return `{ pluginStoreOrder: null }` without resolving a request context or touching the cache; `forceRefresh: true` keeps the explicit path                                                                                                                             |
| Host `IClientScenesService`                                                                                     | `clientScenes`                    | `list()` returns `{ code: 0, data: [] }` with no request                                                                                                                                                                                                                                 |
| Host built-in provider sync                                                                                     | `builtinProviderCatalog`          | the 60 s background check (and the start-time check) skips the download; bundled/Active file stays authoritative; recovery listeners (local) still run; explicit `refreshZCodeBuiltin({ force: true })` unchanged                                                                        |
| Agent built-in provider sync (CLI registry runtime)                                                             | `builtinProviderCatalog` via env  | same runtime option as Host                                                                                                                                                                                                                                                              |
| Agent suggested-plugin official-marketplace refresh                                                             | `pluginMarketplace` via env       | no refresh; already-installed/known entries resolve locally, a missing one is `unavailable` (never installed from a stale snapshot)                                                                                                                                                      |
| Plugin Store "catalog auto-refresh" on page entry (UI)                                                          | `pluginMarketplace`               | `claimMarketplaceAutoRefresh` returns `false`; explicit refresh buttons unchanged                                                                                                                                                                                                        |
| Feedback service (`create`, `comment`, `uploadAttachment*`, `attachLogsFromExport`, `prepareCompactLogArchive`) | `resolveFeedbackSubmissionPolicy` | throws `FeedbackSubmissionDisabledError` first, before ticket creation, device snapshot, progress events, credential/token reads, temp files, log archive preparation, upload-credential requests or object-storage upload; no fallback upload client                                    |
| Feedback UI and Main entry points                                                                               | same policy                       | feedback store refuses `openSubmit/openFeatureRequest/openTickets/openSubmissionJob`; Help-menu, quick-pick, error-banner, task-menu and remote-connection entries are hidden; Main `OpenFeedback` command and application-menu item do not open the dialog **or the upstream form URL** |

`list/get/getDeviceSnapshot/cancel*/cleanup/reveal` are not submissions and keep their contracts.

## Acceptance (synthetic fixtures, loopback only)

All new tests live in already-selected `packages/services/test/` (so they run under the required CI without any manifest change) and are labelled where they use a mock or a source-text guard.

1. Policy: Graph denies every class; production/preview allow every class; unknown flavor denies; env round-trip; unknown env token denies all; absent env allows.
2. Rollout / help config / client-config / scenes / provider runtime / suggested-plugin gate: with Graph policy a loopback recorder receives **zero** requests, including after advancing fake timers; the bundled/default value is returned and nothing hangs. Positive controls: with production/preview policy the same fixture **does** reach the loopback recorder.
3. Explicit paths stay reachable under Graph: `getSnapshot({ forceRefresh: true })` and `refreshZCodeBuiltin({ force: true })` reach the loopback recorder; a user-selected model request to a loopback origin is unaffected (the policy has no hostname logic).
4. Feedback: every guarded method rejects under Graph with the HTTP recorder, the temp dir and the archive spy untouched; production still creates a ticket against the loopback server.
5. Mutation guard: deliberately restoring a denied request or removing the Feedback guard fails the corresponding test (checked once by hand and recorded in the report).
6. Source-text guards (labelled) assert the wiring in `node.ts`, Main `index.ts`, the agent spawn env and the UI entry points, because those files cannot be imported without Electron.

## Limits (not claimed)

No packaged-app, Windows or production-egress measurement; not "zero egress". Uncovered: MCP, hooks, tools, raw sockets, other fetches in the product, explicit account/usage calls, community/docs links opened in the user's browser on request. The OTLP and ARMS positive-control gaps from Z8.1 remain.
