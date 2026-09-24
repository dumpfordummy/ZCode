# Product direction — native graph orchestration in ZCode

Status: approved product direction, implementation feasibility to be proved in Z1.

## Product contract

Graph mode and ordinary Chat mode use the same ZCode agent/session runtime. A graph agent task is a normal tool-using agent task submitted through a graph, not a single raw model completion and not a special reduced-capability agent.

Under the same effective workspace, model, tools, instructions, and permission configuration, the graph must not silently remove capabilities or widen permissions. Whole-project access means the runtime may discover and inspect relevant files under the configured access policy; it does not mean uploading the entire repository into every prompt. External/network behavior follows the actual runtime configuration and must be disclosed rather than assumed local.

Long-term target: selected game workspaces, reusable engineering tasks, explicit handoffs, independent review sessions, deterministic validation steps where useful, human intervention, and eventually bounded routing/repair. The synthetic repository used for initial verification is a test fixture, not a permanent application restriction.

## Ownership

| Owner | Responsibility |
|---|---|
| Existing ZCode services/runtime | Workspace identity and access, providers and credentials, model/tool loop, skills/MCP configuration, permission and question handling, conversation records, process ownership and agent events. |
| New graph module | Graph definitions/layout, immutable run metadata, ordered node dispatch, exact run/node/attempt-to-session/input correlation, graph status projection, explicit handoffs and checkpoints. |
| Native React interface | Graph editing and inspection through existing hooks/service boundaries; navigation to the same underlying conversation. |

Do not add a second provider/key store, a second agent tool loop, a second owner of session state, or a C#/SignalR sidecar as a prerequisite. Do not put task/session business state in Electron Main against the host application's rules. A small integration adapter is appropriate; a duplicated runtime is not.

Use React/TypeScript with the host's components, state conventions, dependency injection and design rules. Prefer React Flow for the canvas, subject to checking existing dependencies and compatible versions. Do not embed the Vue app in an iframe or create a second application shell.

## Session semantics

One Agent Task may involve many model requests, tool actions, and permission/question exchanges. Completion refers to the exact submitted input/turn, not the existence of a session or a sentence saying work is done. Runtime completion is not proof that the business task or its tests are correct.

Z1 starts a fresh graph-owned session per attempt. Reopening its conversation must not create another session or submit another prompt. Normal browsing is allowed. Additional manual prompt submission while an attempt is graph-owned must be serialized or blocked with an explanation; permission/question responses remain available. Later work may add explicit takeover and same-session continuation.

Graph metadata references the authoritative session/event history instead of copying it into an independently editable transcript. Persist the correlation before dispatch when the protocol allows; handle uncertain acceptance without a blind resend.

## Existing work

Keep the standalone M1–M3 application intact as reference and fallback. Reuse its product decisions and suitable pure contracts/tests deliberately, not by wholesale code conversion. Existing workflow exports, provider credentials and historical databases are not automatically migrated in Z1. Do not reinterpret an old Model Call as an Agent Task.

## Milestones

- Z1: native tab and one real agent-task integration, with lifecycle and conversation parity.
- Z2: multiple sequential agent tasks, explicit outputs/handoffs, deliberate new-session versus continuation behavior.
- Z3: reusable game-engineering templates, deterministic validation and review/approval routing.
- Later: controlled game-project pilot, parallel isolation, deeper recovery and packaging.

Only Z1 is authorized by this pack. Do not build the entire roadmap now.
