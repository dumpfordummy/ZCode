# Pre-Z8 product-readiness plan — ZCode Graph

**Decision status:** proposed implementation plan; no application changes or runtime tests were performed to produce it.  
**Prepared:** 27 September 2026.  
**Reference baseline:** ZCode Graph 3.14.0-z7.2, tag `graph-v3.14.0-z7.2`, guide source commit `7e5f02d76abf20d567df1a9e6ddb868ab3421205`.  
**Target:** a usable supervised engineering application before the separate Z8 release-hardening milestone.  
**Read with:** `BACKLOG_AND_ACCEPTANCE.md`, `DELIVERY_PLAN.md`, `SOURCE_REGISTER.md`.

## 1. Executive decision

Pause new orchestration capabilities. Improve the journey from opening a project to understanding a completed or blocked run. Preserve the existing native agent runtime, explicit data handoffs, durable state, approval semantics, and evidence validation.

The present friction is not mainly visual styling. A first-time user has to configure internal verifier contracts before an ordinary engineering template can be created. Source-backed precision is valuable, but internal precision must not become a mandatory onboarding curriculum.

The product must support two explicit verification choices:

1. **Agent-led review:** native agents analyze, implement, and inspect their work; no machine-verified test claim. This is the accessible starting point and requires no Tool recipes.
2. **Configured build and test verification:** native Tool nodes execute approved operations and the application validates the resulting evidence. This remains mandatory for the verified templates, repair decisions that rely on tests, and the existing parallel integration path.

These are workflow policies, not two agent engines. Do not silently turn a verified template into the weaker policy when configuration is missing. Offer a separately named workflow instead.

**Recommended Z8 entry scope:** supported local Windows sequential workflows, supervised execution, a usable project setup path, and one real supported .NET verification integration. Keep parallel work behind an explicit advanced/experimental boundary until its own readiness gate passes. If a full parallel-enabled release is selected, the conditional parallel requirements in this plan become mandatory.

Do not call this work a single large `Z7.3` implementation. Use U0–U6 internally; assign public patch versions only after actual builds and reports exist.

## 2. Evidence and what is still unknown

### Established by the guide, screenshot, and inspected release source

- Graph Tasks use native ZCode sessions and tools. The Host owns graph orchestration; the UI must not become a scheduler. [S1]
- The Sequential engineering built-in includes Analyze, Implement, Build, Test, structured Reviewer, final Human Approval, and End. It requires the run request and both Tool bindings; its optional instruction/skill references are separate. [S2]
- The template form renders recipe choices from `(recipes?.recipes ?? [])`. An unloaded snapshot and an empty snapshot therefore produce the same empty choices. The UI maps all loaded recipes rather than filtering this list by verifier kind. This does not establish whether every incompatible choice is accepted by backend validation. [S3]
- Project recipes are edited in a JSON text area after a separate load operation. Template-library recipe loading is another visible action. [S4]
- Version selection, hashes, duplicate/archive controls, template binding, and transfer controls share the library dialog. [S5]
- Strict test configuration requires machine-readable, invocation-linked evidence, positive test counts and a Build-node link. The recipe format discriminator is `zcode-json-v1`; the report payload discriminator is `zcode-test-v1`. Those are distinct existing contracts, not interchangeable strings. The inspected report parser accepts at most 1,000 test entries. [S6, S7]
- Sequential template transfer currently involves preview plus JSON copy/paste. Parallel plan transfer is explicitly unavailable. [S1]
- Graph completion, a verified result, and human approval are different facts. Recovery does not replay uncertain work. [S1]
- Packaged evidence described in the guide covers only a subset of the later milestone capabilities. Development-fixture results are not packaged/live-project acceptance. [S1]

### Inferences and proposals

The onboarding burden, discoverability problems, and proposed navigation are product judgments based on the reported experience and source inspection. They are not measured task-success results. Every new control described below is a proposal, not an instruction for the current build.

### Unknowns to resolve in U0/U2

The user's current checkout and installed artifact may differ from the pinned release. Actual project solution/test entry points, test platform, feed access, harness report format, source scale, and trust restrictions are not supplied. The guide does not prove current latency, accessibility, safe raw/form round-tripping, or packaged operation of every node type. Verify these before making compatibility claims.

No company code, installed credentials, private local settings, or live provider was accessed for this plan. No tests were run.

## 3. Product contract and non-negotiable boundaries

### User model

- **Project:** the selected local workspace where operations actually happen.
- **Workflow:** the reusable definition of steps and their data dependencies.
- **Run:** one execution of a captured workflow, request, settings, and workspace.
- **Project checks:** user-facing name for configured recipes; retain `recipe` in advanced documentation and existing contracts.
- **Evidence:** actual captured output; never equivalent to an agent's unsupported assertion.

Use these nouns consistently across Design, Library, Project setup, Runs, and approval screens. Keep graph format versions, digests, native input IDs, and raw declarations in a technical-details area.

### Preserve

Native provider settings, permission/question handling, real sessions, immutable historical runs, source-linked evidence, conservative Unknown states, exact cancellation ownership, import-without-execution, and no automatic repository publication.

A simpler interface must not enable unrestricted shell execution, default permission escalation, automatic answers to agent questions, agent-authored passing reports, or replay of uncertain native inputs.

### Explicitly separate operations

| UI action | Meaning | Must not imply |
|---|---|---|
| Scan project | Bounded read of selected metadata/files | Run a build, resolve scripts, install packages, call a model |
| Check configuration | Static/schema/path/capability validation | Tests executed |
| Check tool availability | Explicit approved executable probe | Whole build/test verified |
| Save project checks | Persist approved configuration | Execute commands |
| Create workflow | Instantiate a draft/definition after overwrite warning | Submit work |
| Run checks now | Real user-approved command execution | A model-free or side-effect-free preview |
| Start run | Native task admission after preflight | Permission for all later tools or publication |
| Approve | Consent for one captured gate/evidence revision | Tests necessarily passed, commit/merge authorized |
| Inspect recovery | Read ownership and known activity | Resume/retry/release |

## 4. Priority and release policy

### P0 — blocks normal use or risks misunderstanding

An agent-only quick start; a first-class project-check setup route; distinct unloaded/empty/invalid recipe states; actionable readiness errors; persistent workspace and permission visibility; clear execution/evidence/approval states; preserve user edits; conservative retry/cancel behavior.

### P1 — required for the selected supported product before Z8

Guided .NET verified Build/Test configuration; input selection without writing aliases; usable run inspection; template reuse and safe sequential file import/export; source-compatible migration; realistic pilot and regression evidence; discoverable limits and unsupported integrations.

### Conditional P1 — only for a parallel-enabled release

Safe parallel plan import/export, usable ownership/Join setup, clear integration-workspace result location, and packaged acceptance of the supported parallel path. Either complete these or keep the mode explicitly experimental and outside the supported release claims. Do not erase the recorded Z7-A12 failure when choosing the sequential release route.

### P2 — defer unless a real pilot establishes necessity

Universal report adapters, arbitrary script support, AI-created graphs, full graphical expression/schema builders, same-session continuation, manual agent takeover, nested/remote/unlimited parallel work, automatic apply-to-original, PR/merge/publish automation, cloud scheduling, marketplaces, and always-on hosting.

## 5. Target navigation and journeys

### Navigation proposal

Keep the ZCode shell and native Chat. Inside Graph Engineering use a persistent workspace header and four destinations: **Workflows**, **Design**, **Runs**, **Project setup**. Library management belongs under Workflows, not inside the common execution form. Advanced parallel mode remains clearly separate; selecting a different editor never converts a saved plan silently.

The header always identifies the actual workspace, workflow and saved/unsaved state. Runs show the captured workspace and revision, not current editor settings. On narrow layouts the inspector can collapse, but active status and required actions remain visible.

### Journey A — first useful agent workflow

1. Choose a supported local workspace and use the existing model selector.
2. Select **New workflow → Agent-assisted task**.
3. Enter a concrete task, see Analyze → Implement → Review → Final approval.
4. See **Verification: agent-led; configured test evidence not included**.
5. Create the workflow without recipe JSON; inspect the generated instructions/context.
6. Preview native settings and destinations, then explicitly start the run.
7. Respond to native interactions in the real conversation and graph approvals in the gate.
8. Inspect changes and the result. Never show a machine-verified test badge for this path.

This is a new template/product path using supported graph nodes. Do not remove requirements from the immutable existing verified template. If a v5 graph is used, preserve its final-gate constraints.

### Journey B — supervised .NET work with verified checks

1. Open Project setup and request a bounded metadata scan.
2. Select the actual solution/project, build configuration/framework and test targets from evidence-backed candidates.
3. Select the supported test platform/report adapter. Ambiguous or unsupported configurations remain explicit.
4. Preview executable, arguments, cwd, source/output scope, package-restore/network effects, timeout and result policy.
5. Save the check profile. Optionally perform a separately confirmed calibration run; retain its actual result.
6. Create a Verified engineering workflow. Choose compatible saved checks rather than raw IDs.
7. Review the compiled graph. Execution captures a versioned check snapshot.
8. Inspect the native outcomes and parsed evidence. A failing calibration can still demonstrate a working adapter; do not require every existing project test to pass merely to save a valid check profile.

### Journey C — repeated daily task

Choose a saved workflow, supply today's request, confirm the remembered workspace/check choices remain valid, and start after preflight. No repeated skill-ID entry, Build/Test JSON, manual `buildNodeId`, or version-hash selection. Changed definitions, provider policies, scripts or checks invalidate affected acknowledgments; do not silently reuse old consent.

### Journey D — blocked work

The Runs view states the node, actual cause, preserved work, whether anything may still be active, and the safe next action. Invalid evidence, a real test failure, native permission wait, and unknown execution must never share a generic Retry button.

## 6. Workflow creation and template improvements

Offer three creation paths: Agent-assisted task; Verified engineering task; Advanced templates. Bug-fix repair is available once its required checks are configured. Slot refinement stays under advanced/domain templates until real project parameters are provided.

The ordinary form needs task, selected project, verification choice, native model/permissions and a preview. Optional instructions and skills sit under an expandable context section, with file selection or native-catalog selection rather than opaque identifiers.

Template versions remain pinned. New instances may default to the latest compatible non-archived version, with a visible version summary. Existing instances never float automatically. Hide full digests behind details; retain access for diagnosis.

Create and Duplicate are separate intentions. Do not display a duplicate-name field ahead of the run request. Preserve a partially completed setup when navigating to configure missing checks. Instantiation over dirty work requires a clear Save/Discard/Cancel decision; cancellation leaves the original design untouched.

Replace generic `Unresolved bindings` with a state machine:

- Not loaded → load automatically when the relevant panel opens; reading is not execution.
- Loading → show progress and prevent stale workspace results from being applied.
- None configured → **Set up build/test checks** with return-to-template context.
- Read failed → error and explicit retry-read action.
- Wrong kind/unsupported verifier → explain incompatibility and the supported alternatives.
- Missing executable/dependency → separate installed-tool readiness from recipe syntax.
- Stale configuration → refresh/reselect and invalidate affected preflight approval.

Compatibility selection must validate both the recipe kind and the destination node requirements. A command-only recipe is not a Test recipe. Resolve Test-to-Build graph references during instantiation through a validated mapping; do not mutate a globally saved recipe to point at a transient graph node or ask the user to type an internal node ID.

## 7. Project setup and verification engineering

### Read-only discovery first

Start with `.sln`, `.slnx`, `.csproj`, `global.json`, relevant `Directory.Build.*`, test project metadata and existing saved recipes. Use bounded scanning, excluded generated/dependency folders, cancellation, per-workspace ownership and clear unreadable-file diagnostics. Do not source scripts, run MSBuild evaluation, launch package restore, start MCP, follow symlinks outside the permitted root, or read broad secret stores during detection.

Static detection returns candidates, provenance and uncertainties. `*.Tests` naming is a hint, not proof. A discovered PowerShell filename is not permission or compatibility. Monorepos can have multiple valid solutions; never select the first file silently. Linked source outside the selected workspace requires an explicit unsupported/permission decision, not an expanded scan.

### Commands and evidence need different labels

Use **Detected → Configuration valid → Calibration executed → Evidence accepted/failed/invalid**. Saving a command never grants it a passing test status. Agent-led review and command-only checks are legitimate weaker modes but must not satisfy verified-test dependencies.

### First adapter scope

Prioritize a bounded standard .NET pipeline. Support VSTest/TRX first if U0's pilot inspection confirms that platform; support Microsoft.Testing.Platform only through its separately verified option/report contract. Do not infer a runner from the installed SDK alone or change the project's test platform merely to fit our adapter. Microsoft documents distinct runner behavior and flags. [S8]

The adapter is a trusted deterministic application component, not generated ad hoc by the implementation agent. Its job is to convert genuine current-run reports into the existing internal evidence representation, preserving test identities, result statuses, failure information and provenance. Keep original reports inspectable. The adapter does not establish that the test suite is sufficient to prove all business requirements.

Required details:

- Exact solution/project, configuration, target framework/runtime and test filter form part of the check identity.
- Restore can write files and use private feeds/network; disclose it and require explicit execution. Never silently import original-home NuGet credentials into the fork's private home.
- Build source coverage must include relevant projects and imported build inputs, not one guessed project file. Static guesses remain unverified until approved resolution/calibration.
- Tests must run against the captured build or invalidate/re-establish build evidence when rebuilding. Preserve the relationship between tested binaries and source scope.
- Give every invocation an owned report location; handle multiple test projects/target frameworks without one report overwriting another. VSTest documents fixed-name overwrite behavior. [S9]
- Parse XML with external entities/DTD disabled; enforce file/byte/depth/time limits. Treat truncated, duplicate, oversized, stale or mismatched reports as invalid.
- Normalize skipped/failed/executed outcomes; zero tests and all-skipped results never pass. Required tests and approved test counts must not be silently reduced to fit a failure.
- The existing 1,000-entry bound is a real compatibility consideration. Detect an oversized suite and explain the limit; never truncate it into a pass. Extend the contract only as a separate bounded, tested change if the pilot requires it.
- Preserve separate native process outcome, report validity and assertion outcome. A failure code with genuine failing tests is not necessarily an invalid report; a crash with a partial apparently passing report is not a successful test run.

### PowerShell harnesses and RTP

The current recipe policy restricts shells and script entry points. A wizard that simply inserts `pwsh` or wraps it in another executable would evade the existing boundary. [S1]

U2 must inspect a user-authorized harness entry point and its actual outputs before deciding between an explicitly reviewed script-capability extension, a supported native executable adapter, or agent-led/manual operation clearly labeled not machine-verified. Do not fake test reports, scrape optimistic prose into PASS, modify the harness silently, or claim compatibility from detection alone.

RTP acceptance needs the project's actual target, sample size/seeds, source/version and acceptance rule. Unit-test success is not RTP equivalence or certification. Universal harness/RTP adapters are not a prerequisite for the first standard .NET release. They become required before claiming the selected real game-project workflow is supported.

## 8. Editor and context ergonomics

Guided and Advanced are views of one canonical definition, not two independent saved models or schedulers. Stable node/reference identities drive both. Preserve graph versions supported by the actual code; do not silently translate unknown fields or delete unsupported advanced declarations.

Node inspector, common path: task instructions; context selections; native model/permission summary; expected output; next step. Advanced contains aliases, raw schemas, artifact selectors, technical identities, routing declarations and limits.

Context chips such as **Original task**, **Analyze result**, and **Test evidence** create explicit existing bindings. Show the source node, output type and scope. Switching modes must not broaden context to all prior conversations, reread later Chat turns into past results, or recursively interpolate output text. Invalid selections should be unavailable with an explanation.

Preview rules: before execution, future outputs are unresolved placeholders and never invented; after execution, show actual captured inputs and prompt. Source/skill selection adds explicit context only. Detect already-native project guidance and avoid blindly injecting it twice; review native discovery behavior before designing deduplication.

Canvas work: insert between nodes; readable names and branch labels; Fit view; keyboard-selectable step list; clear End result selection; confirmation of dependent edges/bindings on deletion; optional undo/redo for draft edits only. Keep the current supported node limits visible and validate before creating an impossible workflow. Undo never undoes native commands or file changes.

For conditions/repair, provide a small typed preset builder for existing supported predicates and the built-in repair pattern. Do not build a full visual programming language. Show initial attempt plus additional repair count, time in minutes, and the compiled admission budget. Exceeding current Host limits is blocked. Invalid evidence and Unknown do not become ordinary false predicates or retry triggers.

Advanced-only imported/custom fields must remain intact. If Guided cannot represent them, show the graph read-only in that view with a specific Advanced-edit link rather than lossy simplification.

## 9. Run, approval and recovery experience

The default run page answers four questions: what is running, what changed, what was actually checked, and what action is needed now. Keep detailed identities available but secondary.

Display three separate axes:

- **Execution:** not started, running, waiting, completed, failed, cancelled, interrupted/unknown.
- **Evidence:** not configured/not run, agent-reported, command result, valid test evidence pass/fail, invalid/stale.
- **Human decision:** not required, pending, approved, rejected.

A run can be completed with tests not configured. It cannot inherit a green Verified badge from agent prose or merely from a human approval. Keep source freshness, report origin and project policy visible.

Use a persistent action area for the next required native permission/question or graph approval. Native interactions route to the actual session; do not invent a parallel response channel. Approval shows exact scope, evidence, unresolved questions and source revision, and states whether any next native work is being admitted. Changed evidence invalidates the old approval.

Cancellation is a request until the runtime proves inactivity; edits already written remain. Display Stop requested, proof state and target session. Native session ID continuity must survive ordinary navigation. Logs should be bounded/virtualized without truncating the canonical evidence artifact silently.

Recovery needs a cause-specific decision table, not a universal retry:

- Safe offered checkpoint → inspect and use the existing explicit Continue action.
- Invalid setup before dispatch → fix the design and start a new run after preflight.
- Known test failure → only the approved bounded repair policy may admit a next iteration.
- Unknown/Interrupted → inspect exact owned session; no replay.
- Confirmed inactive, release eligible → audited release with reason; this does not mark success or rerun.

For a new run after partial edits, surface current dirty state and previous changes. Do not pretend the workspace is reset or that replaying steps is idempotent.

## 10. Library, portability and parallel boundary

### Sequential workflows

Provide reviewed **Export to file** and **Import from file** using existing platform abstractions. Keep raw portable JSON as Advanced. Validate before changing the current design; atomically preserve drafts on cancel/error. Show exactly which local values are omitted and which bindings must be supplied on import. Readiness must not imply imported skills or external services are trusted.

Template export is neither execution-history backup nor evidence export. Support a preview with warnings for task prose that may itself contain secrets/source; a scanner is not a guarantee. Never include credentials or native auth files. Reading/importing must cause zero agent submissions, check executions, installs, connections to new MCP services or worker clones.

### Parallel release policy

The documented Z7-A12 portability gap remains open. Two acceptable release paths exist:

1. **Recommended initial path:** sequential is supported; parallel is explicitly experimental with limitations and remains outside the main onboarding journey. Preserve existing local plans. Do not mislabel sequential export as parallel backup.
2. **Full parallel-supported path:** implement a versioned parallel plan envelope including selected workers, ownership/new-file rules, concurrency, Join/integration policy, budgets and portable check requirements. Rebind local configuration. Preview/import without preparing workspaces or starting native work. Test a complete structural/semantic round trip.

A common file envelope may describe sequential vs parallel kind, but it must not coerce one into the other. Existing plan schemas remain the execution authority.

Parallel UX also needs a staged view: select base → choose workers/files → review preparation side effects → start → inspect Join proposal/conflicts → integration → combined verification → final review. Preserve the current maximum two workers and approved integration semantics. Results must clearly name the integration workspace. No automatic Apply to original is introduced here; present the actual supported retrieval steps and retention warning.

## 11. Architecture and migration

Use the current module boundaries. Existing source anchors include:

| Anchor | Change focus |
|---|---|
| `packages/ui/src/graph-engineering/GraphLibrary.tsx` | Intent-first library, version defaults, guided instantiation |
| `GraphTemplateBindings.tsx` and `graphWorkflowView.ts` | Loading states, compatibility, contextual actions and retained draft |
| `GraphProjectRecipes.tsx` | Forms and project-setup navigation; raw editor retained |
| `GraphEditor.tsx`, `GraphCanvas.tsx`, `GraphNodeInspector.tsx` | Guided/advanced projection, context and readiness |
| Graph run/approval/recovery UI modules | State distinctions and relevant next action |
| `packages/services/src/graph-engineering/artifact-types.ts` | Existing check/artifact contracts; deliberate additive extensions only |
| `domain/tool-verification.ts` and `domain/artifact-schemas.ts` | Strict evidence semantics and adapter boundary |
| Existing Graph hooks/native services | Read-only discovery, supported operations, reuse of native ownership |

Confirm every path against the actual checkout. This table is an investigation map, not permission to edit all files.

New logical services may cover project discovery, readiness diagnostics and deterministic report normalization. Expose them through existing public module/Host contracts. The UI cannot directly read arbitrary files, spawn processes, own authoritative result states, or bypass the native runtime.

Do not introduce another model store, graph backend, protocol owner or global workspace registry. Persist saved settings through the existing recipe/config machinery with optimistic conflict checks. Snapshot references and versions per run. Never rewrite historical graph instructions, consent records, model selections, artifacts or native session identities during UI migration.

## 12. Measurement and acceptance

All figures below are proposed acceptance targets, not observed results:

- Configured provider + selected disposable workspace: create an agent-led supervised workflow in under 3 minutes without raw JSON or external assistance; exclude model execution time.
- Previously configured project: prepare a repeated task for the run confirmation in under 60 seconds without re-entering check definitions.
- Supported .NET project with dependencies already installed: complete check setup in under 10 minutes of user interaction; report command/restore wall-clock time separately.
- From a visible failure: locate the responsible step, evidence/cause and safe next action within 60 seconds.
- Three engineers unfamiliar with the new UI complete creation, a permission/approval interaction, a verification-failure diagnosis and template reuse. Require all safety-critical decisions to be understood; record failures and iterate. This small pilot is not population-wide usability proof.
- Test 1280×720 and 1920×1080, common Windows scaling, keyboard-only operation, zoom, focus, theme and readable error associations. Do not claim accessibility conformance from screenshots.
- Measure history/list responsiveness on a declared fixture (for example 500 run summaries) and graph size within actual supported limits. Set performance budgets after U0 measurements; include reference machine and artifact sizes, and keep model latency separate from UI latency.

W3C guidance supports clear inline/form-level errors that identify the field and corrective action. [S10] A Dify-style input/output inspector is a useful reference, but editable pinned values must not replace actual evidence in an authorized run. [S11]

## 13. Entry gate for Z8

Proceed to Z8 only when:

1. No-recipe Agent-assisted task works without misleading test claims.
2. Verified project setup works for the chosen supported .NET profile without user-authored JSON/reports.
3. Template creation cannot dead-end at a generic unresolved label; diagnostics preserve entered work.
4. Guided/Advanced changes preserve supported semantics and imported advanced state; old runs remain immutable.
5. Actual native graph-to-conversation identity, permissions, approvals, cancellation and safe recovery pass regression tests.
6. Real failing/invalid/stale/zero-test evidence remains distinguishable and cannot generate a false pass/repair.
7. Sequential transfer works through reviewed files; parallel scope has an explicit supported/experimental decision and the corresponding evidence.
8. The user or designated operator completes the supported project pilot, and the user guide matches the implementation.
9. Baseline failures, new failures, unperformed checks and exceptions are recorded separately. No new in-scope critical defect remains.

These gates establish product readiness to begin release hardening, not production approval. Z8 still owns the full installer/upgrade/uninstall matrix, consistent backups/restore, retention, support bundles, signing/publication authorization, upstream compatibility and release manifest. Do not postpone fixes for discovered data loss, unsafe execution or credential exposure merely because their full audit belongs to Z8.

## 14. Explicitly not authorized by this plan

Application implementation, company-repository access, credential inspection, live paid runs, dependency/global-tool changes, installed-app updates, signing, pushes/merges, or publication are not performed or authorized merely by delivery of these documents. Use the phased implementation prompts after the user chooses the next assignment.
