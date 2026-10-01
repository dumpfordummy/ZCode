# Z8.3-S1 — local, previewed Graph support bundle (spec)

Status: bounded implementation of proposal **B** in `Z8_3_DECISIONS.md`. The authorized scope is exactly this document. The credential-store redesign, production-egress measurement, runtime-capability work and every other Z8.3 proposal stay **unapproved and untouched**. This is **Z8.3-S1 only: a local support bundle with no upload**. Nothing is submitted, transmitted or persisted automatically.

It replaces the unavailable Feedback upload path (Z8.3-N1 blocks it in Graph) with a file the operator can read and then explicitly save. `Z8_3_N1_SPEC.md` rule 3 ("no local support bundle replaces them") described the N1 task boundary; S1 is the follow-up that `Z8_3_DECISIONS.md` already planned.

## Product rules

1. **Graph only.** Available when `flavor === "graph"`; Production and Preview behave exactly as before (no menu entry, the Host method refuses).
2. **One deterministic UTF-8 JSON document**, versioned schema `zcode.graph.support-bundle` v`1`. No archive, no new dependency.
3. **Local metadata only, by construction.** The bundle _model_ is a closed, strict schema that has no field for any excluded class (below). Excluded data is never copied into the model and then redacted; the projection reads only the listed structured fields. Redaction code is defence in depth (a tripwire that fails generation), not the mechanism.
4. **Inspect, then save.** The UI shows the included categories, the exact byte count and the exact JSON text. **Save** is a separate explicit action and uses the existing Main save-file dialog. Cancel writes nothing. There is no Upload, Submit, Send, Retry upload or endpoint, and no automatic persistence.
5. **No opt-ins in v1.** No checkbox adds logs, prompts, source or artifacts.
6. Workspace hashes are **identifiers, not an anonymity guarantee** (a path someone can guess can be confirmed by hashing it). The bundle says so only here, not as a privacy claim.

## Ownership and event order

| Concern                                                 | Owner                                                                                                                                           |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Bundle construction, schema, serialization, policy gate | Graph Host service (`packages/services/src/graph-engineering`): `IGraphEngineeringService.supportBundle()`                                      |
| Reading Graph records                                   | the existing `GraphRepository` (new read-only `inventory()`; same directory, same schema, same version errors). No second repository is created |
| Reading the other Graph stores' shape                   | one adapter that only `stat`s/counts (`support-bundle-stores.ts`); the workflow library goes through the existing `createWorkflowStore`         |
| Byte count, preview, explicit Save request              | renderer (`packages/ui`), via `useGraphSupportBundle` and `IPlatformService.saveFile`                                                           |
| The save dialog and file write                          | Main, unchanged: `registerDesktopSaveFileIpcHandler`                                                                                            |
| Availability policy                                     | `resolveGraphSupportBundlePolicy(flavor)` in `packages/shared/src/env.ts` (next to the N1 policies); Host and UI both read it                   |

```
Renderer                      Host (Graph service)                         Main
   | supportBundle()  ------->  flavor gate (graph only, else refuse)
   |                            repository.inventory()  (read-only, fs)
   |                            store shapes (stat / counts)
   |                            project -> closed model -> strict schema
   |                            canonical JSON, privacy tripwire, size cap
   | <-------  { json, byteLength, sections }
   | show sections + byteLength + the JSON text
   | (user clicks Save)
   | encode json -> ArrayBuffer (byteLength must match)
   | saveFile({data, suggestedName}) --------------------------------->  showSaveDialog
   |                                                                      cancel -> {canceled}, nothing written
   | <------------------------------------------------------------------  confirm -> writeFile(exact bytes)
```

Generation reads the persisted profile only (records are write-through, so disk is the authority). Generation failure returns a fixed, path-free error code to the renderer, shown as local text; Save is never reachable then, so no destination file exists. The bundle holds no generation timestamp, so an unchanged profile yields byte-identical output.

## Exact allowlist (schema v1)

Top-level object, keys in canonical (sorted) order. Every object is `strict`; every string is a closed enum, a number, a boolean, a version, a 64-hex hash or an **opaque id** (`[A-Za-z0-9._-]{1,200}`, no `..`; an id that does not fit is replaced by `hash-<32 hex of sha256(original)>`).

| Section        | Fields                                                                                                                                                                                                                                                                                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema`       | `"zcode.graph.support-bundle"`; `schemaVersion: 1`; `scope` = `{ graphOnly: true, localOnly: true, transmitted: false }`                                                                                                                                                                                                                                                    |
| `identity`     | `productFlavor: "graph"`, `appVersion`, `buildCommit`, `buildTime` (compile-time constants already used by About)                                                                                                                                                                                                                                                           |
| `runtime`      | `electron` (version or `null`), `node`, `cli` (**`null`: the Host has no CLI version source; not probed, because that would be a native-agent protocol feature**), `protocol` = `{ name, version, v4WireVersion }`, `recordVersionMax`, `instructionContractMax`                                                                                                            |
| `os`           | `platform`, `arch`                                                                                                                                                                                                                                                                                                                                                          |
| `capabilities` | `parallelWorkflows` (`disabled`/`experimental`, from `resolveGraphParallelPolicy`), `feedbackUpload: false`, `supportBundleSchemaVersion`                                                                                                                                                                                                                                   |
| `policy`       | `automaticNetwork` (the six N1 booleans), `automaticTelemetry` (boolean only, **not** endpoints), `feedbackSubmission` (boolean)                                                                                                                                                                                                                                            |
| `profile`      | `records` = `{ fileCount, totalBytes, runCount, byReadStatus, byStoredVersion, runsByStatus }`; `workflowLibrary` = `{ present, bytes, readable, revision, entryCount }`; `artifacts` / `reconcileSnapshots` = `{ present, fileCount, totalBytes, truncated, (workspaceCount) }`; `parallelWorkspaces` = `{ present, entryCount }` (top level only, never recursed)         |
| `workspaces[]` | sorted by `workspaceHash`: `workspaceHash` (= the existing `sha256(workspace key)` used as the record file name), `recordBytes`, `readStatus` (`ok` / `unsupported-newer-version` / `integrity-error` / `invalid`), `storedVersion` (int or `null`), `runCount`, `runsByStatus`, `runs[]`                                                                                   |
| `runs[]`       | sorted by `(createdAt, runId)`: `runId`, `status` (closed Graph status enum), `runVersion` (legacy = 1), `createdAt`, `updatedAt` (epoch ms), `nodeKinds` (`start/task/tool/approval/condition/end` → count; an unknown future kind counts as `other`, its name is never copied), `errorClasses` (closed set, below), `nativeSessionIds[]`, `commandIds[]` (sorted, unique) |

`errorClasses` is derived only from structured fields, never from message text: `run-failed`, `run-rejected`, `run-stale-evidence`, `run-interrupted`, `run-unknown`, `routing-stop` (NeedsHuman/BudgetExhausted/NoProgress), `native-failed` (a terminal proof state), `output-invalid` (a node attempt whose output validation is `invalid`), `output-issue` (an attempt that has an output issue; presence only), `attempt-failed` (a node/tool/approval attempt with status `Failed`).

`nativeSessionIds` come from `sessionId` fields on the run and its node attempts; `commandIds` from `commandId` fields. `runtimeIdentity` is **not** read (it embeds the workspace path).

The only places a size or count is measured: the record files, `workflow-library.json`, `artifacts/`, `reconcile-snapshots/` (all by `stat`/directory listing; contents are not read, except that the workflow library and records are parsed in memory by the existing store/schema to count entries and runs, and only those counts leave the parser).

## Exact exclusion list (no field exists for any of these)

credentials or credential files · provider configuration · API keys or OAuth material · provider/model base URLs · environment variables · HTTP headers · cookies · proxy settings · absolute workspace paths · user-profile paths · prompts or instructions · conversation/model content · source-code contents · tool input/output · terminal output · logs · raw Graph records · raw native records · artifact contents · attachments · snapshots/backups · provider responses.

Not read at all while generating: `credentials.json` / `.credentials.json` (the same file-name set `exportLogs.ts` refuses to archive, now shared as `isSensitiveCredentialFileName` in `packages/shared/src/feedbackPrivacy.ts` and used by both), provider configuration, `process.env` beyond nothing (only compile-time constants and `process.versions`/`platform`/`arch`), other profile files, the native session ledger. The store adapter only visits the five names in the profile table and ignores everything else, including any file whose name is a credential file name.

## Defence in depth (tripwires; they fail closed)

1. Strict zod schema over the final object: an extra key or wrong type throws.
2. Privacy check: `redactFeedbackText(compactJson, { diagnostic: true })` must equal the input. A clean bundle is a fixed point of the diagnostic redactor (the schema's key names were chosen to avoid its sensitive/body key families); any redaction, including a user-profile path (`[USER_PATH]`), an e-mail, a URL credential or a body-like key, fails generation.
3. Path check: no string in the model may contain `/` or `\` or start with a drive prefix.
4. Size cap: 8 MiB (far under Main's 50 MiB save limit); over the cap is an error, never silent truncation.

Failure codes (fixed text, no paths, no underlying error message): `unavailable`, `profile-unreadable`, `too-large`, `privacy-check-failed`.

## UI

One entry in the existing Help menu (`WorkspaceHelpMenuButton`): "Graph support bundle…", shown only when the Graph policy allows it, `platform.saveFile` exists and the base Host exposes the Graph service. It opens a dialog: _Preparing_ → _Preview_ (included categories with counts, "Not included" list, the exact byte count, the read-only JSON text, a "nothing is sent" line) with **Save…** and **Close**; or a local readable error with **Close** (and **Regenerate** for the same local operation, which is not a retry of any upload). Cancelling the OS dialog shows nothing and leaves no file. UX-M5 and menu redesign are not started.

## Acceptance (synthetic only; planted canaries)

Tests live in already-selected directories (`packages/services/test/`, `packages/ui/test/`); no suite-manifest, workflow or gate change.

1. **Canaries absent.** A synthetic profile built from real, schema-valid records (copied bytes of the historical fixtures, never modified in place) with canaries planted in prompts/instructions, start input, messages, model output text, tool-like fields, raw record text, an artifact file, a workflow library entry, a log file, a snapshot, `credentials.json`, a provider config file, environment values, header/cookie/proxy values, a source file, and absolute and user-profile paths. The final bundle bytes contain none of them.
2. **No user-profile path.** No path under the synthetic profile root (any separator form) occurs in the bytes; workspace values appear only as their expected `sha256` hashes.
3. **Deterministic.** Two generations of an unchanged profile are byte-identical, including when directory listing order and run order in the source records are shuffled.
4. **Zero network requests during generation** with a loopback recorder and a positive control (the same instrument records a deliberate request). Not a whole-application egress claim.
5. **Mutation.** Adding an excluded field or a raw path to the model makes serialization throw, and the acceptance scanner flags the same leak when the schema is bypassed. A by-hand source mutation (project a raw field) is also run and recorded in the report.
6. **Graph-only.** Production and Preview refuse and the policy is false; Graph is true; other Host behavior is unchanged.
7. **UI.** The displayed byte count equals the length of the `ArrayBuffer` handed to `saveFile` and equals the UTF-8 length of the JSON; a fake of the existing save boundary writes those exact bytes on confirm and nothing on cancel; generation failure shows the readable error and never calls save. Source-text guards (labelled) cover the Help-menu wiring and that the existing Main handler still writes `new Uint8Array(payload.data)`, because Electron cannot run in the portable CI.
8. The repository's `inventory()` and the Host method have no write path: the profile directory is byte-identical (names, sizes, content hashes) before and after generation.

## Limits (not claimed)

No packaged-app, Windows or production-egress measurement. The renderer-to-Main IPC and the real OS dialog are not executed in CI (fake boundary + source guard). `cli.version` is `null`. Hashes of workspace keys can be confirmed by guessing the key. The existing save handler writes the chosen file directly (not temp + rename); that Main behavior is unchanged and out of scope, and generation failures never reach it. Unknown or future files inside the Graph directory are not listed. No Windows CI dispatch, installer run, signing or release.
