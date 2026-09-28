# ZCode next iteration — reviewer reliability and task-first UI

## Objective

Address the user's two observed problems in the installed Graph Engineering preview:

1. Sequential engineering reaches Review current verification, but the supplied reviewer response does not satisfy the shipped output contract.
2. Running workflows is easier than before, but normal operation still requires navigating too many collapsible configuration sections.

Implement the reviewer correction first, then a bounded UI simplification. This is not Z8 and not a new workflow engine. Preserve the existing native runtime and Graph ownership boundaries.

## Baseline and scope

The source inspected for this brief is the z7.5 release commit `46128aa54ad339175185f9afca042ed1272019bb` in `dumpfordummy/ZCode`. Inspect the actual checkout, applicable repository instructions, working-tree changes and current implementation before modifying anything. Do not assume HEAD still equals the release commit.

Work only in the ZCode checkout and independent synthetic workspaces. The screenshots show a company workspace; that is contextual evidence, not authorization to operate on it. Do not access existing credentials, call live paid providers, install dependencies, relax approvals/sandboxing, reset existing work, stage, commit, push, tag or publish. Do not modify the user's company repository, its ignore rules or its demo files.

Retain existing drafts, advanced declarations, workflow versions, historical runs and original failure evidence. Use existing test infrastructure and native services. Do not add another scheduler, permission owner, credential store or broad extraction/normalization layer.

## Observed input and output

The reviewer prompt explicitly requests JSON only, permits `pass`, `needs_changes` and `needs_human`, forbids edits and commands, and asks for review of verification, source and report. The only bound input shown is `verification`.

The supplied verification reports one passed test, zero failed and zero skipped:

- Verification artifact: `b717916f-8290-400f-8b50-08ade8b30072`.
- Report artifact named inside that verification: `2901673a-14d6-455d-a1b4-57b4ffb86452`.
- Run: `8353b328-7366-4984-aef1-cc821c0c0398`.
- Criterion label: `zz-demo contains after`.

The reviewer responds with prose and a fenced JSON object. It returns `needs_changes` primarily because it says `zz-demo.txt` is Git-ignored/untracked, and includes BOTH artifact IDs in `evidenceReferences`. It also claims to have used Git commands, although the pasted narrative does not independently establish actual tool execution.

The last supplied Runs screenshot shows a Build permission wait, not the later reviewer failure. Do not conflate those states. The exact persisted reviewer error and tool ledger have not been supplied in this brief.

## Source-confirmed findings at the release commit

### A. Final structured output is parsed strictly

`packages/services/src/graph-engineering/app/artifacts.ts`, `GraphArtifacts.captureOutput`, passes the owned `attempt.finalOutput.text` to `parseGraphJson`.

`packages/services/src/graph-engineering/domain/artifacts.ts`, `parseGraphJson` and `parseBoundedGraphJson`, parse strict JSON with size/depth/member bounds, duplicate-key rejection and trailing-data rejection. They do not extract JSON from prose or Markdown fences.

Consequently, the pasted final response is invalid if captured in the form supplied. Separate native reasoning/intermediate messages from the actual final output before diagnosing the persisted failure.

### B. Seeing an artifact ID is not an explicit artifact binding

For version-5 runs, `GraphArtifacts.captureOutput` additionally requires every returned evidence reference to match an artifact in that attempt's explicit bindings, as well as a valid earlier artifact in the same run/workspace.

`packages/services/src/graph-engineering/domain/workflow-sample-nodes.ts`, `reviewer()`, binds only the Test's `verification` selector. The nested report ID is not independently bound to the reviewer by this template. Merely reading a report through a native tool does not satisfy this explicit binding condition.

Therefore the extra report ID is a second rejection reason under the unchanged shipped template, even after the response is converted to otherwise valid JSON. Preserve this provenance boundary; do not broadly accept arbitrary same-run or transitively mentioned artifacts.

### C. The reviewer receives less explicit context than the prompt asks it to review

The same `reviewer()` helper asks for source/report review but binds neither the original request nor the Analyze acceptance handoff nor the report as separate input. Generic, bugfix and slot templates share this helper in `domain/workflow-samples.ts`; changes must account for their different predecessors and repair paths.

### D. Local source fingerprints are not Git commit identities

`app/tool-evidence.ts` obtains source/build fingerprints through the recipe store. `adapters/recipes.ts` delegates to `adapters/artifact-files.ts`, `fingerprintDeclaredFiles`, which hashes declared local file paths, byte counts and content digests. This does not require those files to be tracked or committed.

An ignored/untracked file alone does not invalidate a local working-tree test. Repository reproducibility or committed-source requirements must come from an explicit selected policy or user criterion, not from the reviewer inventing them.

## Part 1 — correct the reviewer contract

1. Reproduce the two validation failures independently through the actual product parser/capture path using synthetic data: prose/fenced output; valid JSON with an unbound report ID. Also prove that raw valid JSON with only the supplied verification reference is structurally accepted. Do not claim this proves the underlying task correct.

2. Trace final-output capture, schema validation, reference validation and route/gate handling. Distinguish output-contract rejection from a valid `needs_changes`/`needs_human` decision, machine-test failure, invalid evidence and native permission waits. Record the actual error for each synthetic case. Do not pretend to have read the user's unavailable persisted run.

3. Specify the review scope and supply bounded, explicitly bound context for that scope. Include the original request and applicable acceptance criteria. Supply source/report evidence through existing safe binding/capture mechanisms where supported. Respect run, attempt, iteration and repair-path availability. Label omitted/redacted/incomplete material. Do not fabricate unavailable source snapshots or quietly substitute later workspace contents for captured evidence.

4. Make the allowed evidence-reference IDs explicit in the delivered prompt. For the unchanged single-verification binding, only that verification artifact ID belongs in the array. Additional report references require a real validated binding, not weaker validation. Avoid hardcoding the example UUIDs in production.

5. Make final-output requirements explicit: one JSON object, no prose or Markdown; documented existing field/length limits; valid outcome; findings grounded in supplied criteria/evidence; questions/assumptions labelled. Use provider structured-output support only if the actual native adapter supports it. Do not assume an OpenAI-compatible endpoint implements it.

6. Keep deterministic validation in the Host: artifact identity, source/build association, freshness, report parsing and counts are not delegated to model claims. A model cannot override failed/invalid evidence. Conversely, passing tests do not forbid a grounded in-scope review finding. Missing necessary evidence should produce an explicit limitation or `needs_human`, not a command hunt or invented failure rule.

7. Audit the reviewer's effective native capabilities. Determine whether forbidden Git commands actually ran using available synthetic execution traces, not narrative claims. Enforce the intended no-edit/no-command scope through existing native capability controls where supported. If a new permission/security contract is needed, stop that dependent change and present the bounded design instead of claiming the prompt enforces it.

8. Preserve raw output and validation diagnostics in their existing safe retained form. Do not use regex extraction, discard conflicting objects, convert invalid output to PASS, or automatically replay implementation/build/test to repair a formatting error. Any proposed format-only retry must be explicit, bounded, evidence-bound, supported by existing execution semantics and unable to change the substantive verdict silently.

9. Handle template upgrades explicitly. Inspect the built-in versioning implementation, which synthesizes version 1 at this release. A changed helper alone does not establish safe migration of saved instances. Preserve pinned/history definitions and provide a deliberate path to use the corrected definition on a future run. Do not mutate a running or historical attempt.

### Reviewer acceptance cases

Exercise the production paths with controlled providers and temporary workspaces, including:

- Raw JSON and the exact bound verification ID: accepted output contract.
- Prose/fences, duplicate keys, multiple objects, malformed/oversized output: rejected with accurate diagnostics.
- Extra unbound report ID, wrong-run/attempt/iteration reference, corrupt/missing evidence: rejected without bypass.
- Valid `needs_changes` and `needs_human`: distinct from parser/schema failure and machine-test outcome.
- A passing local test over an ignored/new file: no invented Git-tracking prerequisite.
- A genuine failed test with model `pass`: cannot become passing evidence.
- An in-scope defect despite passing tests: remains reportable/blocking under the explicit review policy.
- Missing necessary context: explicit uncertainty rather than fabricated evidence or unauthorized tools.
- Old saved definitions/history stay unchanged; a deliberately upgraded/new definition receives the corrected input.

Deterministic scripted-provider tests establish integration, not the reliability of every live model. Report that distinction.

## Part 2 — simplify the normal UI

Keep Workflows, Design, Runs and Project setup as the main destinations. Do not replace accordion overload with a larger always-expanded form, nested tabs, or a new navigation subsystem. Normal actions must not require nested disclosures. Rare diagnostics may retain one deliberate disclosure level.

### Workflows

Show template choice, task request, compact Files and skills selections, saved-check summary and a readable step preview. Provide a clear review-before-run path using existing preflight and permission boundaries. Keep creation/save separate from execution where the underlying contract requires it; explain those actions plainly.

Configure checks once in Project setup and reuse them. Show mappings concisely; use an explicit Edit action for configuration. Never silently guess an ambiguous Build/Test mapping or downgrade a verified workflow into an agent-only workflow. Active-run blockers need a direct View run action.

### Project setup

Show a compact table/list of saved checks with name, kind, target and configuration/readiness state. Select one check to edit in a focused panel instead of stacking every check's full form.

Present .NET setup as a short explicit sequence: discover/select targets, select tests, review commands and source/output scope, save. Discovery remains bounded metadata reading, not execution or proof of completeness. Keep manual reviewed paths for unsupported discovery cases. Preserve source/output reviews, conflict detection, ordered arguments and unsupported Advanced declarations.

### Design

Use the canvas area effectively: legible labels, sensible sequential layout and a usable/resizable selected-step inspector. Prefer a small set of inspector sections such as Task, Inputs, Output and Advanced over nested disclosures. Preserve exact edge/binding semantics; visual proximity is not a dependency. Keep pending Advanced buffers and unsupported declarations intact.

### Runs

Replace wrapping, nearly identical run pills with a selectable history list/table showing request/title, time and status. Keep the selected run's current step, next action, test summary and reviewer result visible.

Show a readable request/result preview without requiring disclosure. Use focused detail views for Steps, Checks, Changes and Logs/Evidence rather than an accordion for every field. Keep execution, machine evidence and human approval distinct. Clearly distinguish a native permission wait from human review and review-output validation failure. Raw identities/digests are secondary details; blocking warnings are never hidden there.

### Presentation acceptance

Use the real components and existing native/browser test infrastructure at representative desktop sizes, including 1280x720 and 1920x1080. Check keyboard navigation, focus, scrolling and overflow. Provide actual before/after screenshots; do not substitute generated mockups for evidence.

Demonstrate a repeat run with already-configured checks without entering Advanced or opening nested disclosures. Demonstrate finding the exact cause and next action for a review-output error without searching through unrelated panels. Demonstrate editing one check while retaining all unrelated draft fields.

No fewer clicks at the cost of automatic approvals, silent execution, hidden blockers or data loss.

## Delivery

Return one consolidated report with confirmed causes, actual changed files, exact commands/results, retained failure cases, current build identity, before/after screenshots, migration behavior and remaining limitations. Keep FAIL/SKIP/BLOCKED/NOT RUN distinct; tolerated baseline exceptions are not passing checks.

Build and test locally using the existing documented pipeline and serialized emitting checks. Do not publish a new release. Identify precisely what was verified with controlled providers and what still needs user-operated/live-provider acceptance.
