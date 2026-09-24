# Z2 — native editable sequential agent graphs

## 1. Objective

Turn Z1's single native task into a useful sequence of native coding-agent tasks in the selected local workspace:

`Start -> Analyze -> Implement -> Verify -> End`

Analyze, Implement, and Verify are instances of the same Agent Task node, not bespoke executors. Each can perform multiple native model/tool interactions under its configured permissions, just as normal Chat does. The graph coordinates tasks; it does not draw or reimplement every internal file read, command, or reasoning step.

A successful Z2 proof creates one native session and one initial input command per Agent Task attempt, transfers explicitly selected prior results, runs them sequentially, and opens each node's actual conversation. A single agent task can legitimately make many model requests; do not confuse model-request counts with node-dispatch counts.

## 2. First actions and scope

Read the actual current repository's applicable AGENTS.md, architecture-governance instructions, design rules, Z1 spec/integration map/setup/report, and distribution follow-up if present. Record actual HEAD and dirty worktree. Update specs first as required by the repository; do not rewrite historical Z1 results.

Run the baseline before edits. Retain the existing exact toolchain and required sequential build order. The report warns that emitting root typecheck and desktop bundling share outputs; do not run those writers concurrently.

In scope:

- Editable linear graph with Start, End, and one to eight Agent Task nodes.
- Native model/permission defaults and visible per-node configuration.
- Explicit text handoffs and immutable submitted run snapshots.
- Sequential Host-owned orchestration using Z1 native integration.
- Runs view, same-session navigation, cancellation, and safe release of confirmed-inactive interrupted work.
- Z1 format/history preservation and regression tests.

Out of scope:

- Branches, merges, loops, automatic repair/retry, parallel code writers, subworkflow libraries, scheduled/background daemon runs, remote/SSH/mobile Graph execution.
- New agent runtime, raw-provider execution node, credential store, C# sidecar, or Vue embedding.
- Automatic Git commits/push/merge or undo/rollback of agent side effects.
- Arbitrary shell-node runner: Agent Task already uses ordinary configured native tools.
- Production rollout, company-repository tests, and feature parity for unverified optional native capabilities.

Do not build a full workflow marketplace/library just for Z2. Preserve the existing document lifecycle; a single editable graph per workspace is acceptable for this milestone.

## 3. Editor and node configuration

Use the already-present React Flow dependency, native components, themes, and localization. Do not add another canvas framework.

The canvas is the primary workspace. Provide a node palette/add action, selection, drag/layout persistence, readable connection handles, and a right-side node inspector. Run history belongs in a separate view or bounded pane. Selecting a running/frozen node shows the submitted state, not today's editable instructions.

Support add, rename, delete, reconnect, and reorder by actual edges. Delete incident edges with a node. Do not accidentally delete nodes while the user edits text. Preserve usable keyboard access, Fit view, and viewport behavior. Keep the selected workspace and whether the user is viewing Design or a frozen Run visible.

Validate that execution is exactly one connected path from the unique Start to the unique End with all Agent Tasks on that path. Array order and node positions have no execution meaning. Reject cycles, branches, dangling references, disconnected nodes, duplicate identifiers, or unsupported versions at Run. Incomplete drafts may be saved if the document shape is valid; explain readiness errors and do not dispatch anything. Put explicit size limits in the spec; no silent truncation.

Agent Task configuration:

- Stable node ID, display name, instructions.
- Literal or explicitly bound instructions (see section 4).
- Inherit captured workspace model/reasoning/permission/plan defaults, or supported explicit node override through existing native controls.
- Visible source of inherited/overridden values. Freeze resolved settings for every node at Run admission, not when a later node happens to start.

A disabled/unavailable native selection must not silently fall back to another model or more permissive mode. Let the existing provider/runtime own credentials; graph metadata contains references/settings, never extracted keys or tokens.

Preserve Z1's automatic-question protection and ordinary permission behavior. Do not change the user's global preference or inject fake answers. Do not call a prompt-only 'do not edit' instruction an enforced read-only sandbox.

## 4. Explicit context handoff

Execution edges control order; input mappings control added context. The shared filesystem is a separate source of context, and is not frozen by saving a graph.

For Z2, implement a deliberately small binding contract:

- Start provides a run request string.
- Each node can map a named input to that request or to an earlier completed node's frozen final assistant text for the exact owned input.
- Bound instructions use `{{inputs.<alias>}}` with one-pass, non-recursive substitution. Literal mode preserves instructions verbatim.
- A downstream node cannot reference itself, a later node, an unsuccessful/unproven attempt, or arbitrary recent messages in a session.
- Resolve and persist the actual instructions and each binding's source/contents before submission.
- End explicitly selects which completed node's final text to expose as the run result. Retain all nodes' evidence and conversations, not just End's output.

Fresh native session per node; same captured local workspace for the entire run. No automatic full-transcript concatenation, shared mutable conversation, entire-repository injection, implicit previousResponseId, or generated follow-up prompt. Only explicitly selected handoffs are inserted. The agent can separately read relevant files with its existing tools.

Derive final assistant text from exact input/turn-attributed native data. Do not grab 'the latest assistant message' after manual follow-ups. Inspect actual native schemas and implement the smallest supported extraction; do not invent output fields. A native successful input without usable final text can remain completed, but a dependent text binding must report missing output and stop downstream admission. Neither parse failure nor missing text triggers another agent call.

Prefer retaining the original Z1 literal semantics and choosing the next format/type versions after inspecting current documents. No forced JSON-only response for ordinary coding agents. Structured-output schemas and artifact-management platforms are deferred.

Handoff text remains untrusted content even when visibly delimited. Do not promise that delimiters prevent prompt injection. Existing native permission and trust controls remain important.

## 5. Ownership, persistence, and sequence

Retain the existing single-owner Host model and graph metadata lock. Do not put orchestration in React effects, Electron Main, or a new polling daemon. One active Graph run per workspace, one active node input at a time; use workspace identity plus the proper native path/Host binding, not path string alone.

Freeze definition/layout revision, Start input, all resolved node settings, and planned path at Run admission. Later edits affect only a future run. Persist run/node/attempt/session/command identity and exact native evidence using the repository's existing schema-validated atomic persistence and interfaces.

Follow the Z1 native creation/admission path; native code allocates session IDs. Use the ordinary deferred draft and first-input promotion. Do not write private runtime tables, synthesize session IDs intended only for import, or treat a lost creation reply as permission to create again.

Before N+1 is submitted, commit N's matched terminal proof and frozen output plus the next-node dispatch metadata. Persist-first failures must produce zero unsupported calls. Never start a dependent node from prose such as 'done', session idle, or a cold-hydrated synthetic header. Require exact command/input correlation, epoch/sequence, and original-runtime binding.

Reuse Z1 idempotency/ambiguity semantics: one stable submission ID for a user Run; repeated same request returns the existing run, and conflicting reuse is rejected. New Session/Send calls are not part of tab switching, reconnect, snapshot reconciliation, or opening a conversation. Do not advertise exactly-once external side effects.

An Agent Task may involve many model requests and tool operations. Record native session/input IDs and runtime observations; do not label a model-request counter as a graph attempt count.

## 6. Conversation access and interactions

Every submitted node has an Open conversation action that selects its stored native session in existing Chat. Do not clone, replay, or create a new task for this action.

Protect all graph-owned sessions while their run is unresolved, including completed predecessor sessions whose evidence is still being used. Block alternate input, edit/retry, and config mutation entry points consistently. Viewing, native permission/question responses, and exact cancellation remain possible. Once the run is truly terminal and ownership is safely released, normal follow-ups may continue without changing the frozen graph result.

Retain native V4InteractionDialogs and existing pending-interaction state. Show which node waits for user input/permission. Downstream nodes remain pending until that input actually completes. Do not automatically respond to AskUserQuestion through any route, including native descendants or preference-change races already covered in Z1.

Do not claim the Graph owns all writes to a workspace. Unrelated Chats/editors are not automatically stopped or locked by Graph metadata. Display a practical warning against concurrent edits, retain workspace identity in the run, and leave OS/security guarantees unchanged.

## 7. Failure, cancellation, restart, and recovery

Use existing status vocabulary where appropriate and document additional run/node states before implementing them. At minimum distinguish pending, active, waiting, input completed, failed, cancelled, skipped, and outcome unknown/interrupted. 'Input completed' means native completion, not verified correctness of code or passing tests.

On definitive failure, block/skip descendants and preserve earlier results. No automatic repair, session resume, repeated input, or replay. A fresh run must be an explicit user decision and can repeat earlier side effects; tell the user.

Cancellation is against the exact owned foreground native execution. Persist intent first, issue supported native cancellation, reconcile matching evidence, and never cancel unrelated sessions or kill a shared process by name. If identity is unavailable or outcome remains uncertain, show it; do not manufacture a terminal confirmation. Late messages cannot start downstream work or rewrite a terminal cancellation.

Tab navigation does not stop a run. Owning Host/window exit follows existing lifecycle and is not an always-on promise. Completed evidence survives reopen. On restart, never dispatch the next pending node merely because a transcript appears successful. Previously uncertain or partially progressed runs require explicit inspection; Z2 has no automatic continuation/replay.

Implement a recovery view for C2:

1. Show frozen run/node/session/input IDs, last persisted proof, original runtime binding, and what is unknown.
2. Allow reconciliation/inspection through existing native APIs; observations must not submit work.
3. Offer targeted cancellation only with authoritative current ownership of the original input.
4. Permit an explicit confirmed release/abandon action only after the owned execution is authoritatively inactive (for example, exact live input terminal evidence, or verified retirement/exit of the original runtime with no pending admission capable of executing). Inspect the actual native capabilities; do not infer this from idle, a new runtime, an unreachable socket, PID existence alone, or a timeout.
5. Persist an audited abandoned/released disposition and reason while preserving Unknown external outcome and all evidence when appropriate. Release only this graph's guard. Do not mark unknown work succeeded, automatically start another node, or roll back files.
6. If inactivity cannot be established, keep the guard and give a clear diagnostic plus the supported investigation path. Do not add a force-reset, state-file deletion, generic PID kill, or silent credential/profile reset.

Tests must show the safe release path for at least one confirmed-inactive interrupted run and refusal for an actually active/uncertain one. If the checked-out native APIs cannot support this safely, report the specific integration blocker before adding a bypass.

## 8. Compatibility and limited delivery

Preserve Z1 stored graphs, literal instructions, completed runs, correlations, and pending guards. Any format upgrade must be explicit or proven lossless and must never reinterpret old drafts/history or replay old work. Do not migrate data from the Vue/C# app in Z2.

No new credential handling, actual private endpoint tracing, company source, machine-wide setup, or installed profile access during development. Use the existing isolated harness, controlled model responses, real native tools on fresh fixtures, and ordinary regressions. Do not remove legitimate packaging changes recorded after Z1; new distribution work is not required for Z2 acceptance.

Read `Z2_VERIFICATION.md` for the required matrix and `Z2_MANUAL_CHECK.md` for the final user-operated proof. Report actual tests, failures, exceptions, and NOT RUN cases using `Z2_REPORT_TEMPLATE.md`.
