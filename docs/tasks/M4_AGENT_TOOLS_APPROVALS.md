# M4 product task — real code changes, tools, and approvals

## 1. Outcome

An engineer can open the current Vue editor, use three new node types, run a small coding
task in a fresh synthetic repository, inspect the actual diff, explicitly authorize local
build/test execution, and accept or reject the verified result. The application, not the
agent's prose, determines whether a process completed, tests executed, or approval exists.

Keep the current Vue/Vue Flow/.NET/SQLite modular monolith. Reuse the M3 worker, snapshots,
ordered events, bindings, authenticated SignalR, and run pages. No UI redesign or new platform.

### Reference flow

Start → Entry Approval → Coding Agent → Approve code for tools → Restore → Build → Test
      → Final Review → End

Entry Approval, Approve code for tools, and Final Review are differently configured instances
of Human Approval. Restore/Build/Test are configured Tool instances. A failed/rejected path
stops; there is no graph retry or repair branch in M4.

The extra middle approval is intentional. Codex may use tools within its own sandbox during
the coding session; the standalone .NET tool process is a different execution boundary.
The user must review the resulting source and authorize THAT source to run locally.

## 2. Scope

Implement:
- Coding Agent, Tool, and Human Approval node types, versioned explicitly.
- A Local runners settings page and capability/readiness view.
- One explicitly selected installed Codex adapter using batch JSONL execution.
- One built-in synthetic C# repository template; a fresh app-owned repository per run.
- Fixed named Restore/Build/Test recipes, selected by ID, not a freeform terminal.
- Actual process results, candidate diff, source integrity manifest, and test artifacts.
- Three approval purposes: authorizeAgent, authorizeTools, acceptResult.
- Durable pending approvals and authenticated idempotent decisions.
- Existing linear ordering, one active run, one writer, cancellation and conservative recovery.

Do not implement:
- Arbitrary local/remote repositories, cloning URLs, worktrees of user repositories.
- Arbitrary PowerShell/shell scripts, command generation, configurable environment secrets.
- Automatic merges, patch application to the source template, deployments, or branch pushes.
- Model-call tool calling, a second Responses agent loop, LangGraph, or an app-server layer.
- Chat Completions, new GLM compatibility, cross-provider credential bridging.
- General conditions, graph cycles, parallel runtime agents, reviewer/repair loops (M5).
- General-purpose OS sandbox construction or claims of protection against malicious code.

## 3. Node and profile design

### Coding Agent

Inspector fields: node name/description, runner profile, explicit model selection, literal or
M3-style bound task prompt, output summary expectations, timeout. For M4 allow at most one
Coding Agent per executable sample flow. Give the node the already-materialized run workspace;
never take a path from prompt text or model output.

Use a local runner profile distinct from a ProviderProfile. Minimum metadata: stable ID,
revision/connection version, friendly name, canonical trusted executable/entry point, version,
configured dedicated Codex home, model, selected supported sandbox mode, and limits.
No API keys, auth tokens, credential copies, or graph-supplied CLI flags.

The first runtime authentication path is Codex-managed ChatGPT login. A dedicated app runner
home prevents inherited developer MCP/hooks/provider/notify config from silently changing the
run. The user logs in through Codex's supported local flow. The app may invoke a documented
non-secret status command if supported; it must never parse the token files itself.
Existing GLM direct Model Call nodes keep working independently. The user can keep using a
different model in their developer Codex session; do not alter that session's configuration.

Metadata validation is not a successful live agent test. Report separately: executable found,
version compatible, configuration ready, login reported, native sandbox verified, and last
user-run result. Do not invent a model catalog or infer subscription availability from a name.

A batch invocation must use verified equivalents of JSONL output, stdin task input, explicit
working directory/model, workspace-write sandbox, and no escalation. Optional ephemeral mode
is useful only if present. Do not assume current docs flags exist in version 0.106.0 reported
by M3. No full-auto shortcut, danger-full-access, bypass flag, managed-policy suppression,
web/MCP/plugin/subagent enablement, or silent fallback to another executable or provider.
User-approved sandbox setup is a separate installation action; do not run it automatically.

### Tool

Inspector: fixed recipe ID, timeout within policy, title/description. Show the resolved
executable, arguments, cwd and trust boundary as READ-ONLY execution details.

Initial recipes:
1. Restore sample dependencies using locked manifests and an explicit source/cache policy.
2. Build sample with restore disabled and persistent build servers disabled where supported.
3. Test the exact sample project/assembly with no implicit restore/build; emit a fresh TRX.

Validate the installed SDK/test-runner flags. Pin the sample to VSTest/xUnit behavior already
used by the app unless a documented local compatibility reason requires otherwise. Select an
explicit project/solution; never rely on cwd globbing or whatever file happens to be present.

Recipe IDs map to backend-owned command construction. No flags, paths, environment values,
project files, sources, shell expressions, or script text from model output. A prompt field
is not a command field. Reject attempts through raw HTTP/import too, not merely in the UI.

Tool success is based on the actual owned process exit plus recipe-specific evidence.
For Test require a fresh parseable result with expected discovered tests, nonzero executed
count, and zero failures/skips under the sample's declared criteria. Missing/stale/fake test
results or “0 tests” are not success. Do not trust the agent's “all tests passed” statement.

### Human Approval

Inspector: purpose (authorizeAgent/authorizeTools/acceptResult), title, bounded checklist,
optional operator note. Review evidence is assembled by the BACKEND, not supplied by a model.

- authorizeAgent: exact task, workspace/base manifest, runner version, selected model,
  sandbox/permission policy, bounds and data-egress disclosure.
- authorizeTools: actual source diff and current manifest, protected-file integrity,
  fixed command recipes, current runner/workspace identity, and local-code trust warning.
- acceptResult: exact candidate digest, fresh build/test artifacts, test counts, actual exit
  codes, changes list and artifact hashes. Passing tests do not automatically grant approval.

Buttons: Approve / Reject / Cancel run. “Approve” means only the named next capability or
review decision; it never commits, pushes, merges, deploys, or certifies slot math.

Static readiness plus runtime checks must prevent bypassing the required approval order.
An imported graph cannot place a Tool before authorizeTools or approve an earlier version of
the files. A final gate cannot convert a failed build/test into successful completion.

## 4. Workspace and synthetic fixture

Only a bundled template ID is executable in M4. Create a unique copy under the configured
app-managed workspace root per submitted run. No existing source checkout is opened for
modification. Do not copy credentials, .git internals, symlinks/reparse points, dependencies,
user settings, external imports, submodules, or arbitrary hidden files from outside the template.

The template is a tiny pinned .NET C# library plus tests for NormalizeSpaces(string?). Only
src/Demo/WhitespaceNormalizer.cs is authorized to change. Tests and build configuration are
protected by the independently stored manifest, not by a suggestion in the prompt.

A manifest outside the agent-writable tree stores canonical relative paths, bytes/hashes and
size limits. Build a source/evidence digest excluding only explicitly declared generated
bin/obj/results locations; never ignore source changes because Git happens to ignore them.
Keep runner logs, immutable evidence, and approval records outside agent-write locations.

Initialize a NEW isolated local Git repository with a synthetic baseline if required by Codex.
Disable external helpers/hooks/templates/signing for this controlled fixture initialization;
use per-invocation/local config only. No remote, shared Git object store, or user Git mutation.
This narrow fixture baseline operation is permitted. No other commit/push/apply is permitted.

Recheck canonical paths, regular files, all protected files and allowed modifications after
agent completion, before tool authorization, immediately before each tool, and at final
review. An out-of-scope change blocks tool execution and leaves the evidence inspectable.
No automatic git reset/clean, patch rollback, or deletion of a failed workspace.

Git output helps display a diff; a Git status or commit hash alone is not the integrity source.
Include new/deleted files in checks. Disable textconv/external diff helpers. Derive candidate
identity from the independently checked file manifest. Detect unexpected changes to protected Git metadata (HEAD, refs, config, hooks or
alternates) rather than silently trusting a rewritten baseline. Do not treat normal
index/stat-cache refreshes from read-only Git inspection as source modifications.

## 5. UI

Preserve the editor layout and existing workflow history. Add the three palette items and
per-type inspector forms, with readiness errors explaining missing runner/gates/settings.
Provide a Create sample coding workflow action so the first test does not require wiring
nine cards manually. It creates a NORMAL editable workflow; it is not a fake execution demo.
Runner references unresolved on another installation remain unresolved, never auto-associated.

Runs view additions:
- Waiting for approval status and clear purpose/checklist/evidence.
- Actual agent task, selected runner/model/version, visible tool/file activity summaries,
  bounded final agent text, actual candidate diff and changed-file count.
- Tool recipe, resolved command/cwd, exit code, duration, bounded stdout/stderr, test results.
- Approval actor (local paired operator, not an invented verified name), decision timestamp,
  evidence digest and decision history.
- Plaintext rendering, no executed HTML/Markdown links or terminal escape interpretation.
- A frozen graph and existing ordered-event/reconnect behavior, not a second event system.

Differentiate: Agent completed / Build succeeded / Tests passed / Waiting for review /
Accepted by operator. A green agent node does not imply correctness or merge approval.
The Final result is a backend-generated evidence summary and references, not agent prose
claiming everything succeeded. Rejection retains work and clearly stops the run.

## 6. Internal implementation stages

A. Baseline, version capability inventory, contracts, synthetic template/materializer.
B. Durable approvals and fixed process recipes; prove with real benign fixture processes.
C. Codex JSONL adapter with controlled executable fixtures; no paid calls during development.
D. Graph/inspector/runner settings and integrated evidence UI; user-ready sample template.
E. Full regression/fault/browser/lifecycle verification and operator handoff.

These are internal work stages, not permission to stop after A or ship simulated C.
Keep the simplest viable contracts. Do not create an enterprise plugin registry or repository
management product to support one controlled runner and one disposable sample.
