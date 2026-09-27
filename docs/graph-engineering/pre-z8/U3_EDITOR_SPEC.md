# Canonical editor, references and routing presets

U2's eight isolated native scenarios passed and its immutable evidence manifest is retained. U3 implementation is now in progress against the current checkout. This is a specification, not a completion report. Existing definitions and immutable run history keep their versions and meaning. Exact public projection and transform shapes are defined in `packages/services/src/graph-engineering/editor-types.ts`.

## State and event order

The renderer's workspace-keyed `graphDraftStore` remains the only owner of unsubmitted definitions. Guided/Advanced is a presentation preference. Un-applied schema/condition text is a retained editor buffer keyed by workspace and stable node ID; it is never execution authority. No view change edits the canonical graph. Explicit Save and Run continue through existing Host revision, lease, preflight and admission paths. There is no new scheduler, context accumulator or reference execution mechanism.

Rendered editor identity is scoped by presentation role and stable node ID. Sibling condition, task, reference and deletion controls must not share a raw node-ID key. Mode/node/workspace round trips must leave exactly one current form, while retained text continues to use its canonical workspace/node buffer key.

```mermaid
sequenceDiagram
  participant User
  participant UI as Scoped editor and draft store
  participant Pure as Public pure Graph projection
  participant Host as Existing Graph/Workflow owner
  participant Native as Existing native owner
  User->>UI: Select context / edit text / insert / confirm deletion
  UI->>Pure: Project or transform the current canonical draft
  Pure-->>UI: New draft or specific unsupported reason; no side effects
  UI->>Host: Explicit Save with current base revision
  User->>UI: Read reference catalog or validate selected file
  UI->>Host: Read-only projectSetup action, scoped generation
  Host->>Native: Existing-only environment metadata; never start cold runtime
  Host-->>UI: Metadata / Unknown / path validation
  Note over UI,Host: Late results cannot alter another workspace or newer selection
  User->>UI: Explicit reviewed Run
  UI->>Host: Existing frozen preflight / request identity
  Host->>Native: Existing native admission
  Native-->>Host: Exact captured output and terminal evidence
  Host-->>UI: Stored attempt prompt and bindings, never later Chat text
```

## Public pure editor contracts

Expose cohesive pure helpers through the Graph public entrypoint; the UI must not import private domain files. Reuse `routingTopology`, existing strict schemas/readiness, recipe compatibility and the one-pass binding scanner rather than implementing their semantics again in React.

- `graphContextCandidates(definition, nodeId, recipes?)` returns candidates with the existing discriminated `GraphInputSource`, producer label, output kind, `run`/`current-iteration` scope, selectable flag, reason and already-selected aliases, plus projection issues. Start uses the actual request. Task final text and configured structured output require an earlier producer available on every initial/repair route. Test verification requires an explicit Test requirement or a compatible configured Test recipe, never a display-name guess. Repair feedback is only for the declared repair entry. Invalid graph topology disables dependent choices. Ineligible selected bindings remain visible and unchanged.
- `addGraphContextBinding(definition, nodeId, source, recipes?)` is an immutable draft transform returning the definition, selected alias and changed flag. Use the same optional recipe snapshot as candidate projection when a custom Test requirement depends on its configured recipe. Exact source selection is idempotent: reuse the first existing alias and append its placeholder only when absent. New aliases are bounded and collision-free. Preserve other IDs, edges, output schemas, overrides, pins and local check mappings. Refuse automatic conversion of literal instructions containing `{{` or `}}`; those need explicit Advanced editing.
- `previewGraphTaskPrompt(definition, nodeId, referenceMetadata?)` returns a draft-only tagged segment list, binding rows, reference summaries and issues. Text and unresolved-output segments are distinct. Resolve Start text once; preserve literal braces in inserted text. All future task/artifact/repair values remain visibly unresolved. Share the token scanner/reference suffix representation with strict runtime resolution without supplying fake attempts, artifacts or provenance. An actual run reads only stored `resolvedInstructions` and `bindings`, selected by run/attempt/iteration.
- A small typed condition compiler builds existing scalar equality/comparison/presence declarations with an explicit default exit and fixed `needs-human` error policy. It validates strict current schemas and does not infer valid evidence from a boolean branch. A repair-preset projection recognizes the existing verified repair pattern, preserving every selected Test dependency and final gate. Unsupported custom declarations stay Advanced-only.

Use tagged text/token editing or an equally lossless projection for common prompts, including U2 expanded multiple-check reviewer handoffs. Guided must not reorder or drop custom text merely to match a predefined suffix. Repeated or unsupported tokens, custom schemas and predicate trees have precise Advanced-only explanations. Switching views always preserves their bytes. The Advanced editor retains current identifiers and controls.

## Reference selection

Guide the existing portable template reference roles and their instance bindings. Show their exact affected nodes. Do not fabricate a template pin to add references to an unrelated custom graph. General new runtime reference semantics are unnecessary for this programme; existing explicit binding and native Read/Skill instructions remain authoritative.

Add read-only `projectSetup` actions for an existing-only reference catalog and individual file selection validation. Catalog reads native environment metadata with no executable queries and no project-recipe dependency; cold or missing catalogs return Unknown with a corrective instruction. Never use ordinary `useSkills` here: its catalog path can start a cold runtime. Display disabled/missing/unverifiable skills, stable IDs, native names, origin and duplicate native project guidance. Do not automatically add or remove a reference; selection remains explicit and preflight revalidates it.

Compatibility decision: new guided reference selections opt into `bindings.referencePolicy: "native-aware-v1"`. Only that explicit additive policy records a delivery marker in frozen reference provenance (`native-instructions`, `explicit-read` or `native-skill`). Match already-native guidance by safely resolved path and exact content digest, with non-truncated native metadata, not by filename. The new prompt suffix names already-native instruction references without requesting their content again. Absent policy retains the previous suffix and provenance shape byte-for-byte, so unchanged old preflight identities are not invalidated merely by this implementation update. An explicitly native-aware definition requires matching frozen metadata and delivery markers for every selected reference; missing or mismatched markers refuse dispatch. Export drops local policy with the other local bindings. Editing no reference does not silently opt an existing instance into a new delivery policy.

Use public `IFileService.searchWorkspaceFiles` for bounded relative candidate search and `IPlatformService.selectFile` for an explicit native file picker. Validate the selected absolute/relative path in the service against the current local workspace using the existing link-safe bounded reference read. Return a relative binding, exact digest/size and any matching native instruction metadata; reject missing, outside-root, linked, oversized or empty files. Cancel/error/late responses leave the prior binding intact. This is a read, not installation or approval of project code.

File search and explicit reference selection use independent request lanes within the same service/workspace lifecycle. A newer search supersedes an older search; a newer selection intent, including a cancelled picker, supersedes an older selection intent. Searching does not cancel a deliberately pending picker, and opening or cancelling a picker does not strand a pending search in Loading. Scope changes and unmount invalidate both lanes. Selection still checks the role, full draft/binding fingerprint and current lifecycle immediately before mutating the draft.

## Editing and limits

Keep the existing keyboard step list, selectable canvas nodes, Fit view and disabled canvas Delete shortcut. Insert into one explicitly selected edge, preserving its `sourcePort`; expose the same operation without pointer gestures. Validate actual schema node limits before insertion. Start/End cannot be removed.

Deletion previews every affected edge, task binding, approval evidence, End result, final gate/repair declaration, template reference role and local Test-to-Build link. Cancel changes nothing. Confirm removes the selected node and incident edges while leaving unresolved semantic references visible for explicit correction; never silently reassign evidence or choose a new End result. The Host readiness checker remains the Run gate. Optional undo is omitted; no control implies reversal of native files/commands.

Repair controls show one initial attempt plus 0–5 additional repairs, deadline in minutes (up to the existing 24-hour bound), and the compiled native Task/Tool admission cap (at most 64). It is an independent execution budget, not a promise that every allowed repair fits. The existing built-in defaults remain two additional repairs, thirty minutes and twenty-four admissions. Initial construction uses that existing template; policy edits preserve its region/verification/final gate and every U2-expanded Test. Any path budget estimate must follow the supported exclusive DAG and declared repair edge, not raw node count; Approval/Condition nodes do not consume native admissions. Unknown process state, invalid/missing evidence and permission waits never become failure/default/repair decisions. Keep the exact existing native safety tests and extend them where a new helper exposes a case.

## Acceptance and ownership

Before U3 closure, prove lossless view switches and retained invalid buffers; actual source/token mapping and single-pass braces behavior; initial/repair dominance; no automatic reference execution; path/cancel/stale catalog negatives; branch-preserving insertion and dependency-confirmed deletion; keyboard input Delete; End selection; strict preset limits and final gate; and captured prompt immutability after later Chat text. Use pure/service tests plus a controlled native UI journey with zero submissions while editing and exact native prompt evidence when explicitly run. Screenshots do not replace ledger/identity assertions.

Coordinator owns the shared types/export integration, read-only reference port and spec. The UI lane owns renderer forms, buffer retention, topology editing and locale strings. The domain lane owns pure context/preview/preset helpers and adversarial tests under the ratified fields. The native lane owns isolated U3 UI/identity evidence after the next serialized build. No concurrent emitting builds. U3 checks remain NOT RUN until actual receipts exist.
