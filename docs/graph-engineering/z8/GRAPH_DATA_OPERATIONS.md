# ZCode Graph data operations

Operator guide for the data ZCode Graph keeps on disk: where it is, what the automatic pre-reconciliation snapshot protects, how to back up and restore a Graph record, and what happens with data the build cannot read. There is no product UI for any of this; the restore tool is a maintenance script in this repository. Status: Z8.2 development checkpoint. The procedures here were exercised on **disposable synthetic and copied-fixture data only**; they have not been through installer-upgrade acceptance.

## 1. Where the data lives

ZCode Graph runs on a private profile so it never shares state with the regular ZCode app.

| What                                                  | Location (Windows)                                                                       |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Private profile root                                  | `%USERPROFILE%\.zcode-graph-engineering\`                                                |
| **Graph data directory** (this guide)                 | `%USERPROFILE%\.zcode-graph-engineering\home\.zcode\v2\graph-engineering\`               |
| One record per workspace                              | `<graph data directory>\<sha256 of the workspace key>.json`                              |
| Run artifacts                                         | `<graph data directory>\artifacts\`                                                      |
| Workflow library (user versions)                      | `<graph data directory>\workflow-library.json`                                           |
| Automatic snapshots (Z8.2)                            | `<graph data directory>\reconcile-snapshots\<workspace hash>\<sha256 of the bytes>.json` |
| Parallel working copies of a project                  | `<graph data directory>\workspaces\` (copies of project source; **not** Graph records)   |
| Ownership lock while Graph is open                    | `<graph data directory>\<hash>.json.lock\` (not data)                                    |
| Native session ledger                                 | `...\home\.zcode\cli\db\db.sqlite` (outside the Graph data directory)                    |
| Provider settings / credentials / Electron data       | elsewhere in the private profile (outside the Graph data directory)                      |
| Project source and the project's `.zcode\config.json` | the project folder itself                                                                |

The workspace key is the workspace path (for a remote workspace, its workspace identity). The record file name is the SHA-256 of that key.

## 2. What the automatic snapshot is

When ZCode Graph opens a workspace whose saved record contains unfinished work, it converts that work to `Interrupted` (or `AwaitingContinuation` when a resumable checkpoint or gate exists) and saves the record. **Immediately before that first change it keeps a copy of the exact bytes it read from disk.**

- Taken **only** when a persisted change is actually required. Ordinary saves, runs, approvals and edits never create snapshots.
- **Opening a record that is already in its reconciled state changes nothing**: record bytes, `updatedAt` and the snapshot set stay exactly as they were, and no retention runs. (Before the Z8.2 correction every launch re-saved such a record and added a snapshot; that is fixed.) If a checkpoint, gate or `resumeRequired` flag is missing or stale the record does change, and that change is snapshotted like any other.
- It is the original file byte for byte, not a re-serialization, named by the SHA-256 of its bytes, so identical content is stored once.
- If the copy cannot be written or verified, or the record changed on disk after it was read, the reconciliation is **aborted**: the original record is left untouched and nothing is started. Opening the workspace again retries from the unchanged original.
- **Bounded retention.** At most **20** snapshots are kept per workspace; the oldest are removed automatically, only from this snapshot folder. This is a safety net for one specific transition, **not a permanent backup guarantee**: snapshots can be removed by later transitions and by restores (section 5). Copy a snapshot out yourself if you need to keep it.

### What a snapshot contains

Only that workspace's Graph record: its runs, node/approval/tool attempts, definition and recorded evidence. It is plain JSON.

**A snapshot can contain confidential text.** A record holds the prompts that were sent, model replies, command and test output and handoff text. The mechanism does not copy credential-store or provider-configuration files, and some known secret shapes are redacted when evidence is captured, but a record can still contain secret or confidential text that a model, a tool or a project printed. Treat snapshots and backups as sensitive. **Snapshots are not support bundles**: do not attach them to an issue, mail them or commit them.

### What a snapshot does **not** contain or restore

- Provider settings, API keys, tokens or any credential-store file.
- Native sessions or the session ledger. A record refers to native sessions by identity; restoring a record never recreates or rewinds a session.
- Run artifacts, the workflow library or other workspaces' records (unless you back them up yourself, section 4).
- Project source files, project check results on disk, or the project's `.zcode\config.json`. Use version control for the project.

## 3. Reading history is not acting

Opening a historical record (including one written by an older release) only reads and, if required, reconciles it. It never sends a message, replays a request, approves, answers a question or releases a guard. Continuing a run is a separate, explicit action with its own freshness and ownership checks.

## 4. Manual backup of Graph-owned files

Close ZCode Graph completely first. A manual backup may include exactly these Graph-owned items from the Graph data directory:

- the workspace record files (`<64 hex characters>.json`),
- `workflow-library.json`,
- the `artifacts\` folder,
- the `reconcile-snapshots\` folder.

It must **not** include `workspaces\` (project copies), lock folders, the native ledger, Electron data, provider settings or credentials. This guide does not tell you to copy the private profile. A backup of these files restores Graph's own bookkeeping only; it does not restore native sessions, credentials, project source, project checks or anything not listed.

```powershell
$graph  = Join-Path $env:USERPROFILE '.zcode-graph-engineering\home\.zcode\v2\graph-engineering'
$stamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = Join-Path $env:USERPROFILE "graph-engineering-backup-$stamp"
New-Item -ItemType Directory -Path $backup | Out-Null
Get-ChildItem -LiteralPath $graph -File |
  Where-Object { $_.Name -match '^[0-9a-f]{64}\.json$' -or $_.Name -eq 'workflow-library.json' } |
  Copy-Item -Destination $backup
foreach ($name in 'artifacts', 'reconcile-snapshots') {
  $source = Join-Path $graph $name
  if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination $backup -Recurse }
}
(Get-ChildItem -LiteralPath $backup -Recurse -File | Measure-Object).Count
```

Keep the backup folder private and delete it when you no longer need it; it can contain confidential text (section 2).

## 5. Restoring a record

Use this only when you decide an automatically reconciled or damaged record should be replaced by an earlier copy. The script is a maintenance tool **in this repository** (it is not shipped inside the installer) and runs with the repository's Node and `tsx`; run it from the repository root.

1. **Close ZCode Graph completely** (including from the tray). The tool refuses while the application holds the record's lock and changes nothing.
2. List records and their snapshots (read-only):

   ```powershell
   $graph = Join-Path $env:USERPROFILE '.zcode-graph-engineering\home\.zcode\v2\graph-engineering'
   node --import tsx scripts/graph-engineering/graph-record-restore.mjs list $graph
   ```

   For each record the output shows the workspace key, the record version and its run statuses, and every snapshot (id, bytes, modified time). A snapshot id is the SHA-256 of its bytes.

3. Restore one snapshot (an id or a unique prefix of at least 8 characters):

   ```powershell
   $key = '<exact workspace key from the list output>'
   node --import tsx scripts/graph-engineering/graph-record-restore.mjs restore $graph --workspace-key $key --snapshot <id-or-prefix> --yes
   ```

   The tool takes the same ownership lock the application uses; validates the chosen snapshot with the same strict parser as the application (including the workspace-key match and the version and integrity checks); **first saves the current record, even if damaged, into the snapshot folder**; then replaces the record atomically with the snapshot's exact bytes. Without `--yes` it refuses.

4. Start ZCode Graph again. A restored record that still contains unfinished work is reconciled on open (and snapshotted once). That is expected.

**Retention during a restore.** The pre-restore copy lives in the same store and counts toward the same bound of 20. During one restore, both the snapshot being restored and the just-saved copy of the previous record are protected from that restore's pruning, and if the replacement step fails both remain in the store. Afterwards ordinary retention applies to every snapshot, including those two; neither is a permanent backup. Copy a snapshot out if you need to keep it.

The tool never changes artifacts, the workflow library, credentials, native sessions, the ledger, project files or `.zcode\config.json`.

## 6. Data the build cannot read

Three situations are reported differently. In all of them the file is **not** rewritten, downgraded or repaired, and no run, session, tool, model call, permission or approval is started.

| Situation                                                      | What you see                                                                                                                                                     | Meaning                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Newer, unsupported format**                                  | "This Graph record uses version N (location), which is newer than this ZCode Graph build supports (up to M)…"                                                    | The record, definition, run or an attempt's instruction contract carries a version above what this build supports (5 for record/definition/run versions, 2 for the instruction contract). Open it with the version that wrote it, or restore a snapshot made by a compatible build. Downgrading over newer data is not supported. |
| **Supported format, recorded instructions cannot be verified** | "This Graph record could not be verified: Resolved instructions differ from exact frozen iteration bindings (run …, attempt …, node …, instruction contract …)…" | Every attempt's stored instructions are rebuilt from the inputs stored with it and must match exactly. A mismatch means the data was edited or damaged, or came from a writer whose format this build does not recognize. It is **not** by itself an upgrade problem. The full original diagnostic is attached to the error.      |
| **Malformed data**                                             | the ordinary validation error                                                                                                                                    | The file does not fit the record format.                                                                                                                                                                                                                                                                                          |

Instruction contracts: attempts prepared by this build carry `instructionContract: 2`. Attempts written by older releases carry no marker and are accepted only if they equal, exactly and completely, the instructions reconstructed under one of the two known historical formats (before and after the evidence-contract suffix). A format marker and a local comparison are consistency checks, **not** proof of who wrote the data.

**Rollback.** A record containing attempts marked with `instructionContract` is rejected by older strict readers (builds before the Z8.2 correction), so reinstalling an older binary does not restore access to such data. Rolling back requires data taken before those attempts were written (a snapshot or your own backup), and everything recorded after that point is lost. There is no supported rollback procedure yet.

The workflow-library file has its own version field; the newer-version handling above covers workspace records only.

## 7. Not covered

Installer (NSIS) upgrade behavior, code signing, credential migration, native-session migration, cross-machine migration and any retention or deletion UI are outside Z8.2. The upgrade tests copy Graph data into fresh profiles; they do not migrate native sessions.
