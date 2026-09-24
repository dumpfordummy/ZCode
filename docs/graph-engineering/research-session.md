# Z1 session/runtime source investigation

Read-only source investigation, 2026-09-24. This records existing source facts and proposed seams; it is not implementation or runtime test evidence. No credentials, user app data, providers, or agent executions were accessed.

## Scope and prerequisites

Read repository `AGENTS.md`, `.agents/skills/architecture-governance/SKILL.md`, architecture policy, package manifest, and the four assignment references. The policy declares `session` as legacy with `packages/services/src/session/contract.ts` as entrypoint, but that file is absent in this checkout. Existing usable public service declarations are exported through `@zcode/services`.

Controlled context wrapper commands for `session`, `services`, and `shared` were attempted. All exited 1 before generation: `ERR_MODULE_NOT_FOUND: Cannot find package 'typescript' imported from scripts/architecture/policy.mjs`, Node v24.11.1. This is an environment limitation, not evidence of architectural approval.

## Normal chat's actual write path

- `packages/ui/src/hooks/useZCodeAgentService.ts`: resolves the selected workspace service through `useWorkspaceServices`; it does not create an independent agent.
- `packages/ui/src/v4/SessionPane.tsx`: the modern composer uses `dispatchSubmissionCommand`. A prewarmed draft sends `sendText`; an unprepared simple draft sends V4 `createSession` with `firstInput`. The two-step path creates a session then sends to the returned ID. Errors after possible admission preserve the original pending identity and do not fall back to a new session.
- `packages/ui/src/v4/agentConversationTransport.ts`: forwards `sendCommand` to `IZCodeAgentService.sendConversationCommandV4` and receives `onDynamicConversationFrame`.
- `packages/ui/src/v4/commandFactory.ts`: creates stable command IDs and envelopes. `packages/shared/src/zcode-protocol-v4/command.ts` contains their runtime schemas.
- `packages/services/src/zcode-agent/zcodeAgentConnectionScope.ts`: `createZCodeAgentConnectionScope` owns a trusted attachment, validates client identity/handshake, overwrites caller-supplied transport fields, and forwards commands.
- `packages/services/src/zcode-agent/zcodeAgentService.ts`: `sendConversationCommandV4` obtains the existing workspace process client via `getClient`, applies the same provider readiness, host tool capability gates, and ambient-context behavior, then issues `V4_METHODS.command` to the CLI.
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/v4-gateway.ts` and `command-inbox.ts`: command validation, per-session FIFO admission, duplicate lookup, and stable receipt handling.
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/session-flow.ts`: `sendText` resolves submitted model/mode, chooses normal native admission, and calls `startPromptTurn` with `inputId: envelope.commandId`.
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/prompt-turn.ts`: `startPromptTurn` invokes `record.app.sendInput` with the same input ID and query ID. Core owns the reservation and execution completion. ACK is an admission receipt, not terminal proof.

The host facade also has a legacy `sendPrompt` path for some attachment/replayable clients. Any ownership guard at the host boundary must cover it as well as V4 commands.

## Host graph adapter candidates

Existing public interfaces:

- `IZCodeSessionService` in `packages/services/src/zcode-session/zcodeSession.ts`: `initializeWorkspace`, `createSession`, `readSession`, `resumeSession`, and `readSessionEvents`.
- `IZCodeAgentService` in `packages/services/src/zcode-agent/zcodeAgent.ts`: V4 command, command query, conversation subscribe/resync/unsubscribe/rows-range, workspace-scoped wire frames, runtime lifecycle notifications, and legacy exact session events.
- Composition in `packages/services/src/node.ts`: `createZCodeAgentService`, `createZCodeSessionService`, `createZCodeTaskIndexSyncer`, and `createZCodeTaskServiceAdapter` share the same agent service.

`createZCodeSessionService.createSession` is the smallest existing creation seam that immediately syncs task visibility: it allocates a trace, calls `agentService.createSession`, establishes the index subscription, and broadcasts the initial snapshot. Immediate persistence enters the task index; deferred drafts do not enter until promoted. Modern V4 creation also enters the index through the workspace V4 syncer, which must have been initialized.

Graph instructions should be sent with an immutable captured workspace target and stable persisted command ID. The V4 envelope already accepts `modelSelection`, `mode`, and `planEnabled`; it should not receive automation/off-peak attribution or artificial tool denylists.

### Workspace isolation

`sessionEventKey` in `zcodeAgentService.ts` uses `resolveWorkspaceKey(params) + NUL + sessionId`. `resolveWorkspaceKey` follows the repository's identity-or-path rule. Frame streams are keyed by workspace and route by conversation topic. A graph adapter must preserve the complete captured target, not infer it later from the selected UI workspace.

## Exact terminal proof

Two existing source surfaces carry exact input correlation:

1. Legacy `ZCodeSessionEvent` envelopes have `eventId`, `sessionId`, `turnId`, `seq`, and timestamp. In `packages/shared/src/zcode-protocol/index.ts`, `zcodeTurnStartedEventPayloadSchema` exposes `inputId` and `foregroundExecutionId`; `zcodeTurnCompletedEventPayloadSchema` exposes `inputId` and `resultType`; `zcodeTurnFailedEventPayloadSchema` exposes `inputId` and an error. Success, cancellation, and execution-limit errors are distinct.
2. Modern V4 `TurnHeaderRow` in `packages/shared/src/zcode-protocol-v4/rows.ts` carries `sourceCommandId` and `state`. `mapTurnResultToHeaderState` in CLI `projection-rows.ts` maps `success` to `completedSuccess`, `cancelled` to `completedInterrupted`, and other result types to `failed`. `product-projection.ts` stamps the canonical source command and updates that exact turn header.

Do not use `IZCodeTaskService.onDynamicTaskTerminalOutcome` as the sole graph proof. `zcodeTaskServiceAdapter.ts` derives it from a session-phase transition in `zcodeTaskIndexSyncer.ts`, then attaches the adapter's current `activePromptInputIds` value. It is not a native terminal event carrying its own verified input ID. Similarly, session readiness, `control.phase`, prose, and assistant text-row completion are insufficient.

Persist the observed terminal proof and freeze it. A later ordinary continuation must not revise the graph's outcome.

## Subscription and reconnect details

V4 is the normal desktop conversation surface. `onDynamicConversationFrame` provides a workspace stream; subscribe and unsubscribe are separate explicit operations. The shared `TopicWireFrameAssembler` validates/reassembles physical frames. Logical frames include topic, subscription ID, `(fromSeq, toSeq]`, and snapshot/deltas. Subscribe ACK includes `logEpoch`. Reconnect must retain the same consistent state before sending a base cursor; sequence gaps require resync rather than applying out-of-order frames. `applyConversationDelta` is the shared reducer.

An independent graph consumer needs its own trusted connection scope, so it cannot replace the renderer's conversation subscription. The existing `createZCodeAgentConnectionScope` can provide this, with its handshake and client identity honored. Direct `queryConversationCommandsV4` on the base service currently rejects without a trusted carrier (`fault.command.queryConnectionUntrusted`); do not call it as if it were a universally callable host query. Scope query binding is one workspace per connection.

Legacy `onDynamicSessionEvent` installs the local listener before asynchronously establishing `session/subscribe`, buffers live events until replay is delivered, deduplicates event IDs, and retries initial subscription failures. This is workspace/session scoped and survives graph UI unmount when owned by a host service. `includeSnapshot` and `afterSeq` control replay. However, the CLI legacy subscription has no unsubscribe RPC and sets `legacyStreamSubscribed = true`, affecting residency until process/session teardown. New code should prefer V4 ownership where feasible.

`readSessionEvents` requires an existing CLI session record. In CLI `server-operations.ts`, `readProtocolSessionEvents` remaps the protocol-visible event sequence and returns `visibleEvents.slice(-limit)`; `limit` is a latest-tail limit, not forward pagination. The default event store is in memory (`server.ts`, `createInMemorySessionEventStore`). A cold process cannot be assumed to retain the old raw event journal or sequence epoch.

## Restart reconciliation limit

V4 cold history is reconstructed by `transcript-hydration.ts`, not a durable raw terminal journal. `inputIntentOfMessage` preserves `sourceCommandId`, and hydration recognizes incomplete assistant messages as interrupted. However, `collectTurnOutput` initializes its result to success before collecting assistant records; `finishTurn` synthesizes `TurnComplete`. A user record with no assistant output can therefore produce a completed header in cold history without proving the original input actually completed.

Consequently, Z1 should persist confirmed live terminal proof, runtime identity, and sequence/epoch. After runtime generation changes, an unfinished attempt without such proof must remain Interrupted/Unknown. Reconnect as running only when the same runtime is demonstrably present and the exact owned input is active. No automatic resend is safe. Command-query acceptance only proves admission, not completion: `persistent-command-facts.ts` reconstructs acceptance from transcript anchors and reports discarded-on-restart inputs separately.

## Permissions, questions, and cancellation

V4 snapshots contain `pendingInteractions`, with `interactionId`, kind, anchor row, and payload. `resolveInteraction` commands resolve the existing native broker; existing `SessionPane` renderers display permission/question controls. The graph can show an actionable waiting state and navigate to the same session. Interaction resolution must remain allowed by a graph ownership guard.

The upstream runtime has `askUserQuestionAutoResolutionEnabled` preferences, defaulting true in shared runtime-preference schema. Graph must not add its own automatic responses; strict waiting-until-human semantics requires explicitly accounting for this existing host behavior, rather than claiming the feature never auto-resolves upstream questions.

V4 `stop` supports `expectedForegroundExecutionId`. CLI `session-flow.ts` invokes `runtime.stopActiveForegroundExecution`; idle or mismatched execution returns `guard.stopTargetChanged` instead of cancelling later work. Capture the token from the matched live turn or authoritative active-work projection. Never terminate the shared workspace process. Graph ownership only guards this application's session input; it does not lock the workspace filesystem against other sessions or external editors.

## Minimal ownership extension

There is no verified existing graph ownership facility. A small host-owned session guard can reject extra prompt-producing commands while an active graph attempt owns the session, allowing the graph's single persisted command ID, read/navigation, native interaction responses, and exact cancellation. The central insertion point is `zcodeAgentService.ts` before `sendConversationCommandV4` forwards a command, plus its legacy `sendPrompt` path. Cover alternate prompt-producing commands such as `sendGoalCommand`, `compact`, `retryTurn`, `editUserQuery`, and `sendQueuedNow`; a composer-only disabled state is insufficient.

The graph service owns graph definitions and immutable attempt metadata only. Session, provider, tool, permission, and admission state remain owned by the existing services and CLI. The host composition should inject the guard through a narrow port instead of adding a reverse dependency from the agent service to a graph implementation.

## Implementation sequence boundary

The source contains a viable native dispatch path. Dependency installation, baseline build/native launch, and required architecture context must still be established by the lead before product implementation. These findings do not replace that Phase A gate.

## Final implementation corrections from native verification

The sections above preserve the initial read-only investigation; the following supersedes its proposed creation and recovery details. Final integration is mapped in [Z1_INTEGRATION_MAP.md](Z1_INTEGRATION_MAP.md).

- Ordinary native `createSession` allocates its own ID; a supplied ID is accepted only for imported-history creation. Graph persists stable run/attempt/input/command IDs first, calls ordinary creation with `persistence: "deferred"`, and persists the returned native session/runtime IDs before observation or submission. Lost creation replies remain Unknown with no recreation. Native `v4-bridge.ts:admitInputCommand` persists/promotes the deferred draft before its input ledger write; native indexing then publishes the task. Actual isolated execution showed that this checkout's immediate-creation path could lack its parent session row and fail V4 admission with a foreign-key error. Z1 uses the working ordinary draft path and does not patch that separate behavior.
- The implemented observer uses the shared **`applyConversationDeltas`** reducer, its own trusted connection and the existing frame assembler. It awaits the known warm session's initial snapshot. Gaps, recovery frames, epoch changes and unexpected replacement snapshots fail closed as unconfirmed work; Z1 does not automatically resync or replay. The earlier general resync suggestion is not the implemented policy.
- Graph subscription, submission and stop carry `expectedRuntimeIdentity`. The Host binds them to the retained existing client of that identity and cannot start a replacement process for a stale Graph operation. This closes the race left by an adapter-only pre/post runtime check.
- Graph metadata is protected across Hosts by the existing public `acquireFileLock` PID/token mechanism. A nonowner receives an uncached view with `readOnly: true` and cannot mutate or reconcile it. Shutdown waits for in-flight operations before releasing ownership; existing abandoned-owner recovery applies. This protects metadata, not workspace files or unrelated native tasks.
- Admission requires the existing question auto-resolution setting to be disabled. Native workspace preference synchronization carries `protectedSessionIds`, including a barrier before Graph input dispatch. The existing interaction registry protects pending, new and restored questions for those sessions and descendants even if the global setting changes; ordinary sessions follow their normal setting. Graph never writes settings or responds to interactions itself.
