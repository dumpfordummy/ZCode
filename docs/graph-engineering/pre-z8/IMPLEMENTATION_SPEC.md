# Pre-Z8 implementation specification

Status: authorized U0–U6 specification, 27 September 2026. This document extends the existing Z1–Z7 specifications; historical definitions, template versions and run records retain their semantics. `EXECUTION_PLAN.md` records actual progress and evidence.

## Ownership and boundaries

```mermaid
sequenceDiagram
  participant UI as Graph UI / workspace-keyed unsaved drafts
  participant Workflow as Existing Workflow library
  participant Graph as Existing window Host GraphState
  participant Native as Native session / Tool / interaction owner
  UI->>Workflow: Read templates or preview import (no execution)
  UI->>Graph: Read saved project checks / bounded metadata scan
  Graph-->>UI: Configuration, candidates, diagnostics; no process started
  UI->>Workflow: Explicit create, immutable version + local bindings
  Workflow->>Graph: Revision-checked saveDefinition
  UI->>Workflow: Prepare exact definition + native settings
  Workflow-->>UI: Frozen review of configuration, destinations, unknowns
  UI->>Graph: Explicit Start / reviewed digest
  Graph->>Graph: Persist immutable run / request identity before dispatch
  Graph->>Native: Existing native task or approved Tool admission
  Native-->>UI: Permission/question in exact native conversation
  Native-->>Graph: Correlated terminal observation
  Graph->>Graph: Capture evidence before successor / final gate
  UI->>Graph: Decision for exact evidence revision
```

The Renderer draft store is not a queue or execution authority. Keys use `workspaceIdentity?.trim() || workspacePath`. No scan, load, save, template creation/import or history read starts an agent, command, installer, MCP connection or worker clone. Commands keep owner/lease, expected runtime identity, persisted idempotency keys and conservative unknown outcomes. Desktop continuous and mobile replayable delivery are unchanged; Graph execution remains local-only.

## U1: first useful workflow and configuration states

Add a new immutable portable built-in `agent-assisted`, version 1, using canonical graph v5: Start → Analyze → Implement → Review → Final approval → End. Bind Original request into Analyze, request/Analyze into Implement, and request/Analyze/Implement into Review exactly once. Review is agent-reported text. Final gate captures Review, Implement and source evidence; comments are required. End selects Review. No Tool node, configured test dependency or repair route exists. The UI labels verification as **Agent-led review; configured test evidence not included**. Existing `generic`, `bugfix` and `slot` v1 content remains byte-semantically unchanged.

Definitions with no Tool nodes and no repair region do not read or bind the project recipe file during creation, preflight, admission or subsequent routing checks. Unrelated invalid recipe entries must not block this path. Native model, permission, workspace, definition and explicit-reference checks remain mandatory. Definitions with Tools retain complete recipe-configuration drift protection.

Workflows, Design, Runs and Project setup are explicit destinations inside the existing Graph shell. The selected workspace remains visible. The library starts from use intent, defaults new instances to the latest compatible non-archived version, and puts Duplicate/archive/version hashes/raw transfer under management or details. Agent-assisted, verified and advanced workflows remain distinct; missing checks never downgrade verified semantics.

One Renderer-local store retains unsaved graph drafts (base revision + full canonical definition), per-workspace/per-template-version parameters and bindings, project-check draft text and navigation. Workspace switches select a different key; returning restores that draft. Host changes reconcile clean drafts; dirty conflicting drafts remain intact with a visible conflict action. Failed reads/saves never replace dirty text. Create over dirty design presents Save and replace / Discard and replace / Cancel. Save failure or Cancel leaves the original unchanged. Consent must apply to the current draft/template, not remain sticky across edits.

Recipe loading has explicit `not-loaded`, `loading`, `ready` and `error` states; `ready` separately presents empty and incompatible results. Panel open may automatically perform a read. Read sequence plus workspace generation suppress late results both in state and returned values. A failed refresh is not reported as an empty successful list. Compatible choices exclude wrong verifier kind; readiness lists corrective navigation to Project setup, model configuration or affected design fields. Every disabled primary action exposes a reason. Native executable availability remains separate from static recipe validity.

U1 acceptance: zero submissions during load/create/save; agent-assisted native sequence and final gate; no false test badge; unavailable/empty/read-failed/wrong-kind states; whitespace/missing parameter rejection; draft preservation across navigation, failed save, workspace switch and replacement cancel; immutable template pins. Use unit/service tests plus controlled native UI evidence.

U1 shared compatibility projection: `graphRecipeCompatibility(definition, nodeId, recipe)` returns `compatible`, `requiredKind` and corrective `issues`. For pre-existing definitions, keep the existing backend's legacy `build`/`test` slot rules, and recognize explicit test/verification artifact consumption or condition `testNodeIds` as test requirements. Do not guess from display names. Unspecified advanced Tool nodes remain `any`; authoritative native validation still applies. Creation and preflight both use this same interpretation. U2 adds explicit graph-local verification/Build bindings for renamed/custom slots. Required Test references must resolve to an existing different Tool; the legacy Test slot still requires its declared Build until that additive mapping exists.

## U2: project checks and deterministic .NET evidence

The Graph module owns read-only discovery through a bounded public contract and async adapter, not direct UI filesystem access. Scan only selected workspace metadata (`.sln`, `.slnx`, `.csproj`, `global.json`, `Directory.Build.*`, test package declarations); exclude generated/dependency/VCS folders; reject symlink escape and linked external source; bound files, bytes, depth and cancellation. Report all candidates, provenance and uncertainties without evaluating MSBuild or scripts. Naming is a hint, not test-platform proof.

Guided checks are projections of the existing revision/digest-checked `.zcode/config.json` recipe configuration. Preserve unrelated config and advanced fields. Forms show executable/argv/cwd/timeout/source/output scope and restore/network/private-home implications. Scan, static validation, availability inspection, save and real calibration are separate actions. Calibration uses existing native Tool admission, permissions and immutable evidence; no second executor. Changes to targets, framework, filter, args, source scope or provider policy invalidate relevant readiness/review; old snapshots remain unchanged.

Additive contracts for per-node verifier requirements/Build references, discovery and VSTest/TRX will be defined before U2 implementation. Test-to-Build remapping affects the definition/run snapshot, never a globally saved recipe. Existing JSON recipe format `zcode-json-v1` and report `zcode-test-v1` remain valid and distinct.

First supported adapter: bounded .NET VSTest with genuine TRX, explicit projects/frameworks and owned unique reports per invocation. Trusted deterministic normalization attaches current native operation/source/build identity only after freshness and process checks. Original reports remain immutable inspectable artifacts. XML DTD/entities are prohibited; bounded parse/file/count limits reject malformed, duplicate, partial, stale, mismatched, oversized and escaping outputs. At most 1,000 tests; never truncate into PASS. Zero/all-skipped/missing-required/failed/cancelled/crashed runs cannot pass; genuine failing assertions may be valid evidence. Test execution must use captured binaries (`--no-build` or explicit output) or invalidate/re-establish Build evidence. Source includes reviewed build inputs, not a guessed single file.

Initial support excludes MTP, private/game/RTP harnesses, shell/script wrappers, external linked source and unreviewed custom imports. Explain these limits and environment/feed diagnostics; never copy original-home credentials or install tools. Actual package-free synthetic VSTest proof is required before support claims.

## U3: guided canonical editing

Guided and Advanced share the same definition and stable IDs. Guided projects supported fields; custom fields or routing outside that projection make Guided read-only with a precise Advanced link. Context choices create existing one-pass bindings and show source/type; future-output previews show unresolved placeholders. Actual run previews read captured prompts/bindings only. Reference selection uses existing platform/hook APIs; skill selection must use existing-only native metadata, not cold-start `useSkills` catalog discovery. Show unavailable/duplicate inherited guidance without silently dropping explicit references.

Provide insert/reconnect/delete with dependent-reference review, End selection, keyboard step navigation and Fit view. Input Delete never deletes a node. Any undo is draft-only. Typed condition/repair presets compile existing schema and limits; disclose initial plus additional repair attempts and minutes/admission budget. Unknown/invalid evidence never causes implicit failure routing or repair.

## U4: execution/evidence/decision projections

Derive three independent axes from persisted facts: Execution; Evidence (not configured/not run/agent-reported/command/valid test pass or fail/invalid or stale); Human decision. A completed input, agent prose or gate approval cannot manufacture verified test success. Summary shows captured target/revision, changes/artifact references, actual inputs/output and next action. Bound visible history/output without truncating canonical records.

Persistent actions route native permissions/questions to the exact existing session with no new input. Graph gate decisions remain their existing revision-bound command. Stop requested is distinct from terminal inactivity; recovery shows reason-specific inspect/continue/release guidance and never offers universal retry. Release remains confirmed inactive plus audit reason. New runs after partial edits disclose retained changes.

## U5: reuse and transfer

Sequential export/import uses platform file selection/save and the existing strict dry preview. Review omissions and prose before export/import; malformed/unsupported/cancel/error preserves design and does not execute. Portable templates exclude local bindings, credentials, native auth, history, artifacts and integration workspaces. Repeat-run uses a new explicit request and pinned workflow/checks while preserving prior runs.

Parallel remains experimental, outside primary onboarding. Display original/worker/integration scope and existing retention limits. Sequential export is never offered as a backup of a parallel plan. Z7-A12 remains FAIL / valid parallel transfer unavailable; conditional U5-P01–P03 are not supported-release claims. No automatic Apply to original, merge or publication.

## U6: verification and human pilot

After every phase run its meaningful unit/service/native/UI negatives and review actual diff before progression. Coordinator serializes emitting typecheck/CLI build/desktop build. U6 runs the combined Graph/Git/UI/script suites, required root typecheck/lint, CLI checks, architecture, changed-file formatting and compares whole-repo baseline failures. Native fixtures cover ordinary Chat plus graph session identity, permissions/questions/gates, cancellation/restart, strict evidence, template transfer and parallel regression. Built-artifact screenshots use isolated profiles and controlled providers only.

Prepare three-engineer task/timing sheets, supported .NET user pilot and short manual checklist. User-operated/live/model-quality/company-project checks stay NOT RUN until supplied evidence exists. The consolidated report includes exact source/artifact identity, commands/results, screenshots, remaining issues, support matrix and a Z8-entry decision; it does not start Z8 or claim production readiness.
