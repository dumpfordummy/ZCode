# Common execution rules for Z3–Z8

Read this document and the selected milestone task before editing. These are proposed product/engineering requirements, not a claim about current upstream guarantees.

## 1. Scope, prerequisites and baseline

Work in the current ZCode fork. Read applicable AGENTS.md, DESIGN.md, architecture-governance rules, current graph specs/contracts, previous reports, and any authorized packaging changes. Preserve all unrelated working-tree changes and the old prototype.

Only implement the milestone the user selected. Do not infer authorization to execute every task because all task files are present. Historical 'do not begin Z3' language is superseded only by a later explicit Z3 instruction, not by merely copying this pack.

Before changes, inspect actual HEAD, branch, tools, dependencies, migrations, runtime protocol, existing features and scripts. Run the relevant baseline. Update specs first, including owners, states, identity, compatibility, and acceptance cases. Reuse already-implemented behavior; do not rebuild a feature just because an older assignment describes it as future.

For in-scope prerequisites already implemented, inspect the evidence and run focused regressions. A missing optional live-provider check may permit isolated development but never becomes a claimed live PASS. A missing required state/ownership primitive is a blocker, not an excuse to guess an API.

## 2. Architecture that must survive

- React edits definitions and displays projections. The graph service/Host owns orchestration and metadata. Native services/runtime own agent sessions, tool execution, permission handling and admission.
- No new agent engine, provider store, credential extraction, C# sidecar, or Vue embedding. Reuse the existing native canvas/components/hooks and the platform/service boundaries actually present.
- One graph attempt can legitimately cause many model/tool calls. Measure owned input dispatches separately from model-request counts.
- Preserve workspace path, canonical identity, Host/runtime generation, session ID, command/input ID, node attempt and run identity. Do not invent runtime-generated session IDs or write private runtime tables.
- Graph ownership is not an OS sandbox or a lock on every unrelated Chat/editor. Never describe an instructions-only restriction as enforced filesystem isolation.
- Native tools remain normally capable under the selected workspace policy. Synthetic tests and optional deterministic Tool nodes are not a permanent cap on Agent Task capabilities.

## 3. Durability and authority

A saved graph, a frozen run, editor layout, approval decision, execution evidence, and live native state are different records. Use the current schema-validated persistence; no unnecessary database migration/rewrite solely to match the old C# prototype.

Persist identities and dispatch intent before operations that may start work. Never infer completion from agent prose, idle status, cold-hydrated history, timeout, or disappearance of a socket. Match authoritative evidence to the exact owned input and runtime. Persist results before allowing downstream dispatch.

A lost acknowledgement is not permission to resubmit. Idempotent request handling returns the original identity and rejects conflicting reuse. Reopening a graph/conversation, retrying a read, rehydrating state, or installing an update must not create sessions or send inputs.

Unknown external outcome is distinct from an inactive runtime. Release only the graph guard whose owned activity is authoritatively inactive, retain uncertainty and audit evidence, and never label an abandoned input successful. No force-delete/reset button that conceals possible execution.

Each future replay, repair or branch dispatch is a new explicitly identified attempt. It is not an automatic replay of an ambiguous previous attempt. No exactly-once external-side-effect claim.

## 4. Permissions, approvals and data

Use existing native permission/question UI and policy. Never fabricate responses, change the global setting to answer questions, or elevate a node to a more permissive mode without user authorization. Graph approvals and tool permission approvals are separate concepts.

Secrets remain in the native owner. Store references/version metadata where required, not copied tokens. Automation tests use synthetic credentials and controlled providers. Application-triggered live model/account use, company source, real external MCP tools, or installed-profile access requires separate user authorization; do not assume it from an implementation assignment. This does not prohibit the user from using their normal Codex development assistant.

Inspect startup/configuration data flows before opening private source. A self-hosted primary model is not proof that auxiliary requests, skills, hooks, plugins, MCP, diagnostics or update services send nothing externally. Do not add broad secret searches as a substitute for tracing actual data handling.

Render prompt/output content as untrusted data. Explicit bindings do not make model outputs authoritative instructions. Imported graphs/templates/skills must not execute or install anything merely by being opened.

## 5. Workspace and command effects

Use synthetic isolated repositories and app data in tests. Never broadly kill processes by name, PID ancestry, or a guessed stale ID. Use the existing exact ownership and native cancellation path; stopping one graph must not stop unrelated sessions.

Builds/tests can execute repository code. User-approved command recipes are not a sandbox. Recipe arguments come from validated configuration and typed bindings, not shell concatenation of raw model output. Use existing native process/tool facilities and permissions. Do not introduce an independent generic shell executor.

No automatic commit, push, merge, destructive reset, release publication, installed-app overwrite, or global toolchain/configuration modification. Creating task-owned fixture repositories or explicitly assigned isolated worker workspaces is permitted within the selected task, with exact cleanup and no changes to user work.

## 6. Verification and evidence

Keep existing checks and run new behavior tests. Re-run the actual root/CLI/type/lint/build commands required by the current repository. Preserve preexisting failures with baseline comparisons; never fix all formatting, suppress rules, skip cases, or change expectations solely to report green.

Do not run emitting typecheck and desktop bundlers concurrently when they write the same outputs. Inspect whether that Z1 collision still exists; avoid assuming output independence.

Use three evidence categories:

1. Unit/service fixtures: state transitions, parsing, races, filesystem persistence.
2. Real native integration with controlled provider: actual Electron/Host/runtime/tools and real test processes, with synthetic inputs.
3. User-operated real provider/project: separately attributed and explicitly authorized.

A fixture-only graph adapter is not native end-to-end proof. A live greeting is not proof of tools, handoffs, tests, permissions, or project safety. A plan file or screenshot is not proof that a test ran.

Each acceptance row records PASS, FAIL, BLOCKED or NOT RUN, the layer, command, outcome and artifact. An existing baseline exception can coexist with changed-feature success, but the overall status must say so. Never claim 'all tests pass' while an invoked required suite fails.

## 7. Handoff and stopping

Write `docs/graph-engineering/Zn_REPORT.md` using REPORT_TEMPLATE.md, plus updated current progress/specs. Do not overwrite historical reports. Explain changed files, contracts, actual results, baseline failures, known gaps, startup/manual steps and the next eligible task.

If required native behavior cannot be verified, stop that path with exact evidence rather than adding unsafe fallbacks. A completed implementation with required automated/native checks passing can be READY FOR USER CHECK with named baseline exceptions. Live acceptance remains separate.

Do not proceed to the next milestone unless the user explicitly selects it or provides a separate bounded batch instruction. None of these documents authorizes a batch by itself.
