# Z1 lead review

Review date: 2026-09-24.

## Basis and decision

Basis: the user-supplied `Z1_REPORT.md` and two screenshots showing Graph Engineering run cards and a native greeting conversation. No repository checkout, binaries, raw logs, native summary JSON, or distribution report were independently inspected in this review.

**Z1 native integration: accepted for development progression. Z2: authorized with the carry-overs below.**

The report's user-operated check was written before these screenshots. Append the new evidence without rewriting historical fixture results into live-provider results. Record the greeting/navigation check as user-supplied, and leave the real Read/Edit/test, permissions, cancellation, and restart check unconfirmed unless the user supplies it. Do not infer the session ID of Chat from its title; the screenshot does not show a comparable Chat ID.

## Evidence we rely on, with limits

The report describes the ordinary native path: session creation via the existing session service; V4 command submission through the existing agent service/CommandInbox; exact source-command correlation; native interaction dialogs; and navigation that opens the stored session without create/send calls. It also reports actual Electron/Host/CLI Read/Edit/Bash execution with a controlled model provider, independent file/test checks, same-session navigation, completed restart, pending interruption, and cancellation that preserves an unrelated native Chat.

Those are reported native-runtime tests, not merely a fake agent adapter, but they remain report-derived rather than independently rerun evidence. They are not live-model quality or private-project compatibility evidence.

Reported verification includes root typecheck/lint, CLI typecheck, managed architecture checks, 28 focused Graph tests, 10 service tests, 10 UI tests, and four native interaction registry fixtures. Root CLI lint/formatting are not universally green: CLI lint reports 85 existing errors in untouched files, and root formatting fails across 2,858 files. Do not summarize this as 'all checks passed'.

## Carry-overs for Z2

### C1 — real workspace-tools proof remains open

The screenshots show a greeting with the default workspace and automatic-edit mode. They do not show source inspection, edits, shell/test results, or a selected game project. Obtain one user-operated synthetic repository task using ordinary native Read/Edit/test behavior and Ask before changes. The implementation agent must not perform paid/live-model work or use company source to close this check.

### C2 — recoverability of interrupted work

Z1 intentionally retains a graph guard after unproven interruption. That is safer than replaying uncertain work, but the report explicitly has no abandonment/reset UI. It can block subsequent Graph work in a workspace.

Before Z2 is considered usable, add inspectable recovery with an explicit audited release path for an attempt whose owned execution is authoritatively confirmed inactive. Never equate release/abandonment with success, failure, rollback, or proof of no side effects. Never auto-resubmit. Keep unconfirmed running work guarded and explain the exact reason and supported next action; do not tell the user to delete state files or kill processes by name.

### C3 — distinguish baseline failures from regressions

Reproduce the current baseline and record exact commit, commands, diagnostics, and changed-file scope. When necessary, compare in a separate untouched temporary checkout/worktree without resetting the user's repository. The reported CLI errors being in untouched files is useful evidence; do not silently assume every formatting failure is preexisting. New/changed-file errors are in scope. No repo-wide reformat, relaxed lint rule, or new blanket suppression just to get a green badge.

### C4 — current build and isolation provenance

The report references later Windows packaging/publication in `WINDOWS_DISTRIBUTION_REPORT.md`, which was not supplied for this review. Inspect it locally if present and record actual current HEAD and working-tree changes. Do not undo authorized publication or describe the present checkout as still uncommitted merely because the earlier implementation phase was.

Preserve the verified isolated development harness. The report establishes that `ZCODE_DATA_BASE_DIR` alone was insufficient; do not replace the harness with a simple variable and claim equal isolation. Do not read installed authentication/settings or transmit company source.

### C5 — make the canvas the working area

Z1's screenshots establish native integration; they do not require another application shell. In Z2, keep the graph canvas primary, put selected-node configuration in an inspector, and separate run history from the editor. Avoid making a growing history list push the canvas and controls out of the working area.

## Boundaries retained

Use the existing native agent; no special weakened executor, new provider/credential store, C# sidecar, or embedded Vue application. Use ordinary native tools and permission mechanisms. Workspace identity and a Git branch are not an OS sandbox. Graph metadata ownership is not exclusive ownership of all filesystem writes: unrelated Chats, editors, tools, and hooks can still affect the same workspace.

Do not claim always-on execution after the owning Host/window exits. Do not make an assistant's final message or an idle/cold-hydrated session into terminal proof. The report specifically warns that cold transcript hydration may synthesize a success header.
