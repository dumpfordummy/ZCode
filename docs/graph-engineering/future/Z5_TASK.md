# Z5 — explicit routing and bounded repair

## Objective and dependency

Dependency: verified Z4 typed evidence/Tool nodes, Z3 gates, Z2 ownership and durable attempts.

Add conditions and an explicitly bounded repair region, not unrestricted arbitrary cycles or a second autonomous planner. Example:

`Implement -> Build/Test -> Reviewer -> Decision`

`pass -> Final human gate`

`needs_changes -> Repair -> Build/Test -> Reviewer` (bounded)

`needs_human or exhausted -> Human review / stop`

This task is the first to authorize automatic graph-level repetition, only within the declared region and only after definitive outcomes. It does not authorize replay of unknown or possibly running work.

## A. Condition and branch semantics

A Condition node evaluates a small typed predicate over explicitly bound structured data: equality, comparison, presence and bounded boolean combinations are sufficient. No JavaScript eval, user code, unbounded expression language or free-text keyword routing.

Use named exits and one explicit default/error policy. Missing or wrong-typed data is a validation error/needs-human condition, not false or PASS by coercion. Declare supported DAG exclusive branches and merge behavior. A branch selects exactly one route; unselected nodes are Skipped, not Succeeded. An exclusive merge must not wait for branches that were never selected. Arbitrary graph cycles remain invalid outside a configured repair region.

Routing consumes exact attempt artifacts. Untrusted output cannot name arbitrary next-node IDs, change the graph, authorize a permission, or bypass a required final gate. Validation enforces permitted paths and required gates for this template/run.

A verifier PASS requires the configured machine evidence as well as any required reviewer decision. A prose statement or schema-valid `pass` cannot override missing/failed required tests. Reviewer findings reference actual artifact/source identities.

## B. Bounded repair region

Define an explicit region contract: entry, body, decision output, allowed targets, maximum repair iterations, maximum total node admissions, wall-clock deadline, stop-on-no-progress policy and exit reason. Inspect current state/versions before introducing schema names.

Use a documented default, for example two repair iterations after the initial attempt. Make the limit visible at Run confirmation. Hard-stop native-input counts and time budgets must be enforced locally; token/cost limits are only authoritative when native usage is actually supplied. Missing usage is unknown, not zero cost.

Every repair attempt has a new attempt/iteration identity and, by default, a fresh native agent session. Hand it the exact prior findings, evidence references and current code baseline. It shares the selected workspace, but old successful outputs/approvals from another source version cannot be reused as fresh verification.

Persist iteration decision, selected route and successor intent before sending. Revalidate workspace/configuration constraints. Changing prompts, recipe versions, limit settings or model configuration in the editor does not mutate a running region; it requires a new run.

Only definitive semantic/test failure can enter the repair path. Authentication failures, ambiguous native completion, unknown process state, unsupported output, missing artifact and transport errors use explicit non-repair paths unless their exact safe handling is specified. Do not 'fix' an uncertain run by starting another agent.

A configured fingerprint of source state plus findings/test result can identify repeated no-progress cycles. Do not declare two semantically different failures identical based on summary text alone. Exhaustion/no progress produces a visible terminal or waiting-for-human outcome, not success.

## C. Failure and restart

Record every attempt and evidence set; do not overwrite the earlier failed attempt with the final success. Graph status explains Input completed vs Validation failed vs Review needs changes vs Awaiting approval vs Budget exhausted.

Cancel active native work through the exact existing handle, prevent future region dispatch, and preserve evidence. Late events cannot start another iteration after cancellation, rejection or expiry.

Restart never automatically resumes an uncertain region. A fully persisted safe checkpoint with no running/queued unknown work may be inspected and explicitly continued under the existing continuation rules; all budgets, approvals, versions and counters persist. A lost decision reply cannot create a second repair attempt.

## D. UI and usability

Draw labelled condition ports and a bounded repair-group container. Selecting the region shows its limit and attempts. Selecting a node lets the user switch between iterations and open each actual native session. Show the exact condition values and selected route, not just an animated line.

No free-form prompt editor is a routing authority. Keep manual user/permission requests native, and require explicit authorization for protected operations in every attempt. A graph loop must not loosen the workspace mode to make itself finish.

## Required verification

| ID | Scenario | Required result |
|---|---|---|
| Z5-A01 | Previous graphs/gates/tools and schema migration | Old acyclic semantics/history preserved |
| Z5-A02 | True/false/default/missing/wrong-type conditions | One permitted route; invalid data cannot become PASS; skipped branches do not deadlock merge |
| Z5-A03 | Synthetic defect -> failing test -> repair -> retest | Actual native edit/test artifacts; exact feedback transfer; later independent test passes |
| Z5-A04 | Schema-valid reviewer PASS with failed machine evidence | Final-success path not admitted |
| Z5-A05 | Maximum iterations/admissions/deadline | Persisted hard bounds; no extra owned input after exhaustion |
| Z5-A06 | Unchanged source and repeated findings | Configured no-progress stop with inspectable evidence |
| Z5-A07 | Agent timeout/unknown dispatch or invalid JSON | No automatic repair/replay; safe error or human path |
| Z5-A08 | Crash/duplicate response around region decision | No double attempt; budget and uncertainty survive restart |
| Z5-A09 | User rejects/cancels during repair | No subsequent iteration; unrelated sessions survive |
| Z5-A10 | Old artifacts, source change, out-of-order event | Routing only from the exact valid iteration; stale result rejected |
| Z5-A11 | Gate bypass/imported illegal edges/cycles | Readiness rejects graph; importing never starts work |
| Z5-A12 | Native loop UI and iteration conversations | Exact sessions, events and real route shown; navigation performs zero sends |

A03/A07/A08/A09 must include controlled-provider real native execution, not only a scheduler fixture. A03 records initial native input count separately from legitimate internal model/tool calls.

## Out of scope and handoff

No unbounded loops, parallel workers, arbitrary subworkflow recursion, hidden retry agent, self-editing graph, automatic merges or automatic approval. Do not implement same-session repair continuation without a separate reviewed ownership/lineage contract.

Write Z5_REPORT.md with failed and repaired runs, route evidence, exact iteration counts, budget/exhaustion case and honest live-check status. Stop after Z5.
