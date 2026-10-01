# ZCode Graph data operations

Operator guide for the data ZCode Graph keeps on disk: where it is, what the automatic pre-reconciliation snapshot protects, how to restore a record, and what happens with data from a newer version. There is no product UI for any of this; the restore tool is a local maintenance script. Status: Z8.2 development checkpoint — the procedure has been exercised on synthetic data only (see `Z8_2_REPORT.md`); it has **not** been through installer-upgrade acceptance.

## 1. Where the data lives

ZCode Graph runs on a private profile so it never shares state with the regular ZCode app:

| What                                                  | Location (Windows)                                                                       |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Private profile root                                  | `%USERPROFILE%\.zcode-graph-engineering\`                                                |
| Graph data directory (this guide)                     | `%USERPROFILE%\.zcode-graph-engineering\home\.zcode\v2\graph-engineering\`               |
| One record per workspace                              | `<graph data directory>\<sha256 of the workspace key>.json`                              |
| Run artifacts                                         | `<graph data directory>\artifacts\`                                                      |
| Workflow library (user versions)                      | `<graph data directory>\workflow-library.json`                                           |
| Parallel clones                                       | `<graph data directory>\workspaces\`                                                     |
| Automatic snapshots (Z8.2)                            | `<graph data directory>\reconcile-snapshots\<workspace hash>\<sha256 of the bytes>.json` |
| Native session ledger                                 | `%USERPROFILE%\.zcode-graph-engineering\home\.zcode\cli\db\db.sqlite`                    |
| Electron/session data                                 | `%USERPROFILE%\.zcode-graph-engineering\electron\`                                       |
| Provider settings and credentials                     | inside the same private profile (`...\home\.zcode\v2\`)                                  |
| Project source and the project's `.zcode\config.json` | the project folder itself — never inside the profile                                     |

The workspace key is the workspace path (or, for a remote workspace, its workspace identity). The record file name is the SHA-256 of that key.

## 2. What the automatic snapshot is

When ZCode Graph opens a workspace whose saved record contains work that was not finished, it converts that work to `Interrupted` (or `AwaitingContinuation` when a resumable checkpoint exists) and saves the record. **Immediately before that first change it keeps a copy of the exact bytes it just read from disk.**

- Taken **only** at that moment (cold-load reconciliation of an existing record). Ordinary saves, runs, approvals and edits never create snapshots.
- It is the original file, byte for byte — not a re-serialization. It is named by the SHA-256 of its bytes, so identical content is stored once.
- If the copy cannot be written or verified, or if the record changed on disk after it was read, the reconciliation is **aborted**: the original record is left untouched and nothing is started (no native session, model call, tool, permission answer or approval). Opening the workspace again retries from the unchanged original.
- Bounded retention: at most **20** snapshots are kept per workspace; older ones are removed automatically and only from this snapshot folder. Nothing else is ever pruned.
- A record that is already `Interrupted` or `AwaitingContinuation` is saved again on each open (its timestamp is refreshed), so each such open can add one snapshot; the bound of 20 still applies. This is existing behavior that Z8.2 does not change.

### What a snapshot contains

Only the one workspace's Graph record: its runs, node and approval attempts, tool attempts, definition and recorded evidence. It is plain JSON; the same file the application would have read.

### What a snapshot does **not** contain

- Provider settings, API keys, tokens or any credential.
- Native sessions or the session ledger (`db.sqlite`).
- Electron/session data, logs, settings.
- Run artifacts, the workflow library, parallel clones.
- Project source files or the project's `.zcode\config.json`.

These are deliberately separate. A record points at native sessions and artifacts by identity; restoring a record brings the Graph's own bookkeeping back, it does not recreate a native session that has since changed, and it never rewinds your project files. If you need a project rolled back, use your version control.

## 3. Restoring a record

Use this only when you decide an automatically reconciled record should be replaced by an earlier copy (for example, to inspect what a record looked like before it was marked `Interrupted`, or to recover from a damaged record file).

1. **Close ZCode Graph completely** (including from the tray). The restore tool refuses while the application holds the record's lock and changes nothing.
2. List records and their snapshots (read-only):

   ```bash
   node --import tsx scripts/graph-engineering/graph-record-restore.mjs list "%USERPROFILE%\.zcode-graph-engineering\home\.zcode\v2\graph-engineering"
   ```

   The output shows each workspace key, the record's version and status summary, and every snapshot (id, bytes, modified time, record version).

3. Restore one snapshot (an id or a unique prefix of at least 8 characters):

   ```bash
   node --import tsx scripts/graph-engineering/graph-record-restore.mjs restore "%USERPROFILE%\.zcode-graph-engineering\home\.zcode\v2\graph-engineering" --workspace-key "<exact workspace key>" --snapshot <id-or-prefix> --yes
   ```

   The tool: takes the same ownership lock the application uses; validates the chosen snapshot with the same strict parser as the application (including the workspace key match and the version check); **first saves the current record — even if it is damaged — into the snapshot folder**; then replaces the record atomically with the snapshot's exact bytes. It prints what it restored and what it preserved.

4. Start ZCode Graph again. Be aware that a restored record that still contains unfinished work will be reconciled again on open (and snapshotted again). That is expected.

The tool never changes artifacts, the workflow library, credentials, native sessions, the ledger, project files or `.zcode\config.json`. The pre-restore copy is stored in the same snapshot folder and counts against the same bound of 20; if you want to keep a particular copy beyond that, copy the file out yourself.

If a restore is refused, read the message: it names the reason (application running, unknown or ambiguous snapshot id, snapshot fails validation, newer unsupported version, content does not match its name). A refused restore changes nothing.

## 4. Data from a newer version

If a record's `version` (or its definition's or a run's `version`) is higher than this build supports (currently **5**), ZCode Graph refuses to load it with a bounded message: the record "appears to come from a newer, unsupported ZCode Graph version", the offending location and version, and the authoritative validation diagnostic (truncated). It then:

- does **not** rewrite, downgrade or "repair" the file;
- does **not** relax the strict schema or ignore unknown fields;
- starts **no** run, session, tool, model call, permission or approval.

Open the data with the version that wrote it, or restore an earlier snapshot made by a compatible build (section 3). Downgrading the application over newer data is not supported. Unreadable JSON, and data of a supported version that fails validation, keep their ordinary error — they are not reported as "newer version".

The workflow library file has its own version field; the newer-version handling described here applies to workspace records. See `Z8_2_REPORT.md` for the exact scope that was tested.

## 5. Backing up yourself

The snapshot is a safety net for one specific transition, not a backup system. For a backup you control, close ZCode Graph and copy the whole Graph data directory (section 1) plus, if you want native sessions and settings to match, the rest of the private profile. Treat a copy of the profile as sensitive: it contains provider settings and credentials. Do not attach a profile copy to an issue or commit it.

## 6. Not covered

Installer (NSIS) upgrade behavior, code signing, credential migration, cross-machine migration and any retention or deletion UI are outside Z8.2.
