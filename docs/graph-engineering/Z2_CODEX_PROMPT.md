# Z2 implementation prompt

Continue the existing ZCode fork. The user has accepted native React/TypeScript Graph Engineering as the product direction; the Vue/C# prototype remains untouched. No standalone M4 implementation is required.

The lead accepts Z1's native integration for development progression based on the implementation report and the user's greeting/Chat screenshots. This is not a complete live-tools acceptance, code audit, or distribution approval. The screenshot does not independently prove matching Chat IDs or filesystem operations. Carry the live repository check forward honestly.

## Read first

1. Applicable upstream/local AGENTS.md and its required architecture/design material.
2. Existing Z1_SPEC.md, Z1_INTEGRATION_MAP.md, Z1_SETUP.md, Z1_REPORT.md, and WINDOWS_DISTRIBUTION_REPORT.md if present.
3. docs/graph-engineering/Z1_LEAD_REVIEW.md.
4. docs/graph-engineering/Z2_TASK.md.
5. docs/graph-engineering/Z2_VERIFICATION.md.
6. docs/graph-engineering/Z2_MANUAL_CHECK.md.
7. docs/graph-engineering/Z2_REPORT_TEMPLATE.md.

Z2 is authorized. Update stale scope/gate statements narrowly; do not rewrite historical results or ignore other repository instructions. Do not recreate Z1, reclone over the repository, or begin Z3.

## Before editing

Inspect current HEAD, branch, existing changes, actual toolchain, and later packaging changes. Preserve all user work and authorized Git history. Run the existing baseline. Record actual failures and compare baseline versus changed files; do not claim full-green status when CLI lint or formatting fail.

Trace the existing Graph service, native input/session correlation, exact final text extraction, controls/ownership, persistence, and cancellation. Define the Z2 contracts/specs before parallel implementation. Parallelize only non-overlapping files after agreeing contracts; do not run emitting typecheck and desktop bundle writers concurrently.

## Implement end to end

- Native canvas for Start -> one to eight Agent Tasks -> End.
- Node editing, valid sequential edges, persistence, and real readiness errors.
- Captured workspace/native model and permission settings.
- Explicit Start-text and previous-final-text bindings; fresh session per node.
- Host-owned sequencing with frozen snapshots and exact native evidence.
- Same-session Open conversation, native tools/interactions, and per-node Runs inspection.
- Conservative failure/cancellation/restart and audited release of confirmed-inactive interrupted work.
- Z1 compatibility and ordinary Chat regression protection.

Do not substitute a raw model call for a native Agent Task, create a second executor/provider store, or add a C# sidecar. Do not permanently restrict native tools to a sample allowlist. Test on synthetic workspaces while preserving the actual selected-workspace product behavior and normal permissions.

Do not auto-answer questions, infer completion from prose/idle/cold history, replay uncertain inputs, or unlock unknown work that may still execute. No automatic repair loops, parallel graph agents, commits, pushes, or merges.

## Verification and handoff

Use the existing isolated development/native harness, synthetic credentials, controlled providers, actual native tools, and independent fixture tests. Do not inspect installed credentials, open company projects, change global settings, or run paid/live-model tasks yourself. Do not kill processes by name or PID ancestry.

A native tool-using agent task can make multiple provider requests. Assert one owned initial input per node attempt and exact handoff content, not one provider request per node. Verify all matrix entries at the stated layer, including no extra sends on navigation/reopen, matched cancellation, current session ownership, and inactive-only recovery.

Review the final diff and fix in-scope defects. Write docs/graph-engineering/Z2_REPORT.md with actual evidence, baseline exceptions, remaining limitations, and exact local startup/manual instructions. Update current progress and append user greeting evidence accurately; do not overwrite Z1 historical results.

Mark live user repository/multi-node checks NOT RUN unless the user has personally provided them. Report READY FOR USER MULTI-AGENT CHECK only when required changed-feature and native checks pass with any documented baseline exceptions. A mock-only implementation is insufficient.

Do not stop after scaffolding or a plan. If a genuine native interface, runtime, or environment blocker remains, provide its exact evidence and stop that unsafe path rather than inventing a workaround.

Do not automatically stage, commit, push, merge, publish a release, or begin Z3.
