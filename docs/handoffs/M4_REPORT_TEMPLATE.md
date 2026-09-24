# M4 implementation report

Date/timezone:
Branch / starting HEAD / final HEAD:
Preexisting changes preserved:
Applicable instructions and authorized scope:

## Status

Overall: READY FOR USER AGENT CHECK / BLOCKED FOR REAL CODEX / FAIL / INCOMPLETE
M3 lead acceptance recorded (reference M3_LEAD_ACCEPTANCE.md, not invented rerun evidence):
U01 live user-agent flow: NOT RUN unless user supplied the result.
M5: not started.

## Baseline and versions

M3 baseline command/result/counts/artifacts:
Exact installed dotnet/Node/Git/Codex versions and canonical entry point:
Codex local-help capability matrix (stdin, JSONL, model, sandbox, approvals, home, optional flags):
Required user-operated authentication/sandbox setup:
No token/config-file/private-store inspection confirmation:
Dependency/toolchain changes and reasons:

## Implementation

Describe new node versions, runner/profile boundaries, sample materialization, recipe IDs,
approval purposes/evidence hashes, active/wait deadlines and durable recovery states.
Explain output contracts and preserved M3 compatibility. State actual sandbox mode; distinguish
Codex sandbox from standalone local Tool execution. Record any design deviation and rationale.

## Process and security evidence

Owned handles/jobs, containment timing, nested sandbox compatibility, stdio caps,
stdout/stderr draining, child environment, failure/timeout/cancel behavior:
Source/test integrity checks, candidate-to-test binding, and safe diff/artifact handling:
Authentication/CSRF/SignalR and approvals race behavior:
Untargeted synthetic process survival; any adverse incident with verified repair:

## Verification matrix

For A01–A20 in M4_ACCEPTANCE.md list:
ID | PASS/FAIL/NOT RUN | exact command/method | actual result/count | evidence path | limitations.
Do not omit intermediate failures; summarize the cause and the verified fix.
A fixture agent is not a live Codex result. A baseline synthetic repository is not user code.

## Operator instructions

Exact routine app start:
First-time runner home creation / login through Codex / model selection / sandbox setup:
Explain required manual setup without placing tokens in arguments or displaying auth files.
Create sample workflow and approval steps:
Completed and waiting-gate restart verification:
Rejection/cancellation and retained-workspace location:
Automated verification commands:

## U01 user evidence — separate

Initially NOT RUN. Populate later only from user observations:
CLI version/model; sample/task; agent output/diff; exact changed files; tool test counts;
entry/code/final decision result; same pending gate after restart; rejected-run zero-dispatch;
sanitized screenshots supplied. Do not invent run IDs, timestamp, usage or command logs.

## Limitations

List at least: trusted local code (not hostile-repo sandbox), user/model/CLI availability,
provider usage/cancellation uncertainty, internal CLI retries vs app dispatches, plaintext
local source/run artifacts, not a general secret scanner, no auto-repair/merge, synthetic-only
repository support and no new production-ready claim.

## Final diff review and handoff

Changed areas and purpose; scope review; commands actually run; remaining blockers;
confirm no user database reset/global settings changes/unauthorized repository edits;
no staging/commit/push/merge; next lead decision required before M5.
