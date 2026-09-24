# Z7 — explicit parallel workers with reviewed integration

## Objective and dependency

Dependency: verified sequential workflow/template behavior from Z6, native workspace identity support, and a reviewed isolation/integration design. Parallelism is optional; keep a sequential-only release possible.

Add an explicit Fork/Join region. Do not infer parallelism merely from multiple outgoing edges or run multiple agents against the same writable directory.

Target:

`Approved plan -> Fork independent tasks -> Join -> Integrate -> Build/Test combined result -> Human review`

A correct final result is the integrated, retested result, not the union of individual workers saying PASS.

## A. Workspace preparation and isolation

Investigate native worktree/isolated-workspace capabilities and relevant Git behavior at the checked-out version. Use the existing services, canonical workspace identities, and a frozen base revision plus an explicitly handled dirty-state policy. Prefer refusing an unreviewed dirty baseline in the first implementation; never discard/stash/reset user changes silently.

Each code-writing worker gets a separate app-owned working directory/identity and native session. Git worktrees, clones or other chosen mechanisms must be verified for shared metadata, hooks, native configuration, dependencies and cleanup effects; do not describe them as OS security sandboxes. Shared repository metadata and unrestricted native tools may still affect other locations.

Full workspace reading and the normal native toolset remain available under the selected policy. Intended edit ownership is a coordination rule unless actual permission enforcement exists. Explicitly document the enforcement boundary and unsupported tool escapes instead of claiming impossible universal isolation.

Capture permitted task scope, base source state, expected files/shared interfaces, selected model/skills/configuration and result requirements before dispatch. Do not copy credential files, installed app data or private caches as part of a workspace snapshot. Dependency/network access uses the same approved operational policy as sequential execution.

If native identities/admission do not support the needed separation, report the blocker. No path-string alias trick or relaxed guard to pretend workers are independent.

## B. Scheduler and fork/join

Start with a small explicit concurrency limit, for example two, and preserve run-wide deadlines/admission budgets. Model usage may be unknown; do not manufacture cost savings or promise speedup.

Each selected branch has a stable ID, workspace, node attempts and exact native input identity. Persist branch intent before dispatch. Unselected branches are Skipped. Join has a declared policy; initially require all selected branches to complete validly before integration. Optional/skipped semantics must be explicit, not inferred from timeout.

One failed/unknown branch cannot be omitted to claim combined success. Stop further admissions, cancel other active work only according to the declared policy and exact ownership, preserve evidence and wait for confirmed inactivity before integration/cleanup. Do not kill a shared runtime or cancel unrelated Chat.

Questions/permissions identify the responsible branch and use native dialogs. Cross-worker messages/subagents remain whatever normal runtime supports; Graph does not add invisible cross-session prompt injection or an independent parallel executor.

## C. Change collection and integration

Workers return proposed changes and evidence against the pinned base. Prefer native diff/patch services; capture tracked changes and explicitly approved untracked additions, deletions and supported file modes. Unsupported binaries, symlinks, outside paths, conflicts or incomplete capture block automatic integration rather than disappearing.

Do not let workers silently commit/push/merge. The graph captures proposals and integrates only through an explicitly configured integration step into another app-owned workspace, not directly into the user's original worktree. Integration is a distinct operation/agent with a fresh evidence set and normal permissions.

When changes conflict or violate the agreed shared contract, show the conflict and require a bounded reviewed resolution. Do not invent a last-writer-wins or silently regenerate all files. Non-conflicting application must still validate expected base hashes and produce a full combined diff.

Build/test the integrated source again. Branch-level test passes are not combined validation. Final approval refers to the integrated diff and fresh combined artifacts. Applying it to an original user branch/worktree is a separate explicit user action; no automatic merge or publication.

## D. Recovery, cleanup and inspection

The Runs view shows branches, session links, workspace aliases, states and integration artifacts. Opening a worker conversation uses that exact existing session. Workspaces remain inspectable until the user chooses safe cleanup/retention policy.

On restart, unknown worker effects remain unknown. Do not automatically rerun branches, integrate partial results, or delete their directories. Cleanup requires confirmed inactivity, exact app ownership, and no user-requested preservation. Refuse root/home/user-repository targets, aliases and foreign paths; never use broad process/name or recursive-directory deletion heuristics.

Record a comparison of sequential versus parallel wall time/resource use on the same fixture only as an experiment. Quality/correctness gates remain mandatory even if parallel execution is slower or more expensive.

## Required verification

| ID | Scenario | Required result |
|---|---|---|
| Z7-A01 | Sequential regression and disabled feature | Old graphs unchanged; disabled parallel nodes cannot execute |
| Z7-A02 | Two actual native workers | Separate identities/directories; one worker cannot overwrite the other's working files in the normal tested path |
| Z7-A03 | Shared/dirty baseline and external source change | Explicit preflight conflict; no silent stash/reset; pinned base retained |
| Z7-A04 | Independent edits and integration | Full captured proposals applied to owned integration workspace; independent combined tests pass |
| Z7-A05 | Conflicting edits/shared-state contract break | Visible integration stop/review; no last-writer-wins or partial success |
| Z7-A06 | One worker fails/unknown, another waiting on permission | No integration; targeted policy cancellation; unrelated Chat survives |
| Z7-A07 | Actual restart with active workers | No automatic resubmit/integration/cleanup; all ownership and artifacts retained |
| Z7-A08 | Traversal/symlink/unsupported patch/untracked files | Safe refusal or explicit unsupported result; no out-of-scope application |
| Z7-A09 | Cleanup known-owned versus foreign/active directories | Only inactive selected app-owned workspaces eligible; user files unchanged |
| Z7-A10 | Concurrency/budget caps and multiple UI views | Hard caps and one dispatch per attempt; no duplicate workers |
| Z7-A11 | Branch passes but combined test fails | Final approval/success path blocked by real combined failure |

A02/A04/A06/A07/A11 require real native processes/tools and filesystem observations, not mocked workspace objects. They establish the tested coordination behavior, not immunity to malicious same-user tools.

## Out of scope and handoff

No distributed cluster, remote/SSH workers, unlimited fan-out, automatic branch publication, implicit collaborative edits in one worktree, or OS sandbox marketing claims.

Write Z7_REPORT.md with workspace/isolation diagram, branch/base identities, actual diffs, combined test evidence, cleanup results and documented boundaries. Stop after Z7.
