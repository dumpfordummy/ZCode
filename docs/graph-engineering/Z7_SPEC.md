# Z7 bounded Fork/Join and reviewed integration

The explicit Z7 instruction waives repeating Z6 prerequisite/baseline verification and writing `Z7_REPORT.md`. Existing specifications and checks remain applicable to changed behavior. This specification precedes implementation. Z1–Z6 definitions, history, provider ownership and packaging retain their semantics.

## Product and ownership

Graph Engineering gains an explicit optional Fork/Join plan, separate from the sequential draft. A bounded plan contains an approved request/shared contract, one or two selected independent Agent workers, an all-selected Join, a reviewed integration Agent, configured combined Build/Test and final Human Approval. Maximum concurrency is two (one is supported for comparison); the feature must be explicitly enabled. Multiple outgoing sequential edges never imply parallelism. Arbitrary nested subworkflows and recursive forks are unsupported.

The existing Host `GraphState` owns the parent plan, immutable runs and dispatch reservations in the existing workspace record/lease. Each child operation uses the existing `GraphEngineeringService` and native session/tool services in a distinct real workspace. Child runs alone own native attempts/facts; the parent stores their exact references and frozen completed proposals, not a second native queue. The fixed worker/integration/validation decomposition is internal to the bounded Fork/Join operation, not a general nested workflow API. The renderer owns only drafts and inspection selection.

```mermaid
sequenceDiagram
  actor Operator
  participant Host as Graph Host / original workspace lease
  participant Git as existing Git service
  participant Workers as existing Graph runner / separate native workspaces
  participant Integration as existing Graph runner / integration workspace
  Operator->>Host: Preview clean base and native operational configuration
  Operator->>Host: Approve preparation (exact preview digest)
  Host->>Host: Persist workspace intent and immutable plan
  Host->>Git: Create independent owned clones of pinned HEAD
  Host->>Workers: Initialize native workspaces; capture actual configuration
  Host-->>Operator: Prepared workspace/configuration inventory
  Operator->>Host: Approve plan and Unknowns (exact digest)
  Host->>Host: Persist stable child request IDs / admission reservations
  Host->>Workers: Run selected branches through existing admission (limit 2)
  Workers-->>Host: Exact persisted native completion / proposals
  Host-->>Operator: Join proposals and explicit conflicts
  Operator->>Host: Approve exact integration selection / bounded conflict choices
  Host->>Integration: Fresh native integration Agent with explicit proposal data
  Integration-->>Host: Native completion
  Host->>Git: Compare complete resulting diff with approved proposal bytes/base
  Host->>Integration: Existing native combined Build/Test + final Human Approval
  Integration-->>Host: Fresh combined evidence and approved final result
```

## Isolation and base policy

Use independent local Git clones with no shared object alternates/hardlinks and an empty template. Derived directories are under the profile's Graph-owned workspace root, keyed by stable run/slot IDs; local canonical identity is the verified real absolute path. Do not create fake identity aliases for the same directory. No remote workers. The native full toolset remains available; edit scope is checked when collecting proposals and is not an OS access-control boundary.

Require the original selected path to be the real repository root, a committed clean tracked/nonignored-untracked baseline, ordinary index entries and supported regular source files. Refuse aliases, linked worktrees/submodules/symlinks, unsupported modes/binary changes and known credential/config-secret filenames in the snapshot. Ignored files, dependencies, native credentials, installed app data, caches and local Git configuration are not copied. Git preparation uses the existing Git command provider with controlled clone Git configuration, no hooks/templates/credential helpers and removes the clone remote. Original source/index/HEAD stay unchanged; no stash/reset/commit/push/merge. Missing dependencies/tooling remain actionable failures. Clean-base fingerprints are rechecked before effects and retained after external changes.

Only selected existing Build/Test recipes are copied through the current recipe service into the owned workspace; no arbitrary original native configuration file is copied. Tracked project instructions and native inherited configuration remain visible in captured native provenance. Preparation explicitly permits native workspace initialization; preview itself only reads an already initialized native inventory. Before Agent admission, display each owned workspace's actually resolved native configuration and selected/auxiliary destinations; Unknowns require a recorded operational acknowledgment. Semantically changed inventory blocks subsequent admission.

## Execution, evidence and integration

Native runtime identities include the actual workspace path and process generation. Preserve them verbatim for exact matching; Tool records and recovery proofs must accept the same nonempty opaque identity as Agent records, including paths longer than 200 characters. Entity/session IDs retain their separate existing bounds.

Clones are shallow (one base commit), single-branch and exclude tags: Graph does not copy old repository history or other branch snapshots. Local native SQLite `session.workspace_id` can be null; this optional column is not the admission identity. Verify the existing real `directory`, Host workspace key, runtime identity and exact session/input/command instead. Every prepared child also binds the selected recipe contents in its inventory digest. Owned child directories cannot themselves host another Fork/Join plan.

Freeze enabled/selected branches, stable IDs, request/shared contract, explicit expected files and separately approved untracked additions, result criteria, native model/mode, recipes, base and configuration digests. Persist preparation/child request intent before filesystem/native effects. Repeated requests return the original record or reject mismatched payloads. Lost creation/submission acknowledgment never retries. UI reads/restarts never dispatch.

Run-wide deadline and admission budget include selected workers, integration Agent and both combined Tool operations. Limit selected workers to two and in-flight worker admissions to configured concurrency 1 or 2. A failure, unknown outcome, deadline or budget stops further admission. Cancel only existing child runs through the native exact-owned cancellation path; unrelated Chat survives. Wait for authoritative child inactivity before integration or cleanup. Unselected branches remain explicitly Skipped.

Collect bounded complete native Git source snapshots against the same pinned base. Reject staged/committed changes, out-of-scope edits, undeclared additions, symlinks/binaries, traversal, incomplete content, conflicting source modes or source/config drift. Captured before/after text, modes and digests are immutable proposal evidence. Any shared path is an explicit conflict; require a named selected branch per conflict and a comment, with one recorded integration decision. No implicit last-writer-wins. A contract/scope violation stops for a new reviewed plan instead of regenerating files.

Integration is a fresh normal native Agent task in its own clone, with approved proposals passed as bounded data. After its terminal proof, capture the entire diff and require exact agreement with the approved proposal. Any extra/omitted/changed content stops before tests. Then use existing native Tool nodes for configured Build/Test and existing immutable artifacts/final gate. Real combined failure cannot reach success even if every worker claimed PASS. Applying the final result to original user source is a separate user operation outside Z7.

## Recovery, retention and UI

The public Git RPC supports preparation and ownership validation only. Actual deletion is a Node-only capability passed during service construction, reachable through the parallel owner's audited control path after inactivity checks. Unknown RPC actions must reject; they must never fall through to cleanup. Preserve/unpreserve decisions and successful cleanup retain the selected slots, timestamp and operator reason in history; invalid selections are rejected before changing retention.

Ownership validation compares all marker field values structurally; JSON object key order is not identity. Repository schema parsing may reorder keys on restart without changing ownership. Any changed field, base, token, directory or native identity still refuses cleanup/admission.

Parent history includes branch aliases/paths, child run IDs, actual session links, phase, conflicts, proposals and combined artifacts. Conversation navigation uses the child attempt's actual session and workspace. Multiple views share the existing Host lease/CAS owner. Original sequential runs and parallel runs exclude each other within the original workspace's Graph guard, without blocking unrelated native Chat.

Cold parent runs become Interrupted. No automatic worker replay, partial integration or directory cleanup. Explicit inspection reconciles child evidence without dispatch. Retain owned directories by default. Cleanup is explicit, selected, requires a non-preserved owned marker and confirmed inactive child runs plus no observed native runtime for that workspace; foreign paths, aliases and root/home/original-repository targets are rejected. Uncertain effects stay uncertain even after an audited inactive release. Same-user malicious tools/other processes remain outside the coordination guarantee.

## Acceptance

### Additional portability requirement (Z7-A12)

The user additionally requires exporting a graph containing Fork/Join and importing it as a new graph, preserving branch connections, concurrency limits, the all-selected Join policy and integration configuration. Import is a draft/library operation: it must not prepare worker or integration workspaces, initialize native runtimes, create sessions or submit work. A successful sequential-only transfer is not evidence for this requirement. The imported graph must have new identity and no copied run history, ownership markers or prepared workspace/session identities; existing graphs must remain unchanged.

This is a newly recorded acceptance requirement, not a claim that the current portable contract supports it. Verification must distinguish an unavailable Fork/Join transfer path from tested rejection of unsupported payloads. Fixed executor behavior alone does not establish that branch topology, Join policy or integration configuration survived serialization. Record the actual result and retain the earlier Z7-A01–A11 evidence.

Already confirmed native terminal runs are inactivity proof through the existing Graph contract; they do not need an additional `recovery` property. A failed directory validation retains metadata-only history and must not prevent cancellation of other known children. A rejected review is persisted and cannot be changed into approval by retrying its ID. Cleaned child history/proposals remain visible, while execution/conversation navigation into its deleted working directory is disabled. Partial preparation failures retain the exact external ownership-intent marker and directories for inspection; no automatic destructive rollback or uncertain preparation replay is provided.

Implement Z7-A01–A11 from `future/Z7_TASK.md`: disabled/sequential regression; distinct native workers; dirty/stale base refusal; reviewed integration and fresh tests; conflicts; failure/permission cancellation with unrelated Chat; actual active-worker restart; path/patch/addition refusal; safe cleanup; concurrency/budget/multiple views; and passing workers with failing combined tests. A02/A04/A06/A07/A11 require actual native controlled-provider processes/tools and filesystem observations. Record sequential-vs-parallel elapsed time and native input/model counts as an experiment without a speedup claim. User/live-provider/company and unavailable-platform checks remain NOT RUN. No Z7 report or Git publication; stop before Z8.
