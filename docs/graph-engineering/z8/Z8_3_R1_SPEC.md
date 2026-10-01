# Z8.3-R1 — Graph native-runtime capability validation and upstream-compatibility contract (spec)

Status: bounded implementation of proposal **C** in `Z8_3_DECISIONS.md`. The authorized scope is exactly this document. The credential-store redesign, production-egress measurement, Windows validation and every other Z8.3 proposal stay **unapproved and untouched**. This is **Z8.3-R1 only**.

## Problem

Graph is built on one native-agent protocol and a few session/recipe operations. An older, mismatched or upstream-changed agent can fail only _after_ Graph has persisted a run and created a native session (the run then ends `Unknown` with an unrelated parse or method-not-found message). R1 moves that discovery to admission, fails closed with a readable local error, and keeps a small regression suite for the upstream interfaces Graph really uses.

Not in scope: a general native-agent rewrite, feature negotiation, an upstream merge, any change to ordinary Chat, tool-permission policy, MCP/hook policy, CI, `.github/**`, credentials, network policy, the support bundle, ASAR or Windows packaging.

## What Graph actually uses (classification)

Derived from `graph-engineering/adapters/{native,observation,tools}.ts`, `app/service.ts` and `app/input-guard.ts` (calls into `IZCodeAgentService` / `IZCodeSessionService`).

| Operation Graph performs                                      | Wire request                                                                                        | Class                                                                     | Why                                                                                                                                                                                                            |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| create native / Tool session                                  | `session/create` (result carries `protocol {name, version}`)                                        | **required (session)**                                                    | A mismatched protocol is today discovered by the result schema _after_ the session exists.                                                                                                                     |
| subscribe to a session and observe facts                      | `v4/conversation/subscribe`                                                                         | **required (session)**                                                    | Observation is the only evidence source.                                                                                                                                                                       |
| send the frozen input / cancel the owned foreground execution | `v4/command` types `sendText`, `stop`                                                               | **required (command)**                                                    | Dispatch and targeted cancel.                                                                                                                                                                                  |
| keep native question responses available                      | `v4/command` type `resolveInteraction`                                                              | **required (command)**                                                    | `CONTRACT.md`/`input-guard.ts`: native permission and question responses must stay possible while Graph owns a session.                                                                                        |
| protect Graph sessions from automatic question resolution     | `workspace/updateInteractionPreferences` with `protectedSessionIds`; interaction registry exclusion | **required (session) + required feature** `interaction.protectedSessions` | Without it a Graph question can be auto-answered.                                                                                                                                                              |
| plan flag in `sendText` payload                               | existing `runtime/capabilities.independentPlanState`                                                | **required (existing capability)**                                        | Graph always sends `planEnabled`; an older runtime strips it.                                                                                                                                                  |
| start / inspect / cancel a Tool command                       | `session/recipe/start`, `session/recipe/inspect`, `session/recipe/cancel`                           | **required (recipe)**                                                     | The whole Tool path; snapshot shape is `zcodeRecipeSnapshotSchema`.                                                                                                                                            |
| capability read                                               | `runtime/capabilities`                                                                              | **required (probe)**                                                      | The probe itself.                                                                                                                                                                                              |
| V4 `hello` / `clientHello`                                    | none: answered by the Host (`helloConversationV4`), the agent is not contacted                      | not a runtime capability                                                  | The Host synthesizes it; it cannot prove anything about the agent. `workflowRunDeltas` is optional and only read from the Host's own hello.                                                                    |
| runtime identity / retirement / lifecycle events              | Host-local process manager                                                                          | not a runtime capability                                                  | Owned by the Host process manager.                                                                                                                                                                             |
| `workspace/previewExecutionEnvironment` (workflow preflight)  | request                                                                                             | **excluded**                                                              | Called before the run record is committed, so a missing method already fails at admission with zero records. Only template workflows need it; requiring it for every run would reject runs that do not use it. |
| `process/childProcesses`                                      | request                                                                                             | **excluded**                                                              | Best-effort resource sampling; failure never changes a run.                                                                                                                                                    |
| `unsubscribe`, connection flow                                | request                                                                                             | **excluded**                                                              | Cleanup / transport hygiene; a failure here cannot create or hide a run.                                                                                                                                       |

The requirement set is therefore:

```
protocol      ZCode Protocol, version 1, V4 wire version 3   (exact match)
methods       session/create, v4/conversation/subscribe, v4/command,
              workspace/updateInteractionPreferences,
              session/recipe/start, session/recipe/inspect, session/recipe/cancel
commands      sendText, stop, resolveInteraction
features      interaction.protectedSessions
existing      runtime/capabilities.independentPlanState === true
```

The same CLI version string does not imply any of this; version strings are never consulted.

## Capability description (backward compatible)

`runtime/capabilities` already exists: the agent returns `{ independentPlanState: true }`, and the Host's Chat path parses it with `zcodeRuntimeCapabilitiesSchema` (non-strict, unknown keys ignored). R1 adds one **optional additive key** and nothing else:

```ts
nativeContract?: {
  protocol: { name: string; version: number; v4WireVersion: number };
  methods:  string[];   // protocol methods this runtime dispatches (a deliberately small list)
  commands: string[];   // v4 command types with a native handler
  features: string[];   // named behaviors that are not a method (e.g. interaction.protectedSessions)
}
```

- Defined once in `packages/shared/src/native-runtime-contract.ts`; both the agent (builder) and the Host (evaluator) import it. The shape is not versioned: it is a set of names that grows by adding names, and a shape the Host cannot parse fails closed. A schema number would add a second compatibility axis for no benefit.
- Non-Graph consumers are unaffected: `zcodeRuntimeCapabilitiesSchema` is unchanged and ignores the new key. A malformed `nativeContract` can never break Chat's `ensureIndependentPlanSupport`, because that path never parses it.
- Producer truthfulness (agent): `commands` is `Object.keys(NATIVE_HANDLERS)` (the executor's own registry); `features` come from constants exported next to the implementation (`V4_INTERACTION_REGISTRY_FEATURES`) and are exercised by the real `V4InteractionRegistry` in its test; `methods` is the advertised subset, and a test fails if `server.ts` has no `case` for any advertised name.
- Interpretation by the Host is conservative: the runtime is **compatible only if every required name is present**. Absent metadata (method-not-found, or a result without `nativeContract`) is **not compatible**. Semver is never inferred. Extra names (unknown additional capabilities) are ignored.

## Admission probe

```
Renderer          Host: GraphEngineeringService.run()                      Agent (runtime/capabilities)
 run(requestId) -> duplicate request? -> return existing (no probe)
                   unresolved attempt / revision / checks / preflight checks (unchanged)
                   native.available()   (settings/model registry; unchanged, no agent contact)
                   runtime.require(target, "model" | "tool")  --------------->  initialize workspace (existing warm-up)
                                                                                runtime/capabilities
                   evaluate(response)   (pure, closed requirement set)
                   incompatible -> throw GraphRuntimeIncompatibleError   (nothing committed, no native session)
                   compatible   -> createRunPlan -> commit -> dispatch (unchanged)
```

- **Owner:** `GraphEngineeringService.run` admission, immediately after the existing availability check and before `createRunPlan`/commit. This is the earliest point with a target workspace and the last point before any state or native session exists. Nothing else changes.
- **Port:** `GraphOptions.runtime?: GraphRuntimeGate` (`require(target, purpose)`), implemented by `adapters/runtime-gate.ts`, wired once in `node.ts`. The gate initializes the workspace the same way the matching `create()` does (`model` for Task workflows; `native-recipe` for Tool-only workflows, which need no model), then asks the agent service for `runtime/capabilities`.
- **Agent service:** new read method `readRuntimeCapabilities(target)` on `IZCodeAgentService`. It returns the raw result (or `{supported:false}` for method-not-found) so the evaluator, not a transport schema, decides compatibility. The result is cached per protocol client: a restarted or replaced agent is a new client and is re-probed; failures are never cached.
- **Not probed (documented limitation):** `continue` on an already-admitted routing run, approvals and recovery paths. They are bound to the run's pinned `runtimeIdentity` and the existing expected-runtime/retirement checks; adding a second probe there would risk changing recovery semantics.
- A missing `runtime` option (test fixtures that do not exercise the boundary) skips the probe. Production composition (`createGraphEngineeringService`) always supplies it and a test pins that.

## Failure semantics

An incompatible runtime is an **admission/runtime-compatibility failure**:

- `run()` throws `GraphRuntimeIncompatibleError` (`name` = `GraphRuntimeIncompatible`) **before** `createRunPlan` and before any commit: no run record, no native session, no input, no Tool operation, no retry, no automatic upgrade/replacement of the agent, no fallback to a model-only path. Recovery and history (existing records) are untouched. Because no run exists, it can be neither a Test failure nor reviewer evidence.
- Checks admission wraps errors thrown there with `GraphChecksAdmissionRejected`; the compatibility error is thrown by the same admission block, so it is shown there as an admission rejection too.
- The error carries a bounded `diagnostic`:
  `{ failures: [{ class, expected, observed }] }` with `class` one of `capabilities-unavailable`, `capabilities-malformed`, `protocol-identity`, `protocol-version`, `wire-version`, `missing-method`, `missing-command`, `missing-feature`, `plan-state`, `probe-failed`.
  - `expected`: a fixed string from the requirement set (a protocol/version/name or a required method/command/feature).
  - `observed`: a bounded safe summary only: an integer, `absent`, `unreadable`, or a short string matching `^[A-Za-z0-9 ._-]{1,48}$` (anything else prints `<invalid>`). Runtime-provided lists are never echoed back: a missing item is reported by its _expected_ name.
  - At most 8 failures; the message is built from fixed templates and is at most 600 characters. No prompts, source, tool output, credentials, environment values, paths or provider data can enter it. Transport/timeout errors from the probe produce `probe-failed` with fixed text; the underlying error text is dropped.
- The message states: Graph did not start; the native agent build is incompatible; no agent was downloaded, replaced or retried.
- `getWorkspace().availability` is unchanged (it never contacts the agent); the incompatibility appears when the user starts a run.

## Upstream-compatibility contract suite

All inside the existing required selectors (no manifest change; `services` group):

- `packages/services/test/graphUpstreamContract.test.ts`: the contract suite. It uses the **real** shared parsers and constants (`zcodeSessionStateSnapshotSchema.shape.protocol`, `zcodeProtocolSessionMethodContracts`, `zcodeRecipeSnapshotSchema`, `parseCommandEnvelope`, `zcodeWorkspaceUpdateInteractionPreferencesParamsSchema`), Graph's real outbound traffic (the real Tool and native ports driven against stubs, their requests parsed by the shared contracts), the real `V4InteractionRegistry`, the real agent-side declaration builder and the real Host evaluator. Its only literals are the `FROZEN` Graph-built contract (protocol identity triple, nine method names, three command names, one feature): they are deliberate pins, because a _consistent_ upstream rename moves the Host and agent constants together and would otherwise go unnoticed. A single `boundaryViolations` audit runs on the real boundary and on seeded in-memory mutations.
- `packages/services/test/graphRuntimeComposition.test.ts`: the production composition root (`createGraphEngineeringService`) rejects an old agent at admission through the real ports.
- `packages/services/src/graph-engineering/adapters/runtime-contract.test.ts`: the evaluator (every required name individually, identity/version, malformed, extras, bounded diagnostics) and the gate adapter.
- `packages/services/src/graph-engineering/app/runtime-admission.test.ts`: admission ordering and zero side effects, retry after the runtime is fixed, no re-probe of a duplicate request.
- `packages/services/src/zcode-agent/runtimeCapabilities.test.ts`: raw read, method-not-found, per-client cache, no failure caching.
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/native-contract.test.ts` (selected by the v4 directory selector): the declaration parses, every advertised method has a `case` in `server.ts`, the server wires the declaration, and `interaction.protectedSessions` is true on the real registry.
- Real-source mutation proof (below, in the report): each mutation edits a production file, runs the suites, and restores it byte-exactly.

## Acceptance tests

Compatible accepted; old runtime (no method / no metadata) rejected; wrong protocol identity rejected; wrong protocol version and wire version rejected; one missing session method, one missing recipe method, one missing command, one missing feature rejected; malformed response rejected; unknown extra methods/commands/features/keys accepted; diagnostic bounded and free of canary content; rejection happens before `createRunPlan`/commit/native creation (counters stay zero) and the same request can be retried after the runtime is fixed; the supported flow is unchanged (existing service tests untouched and green); production composition wires the gate; mutations turn the suite red.

## Remaining unverified boundary

A live agent process is not started by any portable test: the CLI handler registry needs built workspace packages that the CI job (`--ignore-scripts`, no typecheck emit) does not have, so the `commands` list is the executor's own registry key set at runtime and is tested through the builder with an injected list, and the dispatch of every advertised method is cross-checked against `server.ts` source. A packaged-agent check on Windows remains deferred.
