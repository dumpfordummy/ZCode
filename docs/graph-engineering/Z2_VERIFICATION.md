# Z2 verification matrix

## Evidence rules

All entries below are requirements, not current PASS claims. Report each as PASS, FAIL, NOT RUN, or BASELINE EXCEPTION with command, exit code, layer, and artifact. A unit/adapter test is not native end-to-end evidence. A native runtime driven by controlled model responses is stronger execution evidence than a fake agent adapter, but is not a live model result.

Use isolated profiles/workspaces, synthetic secrets and a controlled provider. No paid task or company repository may be used by the implementation agent. Native screenshots/logs must contain synthetic data only. User-operated actual-provider checks are separate.

Capture exact native session and command/input IDs. Tool-using tasks can make multiple model requests. Verify one initial native input per planned node attempt, not 'one API request per node'. In quiescent navigation/restart tests, also demonstrate no extra provider traffic caused by the graph.

## Required matrix

| ID | Check | Required evidence |
|---|---|---|
| B01 | Baseline/provenance | Current HEAD, branch, dirty files, upstream architecture instructions, Z1 tests, root and CLI checks. Preserve later authorized packaging/publication. Record existing failures rather than calling the full repository green. |
| B02 | Build and changed-file quality | Actual typecheck/lint/architecture/build plus changed-file formatting. Compare unresolved full-format and CLI lint failures to an untouched baseline where needed. No added lint suppression or mass formatting. |
| E01 | Native editor | Add/remove/rename/reconnect 3 Agent Tasks; persist layout/instructions/config; safe text editing/deletion; visible selected workspace; existing Chat unaffected. Native UI evidence, not only component tests. |
| E02 | Graph validation | Execution follows edges despite scrambled arrays/positions. Reject branch/cycle/disconnected/invalid IDs and configurations before any session creation. Show actionable draft errors. |
| E03 | Z1 compatibility | Real persisted Z1 definition/run/guard fixtures open correctly. Completed data remains immutable; no automatic send or silent semantic reinterpretation. |
| H01 | Binding contract | Literal preservation, valid Start/earlier-text binding, missing source, future/self source, empty required output, malformed aliases, one-pass insertion, and configured size limits. Missing binding creates zero downstream sends. |
| H02 | Actual handoff | In controlled native multi-node execution, the first task emits a fresh marker not already in the second template. The exact next owned command contains that marker; a separate variant prevents hardcoding. Report resolved instructions and source identity. |
| H03 | Final output attribution | Capture only final assistant text of the exact owned input. A later Chat turn, other session, stale event, or cold synthetic header cannot change the frozen result. |
| R01 | Real sequential native run | Start -> Analyze -> Implement -> Verify -> End: actual Electron/Host/CLI, ordinary native tools, 3 distinct native sessions/initial commands, ordered non-overlapping admission, expected synthetic source change and independent test. |
| R02 | Native configuration | Resolve inherited/overridden selections at Run admission. UI changes afterward do not silently alter later-node model/mode. Invalid/unavailable selection cannot silently fall back. |
| R03 | Same-session navigation | Open every node in native Chat; compare actual SessionPane IDs to stored IDs. Navigation/refresh creates no extra sessions or initial inputs. Returned graph shows same run/node. |
| R04 | Native permission/question | A node waits for actual native permission and AskUserQuestion; successors have zero initial inputs. Correct manual response continues that exact input. Existing auto-answer protections cover descendants and preference races. |
| R05 | Graph ownership | Alternate prompt/edit/retry/config routes remain blocked for all run-owned sessions while unresolved; native interaction responses remain possible. After safe run completion, ordinary follow-up does not rewrite run history. |
| R06 | Failure/cancellation | Cancel before a successor starts, while an active node awaits permission, and during native progress. No successors dispatched; cancellation targets the original owned input. An unrelated Chat session remains usable. Late completion cannot restart the sequence. |
| R07 | Idempotency/storage faults | Duplicate submission ID, contradictory reuse, lost create/send reply, initial persistence failure, terminal/output persistence failure, out-of-order/duplicate events. No hidden recreation/retry/advance and truthful Unknown states. Service-layer evidence is acceptable for faults not safely injectable natively; label it. |
| R08 | Completed reopen | Restart actual owned app after completion: frozen graph, outputs, all session/input IDs unchanged; no new native input/provider request from reopening. |
| R09 | Interrupted reopen | Restart during a permission wait and at a persisted predecessor/next-dispatch boundary. Preserve truthful interruption/uncertainty; never auto-start pending nodes from cold transcript hydration. |
| R10 | Safe recovery | Reconcile and explicitly release a confirmed-inactive interrupted run without changing its evidence/outcome or sending a prompt. Refuse release while actual owned execution is active/unproven. New Run is a separate explicit action. |
| R11 | Workspace/Host boundaries | Existing graph-owner lock behavior retained, stale workspace events ignored, no wrong-workspace navigation or dispatch. Cross-Host tests label fixture versus actual simultaneous-window coverage. Metadata locks are not reported as file-isolation tests. |
| S01 | Isolation and scope | Use existing native isolation harness; no installed credential access or company source; no broad process killing; no new provider/agent engine or permission weakening. Verify current native Chat regression. |
| U01 | User-operated repository task | NOT RUN unless user supplies actual synthetic Read/Edit/test, permission, and restart observations. Do not infer these from greeting screenshots. |
| U02 | User-operated multi-node task | NOT RUN until user verifies 3 native tasks, handoff, edit/test evidence, same sessions and completed-history reopen. |

## Passing and exceptions

All changed-feature tests must pass before reporting READY FOR USER MULTI-AGENT CHECK. Preexisting CLI lint/full-format issues can be explicitly accepted baseline exceptions after a supported comparison and clean changed-file checks. They cannot be silently skipped or included in an 'all checks passed' statement.

Native unavailable checks must be called out. A mock-only sequential implementation is not sufficient for the readiness claim. Record original failures and fixes, including failures of the harness itself, without turning fixture mistakes into unsupported product conclusions.

If the native runtime cannot support reliable text attribution, active-input cancellation, or confirmed-inactive release, document the exact interface gap and stop the affected work rather than bypassing it. Do not turn incomplete native evidence into a status badge claiming real success.

## Artifacts

Preserve sanitized command logs, controlled provider/native command counts, run/session/input mappings, real fixture diffs, independent test output, and screenshots. Keep credentials, private endpoints, and real project contents out of committed artifacts. Reference the actual paths in the report; do not invent pathnames for files that were not created.
