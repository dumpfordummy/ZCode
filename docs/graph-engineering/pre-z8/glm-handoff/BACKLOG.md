# Remaining pre-Z8 work, in dependency order

Status grounded in the 27 September 2026 working tree and retained receipts described in [HANDOFF.md](HANDOFF.md). The original acceptance IDs refer to `docs/graph-engineering/pre-z8/BACKLOG_AND_ACCEPTANCE.md`. Future commands/checks below are **NOT RUN** unless a retained result is explicitly identified. This is remaining work, not a new framework or rewrite proposal.

The supported scope is local Windows supervised sequential workflows with the bounded genuine VSTest/TRX integration. Parallel stays experimental. U0–U3 have implemented automated checkpoints; preserve their source and evidence. Do not reopen whole phases because an old handoff says they are unstarted or because a per-phase report file is absent.

## Dependency map

| Order | Work                                                                                             | Depends on                                                      | Status at handoff                                                           |
| ----- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1     | TASK_001: U4 cancellation driver navigation + native cancellation/independent-Chat/restart proof | Existing U4 source/build, owned fixture                         | Confirmed driver defect; actual attempt failed before Graph Run             |
| 2     | Finish remaining U4 native presentation/evidence journeys and checkpoint review                  | Task 1 and frozen current artifact                              | Drivers exist; listed native journeys NOT RUN on final U4 build             |
| 3     | U5 shared pure reuse/portable-reference contracts and tests                                      | Verified U4 checkpoint                                          | Specification and baseline investigation only                               |
| 4     | U5 bounded file hook, retained transfer state and reviewed file UI                               | Agreed contracts + step 3                                       | New hook/UI integration absent                                              |
| 5     | U5 new-request UI and independent repeated-run evidence                                          | Shared request transform + resolved draft-buffer handling       | Absent                                                                      |
| 6     | U5 visible sequential/parallel boundary and integrated checkpoint                                | Steps 3–5                                                       | Experimental label already present; transfer/reuse acceptance still pending |
| 7     | U6 final combined regression, built-artifact checks, guides and pilot preparation                | Combined U1–U5 implementation                                   | Not started as a final combined gate                                        |
| 8     | U6 human/live acceptance evidence and final readiness decision                                   | Prepared pilot, designated operators and required authorization | NOT RUN; do not fabricate completion                                        |

Keep one coordinator for contracts, spec decisions and integration. Separable domain, hook/UI and read-only review work can be assigned after contracts are fixed, with disjoint files. One owner serializes emitting typechecks, CLI/Desktop builds and native fixtures. Do not run parallel builds against shared outputs.

## 1. TASK_001 — U4 cancellation acceptance

Use [TASK_001.md](TASK_001.md) as the complete bounded assignment. Its repair belongs in the U4 driver callsite, not the product or shared Runs helper. A later assertion may expose a different blocker; preserve it and scope the next task instead of assuming this fix completes the scenario.

Acceptance mapping: U4-03 and U4-05, plus same-profile history/restart preservation relevant to U4-02/U4-06. Existing proof/fixture tests must retain exact identity, terminal-proof, three-input and no-successor assertions.

## 2. Complete the U4 automated checkpoint

Current source review, root checks, 336 Graph/Git tests, 115 UI tests, 10 U4 fixture tests and actual 500-history UI evidence are retained passes. Re-run them only for a concrete changed-source/regression reason or the later combined gate. The current cancellation FAIL does not invalidate unrelated passing unit/history evidence, and those passes do not replace native cancellation proof.

After Task 1, run serially against the same frozen/reviewed artifact:

```powershell
# Repository root; future execution, NOT RUN for final U4 artifact at handoff.
node scripts/graph-engineering/pre-z8-u4-native.mjs --scenario=complete
node scripts/graph-engineering/pre-z8-u2-native.mjs --scenario=pass
node scripts/graph-engineering/pre-z8-u2-native.mjs --scenario=fail
node scripts/graph-engineering/pre-z8-u2-native.mjs --scenario=source-drift
```

Before execution, inspect the U2 proof/UI helpers for the current three-axis assertions described by `pre-z8-u4-native-spec.md`. Extend only missing observation coverage; do not assume a U2 process/evidence pass also proves new U4 rendering. The complete eight-case U2 native matrix belongs to U6, not this reduced U4 subset.

Required observations, mapped to U4-01–U4-08:

- Completed agent-assisted run shows Completed execution, agent-reported evidence with zero configured Tests, and exact Approved human decision independently. Its request/result/workspace/source changes match captured run/approval evidence, not a fresh live diff.
- Native permission/question links and graph gate links resolve the exact existing identities with no extra input or second response channel. Current gate/source binding remains authoritative; existing duplicate/concurrent/stale decision regressions stay passing.
- The `complete` driver's guarded missing/corrupt artifact cases run only on its nonce-owned artifact, with exact `finally` byte/timestamp restoration. Current read error is visible, prior stale content is absent, captured acceptance/history is unchanged, restored evidence/manifest reads work. `pre-z8-u4-artifact-fault.mjs`, `pre-z8-u4-artifact-ui.mjs` and tests already implement this guarded fixture path; inspect before modifying.
- Genuine passing Test, genuine failed assertions and invalid source association remain visibly distinct. No failure/invalid/unknown state becomes a green pass, generic retry or implicit repair.
- Later ordinary Chat and reopened history cannot replace captured prompts/results. Unknown/release/explicit checkpoint behavior remains covered by existing service regressions; expand tests only for a demonstrated coverage gap.
- Preserve actual 500-summary fixture evidence in `evidence/pre-z8/u4/history/`. It proves bounded controls, keyboard page transitions, themes and those viewports only. Human usability, real Windows scaling/OS dialogs and accessibility conformance remain NOT RUN.

Archive new receipts/screenshots and immutable source/artifact hashes without overwriting failed attempts or the history submanifest. Review the source/diff and update `EXECUTION_PLAN.md`, the current guide and exact next actions. Claim only an automated U4 checkpoint after the required native evidence exists; keep human/live rows open. No separate U4 report is required by the latest user instruction.

## 3. U5 shared contracts before dependent UI

Authority: `U5_REUSE_SPEC.md`, original U5-01–U5-03. The following signatures/rules are already specified but **not implemented APIs**:

- `applyGraphRunRequest(definition: GraphSequentialDefinition, request: string): GraphSequentialDefinition`.
- `useGraphTemplateFiles(target)` with `canImportFile`, `canExportFile`, `importFile(isCurrent)` and `exportFile(json, isCurrent)`; the hook work is step 4.

Verified domain source anchors: `packages/services/src/graph-engineering/domain/workflow.ts`, `captureTemplate` and `instantiateTemplate`; public exports in `workflow-contract.ts`. Current `captureTemplate` deletes the frozen instance then emits `references: []`, losing selected semantic reference roles. `instantiateTemplate` currently renders parameters/exclusions into Start inline. Read `.tmp/pre-z8-current/u5-domain-preparation.json` and its copied baseline investigation in this handoff's `evidence/retained-checks/`; it is a preparation receipt, not a completed implementation.

Implement a bounded pure transform and share the **exact existing** Start renderer with initial instantiation. A proposed `domain/workflow-request.ts` and focused `app/workflow-reuse.test.ts` are reasonable new files, not existing references to call. The coordinator owns the public export and contract/spec updates. Do not add another state owner or change readiness ownership.

Required request behavior:

- Nonblank string, at most the existing 12,000-character parameter bound, exactly one Start.
- Pinned instances require an existing own string `parameters.request`; missing/non-string parameters use a clear Advanced path, not an invented parameter declaration.
- Clone and change only the request parameter and corresponding Start rendering. Preserve other parameters including false/zero/Unicode/braces, exclusions and rendering order, IDs, pin/version/digest, settings, references, check mappings, schemas and routing. Unpinned definitions change only Start text.
- Unrelated incomplete custom draft structure is not “fixed” or rejected by a full readiness rewrite. Existing readiness/preflight still gates execution separately.

Required capture behavior:

- Capture selected semantic reference roles before removing local instance data: stable ID/kind/affected node IDs, label equal to ID because the frozen instance lacks the original label, and required rebinding because it lacks the original optional flag. Saved library-version exports retain their original role declarations/optional flags.
- Strip local reference paths/content/native delivery policy, model overrides, source bindings and Start request through the existing portable contract. Do not silently prune invalid roles; strict preview must reject invalid identifiers/targets.
- Preserve expanded multi-check topology, Build/Test mappings, custom structured schemas, conditions, repair limits and final gate. Export/import remains `zcode-workflow` v1; it is not run/history/evidence/parallel backup.

Independent tests should compare known template semantics and immutable input snapshots, not simply compare output to the same helper used to produce it. Include two-Test generic and bugfix capture/import/instantiate, document/instruction/skill role rebinding, custom advanced declarations, exact existing Start-renderer golden output, and negative missing/multiple Start or malformed request. Prove no IO/native execution or historical mutation.

## 4. U5 file transfer and retained review state

Reuse `packages/ui/src/graph-engineering/GraphTemplateTransfer.tsx`, `GraphLibraryManagement.tsx`, `packages/ui/src/store/graphDraftStore.ts`, existing `IGraphWorkflowService.preview(...)` and `mutate({ action: "create" | "version", ... })` operations, public `IPlatformService` and `IFileService`. These method/discriminant names come from `workflow-contract.ts`; `graph-library-save-version` is a UI selector, not a service operation. Current transfer UI uses component-local name/description/JSON/preview/review state and raw JSON; it is not the requested reviewed file flow. Pass workspace identity explicitly where needed rather than introduce another registry.

The planned hook belongs under `packages/ui/src/hooks/`. Exact contract from `U5_REUSE_SPEC.md`:

- Use `canSelectFilePath`/`selectFile`, `stat`, one bounded `readFileRange`, second `stat`, and `saveFile`. No direct filesystem/`window.zcode`, new Host protocol, process or network operation.
- Import returns `{ path, json }` or undefined for cancellation/stale scope. Before read require a file, finite integer size and finite mtime; request at most 256,001 bytes, reject beyond 256,000, returned-length/type/size/mtime changes, invalid UTF-8 and blank content. Then use existing strict `workflow.preview(action: import)`.
- Export supplies exactly the reviewed JSON as a fresh UTF-8 ArrayBuffer, suggested name `workflow.zcode-workflow.json`, and the existing `SaveFileResult`. Current errors propagate; stale scope returns must not authorize or replace newer content.
- Combine caller intent generation with service/platform/workspace lifetime and cleanup generation, including StrictMode cleanup/setup. A permitted OS save may finish after navigation; its late result still cannot authorize a different review.
- Without local capabilities, explain the limitation and retain the explicit Advanced JSON path. No file read/write when capability is unavailable.

Retain transfer name/description/JSON by workspace through the existing draft owner. Review acknowledgement is scoped to exact content, entry/version, preview operation and workspace; changing any invalidates it. Import/cancel/read/preview/save errors preserve the current design and entered text. Native file import only previews; explicit reviewed Create/Save version changes the library, and existing reviewed instantiation changes Design. None executes agents/checks, installs references or prepares workers.

Before implementing replacement, resolve the unapplied-editor-buffer choice recorded in HANDOFF/U5 spec. The existing dirty canonical definition and invalid/unapplied editor text are different states. Save cannot falsely persist unapplied text; Cancel/error/late result must preserve it; an explicit Discard may clear only unchanged buffers covered by that decision after successful replacement. Exact UX/callback placement is provisional until this choice and current component lifecycle are inspected.

Acceptance includes valid round trip; malformed, oversized, invalid UTF-8 and parallel envelope rejection; picker/save cancellation and failures; late workspace/entry/preview responses; concurrent text edits; replacement Cancel; local/auth/history omission; preservation of custom schema, final gate, multi-check and reference roles. Use requirement-level content and state assertions plus isolated UI wiring. A controlled Electron picker seam may exercise file plumbing, explicitly labelled; actual OS dialog ergonomics remain a human check, not a mocked PASS.

## 5. U5 daily new-request flow

Use the new pure transform through the existing canonical draft owner in `GraphEditor.tsx`/related cohesive controls after step 3. New request applies a draft change only; Run remains a separate deliberate action with fresh durable request identity and re-bound preflight. Editing the request invalidates open consent. Preserve selected template version, current project/check/reference bindings and per-node configuration.

Show that previous edits remain in the workspace and point to prior runs/current changes. Do not reset files, imply idempotent replay, reuse an old native input or mutate captured earlier prompts/settings/evidence. Existing active/uncertain-run and Host lease guards continue to block unsafe admission.

Test two distinct requests against the same configured sequential workflow: the second preview keeps declared choices but has the new Start text and no execution yet; explicit second Run has fresh run/request/session/input IDs; first run bytes and evidence remain unchanged. Include cancellation/invalid request and a custom unsupported request-parameter shape. Use independent first-run snapshots and exact native ledger identities. Human under-60-second reuse timing stays NOT RUN until an operator performs it.

## 6. U5 parallel boundary and checkpoint

Original U5-04 is mandatory: clearly state experimental Fork/Join limits and that sequential export cannot back up a parallel plan. `GraphEngineeringPanel.tsx` already exposes an experimental parallel entry; inspect whether reuse/file UI adds any misleading affordance. Preserve saved local parallel plans and current existing execution APIs.

U5-P01–P03 are conditional and remain OPEN/outside supported scope. Do not implement an unreviewed parallel transfer envelope, worker cloning from import, automatic Apply to original, merge or cleanup. **Z7-A12 FAIL** must remain visible in support/readiness documentation. Promoting parallel to supported release requires a separate explicit decision and its own complete transfer/lifecycle evidence.

Review U5 combined domain/hook/UI changes, run focused negatives, root typecheck/lint/architecture, serial artifact builds as needed and isolated native repeat/transfer journeys. Record safe import/export as template portability only. Update user/LLM guide controls and support boundaries; keep prior checkpoints and failures intact.

## 7. U6 combined automated gate and documentation

Original U6-03–U6-05 and the cross-cutting regression matrix remain open. After all combined changes, execute the actual current Graph/Git services, Graph UI and harness test suites from HANDOFF; provide a genuine valid TRX fixture manifest rather than silently skipping report replays. Run required root typecheck/lint, architecture, separate CLI checks/build, changed-file formatting and a baseline-aware whole-format/CLI-lint comparison. Preserve the known root 70 warnings, CLI 85 errors/53 warnings and whole-format 2,874-file failure as baseline unless actual new evidence changes that classification. Never suppress diagnostics or format the whole unrelated repository to hide them.

Serialize final emitting validation, then freeze the final artifact for built native acceptance. Previous U1–U3 passes belong to their earlier artifacts; replaying saved JSON in a pure test is not a final-artifact native rerun. The final matrix must cover:

- No-recipe agent-assisted flow and unchanged verified-template requirements; draft/configuration/read races, no-execution preview/import and new-request behavior.
- All eight supported U2 native cases, genuine original reports and strict invocation/source/Build links. Preserve valid failure vs invalid evidence; zero/all-skipped/missing-required remain non-pass. No private feeds/installed credentials or fake model-authored reports.
- U3 context/reference/rendering preservation; ordinary Chat and exact native session navigation; permissions/questions/final gate; cancellation/late events/Unknown/restart/explicit recovery; prior histories remain immutable.
- U4 completed/no-tests, passing/failed/invalid checks, current-iteration evidence, captured changes, scoped artifact errors, history selection and bounded UI rendering.
- U5 reviewed sequential file transfer and repeat-run identities, and negative/cancel/stale/draft-preservation cases.
- Existing Z4/Z5/Z6 native regressions using `z4-native-smoke.mjs`, `z5-native-smoke.mjs`, `z6-native-smoke.mjs`. Their helper navigation adaptations have syntax/lint evidence, not fresh combined native passes. Inspect supported `--scenario` values from each current driver before selecting the matrix; do not invent a command named “all”.
- Existing experimental parallel regression through `z7-native-smoke.mjs`, preserving original/worker/integration ownership, conflicts, combined verification, inactivity/retention and no automatic publication. Passing existing scenarios does not close the missing parallel-transfer gap.

Use isolated owned profiles/workspaces and the real built application with controlled providers only. Record source/artifact hashes, fixture provenance, commands/exits, failed and successful receipts, screenshots and layer limits. Avoid conflicting builds; do not install over the user's application or launch ordinary production development mode against user data.

Update `docs/graph-engineering/pre-z8/USER_GUIDE.md`, `docs/graph-engineering/LLM_USER_GUIDE.md` and relevant examples to match final visible controls, commands, report limits and state meanings. Inspect broader release-guide references before editing them; do not overwrite unrelated README work. Prepare the final `docs/graph-engineering/pre-z8/PRE_Z8_READINESS_REPORT.md` (absent at handoff) with consolidated implemented scope, actual checks, screenshots, open issues, baseline exceptions, support/experimental matrix and short manual acceptance checklist. Separate automated completion from the remaining operator gate.

## 8. Human/live work and unresolved compatibility

`HUMAN_PILOT.md` exists and every operator result is NOT RUN. U6 automation must prepare/revise it and leave truthful statuses. Actual pilot execution requires designated people and, for live providers/company projects, separate authorization. Do not block independent automated/documentation work while waiting, and do not mark these requirements completed.

Required operator evidence includes three unfamiliar engineers' creation, native permission/question and Graph approval understanding, failure/invalid-evidence diagnosis and template reuse; interaction time separate from model/command time; actual keyboard/focus/zoom/Windows scaling/theme/error usability; native OS picker ergonomics; and an explicitly approved supported .NET project journey. Targets remain the plan's 3 minutes creation, 60 seconds reuse/diagnosis and 10 minutes setup interaction. Recorded 500-history fixture performance does not fill any of these cells.

U0/U2 unknowns about real company solution shape, VSTest vs MTP, private feeds/custom imports and game/PowerShell/RTP harnesses remain unknown. Standard synthetic VSTest acceptance does not establish private-project compatibility or test adequacy. Inspect only an authorized sample before expanding support; a shell wrapper cannot bypass recipe restrictions, and unit tests are not RTP equivalence/certification.

Do not begin Z8 after automated completion. Z8 requires a separate assignment and the plan's remaining operator/support gates; installer/upgrade/uninstall, signing, publication and broad retention/recovery qualification remain outside this implementation handoff.
