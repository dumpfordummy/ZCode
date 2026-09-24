# M4 acceptance — implementation evidence and operator check

## Synthetic C# fixture

Create a small bundled template, separate from application source and executable only after
materialization into a NEW app-owned run directory. No company code, remotes or credentials.

Behavior to implement:

WhitespaceNormalizer.NormalizeSpaces(string? input)
- Null, empty, or whitespace-only input returns the empty string.
- Leading/trailing whitespace is removed.
- Each internal run of characters for which char.IsWhiteSpace is true becomes one ASCII space.
- Other characters and letter case remain unchanged.

Seed a plausible defect: null-safe Trim alone (does not collapse internal whitespace).
Use deterministic independently written tests covering null, empty, only spaces/tabs/newlines,
unchanged words, multiple spaces, tabs/newlines, Unicode whitespace, and preserved case.
Record the exact expected test IDs/count. The baseline must build and genuinely fail the
relevant tests. A reference fix in a separate TEST-ONLY copy must pass. Do not expose the
reference fix as a production fallback or modify the baseline template to hide the defect.

Only src/Demo/WhitespaceNormalizer.cs may change in the live task. The runner must reject
changed/deleted tests, project/lock/global config, hooks, added scripts or unexpected files.
The agent task asks for the smallest focused implementation and a brief final summary.

Use normal stable pinned .NET/xUnit test infrastructure. Dependency/SDK prerequisites are
prepared explicitly, not through a secret script during the model session. Codex creates the
fixture source/tests as implementation work; this document supplies requirements, not output.

## Automated gates

Use PASS / FAIL / NOT RUN, command, actual count, and artifact reference for every row.
No target test count is prescribed; meaningful coverage is required. Do not add trivial tests
to exceed the M3 total or remove existing semantic checks to keep the suite green.

| ID | Required evidence |
|---|---|
| A01 | M3 baseline, final combined backend/frontend/browser suite, locked restore/build/type-check/lint; preserve M1–M3 behavior and histories. |
| A02 | Fresh and real M3-schema SQLite migration; legacy documents/runs retained; new node types round-trip; malformed/imported unsafe configs rejected. |
| A03 | Installed Codex version/entry-point metadata inventory; no real auth/config contents inspected; missing/unsupported capabilities fail honestly; no provider calls. |
| A04 | Materialize two fresh samples, verify separate baselines and no source/template mutation; absolute/traversal/reparse/unsafe-file inputs fail; imports cannot select arbitrary folders. |
| A05 | Real sample baseline build succeeds and named tests fail; separate reference-fixed copy passes nonzero expected tests; no fallback fix in production path. |
| A06 | Real owned process launches through structured argv/stdin; spaces, quotes, newlines and shell-looking text remain data; no extra command executes. Synthetic child environment lacks sentinel parent secrets. |
| A07 | Controlled test Codex executable emits valid JSONL and edits the permitted file. Actual host diff/output recorded; fail on nonzero/failed terminal/missing terminal/malformed required events/protected-file edits. |
| A08 | Runner recipe guard rejects arbitrary executable/path/flags/env commands via API/import/bindings. Required gates cannot be bypassed by graph order or direct endpoints. |
| A09 | No agent starts before entry approval; no app-managed tool starts before code approval; final approval requires actual command evidence. Fixture dispatch counts prove the boundary. |
| A10 | Simultaneous duplicate approvals, mismatched decisions, lost HTTP response, stale hash, cancellation/rejection race: one decision and no duplicate dispatch. Reject retains workspace and skips downstream. |
| A11 | ACTUAL backend process restart at a pending quiescent gate: same request/digest remains, re-pair required, zero automatic child starts, explicit decision resumes once. Changed files invalidate the gate. |
| A12 | ACTUAL crash during agent/tool and after tool completion before result persistence: unfinished run Interrupted, partial files visible, no automatic rerun/resume; ownership cleanup proven. |
| A13 | Tool uses actual .NET process results and unique TRX. Missing/stale/zero-tests/malformed TRX, failed build/test, wrong project or changed test files cannot pass or reach final success. |
| A14 | Timeouts, cancellation, huge stdout/stderr/no-newline, a hanging child and parent exiting before child: bounded memory/termination, no deadlock, no late success or downstream dispatch. |
| A15 | Updated-source/evidence/runner edits during waiting or execution invalidate authorization; tests/diff/hashes correspond to actual executed candidate, not expected model answer. |
| A16 | Ctrl+C, partial-start failure and abrupt launcher/backend exit: owned jobs cleaned; an independently retained untargeted synthetic process survives. No name/ancestry-based kills. |
| A17 | Auth/Host/Origin/CSRF on runner/gate/artifact/readiness/mutation routes; actual SignalR reconnect reconciles pending/resolved gate without approving or executing twice. |
| A18 | Synthetic credential/pairing/env sentinels absent from saved profiles/exports/child logs/events/artifacts and test screenshots; untrusted output escaped; unsafe artifact paths/XML rejected. |
| A19 | Browser creates/edits sample flow, selects runner, inspects entry and code gates, views actual diff/commands/test counts, approves/rejects; history/frozen graph remains inspectable after restart. |
| A20 | M3 real-process model-only restart semantics unchanged. M4 wait expiry/active budget/single slot work across re-pair/restart; existing provider profile flow remains isolated from runner auth. |

Tests may use a controlled fake Codex executable, but it must be injected through test-only
composition in isolated data. Production UI must never offer “fake agent success.” Also run
real benign OS processes and the real synthetic dotnet build/test. Report which evidence
comes from which layer. Disable automatic secret-bearing HAR/video/trace capture.

## Manual check U01 — user-operated live Codex

The implementing Codex must not run this using live authentication. After implementation,
the user personally:

1. Opens Local runners, verifies the exact installed executable, selected model, isolated
   app runner home and sandbox requirements. Follows the generated terminal login steps
   using Codex itself, with no auth file copying or token pasting into chat.
2. Creates the sample coding workflow and starts it once. At Entry approval inspects the
   synthetic repo/task, permitted file, model and sandbox disclosure, then approves.
3. Observes a real Codex session and an actual source diff. At Approve code for tools,
   reads the generated code and local execution warning before approving the fixed recipes.
4. Observes Restore/Build/Test results including genuine exit codes and nonzero test counts.
5. At Final review inspects the same source digest/diff/test evidence. BEFORE deciding,
   restarts the app, re-pairs, and reopens that same pending gate. Nothing should execute
   until the explicit decision. Approves and confirms the run ends accepted without merge.
6. Starts a fresh sample run and rejects Entry approval. Confirms no agent/tool starts and
   the original template/earlier run remains unchanged. Do not rerun the accepted one.

If Codex changes protected files, stops on sandbox denial or does not solve the fixture,
the honest result is failure/blocked. Do not hide it with a fake final output or manual
patch while claiming an unassisted successful live graph. Make a new run after a reviewed fix.

Return sanitized observations only: selected CLI version/model, final source diff summary,
actual test counts/result, approval/restart/rejection outcome, and screenshot(s) without
secrets, private paths or tokens. Logins/keys remain local. A real provider failure is not
permission to disable TLS/sandbox or silently route to the configured GLM endpoint.

## Completion status

- READY FOR USER AGENT CHECK: required implementation/automated gates pass and installed
  metadata supports the adapter; U01 remains NOT RUN until user confirmation.
- BLOCKED FOR REAL CODEX: installed interface/sandbox prerequisite incompatible; explicitly
  identify the blocker even if isolated adapter tests pass.
- FAIL / INCOMPLETE: any required automated behavior remains failing/unimplemented.

Only the lead/user accepts M4 and authorizes M5. A green suite or agent final message cannot
provide that decision. No automatic commit, push, merge, or deployment.
