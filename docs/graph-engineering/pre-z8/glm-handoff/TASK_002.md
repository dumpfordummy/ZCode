# TASK_002 — Establish identity contract and correct U4 cancellation proof

## Outcome and bounded scope

Establish the identity contract between Graph command/input identity and native ledger-row identity. Correct the U4 cancellation proof (`assertU4Cancellation`) to correlate a Graph attempt with exactly one native ledger entry using the exact owning session ID and the exact original source command ID, then independently validate the queue-row ID mapping. Rerun the complete native `--scenario=cancel` scenario.

This is a bounded harness/spec/test task. It does not authorize changes to production session ownership, persistence, cancellation, recovery, or ID generation. The preferred approach is to correct the harness comparison, not to change production IDs to make the test pass.

## Confirmed identity semantics (verified from source)

The Graph record and the native `session_input` ledger use **separate identity namespaces** by design. They are correlated, not string-equal.

| Identity                         | Space                                              | Source                                                                                                                                                                                                                                                                                                                                           | Verified meaning                                                                                                                                                                         |
| -------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `attempt.commandId`              | bare UUID                                          | `packages/services/src/graph-engineering/app/run-plan.ts:53` (`options.id()`), `:191`, `app/routing-plan.ts:36`                                                                                                                                                                                                                                  | The Graph-generated command id that identifies the submitted native command.                                                                                                             |
| `attempt.inputId`                | bare UUID, **equals `commandId`**                  | `run-plan.ts:58` (`inputId: commandId`), `:200`, `routing-plan.ts:41`                                                                                                                                                                                                                                                                            | Intentionally set equal to `commandId` by Graph design. It is the Graph-side input identity, not the native ledger-row id.                                                               |
| `session_input.id`               | `queue_<commandId>`                                | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/command-inbox.ts:75-77` (`queueItemIdForCommand`), assigned at `:182`, returned as ledger row `id` at `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/v4-bridge.ts:442`, stored by `apps/zcode-cli/packages/adapters/src/storage/session-store/repositories/session-inputs.ts:49` | A separate queue-row identity. Deterministic and reversible: `id === "queue_" + commandId`. Documented at `apps/zcode-cli/packages/contracts/src/interfaces/session-store.port.ts:1192`. |
| `payload.intent.sourceCommandId` | bare UUID, **equals `commandId`**                  | Observed in actual native ledger rows; set by the runtime admission path                                                                                                                                                                                                                                                                         | Identifies the original command. This is the correlation key between a Graph attempt and its native ledger row.                                                                          |
| `session_id`                     | `sess_<uuid>`                                      | Native session owner                                                                                                                                                                                                                                                                                                                             | Identifies the owning native session. Matches `attempt.sessionId` for the admitted Graph attempts.                                                                                       |
| `payload.intent.queueItemId`     | `queue_<commandId>`, **equals `session_input.id`** | Observed in actual native ledger rows                                                                                                                                                                                                                                                                                                            | Redundant confirmation of the queue-row identity.                                                                                                                                        |

### Actual native ledger row shape (from attempt-2 run)

```
id:          queue_7cccd9b3-675c-4ee0-bed2-0e02544db5e5
session_id:  sess_e1738056-8343-4e48-9c79-169125e37922
kind:        sendText
delivery:    startNow
status:      promoted
payload: {
  text, attachments, sourceCommandType,
  intent: {
    sourceCommandId: "7cccd9b3-675c-4ee0-bed2-0e02544db5e5",  // == attempt.commandId
    queueItemId:     "queue_7cccd9b3-675c-4ee0-bed2-0e02544db5e5",  // == session_input.id
    clientId, kind, admissionSeq, admittedAt, requestedDelivery, admittedDelivery, attachmentRefs
  },
  conversationInputIntent: { ... full intent ... }
}
```

### Relationship summary

```
attempt.inputId  === attempt.commandId                         (Graph design)
ledger.id        === "queue_" + attempt.commandId               (native design)
ledger.payload.intent.sourceCommandId === attempt.commandId     (correlation key)
ledger.session_id === attempt.sessionId                         (correlation key)
ledger.payload.intent.queueItemId === ledger.id                 (redundant)
```

The old proof assertion `input.id === attempt.inputId` conflated the two namespaces: `queue_<commandId> !== <commandId>`. The correlation is sound via `session_id` and `sourceCommandId`; the `queue_` prefix is deterministic and reversible but was never meant to be string-equal to the Graph `inputId`.

## Authorized correction (option B)

The source confirms the reported separate identity namespaces. No production ownership defect is exposed. The authorized correction is:

1. Correlate a Graph attempt with exactly one native ledger entry using `session_id === attempt.sessionId` AND `payload.intent.sourceCommandId === attempt.commandId`.
2. Independently validate the queue-row ID mapping: `ledger.id === "queue_" + attempt.commandId` (defined locally, not imported from the runtime, to preserve layer boundaries).
3. Validate the matched row's payload structure is complete.
4. Preserve all existing assertions: exact count, cancellation ordering, terminal proof, sequence, no-successor, companion isolation.

## Constraints

- Do not match by suffix, substring, or indiscriminate prefix removal.
- Do not accept a match when only one ownership attribute agrees.
- Do not drop exact-count, cancellation-order, terminal-proof, sequence, no-successor, or companion-isolation assertions.
- Do not hardcode this run's UUIDs or observed sequence number.
- Do not infer success from assistant text or an idle status.
- Do not import private runtime implementations into unrelated layers.
- Do not change production IDs, persistence, cancellation, or recovery.
