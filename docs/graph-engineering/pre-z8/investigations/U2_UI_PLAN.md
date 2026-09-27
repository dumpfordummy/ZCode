# U2 Project setup UI plan

Read-only planning checkpoint, 27 September 2026. The root coordinator owns new shared contracts and native execution integration. No U2 product source, build or fixture execution was changed by this investigation. This plan follows [U2_CONTRACT_DRAFT.md](../U2_CONTRACT_DRAFT.md), [IMPLEMENTATION_SPEC.md](../IMPLEMENTATION_SPEC.md) and U2-01 through U2-11 in the backlog.

The current U1 source and its scoped read/draft helpers were inspected, not inferred from the handoff. Root reported the final U1 typecheck, lint, desktop build and 48 pure UI tests passing; the expanded native U1 harness is still owned by the safety lane. Those results do not establish any U2 behavior.

## Current seams confirmed in source

| Current source                                                                                | What is available now                                                                                                                                                               | Consequence for U2                                                                                                                                                               |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/ui/src/graph-engineering/GraphProjectRecipes.tsx`                                   | One retained JSON recipe form, digest-conflict display, explicit read/save, zero execution on opening                                                                               | Keep as Project setup entry; extract the Advanced JSON section and add Guided projections over the same retained text                                                            |
| `packages/ui/src/store/graphDraftStore.ts`                                                    | Canonical recipe draft text, base text/digest, external-conflict preservation and delayed-save protection                                                                           | Extend only workspace-local selection/authoring fields as needed; do not create a second accepted profile store                                                                  |
| `packages/ui/src/hooks/useGraphRecipes.ts`, `graphRecipeRead.ts`                              | Independent scoped recipe read state, latest-read guard, stale return suppression                                                                                                   | Reuse this pattern for discovery/availability without merging their state into Save/Run pending                                                                                  |
| `packages/ui/src/hooks/useGraphEngineering.ts`                                                | Current Run path saves the submitted design before admission; action results are scope guarded after final reload                                                                   | Add a checks-specific callback that directly submits the new checks intent. Never call the current design `run` path for calibration                                             |
| `packages/ui/src/hooks/useGraphWorkflow.ts`                                                   | Bounded library hook with service/target scope and typed facade calls                                                                                                               | Add a separate project-setup hook over the same Workflow service; a scan must not lock Library/Save/Run via a shared pending flag                                                |
| `packages/services/src/graph-engineering/workflow-contract.ts`                                | List/mutate/preview/instantiate/prepare; no project discovery, compiler, availability or calibration-preview contract                                                               | Root needs the additive project-setup facade before dependent UI implementation                                                                                                  |
| `packages/services/src/graph-engineering/artifact-types.ts`                                   | Canonical recipes, command/build/Test union, only `zcode-json-v1`, source/output arrays and redaction-variable names                                                                | New TRX descriptor must be public and versioned; preserve old JSON Test semantics and every supported field                                                                      |
| `packages/services/src/graph-engineering/tool-types.ts`                                       | Tool node contains only ID/name/recipe ID/position; attempts freeze complete recipes and verification                                                                               | Additive graph-local requirements/Build mapping belong to root; UI must use the public effective compatibility helper                                                            |
| `packages/services/src/graph-engineering/workflow-provenance.ts`                              | Template bindings map one recipe ID per node; run provenance requires a template and model-oriented metadata                                                                        | Multi-test groups need additive binding data. Checks-only preview needs a distinct public shape, not a fake template/model provenance                                            |
| `packages/services/src/graph-engineering/domain/artifact-schemas.ts`                          | Strict schema: 32 recipes, 32 source/output paths, 64 arguments, timeout 100–600000 ms, bounded required/count policies; safe forward-slash relative paths; script-shell exclusions | Show these bounds before execution. UI must not drop excess items, normalize away unsupported data or synthesize a shell wrapper                                                 |
| `packages/services/src/graph-engineering/adapters/recipes.ts`                                 | Digest-check plus lock/atomic save; preserves unrelated `.zcode/config.json` fields                                                                                                 | Keep the existing save path. UI only submits the recipe array and expected original digest, never rewrites the configuration file                                                |
| `packages/services/src/graph-engineering/adapters/workflow-preflight.ts`, `workflow-tools.ts` | Existing-only native executable availability, frozen command summaries, source checks, public recipe compatibility; preflight currently requires versioned template instance        | Reuse the injected availability/effective-recipe paths in root's new checks-preview adapter; do not expose Repo/Node filesystem operations to UI                                 |
| `packages/shared/src/zcode-execution-environment.ts`                                          | Executable available/missing/unknown, config digest and inherited metadata; no SDK version, dependency/feed readiness, private-home or network-policy facts                         | Availability alone cannot produce an SDK/package/home/network readiness badge                                                                                                    |
| `packages/services/src/zcode-agent/zcodeAgentService.ts`                                      | `previewExecutionEnvironment` calls `processManager.getExistingClient`; it does not start a client                                                                                  | Safe source for the read-only availability action; an unavailable native runtime remains Unknown with a corrective route                                                         |
| `packages/shared/src/native-recipe.ts`                                                        | Exact executable/argv/cwd/timeout and optional redaction-variable names; no arbitrary environment injection field                                                                   | Do not add UI environment-value inputs or invent environment override support                                                                                                    |
| `packages/ui/src/hooks/usePlatform.tsx`, `packages/shared/src/platform.ts`                    | `usePlatform`, `selectFile`, optional `selectFiles`, `canSelectFilePath`, optional `saveFile`                                                                                       | Pick explicit metadata files only if needed; service must validate relative containment. Scanning itself stays in the Graph service. No `window.zcode` or UI directory traversal |
| `packages/ui/src/graph-engineering/GraphRunPanel.tsx`, `GraphToolInspector.tsx`               | Existing native conversation navigation, cancel/recovery, frozen Tool recipe/verification/artifact details                                                                          | Calibration should navigate to the persisted run here. No second execution/result owner is needed                                                                                |

## Minimal cohesive UI implementation

Keep the existing Project setup destination. The top-level view should contain four sequential, independently meaningful sections:

1. **Discover projects**: explicit Scan project button, bounded read progress/status, Cancel scan, all candidates and provenance/uncertainty. A solution row is an organizational choice; it must not silently select its first project or every target framework. Unsupported/unknown runner and incomplete source coverage remain visible.
2. **Configure checks**: a recipe list and Guided/Advanced controls. Guided supports existing command/Build/legacy JSON Test fields plus the ratified TRX profile. A generated .NET proposal becomes a draft only after an explicit Add checks action; it never writes over a same-ID recipe implicitly. Save remains separate and retains the existing digest-conflict behavior.
3. **Check availability**: explicit read-only executable lookup with available/missing/unknown status and the exact checked configuration. This does not run `dotnet --info`, restore packages or calibrate tests. SDK/package/feed checks remain unknown unless an approved native execution supplies evidence.
4. **Run checks now**: first prepare/review an immutable saved-check plan, then explicitly start calibration. Show exact argv, cwd, inputs/outputs, report ownership, environment facts/unknowns and native permission expectations. Dirty unsaved form text blocks calibration with a Save-first route; no implicit save or design replacement.

Suggested components, each kept below the repository file limit:

- `GraphProjectRecipes.tsx`: orchestration of the saved snapshot, canonical draft, selection and sections.
- `GraphRecipeJsonEditor.tsx`: the current Advanced text/conflict/save surface, with its existing test IDs preserved.
- `GraphRecipeForm.tsx` plus `GraphRecipeArguments.tsx` if needed: common field controls and reversible field updates; no service calls.
- `GraphProjectDiscovery.tsx`: scan results, explicit candidate/framework selection and provenance/uncertainty disclosure.
- `GraphCheckCalibrationReview.tsx`: command/scope/environment review and explicit confirmation over a dedicated checks-preview contract.
- `useGraphProjectSetup.ts`: service-facing independent scoped read operations; UI components only call this hook.
- `graphRecipeForm.ts` and `graphProjectSetupView.ts`: pure lossless draft projection/update, selection identity, validation focus mapping and preview-invalidation helpers with tests before behavior changes.

This is a cohesive minimum, not a request to implement every file exactly as named. Reuse existing Input, Textarea, Checkbox, Button, Dialog and GraphSelect controls and bilingual graph locale modules. Use a checkbox list for multiple test selections rather than changing the existing single-value GraphSelect into a partial multi-select.

## One canonical draft and round-trip rules

The current recipe JSON text remains the sole unsubmitted recipe value. Guided values are derived from parsing that text. Switching view changes presentation only and must not rewrite the text, reset formatting, regenerate defaults or discard unknown content. A Guided field edit patches only that path in the complete parsed object, then serializes the resulting draft. The previously loaded base text/digest stay unchanged until an acknowledged save.

- Invalid JSON remains editable in Advanced, with Guided unavailable and a direct error/focus route. No replacement with `[]` and no silent fallback to the saved snapshot.
- Existing `redactEnvironmentVariables`, optional fields, custom argv, source/output arrays and all known verifier fields survive an unrelated field edit. Preserve property absence separately from explicit empty values.
- Unknown schema fields or verifier declarations remain in text and make Guided read-only. The strict current service rejects unknown fields; do not claim such data can be saved successfully without a new supported schema. Preservation means retaining the user's text and explaining the limit, not stripping it until validation passes.
- Arguments are an ordered array with one editable row per element. Never split or join on spaces, shell-quote/reparse, trim empty arguments or discard newlines inside an argument. Show an exact JSON argv preview for unambiguous review.
- Numeric inputs must retain an incomplete/invalid editing value until corrected, rather than substituting default numbers. Service static validation decides whether a draft can be saved/prepared. Avoid a separately retained accepted `GraphRecipe[]` plus a second independently editable form state.
- Editing target, configuration, framework, runtime, filter, argv, source/output scope, acceptance policy or environment-related settings invalidates the dependent static-validation/availability/preview result by digest. A previous calibration remains historical evidence, not a green badge for the edited profile.
- Generated recipes use a proposed stable identity per explicit scope and report collisions before applying the proposal. The user reviews additions/replacements, and unrelated recipes retain both content and order. Do not use display names as keys.
- The UI must preserve source manifest ordering because existing Build/Test/repair code compares exact scope representations. Root's compiler owns canonicalized generated manifests and effective recipe mapping.

## State owners and event order

```mermaid
sequenceDiagram
  participant UI as Project setup / retained draft
  participant WF as Workflow project-setup facade
  participant Read as Bounded read-job owner
  participant Graph as Existing Graph owner
  participant Native as Existing native Tool owner
  UI->>WF: scan(target, scanRequestId)
  WF->>Read: bounded metadata read
  Read-->>UI: candidates + scan digest + limits/uncertainty
  UI->>WF: compile explicit selection / validate full draft
  WF-->>UI: proposal + field diagnostics + coverage
  UI->>UI: explicitly apply proposal to same canonical draft
  UI->>Graph: recipes save(expected saved digest)
  Graph-->>UI: acknowledged recipe snapshot
  UI->>WF: availability(saved selection)
  WF-->>UI: existing-native executable facts + unknowns
  UI->>WF: prepare checks(saved digest, selected identities)
  WF-->>UI: immutable exact plan + review digest
  UI->>Graph: explicit checks run(requestId, review digest)
  Graph->>Graph: admit and persist immutable calibration run
  Graph->>Native: existing Tool creation/permission/dispatch
  Graph-->>UI: persisted run identity
  UI->>UI: navigate to Runs; retain design and form
```

Read state must be tagged by the actual service/target pair, including workspace path even when identity is stable, plus request sequence and input digest. Hide old workspace results synchronously before effects. Cancellation is read-job cancellation, not native Stop. A cancelled/limited/error scan must not be rendered as a complete empty project list. A new scan or changed source digest invalidates a proposal without silently dropping retained selected identities.

Suggested independent projections:

| Concern                | States                                                          | Identity that must match before use                                                                              |
| ---------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Scan                   | not-scanned / scanning / complete / limited / cancelled / error | service, target, scan request ID                                                                                 |
| Static form validation | not-validated / validating / valid / invalid / error            | target and entire canonical draft content                                                                        |
| Availability           | not-checked / checking / available / missing / unknown / error  | target, selected recipes/effective commands and native configuration digest                                      |
| Calibration review     | not-prepared / preparing / ready / invalidated / error          | saved recipe digest, exact selected scope, effective mapping, reviewed environment/configuration/source identity |
| Calibration execution  | existing persisted Graph/native run states                      | run/request/attempt/operation/session/runtime identity                                                           |

No timeout should erase a pending native identity. If a calibration reply is lost, retain the original request/review identity and reconcile through the existing run read. A changed form cannot produce a new request while the previous run is unresolved.

## Exact public API gaps for the coordinator

These are proposals for root to ratify. The UI should wait for the concrete contract rather than inventing implementations or importing service internals.

| Capability                     | Smallest required input/output                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Discovery start/cancel         | Workflow `projectSetup` discriminated operation with target and stable scan request ID; result identifies complete/limited/cancelled, metadata digest, every candidate/project/framework, supported runner evidence, provenance, uncertainty, safe source manifest, exclusions and limits. Cancellation must return a distinct terminal read status and reject late publication                        |
| Static generation/validation   | Bounded draft JSON or typed explicit .NET scope request; result returns proposed complete recipes without a write, structured diagnostics with recipe ID/field path/code/severity, representability/support status, source/output coverage and content identity. Empty/wrong-type numeric editing values need a diagnostic rather than RPC-level loss of all form context                              |
| Availability                   | Selected effective executable queries through existing-only preview, no native start. Return executable results/configuration digest plus explicit Unknown values for SDK, private-home/package/feed/network facts not established by that API                                                                                                                                                         |
| Checks preview                 | Saved recipe digest + selected Build and ordered explicit Test identities, graph-local Build mapping, current saved definition revision only if necessary for concurrency (not to overwrite it). Return exact transient definition/effective recipes, argv arrays/cwd/timeouts/source/output/report scopes, current limits, availability, environment policy facts/unknowns and a reviewed plan digest |
| Checks admission               | New discriminated `Graph.run` checks intent with target, stable request ID, expected recipe digest and reviewed preview digest/acknowledgement. Return the persisted run. Root owns lost-ACK idempotency, owner/lease, unresolved/parallel guards, pre-dispatch revalidation and no design save                                                                                                        |
| Calibration provenance         | Additive run purpose identifying project checks, selection/configuration digest and frozen preview. Existing `GraphRunProvenance` requires a template/model list and should not be faked for a tool-only calibration                                                                                                                                                                                   |
| Effective recipe compatibility | Public helper recognizes new node verification declaration and graph-local Build ID while retaining legacy fallback. UI reads the same helper used by instantiate/preflight/run; it never rewrites a global Test recipe Build reference                                                                                                                                                                |
| Multi-test template binding    | Additive bounded group binding preserving all selected Test recipe IDs in a stable order; service-owned expansion preview/instantiate returns the actual extra Tool-node mapping and all reviewer/gate/condition/repair dependencies. Unsupported expansion is explained before mutation                                                                                                               |
| Evidence presentation          | Public frozen verification fields and immutable artifact/normalization receipt identities distinguish process outcome, raw redacted preview, trusted normalized validity and assertion pass/fail. UI must not reconstruct trust from console strings or an artifact label                                                                                                                              |

The new `projectSetup` facade can cover read/compile/availability/prepare actions while keeping `IGraphEngineeringService` bounded. The current `useGraphWorkflow.invoke` serializes every operation with one pending flag; do not route long cancellable scan state through that Library mutation flag. A separate hook may use the same facade without introducing another business owner.

The most important sequencing decision is to expose the checks-run intent before the UI Run checks now control. The existing `useGraphEngineering.run` calls `captureGraphSubmission` and saves the supplied definition; reusing it would replace the engineering workflow with the transient calibration design.

## Multiple project/framework choices

Discovery shows all solutions and projects. A candidate row needs path, project kind, known frameworks, runner evidence, source coverage and unsupported reasons. Do not derive a reliable VSTest classification from a `Tests` filename. Unknown/dynamic target frameworks cannot become a guessed invocation.

For each explicitly selected supported Test scope, retain project + framework + configuration + optional runtime/filter as a distinct identity. Let users select several scopes with a count and readable per-scope command preview. One explicit scope corresponds to one Test recipe/Tool invocation and one owned report. A selected solution should expand only through the service's explicit, reviewed scope proposal; there is no first-solution or first-framework default.

The common verified template needs group binding: choosing two tests must yield two visible Test steps and complete reviewer/gate evidence, not two UI checkmarks mapped into one recipe string. The user must see the expansion and any graph-size/routing limitation before Create. Existing single-recipe bindings remain valid. Renaming a Build display name must not break an ID-based local mapping; selecting a different Build cannot mutate a saved shared Test recipe.

Calibration can select one compatible Build whose captured output manifest covers the chosen Test assemblies, or an explicitly supported multiple-Build plan from root's compiler. This is a contract decision, not a UI assumption that one arbitrary Build covers every selected project. If the first supported compiler has a narrower complete coverage envelope, it must return a precise unsupported reason before execution while retaining selections.

## Output, restore and privacy explanations

Use user-facing facts tied to the actual preview, with no claim beyond the returned metadata:

- **Saved configuration**: saving defines checks; it does not execute a command or prove passing tests.
- **Executable found**: the native runtime can locate this executable. This does not establish the selected SDK version, missing packages, feed authentication or test-runner support.
- **Build**: show every command and output path, its declared no-restore behavior and why fresh outputs are required. A Rebuild or owned-output strategy must come from the reviewed compiler, not be silently inserted by the UI.
- **Test**: show the explicit project/framework/configuration/filter, captured Build association, `--no-build`/no-restore requirement and unique report scope. Do not promise fixed path reuse; the actual operation-owned report path is frozen at admission.
- **Restore**: no automatic restore/install. Explain that missing assets/packages can block checks, and an explicit restore can write files or access configured feeds. Do not copy original-home credentials, discover secret values or offer a wrapper to bypass the native restrictions.
- **Environment**: report the confirmed native policy. The existing preview does not prove private-home isolation or network denial. If these facts are unavailable, label them Unknown and state that the run uses the existing native permission/sandbox controls. A private synthetic fixture is not proof of the installed product's home/feed configuration.
- **Evidence**: redacted original-report preview may be incomplete while an independently validated normalization receipt binds the original SHA/length to normalized results. Never label the preview digest as the original report digest; never offer redacted output as exact raw proof.
- **Capacity**: show the current source/output/report/test limits and incomplete scan state before Start. More than the supported limit blocks the supported preset; no hidden truncation or reduced expected-test count.
- **Unsupported**: MTP, script/shell/RTP/game harnesses, external linked source and unresolved imports need a precise explanation and retained draft. Do not switch their semantics to a command-only recipe automatically.

## Tests and native acceptance to author before implementation

Pure tests should establish these behaviors before form/hook implementation:

1. Guided/Advanced switching leaves canonical text untouched; editing one field preserves redaction-variable names, optional verifier fields, exact argv order/empty arguments and all unrelated recipes.
2. Invalid JSON, unknown verifier format, unsupported extra fields and unrepresentable custom invocation stay intact and cannot be rewritten by Guided.
3. Empty/invalid numeric input is rejected without default substitution; unsafe paths are shown as invalid rather than silently normalized.
4. Multi-scope selection retains every identity across setup/navigation/scan refresh, produces a matching service expansion preview, and cannot silently drop a framework or duplicate report destination.
5. Scan cancellation, scan limits, malformed metadata, changing target path with stable identity, and deferred out-of-order responses produce distinct scoped states with no stale return values.
6. A target/filter/source/argv/acceptance or native config change invalidates exactly the dependent review. A saved valid configuration can be retained even after genuine failed assertions.
7. Checks confirmation submits only the dedicated checks command, never `saveDefinition`; duplicate click/lost reply retains the exact request/review identity.
8. Wrong-kind recipes and invalid local Build references cannot enable verified binding; the shared recipe object remains unchanged after mapping.

The native harness must additionally prove zero model/command submissions for opening, scan, availability, validation, generation and save; ordinary native permission flow for explicit calibration; preserved current design/draft; exact per-scope native operation/report association; multi-target independent identities; genuine valid failing assertions versus invalid/zero/skipped results; and safe cancel/restart/lost-ACK behavior. Screenshot empty/limited/unsupported discovery, forms, exact command review, native permission, valid failed result and invalid evidence separately.

All U2 tests and native checks described here are **NOT RUN** in this planning lane. Exact next action: root ratifies/publicly exports the additive facade, TRX/effective-recipe/group-binding and checks-run/preview contracts, then dispatches the UI lane against those types after the verified U1 checkpoint.
