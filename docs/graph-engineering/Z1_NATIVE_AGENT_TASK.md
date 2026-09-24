# Z1 — Native tab and one shared-runtime agent task

## Acceptance target

In the locally built ZCode desktop app, open a selected local workspace, select Graph Engineering, configure `Start -> Agent Task -> End`, and run the task through the same application services/runtime as normal chat. Inspect genuine events and open the same session in the existing conversation view. Returning to the graph, switching tabs, or reopening a completed run must not submit work again.

This is a bounded end-to-end feature, not a UI-only mock and not a complete port of M1–M3. Initial automated verification uses synthetic workspaces/credentials and controlled runtime/provider fixtures. The user performs the live-agent check after inspecting the report and configuring a provider through the isolated app.

## Phase A — Baseline and verified integration map

Before changing product code:

- Inspect Git status and preserve all existing changes. Record repository URL, branch, exact HEAD and dirty baseline. Do not pull or change the upstream revision mid-assignment without recording and justifying it.
- Read applicable AGENTS.md, DESIGN.md, package manifests, mise.toml, architecture-policy.yaml and the repository architecture-governance skill. Follow the current checked-out source, not copied interface signatures from this pack.
- Inspect startup/install scripts before executing them. Use the upstream workspace-freshness/architecture checks and required controlled module context. ZCode's current guidance requires spec changes before behavioral changes; identify the proper spec locations.
- Compare installed tools to the checkout's pins. Use project-local version tooling when available; do not silently change machine-wide Node/pnpm/Codex installations. Record missing prerequisites and obtain ordinary approval where required.
- Run the unmodified relevant build and native desktop smoke baseline with a fresh isolated app-data location. Record typecheck, lint, architectural and relevant test baselines, including existing failures. Do not introduce unrelated fixes or weaken checks just to obtain a green baseline.
- Verify how the data-directory setting affects providers, session storage, workspace restoration, auxiliary caches and runtime configuration. Do not read, copy, modify or delete the user's installed ZCode/Codex data or auth stores.
- Inspect production/test startup configurations, auxiliary model calls, telemetry, updates, indexing, provider routing, hooks/MCP loading and credential sync. Record observed versus source-inferred behavior. A test environment name does not establish absence of external requests. Do not open a company repository or attach live accounts for baseline verification.
- Preserve licenses and third-party notices. Identify material missing source features instead of silently borrowing components from the installed official app.

Write `Z1_INTEGRATION_MAP.md` in this documentation directory with exact paths/symbols and these paths traced from normal Chat UI to the runtime:

1. Selected workspace identity, path and host attachment.
2. Effective model selection and permission/mode configuration.
3. Creation of a session visible in the normal task/conversation list.
4. Prompt dispatch, command/input IDs, admission and duplicate behavior.
5. Event subscription, sequence/cursor, snapshots and reconnect.
6. Permission requests, user questions and their correlated responses.
7. Exact input terminal result versus session readiness/idle state.
8. Cancellation and shared runtime/process ownership.
9. Opening the same task in the existing conversation interface.
10. Persistence and safe reconciliation after renderer or host restart.

`packages/services/src/zcode-session/zcodeSession.ts`, `session/zcodeTaskService.ts`, the agent service and UI hooks are investigation starting points, not preapproved imports. Follow public boundaries and the actual modern dispatch path. Do not couple the new service to concrete runtime implementations or call a private database directly from React.

Proceed to Phase B when the baseline and map demonstrate a viable native path. An unrelated baseline failure may be documented with a narrowly justified verification plan; a broken relevant runtime/build or missing critical dispatch/lifecycle boundary is a blocker, not permission to fake integration or replace the engine.

## Phase B — Minimal native implementation

### Interface and graph

Add a native Graph Engineering entry/tab in the existing workspace shell. Follow existing navigation, hooks, theme, accessibility and localization patterns. Keep normal chat functional. Avoid broad shell redesigns.

Support a small saved local graph with Start, one Agent Task and End. Node position/layout and editable name/instructions are real data. Z1 can restrict execution to exactly one task and diagnose unsupported branching, loops or extra tasks. Keep definitions/layout separate from run state. This limit is a milestone scope, not a permanent tool restriction on the task itself.

Agent Task configuration shows the selected local workspace and effective model/permission configuration using host selectors or projections. Keep credentials in the host's existing provider system. Do not force a new login mechanism or special provider on the user. Handle no-provider/unavailable-runtime states honestly without automatically probing a paid endpoint.

The task receives its instruction as a normal agent task. Do not require the model's final answer to be strict JSON for this milestone. Inspectable final text, session history and actual file/tool evidence are sufficient. Do not replace tool-using agent execution with a direct Responses API call.

### Host orchestration and persistence

Introduce the smallest host-level graph service under the existing architecture boundaries. It owns graph metadata and correlations, not the agent session's internal state. React requests actions and renders projections; a React effect or tab-mounted loop must not be the scheduler.

Persist the saved graph revision, run and attempt identity, immutable instructions/effective configuration, workspace target and native session/input/command IDs. Use existing app storage/repository conventions. Do not create a competing credential store or reinterpret old application databases.

One active graph attempt per local workspace initially. Capture the workspace at admission: later UI workspace selection must not retarget a running attempt. Reuse the host's rules for active/busy sessions and workspace mutations; a graph-only lock does not exclude ordinary chat tasks or external editors. Detect relevant conflicts where the host exposes them and disclose remaining limitations without inventing a global filesystem lock.

Protect duplicate UI submissions and ambiguous dispatch responses. Persist stable dispatch identity and reuse native admission/idempotency where verified. If acceptance cannot be established, preserve an unknown/interrupted state and reconcile known identities; never resend merely because a timeout occurred.

Map runtime events for the exact owned input to graph states. An idle session, a previous turn's success, disconnection, UI unmount or assistant text containing 'done' cannot finish the current task. Distinguish completion from successful business verification. Show Failed, CancelRequested/Cancelled, WaitingForPermission/WaitingForUser and Interrupted/Unknown as required by the actual protocol. Do not automatically approve questions or permission requests.

Progress continues independently of whether the graph tab is visible, within the existing host lifetime. Closing the owning desktop window or quitting the app follows the host's real lifecycle, not a promised always-on background service. Persist enough to reopen records. On restart query the known native session/input and restore a confirmed outcome, reconnect only when the same work is verifiably active, or mark interrupted/unknown. Never automatically resubmit.

### Conversation parity

Add Open conversation to the node attempt. It must navigate to the existing conversation component for the same session/task, not copy messages into another chat or create a new session. Reuse existing tool event, permission and question renderers. When the graph view cannot render a particular permission/question component, show an actionable waiting status and open the existing conversation response interface.

Prevent uncontrolled additional manual prompt submission while the graph owns the attempt. Use existing input admission/ownership facilities; if they do not support this, add the smallest explicit guard at the correct service/UI boundary. Viewing is not takeover. Permission/question responses for the active attempt remain available. Do not claim exclusive control over an external CLI or arbitrary outside edits.

Opening a completed session and later continuing it must not rewrite the frozen graph result. The graph attempt remains correlated to its original input ID and event range.

### Cancellation and permissions

Cancel through the verified native API for the owned attempt. Do not terminate a shared runtime that also serves other sessions. Do not kill processes by name or inferred parent-PID ancestry. Retain exact process ownership for any fixture/launcher process the tests start.

Keep effective permission rules the same as normal chat under the selected configuration. No automatic yolo/full-access change, no sandbox downgrade and no fallback to a different executor. Do not claim worktrees, working directories or the desktop shell are OS sandboxes. Preserve existing app protections and report important upstream limits rather than rebuilding them all in Z1.

Do not hardcode Restore/Build/Test as the entire agent's allowed tool set. Ordinary configured file, shell, skill and MCP behavior should remain reachable through the native runtime, subject to its actual support and selected permissions. Test only authorized synthetic targets for now.

## Verification

Follow repository-mandated typecheck and lint. Discover actual package test entry points instead of inventing a root test command. Run architecture checks for changed modules and regression tests for normal chat/navigation. Provide command, exit code, artifact and scope for each result.

| Check | Required evidence |
|---|---|
| Baseline | Exact checkout and environment; untouched relevant build/native launch result and existing failures. |
| Native tab | Real desktop view, instructions/layout save and reopen, no replacement shell. |
| Shared execution | Source trace and integration test showing graph dispatch reaches the same native session/runtime path as chat; distinguish a fake adapter from a real runtime with controlled provider. |
| Identity | Workspace/session/input IDs match between the graph attempt and Open conversation. No extra session or prompt on navigation. |
| Tools and final result | Controlled tool-using task exercises actual runtime tool events where the test infrastructure supports it. Missing live-model evidence is NOT RUN, not PASS. |
| Waiting | Permission and question events remain waiting until a correlated user response; no automatic approval. |
| Admission | Double submission and lost response do not knowingly duplicate dispatch; ambiguous acceptance stays conservative. |
| Event integrity | Old/duplicate/out-of-order events cannot complete a different input or resurrect terminal state. |
| Lifecycle | Tab change/reopen does not cancel or resubmit; known state reconciles after app/runtime restart without replay. |
| Cancellation | Only the correct attempt is stopped; unrelated synthetic sessions/processes remain intact. |
| Chat coexistence | Ordinary chat works; Open conversation shows the same task; conflicting extra input is serialized/blocked. |
| Isolation | Developer data stays separate; no real credential copying, logged secrets, company-source uploads or changes to installed app configuration. |

Do not invent a large fake test matrix. Report exactly which layer each fixture exercised. A browser rendering test alone is not a native Electron smoke result; a mock service alone is not a runtime integration result.

## Manual user proof

Provide exact verified Windows startup instructions for this fork and its isolated data directory. The user configures the approved model through the app's existing UI and runs a synthetic repository task: inspect a source file, make a small specified change, and run the available focused test/command. Use a uniquely identifiable value in the sample so the user can inspect genuine file contents, diff and tool output. A .NET sample may be used when the local SDK is available, but .NET is not a runtime dependency of the graph feature.

Compare graph and normal chat effective configuration. Open the graph-created session in normal conversation view and confirm the same task/event history. Record only sanitized observations and IDs; do not record real keys or provider URLs. The user can later authorize a real game repository after network/trust review; no migration to that repository is authorized here.

## Final report and exclusions

Write `Z1_REPORT.md` using the report template. Include integration map, changed files, baseline and final checks, native screenshots, known limits, setup and manual verification. Distinguish BLOCKED, IMPLEMENTED — READY FOR USER AGENT CHECK, and actual user-operated evidence. Full acceptance remains the lead/user decision.

Excluded: complete M1–M3 data migration, C#/Vue embedding, custom provider system, multi-node scheduler, parallel agents, repair loops, arbitrary new shell node engine, production packaging, automatic commits/pushes/merges, upstream publication and company project execution. Do not perform unrelated rewrites.
