# Z8.3-S1 — implementation report

**Scope: Z8.3-S1 only — a local, previewed Graph support bundle. There is no upload.** Nothing is submitted, transmitted or automatically persisted. The credential-store redesign, production-egress measurement, runtime-capability work and every other Z8.3 proposal remain unapproved and untouched. Windows, packaged-app and production-egress evidence stays deferred. The authorized spec is `Z8_3_S1_SPEC.md`.

## Identity

| Item                                          | Value                                                                                                                                         |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Integration base (refreshed before and after) | `claude/zcde-graph-ux-audit-be80d8` @ `22c752708ddb0622d4fa7bb5ae653e8ba84d7fdc` (unchanged, no intervening work to preserve)                 |
| Feature branch                                | `claude/z8-3-s1-support-bundle` (no Cloud-assigned branch existed; created separately, integration not modified)                              |
| Source/test commit                            | `fbe879c2394c0ef9222474d3b19b11418c79ba85` (code, tests, spec). Later commits, if any, are docs only                                          |
| Toolchain                                     | Node 24.14.0, pnpm 10.33.2 (npm-installed from the repository pins, as `scripts/ci/cloud-setup.sh` does)                                      |
| Install                                       | `pnpm install --frozen-lockfile --ignore-scripts` (exit 0). **Native postinstall scripts did not run: native setup is incomplete by design.** |
| Dependencies                                  | none added or upgraded; `pnpm-lock.yaml`, `.github/**`, `scripts/ci/**`, the suite manifest, expected skips and exclusions untouched          |

## Schema version

`zcode.graph.support-bundle` **schemaVersion 1**: one deterministic UTF-8 JSON document, keys sorted at every depth, 2-space indent, trailing newline, no generation timestamp. No archive and no dependency (a single JSON file was possible, so no blocker).

## Exact allowlist

`schema`, `schemaVersion`, `scope` (`graphOnly/localOnly: true`, `transmitted: false`); `identity` (`productFlavor: "graph"`, `appVersion`, `buildCommit`, `buildTime`); `runtime` (`electron`, `node`, `cli` = `null`, `protocol` name/version/v4 wire version, `recordVersionMax`, `instructionContractMax`); `os` (`platform`, `arch`); `capabilities` (`parallelWorkflows`, `feedbackUpload: false`, `supportBundleSchemaVersion`); `policy` (the six N1 automatic-network booleans, `automaticTelemetry` boolean, `feedbackSubmission` boolean); `profile` (`records` file count, bytes, run count, counts by read status / stored version / run status; `workflowLibrary` present/bytes/readable/revision/entryCount; `artifacts` and `reconcileSnapshots` present/fileCount/totalBytes/truncated (+workspaceCount); `parallelWorkspaces` present/entryCount); `workspaces[]` sorted by `workspaceHash` (`workspaceHash`, `recordBytes`, `readStatus`, `storedVersion`, `runCount`, `runsByStatus`, `runs[]`); `runs[]` sorted by `(createdAt, runId)` (`runId`, `status`, `runVersion`, `createdAt`, `updatedAt`, `nodeKinds` counts, `errorClasses`, `nativeSessionIds`, `commandIds`). Strings are closed enums, numbers, booleans, versions, 64-hex hashes or opaque ids (`[A-Za-z0-9._-]{1,200}`; anything else becomes `hash-<32 hex>`). `cli` is `null` because the Host has no CLI-version source and probing the agent would be a native-agent protocol feature.

## Exact exclusion list (the model has no field for any of these)

credentials or credential files · provider configuration · API keys or OAuth material · provider/model base URLs · environment variables · HTTP headers · cookies · proxy settings · absolute workspace paths · user-profile paths · prompts or instructions · conversation/model content · source-code contents · tool input/output · terminal output · logs · raw Graph records · raw native records · artifact contents · attachments · snapshots/backups · provider responses. No opt-in checkbox exists. `runtimeIdentity` (embeds a path) and `message`/`outputIssue` text are never read; error classes come only from structured fields.

## Section matrix: source owner and user-derived identifiers

| Bundle section                                                        | Source owner                                                                                                               | Potentially user-derived identifiers?                                                                                                  |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `schema`, `scope`, `capabilities.supportBundleSchemaVersion`          | support bundle schema constants                                                                                            | No                                                                                                                                     |
| `identity`                                                            | compile-time constants (`ZCODE_VERSION`, `ZCODE_COMMIT`, `ZCODE_BUILD_TIME`) in `@zcode/shared`                            | No (build facts)                                                                                                                       |
| `runtime`                                                             | `process.versions`, `@zcode/shared` protocol constants, Graph record-version constants                                     | No                                                                                                                                     |
| `os`                                                                  | `process.platform`, `process.arch`                                                                                         | No                                                                                                                                     |
| `capabilities.parallelWorkflows`                                      | `resolveGraphParallelPolicy` (shared)                                                                                      | No                                                                                                                                     |
| `policy`                                                              | `resolveAutomaticNetworkPolicy`, `resolveAutomaticTelemetryPolicy` (empty env), `resolveFeedbackSubmissionPolicy` (shared) | No (booleans only, no endpoints)                                                                                                       |
| `profile.records`                                                     | Graph repository `inventory()` (existing record schema)                                                                    | No (counts and sizes)                                                                                                                  |
| `profile.workflowLibrary`                                             | existing `createWorkflowStore`                                                                                             | No (revision and entry count only; entry names are never read out)                                                                     |
| `profile.artifacts`, `reconcileSnapshots`, `parallelWorkspaces`       | Graph data directory listing (`lstat`/`readdir`, no content reads)                                                         | No (counts and bytes; file names are not output)                                                                                       |
| `workspaces[].workspaceHash`                                          | existing `sha256(workspace key)` record file name                                                                          | **Yes, derived:** a hash of the workspace path or remote identity. An identifier, **not anonymous**: a guessable path can be confirmed |
| `workspaces[].readStatus/storedVersion/recordBytes/runsByStatus`      | Graph repository `inventory()`                                                                                             | No                                                                                                                                     |
| `runs[].runId`                                                        | Graph record (`run.id`, Host-generated)                                                                                    | Opaque; correlates with the user's own records                                                                                         |
| `runs[].nativeSessionIds`, `commandIds`                               | Graph record fields written from native session/command ids                                                                | Opaque ids assigned by the native runtime; correlate with the user's native ledger                                                     |
| `runs[].status/runVersion/createdAt/updatedAt/nodeKinds/errorClasses` | Graph record structured fields                                                                                             | No (timestamps reveal when the user worked)                                                                                            |

## Ownership as built

Graph Host: `IGraphSupportService.supportBundle()` (new channel `graphSupport`, `packages/services/src/graph-engineering/support-contract.ts`). It is a dedicated service because `IGraphEngineeringService` is already at the architecture policy's 12-method contract cap, and `app/ports.ts` is untouched because core Graph files (for example `sequencer.ts`, which already exceeds the file-size cap on the base) depend on it and would be pulled into the PR-scoped architecture check. Records are read through `createGraphRepository(...).inventory()` (read-only; no ownership lock, no write, no reconcile). Main is unchanged (`desktopSaveFile.ts`). The renderer requests generation, shows the preview and calls `platform.saveFile` only on Save.

Defence in depth (all fail closed with a fixed, path-free error): strict zod schema; no string with a path shape; `redactFeedbackText(json, { diagnostic: true })` must be a fixed point; 8 MiB cap. The credential-file name set moved from `exportLogs.ts` to `isSensitiveCredentialFileName` in `packages/shared/src/feedbackPrivacy.ts` and both use it (behavior identical; the store walker also skips such names).

## Changed files (29)

Spec/report: `docs/graph-engineering/z8/Z8_3_S1_SPEC.md`, `Z8_3_S1_REPORT.md`.
Shared: `packages/shared/src/{channels,env,feedbackPrivacy,index}.ts` (channel name; `resolveGraphSupportBundlePolicy`; shared credential-file predicate).
Desktop Main (shared-predicate refactor only): `packages/desktop/src/main/exportLogs.ts`.
Services (new): `graph-engineering/{support-contract,support-bundle-types}.ts`, `domain/support-bundle.ts`, `app/support-bundle.ts`, `adapters/{support-bundle,support-bundle-stores}.ts`. Services (edited): `graph-engineering/{module,node}.ts`, `adapters/repository.ts` (+`inventory()`), `src/{accessor,index,node}.ts`, `packages/client/src/remoteServiceAccess.ts`, `architecture-policy.yaml` (one public entrypoint).
UI (new): `graph-engineering/{GraphSupportBundleDialog.tsx,supportBundle.ts}`, `hooks/useGraphSupportBundle.ts`, `i18n/locales/graphS1.ts`. UI (edited): `WorkspaceHelpMenuButton.tsx` (one menu item, one sibling dialog), `i18n/locales/{en-US,zh-CN}.ts`.
Tests (new, inside already-selected directories): `packages/services/test/graphSupportBundle.test.ts` (12), `packages/ui/test/graphSupportBundleUi.test.ts` (8).

## Verification (local, this commit)

| Command                                                               | Exit | Result                                                                                                                                         |
| --------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                                                      | 0    | clean                                                                                                                                          |
| `pnpm lint`                                                           | 0    | 75 warnings, 0 errors (equals the recorded baseline)                                                                                           |
| `node scripts/ci/architecture-changed.mjs origin/<integration>`       | 0    | 29 changed files, 0 new violations                                                                                                             |
| `node scripts/ci/format-changed.mjs origin/<integration>`             | 0    | changed files formatted (repo formatter `oxfmt`)                                                                                               |
| `node --test scripts/ci/*.test.mjs`                                   | 0    | 18 / 18                                                                                                                                        |
| `node scripts/ci/graph-cloud-suite.mjs` (integrated pass, all groups) | 0    | scripts 148/148, services 502 tests (498 pass, **4 skipped = the expected 4**), ui 240/240; total **890 tests, 886 pass, 0 fail, 0 cancelled** |
| New tests inside that pass                                            | —    | **20** (12 services + 8 ui), all executed under the required selectors; 870 → 890; no suite-manifest change                                    |
| `tsc -p packages/desktop/tsconfig.main.json --noEmit`                 | —    | 87 errors, the same 87 pre-existing on the integration base (not covered by `pnpm typecheck`); none new                                        |
| `pnpm knip` (support-bundle items)                                    | —    | no finding left for new code (unused exports were un-exported); remaining findings pre-exist                                                   |

Mistake caught and undone during the work: a stray `prettier` run reformatted unrelated Graph files; they were reverted from git, the repository's own `oxfmt` was used instead, and the final diff is limited to the files above.

## Test behavior (synthetic only)

- **Canaries.** A profile is built from the unmodified historical fixture records (parsed in memory, rewritten onto synthetic workspaces, 5 records spanning versions 1–5), with canaries planted into prompts/instructions, start input, model output, tool stdout/stderr, messages, evidence text, cwd paths (kept only where the strict record schema still accepts them), plus files for credentials, provider URL/config, OAuth, cookie, header, proxy, log, source, artifact, attachment, snapshot, native raw, workflow library and `credentials.json` inside and beside the Graph directory, and environment values. None appears in the final bundle bytes; also no free-text string of any source record or the library appears.
- **Paths.** No path under the synthetic user-profile root (POSIX or Windows spelling, JSON-escaped or not), no `Users`/`AppData`, no original fixture path; no string in the document has a path shape; workspaces appear only as `sha256(workspace key)`.
- **Determinism.** Two generations are byte-identical; records rewritten with every object's key order reversed give identical bytes; a unit test shuffles run, id and workspace order before serialization.
- **Zero network.** Generation makes no socket connection or name lookup while a loopback recorder with a positive control records a deliberate `fetch` (proxy env vars point at the recorder). **Not** a whole-application zero-egress measurement.
- **Read-only.** The whole profile tree (names, sizes, content hashes) is identical before and after generation; no lock directory is created.
- **Graph-only.** Production, Preview and an unknown flavor refuse with `unavailable` before the repository is read; `resolveGraphSupportBundlePolicy` table; the existing `GraphEngineeringService` gains no method and its `getWorkspace` is unchanged.
- **UI.** Displayed byte count equals the UTF-8 length of the JSON, the length of the `ArrayBuffer` handed to `saveFile`, and the size of the file the fake Main boundary writes (content equals the previewed text); a cancel writes nothing; a size mismatch and every Host error code are refused/mapped without reaching save; copy has no upload/submit/send/retry wording; a pure controller test shows Save only works from a ready preview and a failed generation never reaches the save boundary.
- **Labelled mocks and source guards.** `net.Socket.prototype.connect`/`dns.lookup` counters and the fake Main save handler are labelled mocks. Source-text guards (labelled) cover the Help-menu wiring, the absence of network APIs in the dialog/hook/logic, that the existing Main handler still returns on cancel before `writeFile(result.filePath, new Uint8Array(payload.data))`, and that `exportLogs.ts` uses the shared predicate.

## Mutation result

In the test: eight mutated models (a prompt field, raw `message`, a provider section, an environment section, a `workspacePath` next to the hash, and raw paths as run id / native session id / build commit) each make `serializeSupportBundle` throw, and the acceptance scanner flags the same leak when the serializer is bypassed. **By hand, then reverted byte-exact:** (M1) the projection copies `run.message` with the schema intact → 10 of 12 services tests red, fail-closed; (M2) schema, path and redaction checks bypassed and the projection copies `startInput` → the canary acceptance test, the content test and the mutation test red; (M3) schema/path/redaction bypassed and the raw `workspacePath` emitted next to the hash → the canary, path/hash, content, determinism and mutation tests red. Baseline restored and re-run green.

## Not verified / limits

- No packaged-app, Windows or production-egress measurement; the real OS save dialog and renderer→Main IPC were not executed (fake boundary plus source guard). The dialog and Help menu component were typechecked, formatted and linted but not rendered in a browser here.
- The existing Main save handler writes the chosen file directly; that behavior is unchanged. A generation failure never reaches it, so no destination file exists in that case.
- `cli` version is `null`. A workspace hash is an identifier, not anonymity. Files outside the five named stores in the Graph directory are not listed. `workspaces/` (project copies) is counted at top level only.
- The Help menu item appears only when `flavor === "graph"`, `platform.saveFile` exists and the base Host exposes `graphSupportService`; the web client does not show it.
- `pnpm architecture:check --changed` (working-tree mode) flags the existing `sequencer.ts` size (403 lines, over the 400-line cap, baseline empty) whenever a transitive dependency of it is modified; this PR avoids touching those files, so the PR-scoped CI check reports 0 new violations. The oversize file itself is pre-existing and not changed here.

## Flag for separate owner review

No change to `.github/workflows/**`, `scripts/ci/**`, the suite manifest, workflow permissions, expected skip counts or exclusions, the ruleset, or any dependency. `architecture-policy.yaml` gained one public-entrypoint line for the new contract file.
