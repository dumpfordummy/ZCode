# Z8.2 specification — historical upgrade, backup and conservative recovery

Written before implementation. Scope is the approved Z8.2 task only; Z8.3–Z8.5, retention/deletion UI, credential migration, a database or a migration framework are out of scope. Base: the merged Z8.1 integration tip `1cbe89cd95a63e9aba992572ca2e9ed9e23bf333` (`origin/claude/zcde-graph-ux-audit-be80d8`); branch `claude/z8-2-upgrade-recovery`. Root application version stays `3.14.3`; a new packaged candidate, if any, is `3.14.3-z8.2`. The Z8.1 `b1`/`b2` artifacts are immutable and never relabelled.

## 1. Current behavior being changed (read from source)

- Graph data directory: `<app config dir>/graph-engineering/` (private Graph profile: `%USERPROFILE%\.zcode-graph-engineering\home\.zcode\v2\graph-engineering\`). One JSON record per workspace, named `<sha256(workspaceKey)>.json`; artifacts under `artifacts/`; `workflow-library.json`; parallel clones under `workspaces/`.
- `createGraphRepository(directory).read` parses the whole record with the strict `recordSchema` (version union 1–5) and validates integrity; `write` is an atomic private-file replacement under a PID/token file lock held by the owning Host.
- `GraphState.load` is the only cold-load reconciliation. For a record whose runs are not confirmed terminal it sets: route checkpoint or resumable gate → `AwaitingContinuation`; otherwise → `Interrupted`; unresolved parallel runs → `Interrupted`; then it **commits the changed record with no copy of the original**. If the commit throws, the in-memory cache is not populated, so the next load re-reads the original file.
- A top-level `version` outside 1–5 fails the Zod union with a raw schema error; nothing distinguishes it from a malformed file.

## 2. Pre-reconciliation snapshot

**Rule.** Before a cold-load reconciliation writes a change to an existing workspace record, the exact bytes that were read from disk are preserved first. This is not a migration engine and does not apply to ordinary saves, runs, approvals or any other write.

- **Which bytes.** The repository remembers the raw bytes (and their SHA-256) of the most recent successful `read` per workspace. The snapshot is written from those bytes — never from a re-serialized object. Immediately before writing, the snapshot step re-reads the record file and requires its SHA-256 to equal the remembered one; if the file changed (or is missing) the reconciliation aborts. This runs while the Host holds the record's existing ownership lock, inside the existing serialized `GraphState` flight.
- **Where.** `<graph-engineering dir>/reconcile-snapshots/<sha256(workspaceKey)>/<sha256(bytes)>.json`. The file name is the content hash, so identical content is stored once; an existing snapshot is verified by hash and only its modification time is refreshed (metadata only). Bytes are written with temp-file + fsync + atomic rename with private permissions. Nothing else is stored there (no credentials, native session data, artifacts or settings).
- **Failure.** If the snapshot cannot be created or verified, `load` throws before any mutation. The original record is untouched, the in-memory record cache is not populated (so a retry re-reads the original and re-attempts deterministically), and no native/session/model/tool/permission/approval action starts, because every such action goes through `load` first.
- **Order of one reconciliation:** read bytes (remember) → decide a change is needed → snapshot (write or verify) → commit the reconciled record (existing atomic write) → populate cache. A crash or failure at any step leaves either the untouched original or original + snapshot, never a partial record.
- **Port.** `GraphRepository` gains one optional method, `snapshotBeforeReconcile(target)`; repositories without it (in-memory test doubles that do not model disk bytes) behave as before. The production repository always provides it.

## 3. Bounded retention (snapshots only)

At most **20** snapshots are kept per workspace directory. After a successful snapshot, if more than 20 exist, the oldest by modification time are removed, never the one just written or verified, and only regular files named `<64 hex>.json` directly inside that workspace's snapshot directory. Nothing else is ever pruned: not records, artifacts, library versions, native sessions, project checks or the pre-restore snapshots made by the restore tool (which use the same store and therefore the same bound — documented). No retention UI, no deletion command.

## 4. Operator restore (no product UI)

`scripts/graph-engineering/graph-record-restore.mjs` (run with `node --import tsx`, the repository toolchain):

- `list <graph-dir>` — lists workspace records (key, record version, run count/status summary) and each one's snapshots (id, bytes, modified time, record version).
- `restore <graph-dir> --workspace-key <exact key> --snapshot <id or unique prefix> [--yes]`.

Restore refuses unless the Graph app/Host is closed: it takes the same ownership lock; if it cannot, it exits nonzero and changes nothing. Then: validate the selected snapshot with the same parser as `read` (strict schema, integrity, workspace key match, definition validation) → snapshot the **current** record bytes (even if damaged or unparseable) into the same store → atomically replace the record with the snapshot's exact bytes → release the lock. It never touches artifacts, credentials, native sessions, project files or `.zcode/config.json`. All tests use disposable synthetic data.

## 5. Unsupported newer data

`read` first parses JSON. If the top-level `version`, `definition.version` or any `runs[].version` is an integer greater than the highest supported version (derived from the schema, currently 5), it throws `GraphRecordUnsupportedVersionError`: a bounded user-readable message ("appears to come from a newer, unsupported ZCode Graph version… nothing was changed… see the Graph data backup and restore guidance"), the offending location and version, and the authoritative `safeParse` issues (truncated) as a `diagnostic` string and as `cause`. It never rewrites or downgrades the file, never loosens `.strict()` or ignores unknown fields, and creates no run/session/tool work (the error occurs in `read`, before anything is cached). Any other failure remains the existing generic parse error. Structurally unreadable JSON stays generic.

## 6. Historical binary/profile evidence

Authorized downloads only: the published `graph-v3.14.0-z2.2` and `graph-v3.14.0-z7.5` installers and their `SHA256SUMS.txt` from `dumpfordummy/ZCode` releases, kept under `.tmp/` (never committed). Hashes are verified before use; URLs, asset names, byte counts and hashes are recorded. The installers are **not executed**; they are unpacked read-only with the `7za` already shipped with the repository's `electron-builder` dependency (no new utility). If the NSIS payload cannot be unpacked that way, that path stops and is reported as blocked for Z8.4.

Old binaries are launched from the extracted tree with a fresh temporary home/profile (the binary's own private Graph profile), synthetic workspaces, the controlled loopback provider and the existing Chromium-proxy/ environment interception, no credentials. The drivers used are the harness files **from the same release tag**, run from a scratch tree, because each release's UI differs. Data is whatever the old binary actually wrote; states a release cannot produce are recorded `NOT AVAILABLE FROM THIS RELEASE`. Nothing is built with current code.

Provenance per fixture (committed in `docs/graph-engineering/z8/fixtures/historical/PROVENANCE.json`): release tag, installer SHA-256, old app identity/version, producing scenario, exact files, profile-relative paths, workspace identity, whether byte-for-byte produced by the old app, sanitization (none planned: synthetic from the start; schema fields are never rewritten). Committed: Graph record bytes (and, only where an assertion needs it, the minimum synthetic subset of other Graph-owned files), hashes, the generation recipe. Not committed: credentials, provider configuration, Electron session data, raw profiles, installers, native logs.

## 7. Upgrade matrix

For every captured fixture the **current** product loads a copy of the old profile and the harness asserts before/after bytes and hashes of every Graph file:

| Old state | Required result |
| --- | --- |
| Completed / terminal | byte-identical afterwards; no snapshot; zero native/model/tool activity |
| Executing / unknown / waiting for permission or question | record becomes `Interrupted` (or the existing `AwaitingContinuation` mapping); exact original bytes present in the snapshot store; zero resends, Build/Test reruns, permission answers, guard releases, recreated native tasks |
| Waiting for final approval | no approval; existing mapping preserved; explicit continuation still performs the existing freshness checks (existing tests; checked on the fixture where the release supports it) |
| Failed / NeedsHuman / Cancelled | unchanged; no retry or repair |
| Workflow library | historical versions remain exact; nothing synthesized |
| Not interpretable by the current schema | fail closed, preserve the file, report the exact gap; the fixture is never edited to pass |

This is current-product-over-old-data evidence from an unpacked binary running after another. It is **not** NSIS installer-upgrade acceptance.

## 8. Failure injection (unit level, disposable data)

Failures are injected (a) before the snapshot is created, (b) in the snapshot write, (c) after the snapshot but before the reconciled-record write, and (d) in the reconciled-record atomic write. After each: the original bytes are still the record on disk and still recoverable from the store where it exists, the in-memory cache holds no partial record, zero native creates/sends/permission/approval actions occurred, and a retry after the fault clears produces the same reconciled result deterministically with exactly one snapshot of the original.

## 9. Downgrade / unknown version

A synthetic copy (explicitly not a historical fixture) whose top-level version exceeds the supported union: rejected with the section 5 error; file bytes unchanged; no run, session or tool work.

## 10. Packaging and validation

If product code changes (it does), one local candidate `3.14.3-z8.2` is built with the existing Z8 builder (no install; no second reproducibility build). The packaged baseline needed to show the change did not break it runs against that candidate: ordinary Chat, no-provider, Z1 literal compatibility, Z2 complete, restart-interrupted, restart-permission, persistence-recovery and the current Sequential Engineering reviewer journey. Validation: typecheck, root lint, architecture, focused persistence/recovery, historical-fixture, snapshot and restore tests; CLI-lint and repo-wide format exceptions stay visible and are not cleaned up. Every failed attempt and exit code is recorded.

## 11. Mapping to Z8 acceptance IDs

- **Z8-A03** historical upgrade: sections 6–7, 9.
- **Z8-A04** interrupted work across restart/upgrade: sections 2, 7, 8, packaged baseline.
- **Z8-A05** migration/backup failure and restore: sections 2–4, 8.

Installer upgrade (NSIS over an installed app) remains out of reach for Z8.2 and is not claimed.
