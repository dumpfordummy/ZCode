# Complete Codex assignment — M4

Continue the existing Graph Engineering repository. The lead has accepted M3 for development
progression after the user's real text/JSON runs and restart confirmation, and authorizes
M4 only. This narrowly supersedes stale milestone-scope statements, not the other rules.

## Read before editing

1. AGENTS.md and all applicable nested instructions.
2. docs/PROJECT_BRIEF.md, docs/ARCHITECTURE.md, docs/PROGRESS.md, docs/CONTRACTS.md,
   and the current security/environment documentation.
3. docs/handoffs/M3_REPORT.md and docs/handoffs/M3_LEAD_ACCEPTANCE.md.
4. docs/tasks/M4_AGENT_TOOLS_APPROVALS.md.
5. docs/tasks/M4_EXECUTION_CONTRACT.md.
6. docs/tasks/M4_ACCEPTANCE.md and docs/handoffs/M4_REPORT_TEMPLATE.md.
7. docs/M4_SOURCES.md.

## Establish the baseline

- Inspect Git root/status/diff and installed SDK, Node, Git, Codex entry point/version.
  Preserve ALL preexisting changes. Do not reset, clean, stash, stage, commit, push, or merge.
- Run the existing M3 integrated check before implementation with isolated fixture data.
  Report genuine environmental blockers through the normal permission path.
- Inspect installed Codex --version / --help / exec --help as metadata only. Resolve the
  selected executable deterministically. Do not invoke a live agent, read auth files,
  dump private configuration, discover secrets, or perform a paid compatibility probe.
- Record an adapter capability matrix for the EXACT selected version, including stdin,
  JSONL events, model selection, workspace sandbox and no-escalation policy, and supported
  isolated-home configuration. Do not assume the PATH CLI equals the desktop-bundled CLI.
- Fix public contracts before frontend/backend work is split. Use non-overlapping ownership;
  one owner integrates migrations, dependencies, process supervision, and the final suite.

## Implement end to end

Deliver the three new node types, local execution settings, fresh synthetic workspaces,
Codex process adapter, fixed tool recipes, durable approvals, integrity evidence, and Runs UI.
Use the internal stages in the product task. Do not stop after scaffolding or only a plan.

Keep direct Responses Model Call behavior and provider profiles intact. A Coding Agent
selects a LOCAL RUNNER profile, not a Model Call provider ID. M4's first live agent path is
Codex-managed ChatGPT login in an isolated, explicitly configured runner home. Do not bridge
GLM API keys into Codex or assume the current GLM text test proves tool-agent compatibility.

Do not modify the user's existing global Codex home/config/authentication. Generate safe
minimal configuration only in a NEW explicitly configured application runner home. The
user performs any real Codex login and required sandbox setup personally after implementation.
No authentication material belongs in app profiles, prompts, screenshots, logs, or tests.

Do not hardcode a current model name or require a preview. Let the user select an available
Codex model. Fail clearly when an installed capability is absent; no unsandboxed fallback,
no automatic global upgrade, no replacement with a simulated successful agent.

## Safety and scope

- Only app-materialized copies of the bundled synthetic repository are executable in M4.
  Never use this application repository or a company repository as the live agent target.
- Use normal implementation sandbox/approval controls. Do not use full-access/bypass flags.
  Runtime Codex uses workspace-write and denies escalation; it never opens a hidden prompt.
- Fixed Tool recipes execute trusted local code after a separate explicit code/diff approval.
  They are NOT an arbitrary-code sandbox. Reflect this truth in UI and documentation.
- No arbitrary executable/script/argument/working-directory/env settings from graphs,
  model outputs, imported JSON, or binding expressions. No shell interpolation.
- Keep owned-process jobs/handles and test untargeted-process survival. Never kill by name
  or ancestry. Do not change Windows services, firewall, users, global ACLs, or trust stores.
- No graph branching, external retry, harness-driven repair loop, auto-commit/push/merge,
  live company data, model token streaming, remote runners, or M5 features.
- Minimal Git initialization in NEW synthetic fixtures is permitted to establish a baseline;
  that is not permission to commit the Graph Engineering repository or an existing checkout.

## Verification and completion

Run the full matrix in M4_ACCEPTANCE.md. Use isolated SQLite, synthetic secrets, a controlled
fake Codex EXECUTABLE in tests, and real owned OS processes. A fixture agent must never be
selectable as a successful production adapter. Run a real .NET build/test against the
synthetic C# sample. Do not use EF InMemory or simulated command-success timers.

Test actual request/dispatch counts, partial effects, output floods, malformed JSONL,
process crashes, pending-approval restart, approval/cancellation races, stale evidence,
source/test tampering, authentication, and browser reconnect. Keep earlier checks meaningful.

Before finishing:
- Review the entire diff for unrelated changes, unsafe fallbacks, unverified success paths,
  secret exposure, placeholder UI, and dependency churn; fix in-scope defects.
- Write docs/handoffs/M4_REPORT.md using the template and update PROGRESS/README/contracts/
  security/environment docs narrowly. Preserve historical reports and source data.
- Provide exact first-time local runner setup/login, supported executable/model selection,
  routine startup, sample workflow, and manual acceptance instructions.
- Label every check PASS/FAIL/NOT RUN with evidence. Never convert fixture evidence into a
  live model result. If the adapter version is unsupported, explicitly state BLOCKED FOR
  REAL CODEX; report which other implementation/fixture checks passed.
- Without the user's real agent flow, use READY FOR USER AGENT CHECK only when all required
  automated gates and available installed-version metadata compatibility checks pass.

Do not automatically stage, commit, push, merge, or begin M5.
