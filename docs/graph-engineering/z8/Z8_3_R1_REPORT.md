# Z8.3-R1 implementation report

This is **Z8.3-R1 only**. Windows and native packaged acceptance remain deferred. This does **not** make Z8.3 complete or release-ready. Out of scope and untouched: credential store, production-egress measurement, ASAR/fuses, support bundle, tool-permission policy, MCP/hooks, CI/workflows/rulesets, upstream merge, main.

Spec: `Z8_3_R1_SPEC.md`. Merge checklist: `Z8_3_R1_UPSTREAM_MERGE_CHECKLIST.md`.

## Minimum capability set Graph requires

Derived from Graph's actual calls (classification table in the spec); version strings are never consulted.

| Kind                         | Required                                                                                                                                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Protocol identity (exact)    | `ZCode Protocol`, version `1`, V4 wire version `3`                                                                                                                                                                |
| Session methods              | `session/create`, `v4/conversation/subscribe`, `v4/command`, `workspace/updateInteractionPreferences`                                                                                                             |
| Recipe methods               | `session/recipe/start`, `session/recipe/inspect`, `session/recipe/cancel`                                                                                                                                         |
| V4 commands                  | `sendText`, `stop`, `resolveInteraction`                                                                                                                                                                          |
| Interaction registry feature | `interaction.protectedSessions` (protected Graph sessions are never auto-answered)                                                                                                                                |
| Existing capability          | `runtime/capabilities.independentPlanState === true`                                                                                                                                                              |
| Classified but not required  | Host-synthesized V4 hello/initialize, runtime identity/lifecycle (Host-local), `workspace/previewExecutionEnvironment` (already fails at admission with zero records), `process/childProcesses`, unsubscribe/flow |

## Where it is checked in the lifecycle

`GraphEngineeringService.run` admission: after the existing duplicate-request / unresolved-attempt / revision / checks / preflight checks and `native.available()` (settings and model registry; no agent contact), **before** `createRunPlan` and the first commit. The gate initializes the workspace the way the matching `create()` does (`native-recipe` purpose for Tool-only workflows, which need no model), reads `runtime/capabilities` (raw, cached per protocol client, never cached on failure) and evaluates it with a pure function. `getWorkspace().availability` is unchanged (no agent contact). Not re-probed: `continue`, approvals and recovery for already-admitted runs (bound to the run's pinned runtime identity and the existing expected-runtime/retirement checks).

## Failure semantics

An incompatible runtime is an **admission/runtime-compatibility failure**: `run()` throws `GraphRuntimeIncompatibleError` (`name` `GraphRuntimeIncompatible`) with `{failures:[{class, expected, observed}], omitted}`. No run record, no native session, no input, no Tool operation, no retry, no agent download/replacement, no fallback; existing recovery/history untouched; it is neither a Test failure nor reviewer evidence. Classes: `capabilities-unavailable` (method-not-found or no `nativeContract`), `capabilities-malformed`, `protocol-identity`, `protocol-version`, `wire-version`, `missing-method`, `missing-command`, `missing-feature`, `plan-state`, `probe-failed` (transport error; its text is dropped). `observed` is an integer, `absent`, `unreadable`, `no response`, `<invalid>` or a string matching `^[A-Za-z0-9 ._-]{1,48}$`; a runtime-provided list is never echoed (a missing item is reported by its expected name). At most 8 failures (overflow counted), message ≤ 600 characters. The same request can be retried after the runtime is fixed.

Backward compatibility: one optional additive key `nativeContract` on the existing `runtime/capabilities` result (`protocol`, `methods`, `commands`, `features`), unversioned (a set of names; unreadable shape fails closed). `zcodeRuntimeCapabilitiesSchema` and Chat's `ensureIndependentPlanSupport` are unchanged and never parse the new key.

## Upstream-boundary-to-test matrix

| Boundary                                                                   | Test                                                                                                                                                     |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Protocol identity / version / wire version                                 | `graphUpstreamContract` (frozen set, audit, older-identity and wire-bump mutations); `runtime-contract.test.ts` (exact match)                            |
| `session/create` result protocol parse                                     | `graphUpstreamContract` (real `zcodeSessionStateSnapshotSchema.shape.protocol`, accepts identity, rejects older, rejects a moved schema)                 |
| Required session methods (presence, dispatch)                              | `runtime-contract.test.ts` (each missing); CLI `native-contract.test.ts` (every advertised method has a `case` in `server.ts`); `graphUpstreamContract`  |
| Required recipe methods + request/response parsing                         | `graphUpstreamContract` (Graph's real Tool port requests parsed by the shared contracts; snapshot sample; renamed/removed/changed-shape mutations)       |
| V4 command parsing and handler registry                                    | `graphUpstreamContract` (real `sendText`/`stop` envelopes through `parseCommandEnvelope`; handler-registry source; dropped-handler case)                 |
| Interaction preferences request (`protectedSessionIds`)                    | `graphUpstreamContract` (shared params schema)                                                                                                           |
| Interaction registry behavior                                              | `interaction-registry.test.ts`; CLI `native-contract.test.ts`; `graphUpstreamContract` (audit + broken-registry mutation)                                |
| Notifications / frames Graph orchestrates on                               | `graphUpstreamContract` (turn header + `activeWorks` yields a running fact with the foreground id) plus the existing `observer.test.ts`/`native.test.ts` |
| Agent declaration ↔ Host evaluator pairing                                 | `graphUpstreamContract` (real builder output accepted; removing any required name rejected)                                                              |
| Admission ordering, zero side effects, retry, duplicate not re-probed      | `runtime-admission.test.ts`                                                                                                                              |
| Production composition wires the gate                                      | `graphRuntimeComposition.test.ts`                                                                                                                        |
| Capability read: raw, method-not-found, per-client cache, no failure cache | `runtimeCapabilities.test.ts`                                                                                                                            |
| Bounded diagnostics, malformed, extras tolerated                           | `runtime-contract.test.ts`                                                                                                                               |

## Changed files

Code: `packages/shared/src/native-runtime-contract.ts` (new), `packages/shared/src/zcode-protocol/index.ts` (+1 export), `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/native-contract.ts` (new), `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server.ts` (capabilities case + 2 imports), `packages/services/src/zcode-agent/runtimeCapabilities.ts` (new), `zcodeAgent.ts` (+interface method), `zcodeAgentService.ts` (+method, +import), `packages/services/src/graph-engineering/domain/native-runtime-contract.ts` (new), `app/runtime-ports.ts` (new), `app/service.ts` (gate call, `GraphServiceOptions`), `adapters/runtime-gate.ts` (new), `node.ts` (wiring), `CONTRACT.md` (+4 lines).
Tests: `packages/services/test/graphUpstreamContract.test.ts`, `packages/services/test/graphRuntimeComposition.test.ts`, `packages/services/src/graph-engineering/adapters/runtime-contract.test.ts`, `packages/services/src/graph-engineering/app/runtime-admission.test.ts`, `packages/services/src/zcode-agent/runtimeCapabilities.test.ts`, `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/native-contract.test.ts` (30 new tests).
Docs: this report, `Z8_3_R1_SPEC.md`, `Z8_3_R1_UPSTREAM_MERGE_CHECKLIST.md`.
Not touched: `.github/**`, `scripts/ci/**`, the suite manifest, `state.ts`, `sequencer.ts`, lockfile, package versions, fixtures.

One design note found while verifying: the gate option lives on `GraphServiceOptions` in `service.ts`, not in `GraphOptions`/`state.ts`. `state.ts` is imported by the sequencer, and the PR-scoped architecture check pulls dependents of changed files into scope, which surfaced the pre-existing 403-line `sequencer.ts` violation. The first commit did edit `state.ts`; the second reverted it.

## Test commands and results

Toolchain: Node 24.14.0 (downloaded tarball; the sandbox default is 22.22.0), pnpm 10.33.2, `pnpm install --frozen-lockfile --ignore-scripts` (native postinstall skipped, as in Cloud CI; nothing here needs it).

| Command                                                             | Result                                                                                                                                                                                               |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| focused: `node --import tsx --test` on the six new files            | exit 0; 10 + 4 + 3 + 8 + 1 + 4 = 30 tests, 30 pass                                                                                                                                                   |
| `pnpm typecheck`                                                    | exit 0                                                                                                                                                                                               |
| `pnpm lint`                                                         | exit 0; 0 errors, 75 warnings (the existing baseline; none in changed files)                                                                                                                         |
| `node scripts/ci/architecture-changed.mjs 6abed10`                  | OK, 0 violations (21 changed files)                                                                                                                                                                  |
| `node scripts/ci/format-changed.mjs 6abed10`                        | exit 0, all matched files formatted                                                                                                                                                                  |
| `node --test scripts/ci/*.test.mjs`                                 | exit 0; 18 tests, 18 pass                                                                                                                                                                            |
| `node scripts/ci/graph-cloud-suite.mjs` (the Cloud selector runner) | exit 0. scripts 23 files / 148 tests / 148 pass / 0 skipped; services 90 / 532 / 528 pass / 0 fail / **4 skipped (expected 4)**; ui 48 / 240 / 240 / 0; total 920 tests, 916 pass, 0 fail, 4 skipped |

Not run: `apps/zcode-cli` `tsc` (its workspace packages are not built here; the existing unresolved-module errors are unrelated and none is in `native-contract.ts`), the CLI's own runner, any live agent process.

## Seeded-mutation result

Each row edited one production file, ran the named suites, then restored the file; every restore was verified byte-exact (SHA-256 before = after) and the final `git status` showed no stray change.

| Mutation (production file)                                                  | Result                                                                       |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| rename `session/recipe/inspect` wire method (`zcode-protocol/index.ts`)     | RED: 3 failing (frozen set, audit, declaration pairing)                      |
| change recipe snapshot status vocabulary (`native-recipe.ts`)               | RED: 3 failing (audit, mutation case, outbound recipe parse)                 |
| agent declaration omits recipe inspect (`native-contract.ts`)               | RED: 3 failing (audit, dropped-handler case, pairing)                        |
| server loses the recipe inspect dispatch case (`zcode-protocol/server.ts`)  | RED: 1 failing (dispatch cross-check)                                        |
| V4 wire version 3 → 4 (`zcode-protocol-v4/core.ts`)                         | RED: 2 failing (frozen set, audit)                                           |
| interaction registry ignores the protected list (`interaction-registry.ts`) | RED: 6 failing (4 existing registry tests, `native-contract.test.ts`, audit) |
| composition root stops wiring the gate (`node.ts`)                          | RED: 1 failing (`graphRuntimeComposition`)                                   |
| service skips the gate at admission (`service.ts`)                          | RED: 4 failing (admission tests, composition)                                |

The in-suite audit also carries eight in-memory mutations (removed/renamed recipe method, changed response shape, older protocol identity, removed feature, moved schema, broken registry, wire bump) that must each be reported.

## Revisions

- Source/test code SHA: `533c898` (feature commit `bc11bbe` + fixup `533c898`). The final PR head is this report's commit on top; the pushed head and the check results are in the PR.
- Integration base verified at `6abed100fe5e18b215aa9d3fedaf0337b768549c` immediately before pushing (unchanged since the start of the task).

## Remaining unverified boundaries

- A live agent process: no portable test starts one. The `commands` list is `Object.keys(NATIVE_HANDLERS)` at runtime, but the registry cannot be imported under the CI runner (unbuilt workspace packages), so the suite reads the handler sources, and the builder is tested with an injected list. The `server.ts` dispatch is cross-checked as source text, not executed.
- `methods` is a curated advertised subset: a new dispatch gap for a method outside the list would not be detected (by design; Graph's set is what is pinned).
- Continuation, approval and recovery paths are not re-probed (documented in the spec).
- The Tool-only (`purpose: "tool"`) admission mapping is covered by the gate adapter test and review, not by a dedicated service-level test.
- Windows, packaged-build and manual acceptance remain deferred.
