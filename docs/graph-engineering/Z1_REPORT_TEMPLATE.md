# Z1 native graph integration report

Date/timezone:
Checkout path / repository URL / branch / starting and final HEAD:
Initial worktree changes preserved:
Status: BLOCKED / IMPLEMENTED — READY FOR USER AGENT CHECK / other accurately qualified status.

## Baseline and isolation

Installed versus pinned tool versions:
Actual baseline commands, exits, relevant failures:
Native desktop smoke result:
Isolated data/runtime paths and verified scope of isolation:
Startup/network behavior: source-derived, observed, and not verified (separate):
No existing user credentials/configuration accessed or changed (report any exception honestly):

## Integration map

Link Z1_INTEGRATION_MAP.md. List verified owner, file and symbol for workspace/model selection, session creation, prompt dispatch, input correlation, events, permissions/questions, terminal result, cancellation, navigation and persistence.

Describe the graph module boundary and any necessary small changes to host interfaces. Explain why normal Chat and Graph use the same runtime rather than two agents.

## Implemented behavior

Native entry, graph persistence/configuration:
Exact graph-to-session/input mapping:
Effective model/tool/instruction/permission parity and unsupported capabilities:
Conversation navigation and prompt ownership:
Run state, uncertain dispatch, cancel/restart handling:
Difference between agent completion and verified task success:

## Verification

For each category in Z1_NATIVE_AGENT_TASK.md, record PASS / FAIL / NOT RUN / BLOCKED, commands, actual tested layer, counts where applicable and evidence paths. Separate mocked service, controlled provider with real runtime, genuine native desktop and user live-agent evidence.

Baseline:
Final typecheck/lint/architecture:
Targeted tests:
Normal Chat regression:
Native desktop visual/smoke evidence:
Duplicate, permission/question, cancellation and restart evidence:
Intermediate failures and confirmed fixes:

## User-operated real-agent check

NOT RUN unless the user actually supplied the result.
Selected synthetic workspace:
Model alias (no key or private endpoint):
Task and expected file change:
Actual file/diff/tool/test evidence:
Graph attempt and native session/input match:
Permission/question and cancellation observations:
Completed-run reopen/restart:

## Changes and limitations

Changed source/spec/test paths and rationale:
Dependency changes, license notices and lockfile changes:
Unrelated preexisting changes preserved:
Unresolved upstream behavior or feature gaps:
Data migration: not performed in Z1.
Company repository access: not performed in Z1.
Final diff review:
Git mutations actually performed:

## Exact operator steps

Verified commands with project-local prerequisites and isolated data settings. Identify any network access they entail. Explain configuration through the application's own provider UI, the synthetic verification task, and normal shutdown without killing unrelated processes.

## Gate

Evidence available:
Evidence still needed:
Z2 remains unauthorized.
