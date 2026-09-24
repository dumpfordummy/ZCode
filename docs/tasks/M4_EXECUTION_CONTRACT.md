# M4 execution contract — invariants and acceptance semantics

This document defines new decisions for M4. Preserve M3 behavior unless an explicit extension
below is required. Implement equivalent names when the existing code already has a good
contract; document the mapping instead of maintaining two competing state machines.

## 1. Versioning and output data

Add independently versioned codingAgent, tool, and humanApproval types. Do not reinterpret
legacy Model Call/End definitions. Preserve prior stored snapshots and migrations. Update
strict parser/serialization/import/readiness tests. Unsupported versions remain errors.

Reuse explicit bindings. New node output objects are built by the backend:
- agent: bounded final text, candidateManifestHash, changedFiles, artifactRefs, process outcome;
- tool: recipeId, exitCode, outcome, artifactRefs and validated test summary where applicable;
- approval: purpose, decision, evidenceHash, decidedAt (no secret/session token).

Permit earlier-node object/text bindings only through declared output kinds. Extend End and
binding readiness narrowly without changing old v2 behavior. Model text cannot provide trusted
process status, gate decisions, executable paths, artifact storage paths or credentials.
Cross-run IDs cannot be read as current-run outputs. Keep missing/null and exact-number behavior.

## 2. Admission and snapshot

Retain single active-run admission and idempotent submission. Snapshot all effective execution
settings: workflow, run input, template version/base manifest, allowed files, fixed recipes,
runner revision/model/entry point version, relevant nonsecret policy and limits.

The template/workspace reference is a server-controlled capability, not an arbitrary path in
run input. Create the workspace only in the managed root after explicit submission consent.
Track partial materialization so crash recovery does not delete unrelated paths or silently
reuse an incomplete workspace. M4 creates no production database writes in external repos.

Metadata-only health/version checks must not call a model or run repository scripts. Changing
runner selection/path/model/permissions invalidates the old configuration version; a pending
run does not silently adopt it. Verify coherent runner identity and approval immediately before
launch. On mismatch stop with an actionable conflict. Historical run display survives profile
editing/deletion without substituting current values.

## 3. Approval state and concurrency

Store a durable ApprovalRequest and Decision with run/node/attempt identity, purpose,
immutable evidence references/digest, request revision, timestamps, state, and operator note.
State is not inferred from a Vue button or an LLM output.

Creating a pending request and transitioning the node/run to WaitingForApproval is one
transaction. All earlier external processes must be known quiescent and all reviewed evidence
committed before a pending approval can be durable. Waiting releases worker resources but
occupies the single active-run slot; show this and allow cancellation.

Decision input includes request ID, expected version/evidence digest, approve/reject, and a
client-generated decision ID. Apply compare-and-set atomically. Same decision replay returns
the original result; conflicting replay/stale version returns conflict; no duplicate work.
A lost HTTP decision response is recovered by protected read, not by a new side effect.
Approval/cancel/reject races have one terminal winner. Expired sessions must re-pair.

Before accepting approval, recompute/validate the relevant source and policy manifest.
A stale request cannot authorize changed content. In M4 mark the run Interrupted/NeedsReview
(or equivalent non-success terminal outcome) and require a NEW run rather than silently
regenerating/reusing old approval. Keep the old request/evidence visible.

Rejection is terminal Rejected, with downstream skipped. Cancellation is Cancelled/Interrupted
as appropriate, not rejection and not rollback. Final approve succeeds only after actual
required command evidence exists and the candidate/source digest still matches.

## 4. Restart and waiting semantics

M3 model-only recovery stays unchanged: uncertain/nonterminal external work is Interrupted,
never replayed. M4 adds ONE safe recovery case: a transactionally persisted, quiescent
WaitingForApproval request can remain waiting across restart. No process is launched merely
because the application started or browser reconnected. Re-pair and explicitly decide.

Require durable proof of quiescence when creating the gate. If a crash occurred during
materialization, dispatch, agent execution, command execution, evidence capture, or the
transition AFTER an accepted gate, mark unfinished work Interrupted. Do not resume a Codex
thread, repeat a command, or infer failure/success from an old PID.

A rejected/cancelled/completed run stays terminal. A changed/missing workspace invalidates a
restored approval. Same approval ID and immutable evidence should survive a clean restart.

Use a distinct wait expiry (default 24 hours) for human gates and bounded ACTIVE work time.
Retain M3's existing limits for model-only runs. For M4 default agent timeout 10 minutes,
Restore/Build/Test 5 minutes each, and active-work budget 30 minutes. Persist elapsed budget
rather than resetting it on reconnect/restart. Show expiry; no automatic approval on expiry.
A stricter administrator/app limit always wins. No run can wait or execute forever silently.

## 5. Owned-process supervisor

Reuse and extend the established exact-handle/Job Object ownership model. Do NOT implement a
second broad PID cleanup script. Microsoft Job Objects provide process lifetime management,
not a complete hostile-code security sandbox.

- Pin the executable/entry point and canonical working directory from the saved runner/recipe.
- Use structured argument vectors and stdin for the prompt; UseShellExecute=false where
  applicable. No cmd /c or PowerShell -Command built by concatenating prompt/data.
- A Windows npm .cmd shim is not an excuse for shell interpolation. Resolve a trusted
  installed entry point/native binary and, if necessary, a pinned node.exe plus script
  argument using a tested structured launcher. Unsupported launch paths fail clearly.
- Retain exact process/job handles. Ensure containment before untrusted child work starts
  (suspended creation/assignment/resume or an equivalently tested owned bootstrap). Do not
  spawn uncontrolled work and hope to discover descendants afterward.
- Non-inheritable ownership handles, kill-on-close, no permitted breakaway. Verify nested-job
  compatibility with the chosen native Codex sandbox; fail if containment cannot be established.
- Drain stdout and stderr concurrently. Bound line size, stored bytes, duration and termination
  waits. Test huge output with no newline and a child holding inherited pipe handles.
- Capture actual exit status and process identity/timestamps. Redact before persisting logs.
- After parent completion ensure no surviving owned descendants can still mutate source or
  write evidence. Do not declare a quiescent review gate merely because the parent exited.
- Cancellation is persisted before termination; wait for the owned job to become quiescent,
  then persist final effects/unknowns. A late callback cannot resurrect a cancelled run.
- Do not kill processes by executable name, cached PID, or parent ancestry. Test an untargeted
  synthetic Node process alongside each lifecycle scenario and prove that it survives.

Restrict child environments explicitly. Do not inherit the backend's full environment,
provider API keys, pairing/CSRF tokens, logging-exporter secrets, private package credentials,
or arbitrary Git/MSBuild/profiler overrides. Use per-run TEMP/TMP and controlled .NET/NuGet
locations where practical. Preserve necessary OS/tool paths through an explicit allowlist.
Never log an environment dump. Restrict tool registry arguments even when using ArgumentList;
argument escaping alone is not authorization.

Codex invocation gets its declared CODEX_HOME as a reference for Codex-managed auth. Standalone
build/test children do not get the app provider keys or a CODEX_API_KEY environment variable.
This is not protection against a malicious program running as the same Windows user and
reading files directly. UI must disclose the trusted-local-code boundary.

## 6. Codex adapter

The selected installed CLI is the compatibility authority. Current official documentation
provides direction; local help/version and an isolated synthetic compatibility check prove
what actually works. Never parse colored terminal prose as the API.

Consume JSONL incrementally with explicit supported event variants, line/body caps and safe
handling of optional fields. Support command/file activity and bounded final agent text.
Do not retain or surface hidden reasoning content. Unknown optional informational events can
be safely ignored by documented policy; unknown terminal shapes or malformed required data
fail honestly. No fabricated default completion when the stream ends.

Agent success requires verified terminal completion, a successful process exit and valid
post-run integrity evidence. A final chat message alone is not success; exit 0 alone with
missing/failed terminal events is not success. Nonzero exit, turn failure, invalid protocol,
missing output, protected-file edits or unmanaged remaining children block downstream work.
Store the actual diff via the host after quiescence; do not accept a model-supplied diff as fact.

In a single Codex session the model can make many tool/model calls and may use internal
provider retries. M4 promises one app-level agent dispatch per attempt, NOT exactly one
inference request or zero internal CLI retries. Bound wall time and supported settings; show
usage only when actually supplied. No invented hard token/cost guarantee from a timeout.
No app-level automatic restart, resume-last, or semantic repair dispatch.

Use only supported sandbox/config settings. Keep managed security policy in force. The app's
runner-home bootstrap must not import the developer's notify hooks, plugins/MCP, browser,
computer-use, subagent config, arbitrary code hooks or provider routing. Never silently
relax sandbox settings if a command is denied. A no-escalation policy means fail/continue
within allowed permissions, NOT automatic unrestricted approval.

Optional --ephemeral can limit Codex rollouts when supported. Regardless, document that
Codex-managed local history/data handling is distinct from the app's Responses store:false
request and its local SQLite artifacts. Do not promise that one controls the other.

## 7. Tool recipes and evidence

Build/test are local executable code. The app permits only the bundled trusted sample and
its human-reviewed candidate, and displays that they run as the local account (unless a
separately verified sandbox is explicitly provided in a future milestone). Do not advertise
path allowlists, a Git copy, or a Job Object as safe execution of arbitrary hostile code.

Freeze project/test/settings files, allowed source changes, SDK and dependency lockfiles in
the independent manifest. Recheck before EVERY app-managed tool. A passing test produced
by changing the tests or adding MSBuild hooks must not be accepted. Source mutation during
or after tools invalidates the candidate/evidence and final gate; tests are linked to the
exact input digest. Preserve results for diagnosis, not acceptance.

Generate a unique per-attempt output/results directory with no prior files. Parse structured
TRX with DTD/external entities disabled and strict size/depth limits. Require expected test
identity/count criteria, not just a console string or a reusable file named results.trx.
Use controlled artifact IDs with authorization and safe filenames for downloads. No arbitrary
filesystem file-serving routes. Bound diff/log/artifact sizes and never present truncation
as a complete review: exceed the review limit => stop for manual diagnosis.

Restore is a disclosed named step with locked dependencies; do not let Build/Test implicitly
restore or use different projects. Do not include private feed credentials. Prefer the
reviewed/cache-warmed sample dependencies for automated verification; missing prerequisites
are reported, not hidden by modifying global NuGet or Windows settings.

## 8. Durable effects, logs and errors

Commit launch intent before attempting process creation, as for M3's dispatch intent. Before
successful creation may establish NotStarted only when definitive; after possible creation,
unknown outcome is conservative. Distinguish OS process outcome from remote provider outcome.
Terminating Codex does not guarantee the remote provider stopped or that usage was not charged.

Commit output/artifact metadata/state/events together. Notifications follow commit and remain
bounded; failed SignalR publication cannot repeat execution. Crash after actual file changes
or command completion but before DB acknowledgement leaves Interrupted evidence, not replay.

Artifacts/diffs/logs may contain source code or accidental secrets. Only synthetic repositories
are supported in M4. Reuse safe rendering, known-secret filtering and limits; do not claim a
general secret scanner. Run data/artifacts remain locally retained plaintext unless explicitly
otherwise implemented. Never copy auth files, browser pairing data, or provider credentials.

## 9. Recovery/manual retention

Retain failed/cancelled/rejected workspaces and evidence for explicit local inspection. Do
not auto-apply or clean changes. No new bulk cleanup feature is needed in M4. Document the
paths and backup sensitivity, but do not expose host paths outside an authenticated view.
Mark known residual limitations rather than expanding into M6 packaging/retention work.
