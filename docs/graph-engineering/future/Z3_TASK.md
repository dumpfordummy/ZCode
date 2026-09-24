# Z3 — durable human checkpoints

## Objective and dependency

Dependency: Z2 sequential orchestration, explicit bindings, stable node/run identity, native interaction ownership, and inactive-only interrupted-run release are implemented and verified. Do not infer this from task files or screenshots alone.

Add an optional Human Approval node that pauses the graph between native Agent Tasks. Example:

`Start -> Analyze -> Approve interpretation -> Implement -> Approve result -> End`

It is a graph control node, not an agent prompt or replacement for native tool permissions. It must issue zero model requests or native input commands while waiting or merely displaying evidence.

## Required behavior

### A. Gate contract and editor

Use one node type for entry/intermediate/final approvals. Configure a title, review instructions, required evidence bindings, and optional comment policy. For Z3, the only decisions are Approve and Reject. Reject ends the run with a non-success result; 'request changes' routing comes in Z5.

Evidence is explicitly chosen from the run request, frozen upstream text, and supported source/diff snapshots. Do not imply that all workspace files were captured. Missing required evidence prevents creating an actionable approval request. Configuration can be saved incomplete but Run readiness must explain the problem.

Define the exact gate request schema using current conventions. Persist run/node attempt, request ID, request version, immutable evidence references/digests, workspace identity, relevant source baseline, and review text. A decision includes that request/version, decision ID, timestamp and local actor/session attribution. In a single-user desktop application this is not a certified human identity or tamperproof signature.

### B. Evidence-specific decisions

The approval panel shows exactly what is being approved, its source, selected workspace and intended successor. Open conversation navigates to existing upstream sessions without creating work. Freeze an artifact/text snapshot; do not have a historical approval render only whatever the file contains today.

Use the current native Git/diff/file services for a bounded source-change snapshot where supported. For code approval, establish the relevant baseline and changed/untracked files. Unsupported/binary/oversized entries need visible incomplete-evidence status, not silent exclusion. Do not create a full artifact platform; Z4 extends this.

A changed graph, changed evidence, or mismatched review version cannot use an old decision. A changed relevant workspace state before the successor dispatch pauses/stales the gate rather than inheriting approval. Recheck at dispatch through the current ownership path.

Hash checks and Graph ownership do not prevent unrelated editors from writing between checks. State this limit. Do not claim a directory is frozen or sandboxed. Later evidence must identify the actual source state used by a tool run where possible.

### C. Durable gate state and resume

Persist the pending request before showing Approve/Reject. Approval commits the decision and one successor-admission intent through serialized graph ownership. Duplicate decisions return the original result; conflicting concurrent Approve/Reject has one winner and an explicit conflict. No successor after Reject, cancellation, stale evidence, persistence failure, or unknown activity.

A pending gate can survive owning-app restart because it has no executing native input. Rehydrate it only after verifying predecessor terminal proof, no unconfirmed owned activity/pending admission, current graph guard, and matching evidence. Require an explicit user action to continue after restart; opening history does not advance it.

For a crash after a decision was committed but before the successor's dispatch is proven, distinguish a provably undispatched successor from an uncertain native dispatch. The former may be eligible for an explicit Continue action; the latter follows Z2 interruption rules. Never repeat creation/send to guess which happened.

Changing tabs does not reject or approve. Cancelling a waiting gate sends zero native stop commands when no input is active and permanently blocks further dispatch for that run. Native permission/user-question dialogs elsewhere remain unchanged.

### D. UI

Canvas states include Waiting for approval, Approved, Rejected and Stale evidence using current terminology. A run inspector shows pending request, selected artifacts, decision history and why Continue is blocked. Keyboard activation cannot approve a different selected gate or submit twice. Disabled controls explain the missing prerequisite.

No authorizing effects from importing a graph, changing a selection, resolving a view, or entering a gate comment. A final approval completes the workflow only after its own evidence was reviewed; it never implies a Git push/merge permission.

## Required verification

| ID | Scenario | Required result |
|---|---|---|
| Z3-A01 | Z2 baseline and old graph/run migration | Existing behavior preserved; no old run dispatched |
| Z3-A02 | Agent -> gate -> Agent through real native integration | First task completes; successor has zero admissions until explicit approval; then one owned input |
| Z3-A03 | Duplicate approval and simultaneous reject | One decision winner and at most one successor intent; stale clients get conflicts |
| Z3-A04 | Evidence/settings/version changed after display | Old decision rejected; no successor; historical snapshot unchanged |
| Z3-A05 | Native tool permission/question | Original native UI and ownership remain; graph approval does not auto-answer it |
| Z3-A06 | Cancel/reject while waiting | No subsequent agent input; late decisions cannot resurrect the run |
| Z3-A07 | Actual app restart while waiting | Same request/evidence/history; no model/send activity; one explicit safe continuation |
| Z3-A08 | Crash around decision commit/dispatch boundary | No guessed replay; uncertain work retains guard; provably undispatched work requires explicit continuation |
| Z3-A09 | Metadata failure and lost decision reply | No unpersisted approval effect; retry returns existing decision when committed |
| Z3-A10 | Source/diff review coverage | Selected tracked/untracked changes visible; incomplete/oversized evidence never silently approved |
| Z3-A11 | UI, localization, multiple views and ordinary Chat | Native navigation works; unrelated Chat remains usable; no duplicated sessions |

At least A02/A05/A07/A08 require actual owned Host/native integration and process restart where relevant, not only state-object reconstruction. Use a controlled provider and independent dispatch evidence.

## Out of scope and handoff

No conditional rejection route, repair loop, structured output platform, new identity service, daemon, remote execution, arbitrary shell executor or Git publication.

Write Z3_REPORT.md. Supply a pending-gate screenshot, evidence/decision details, restart evidence and exact manual instructions. A live-user gate check remains separate from controlled native proof. Stop after Z3.
