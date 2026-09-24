# Z5 independent UI and routing source review

Scope: the initial phase was a read-only review of Graph routing/repair/typed machine evidence, iteration ownership, checkpoints, compatibility and exact session navigation. That source-audit phase launched no application, model task or emitting build. Subsequent explicitly assigned UI fixes and isolated native checks are distinguished below. All native checks used synthetic workspaces, new private app profiles and controlled local providers. No installed credentials or settings, company repository, live model or paid task was accessed.

## Resolved findings verified

- Cold prepared final approval: `domain/routing.ts` now returns a route checkpoint only for a native successor still in `planned` or a control successor still `Pending`. `app/approvals.ts` consumes the matching incoming checkpoint in the same persisted write as gate preparation. `resumableGate` preserves the exact current approved/waiting gate. The real service fixture `cold prepared final gate uses the original approval continuation, not its incoming route` passed and reached Completed after explicit original-gate continuation/approval with zero new native sends.
- Deadline across asynchronous work: `GraphRoutingChecks.verify` rechecks time after async reads/fingerprints. `beforeEffect` is called after sending-intent persistence immediately before actual Agent send and Tool start. Expiry in that write produces no effect and retains Unknown ownership, cancel intent and the BudgetExhausted reason. The service fixture covers both async-read expiry and sending-write expiry and passed with zero sends.
- Exact confirmation revision: the initial native acceptance failure was genuine. The v5 UI now saves a cloned graph before opening confirmation, captures native settings before the await, shows the returned saved revision, and Confirm uses that revision without another save. Matching lost-ACK reconfirmation reuses the old saved revision without saving; changed graph/settings are rejected. Old version run behavior is preserved. Tests first failure retained in `.tmp/z5-ui/saved-confirmation-first.log` and `reopened-confirmation-first.log`.

## Repair and evidence observations

- `GraphRoutingDecision.verification` requires each configured Test's exact current observation and explicit whole-artifact binding, plus the configured reviewer's strict structured output and exact evidenceReferences. A reviewer PASS cannot override failed machine observations. Only actual valid failed tests or current structured needs_changes can authorize the declared repair exit.
- `GraphToolEvidence.finish` distinguishes report structural/provenance validity from acceptance. An observation excludes timeout, cancellation, signal termination, missing integer exit code, unobserved exit, truncation, redaction, stale/mismatched reports and changed source/build. All failed assertions may remain valid repair evidence; all skipped/zero/missing required tests do not.
- Repair appends fresh native attempts and per-node IDs. Record validation checks every node in every iteration, shared source ownership, feedback's immediately previous iteration, frozen settings/recipe equality with iteration zero, exact attempt artifact bindings, admission count and deadline equality. Runtime resolvers and the UI default selection use the exact current iteration map; v5 does not fall back to a historical attempt when that map is absent.
- Feedback contains exact prior findings, machine observations/artifact IDs, source digest and previous iteration identity, is bounded and digest checked, and is only bound at the configured repair entry. Reviewer output never chooses arbitrary graph node IDs.
- No-progress fingerprints include source state, complete finding records and named test outcome/status/message content. Invocation-specific artifact/report IDs are excluded. Different source, findings or test results remain distinct; summary text alone is not used. Array ordering remains part of this conservative fingerprint; reorder-only findings/tests can avoid no-progress matching, but the hard repair/admission/deadline bounds remain authoritative.
- Route decisions and successor checkpoints persist before dispatch. Explicit continuation checks checkpoint identity/digest, source/configuration and inactivity; duplicate request IDs reuse the persisted continuation. Unknown native admission removes live progression, and a late terminal event may reconcile the exact attempt without routing automatically.
- Native permissions and exact-session guards continue through existing services. Every historical Agent/Tool session in an unresolved run remains protected from arbitrary new inputs. Cancellation/late facts do not authorize a new iteration.

## UI and compatibility observations

- Named Condition handles/edge projections and the repair container derive from definitions and stored attempts. Inspecting an iteration, Condition, artifact or region invokes no run command.
- Agent and Tool conversation actions use the selected exact attempt's session ID and captured target. Artifact inspection is filtered by exact attempt. Approval evidence uses its stored source session ID.
- Conditions/predicates remain declarative JSON; the renderer does no eval or predicate execution. It rejects malformed render structures before placing them in the canvas; the Host remains readiness/execution authority.
- v5 additions are explicit; appending/editing old nodes cannot downgrade an already v5 graph. Old acyclic graph helpers, approval decisions and default native paths remain supported. Legacy save/run behavior is unchanged by the v5 confirmation option.
- Usage/cost is visibly unavailable, not zero. All new labels have EN/CN entries; semantic existing components/tokens are used.

## Initial source-audit verification actually run by this reviewer

- `.tmp/z5-ui/independent-routing-tests.log`: 22 PASS across routing predicate/topology, region validation, durable records, iteration plans, service recovery/budget/late-event and Tool report verification fixtures.
- `.tmp/z5-ui/helpers.log`: 27 PASS across Graph UI editing, view, approval, submission and routing helper tests.
- `.tmp/z5-ui/typecheck.log`: UI nonemitting TypeScript check PASS after final confirmation fix.
- `.tmp/z5-ui/lint.log`: scoped Graph/hook/store/test lint PASS after extracting unchanged readiness projection hook to meet the existing max-lines rule.
- UI whitespace diff check PASS before the final four-file confirmation patch; parent final diff verification remains required.

No additional material source blocker was found in this bounded source review. It does not independently establish the native loop, crash, cancellation or multi-PC acceptance; those checks were assigned to the parent/native harness and must be reported from their actual retained results. This reviewer's later Condition and presentation checks are recorded below.

## Native editor defects discovered and fixed after initial audit

The actual condition builder first supplied an empty verification field where the UI declares JSON object or null; this harness mistake was corrected to literal null. The first attempt had zero native inputs/model requests and is retained in native-condition-true-first.log.

A second real Electron attempt saved a Condition with defaultExit=default but retained its original hidden needs_changes edge, so Host readiness correctly blocked Run. Profile .tmp/z1-native-1790259346610-ab26f7 and native-condition-true-obsolete-exit.log preserve it. The fix prunes only outgoing ports no longer declared, preserving all other edges and requiring explicit reconnection. Its tests-first failure is .tmp/z5-ui/condition-edge-first.log.

The native inspector regression reproduced four output editors under a selected Condition, expected zero (.tmp/z5-native-checks/native-condition-inspector-first.log, profile94aa30). Duplicate sibling node.id keys in output/configuration editors caused orphan React panels. Distinct output:/settings: keys fix reconciliation; the next coordinated bundle was checked with native assertions requiring Condition0/Task1/End0, as recorded below.

Z5_SPEC was updated before these changes. The focused Graph UI helper set passed 28 tests; UI noEmit and narrow four-file lint passed. Those checks preceded the coordinated desktop rebuild and the following native acceptance.

## Final native acceptance after coordinated rebuild

Five Condition scenarios and invalid-topology passed on the final bundle. true37e780/false90a29e/defaultb9efa4 completed after the explicit final gate with exactly three native sessions/inputs/admissions. missingfd0c84/wrong-type0006a0 stopped NeedsHuman after one input/admission, without selected exit or repair. Every Condition builder asserted exactly zero output editors for Condition/End and exactly one for Agent. Provider errors were zero. The native identity helper checked exact session/sourceCommandId/queueItemId correlations. Bypass and undeclared-cycle drafts were saved for review but Run stayed disabled with zero native/model requests. Logs are native-condition-\*.log and native-invalid-topology.log under .tmp/z5-native-checks.

Presentation passed in fresh profile67c02e and was visually inspected: actual pointer-drag layout shows the bounded region and named Condition, limits are visible, Chinese/light at760x1000 stacks canvas and inspector without horizontal document overflow. No work/model requests occurred. This is desktop presentation only; actual mobile Web and user-operated checks remain NOT RUN. Native-presentation-first.log preserves the harness-only Runs/Design selection error; its fix added Design navigation, without product changes. All owned native app instances closed through harness finally.

Final presentation/editor script lint and formatting passed; the final owned diff whitespace check passed with Git's informational LF/CRLF warnings only. These focused checks do not replace the root's full baseline-aware verification. Existing Z3/Z4 changes, historical reports/evidence and packaging files were preserved; no stage, commit, push, reset or whole-repository formatting was performed by this reviewer.

Retained native evidence is indexed in [native/index.json](../native/index.json). Final summaries and actual screenshots are under `../native/current/condition-true/`, `condition-false/`, `condition-default/`, `condition-missing/`, `condition-wrong-type/`, `invalid-topology/` and `presentation/`. Earlier failing attempts remain separately identified in that index. This audit was copied from the working notes after the native checks; `.tmp` paths above identify original local logs rather than distributable prerequisites.
