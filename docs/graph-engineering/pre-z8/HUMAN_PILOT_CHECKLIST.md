# Human pilot checklist — Pre-Z8 graph engineering

This checklist prepares three human-pilot journeys for the current dev build (HEAD `6f41ad53`,
app `3.14.0`). No person has performed these yet — all timings, feedback, and PASS/FAIL below are
**expected outcomes** to verify, not recorded results. Measure usability only when a person
actually performs each step.

## Prerequisites

1. **Build the app** (already done in this checkpoint, but re-run if `out/` is stale):
   ```bash
   cd D:/Playground/ZCode/packages/desktop
   node ../../scripts/build-metadata.mjs
   corepack pnpm exec tsup      # main + host + preload
   corepack pnpm exec vite build # renderer
   ```

2. **SDK 8.0.425** (required for Journey B and the U2 matrix):
   - Already restored to `.tmp/dotnet-toolchain/sdk-8.0.425/` via the official `dotnet-install.ps1`
     script (`-NoPath`, project-local, from the Microsoft CDN).
   - Set `PRE_Z8_DOTNET_ROOT=<repo>/.tmp/dotnet-toolchain/sdk-8.0.425` when running U2 scenarios.
   - Verify: `<repo>/.tmp/dotnet-toolchain/sdk-8.0.425/dotnet.exe --version` should print `8.0.425`.

3. **Isolated pilot profile**: the native test scripts (`pre-z8-u*-native.mjs`) create isolated
   profiles under `.tmp/z1-native-<timestamp>-<hex>/` via `createIsolation` from `isolation.mjs`.
   This sets a temporary `HOME`/`USERPROFILE` and `ZCODE_GRAPH_DIALOG_CONTROL`, isolating both the
   Electron user data and the Graph engineering home (`%USERPROFILE%\.zcode-graph-engineering`).
   **Do not assume `--user-data-dir` alone isolates every service** — it only isolates Electron's
   user data directory, not the Graph engineering home which is derived from `USERPROFILE`. The
   native harness isolates both by redirecting `USERPROFILE` to the temp profile.
   ```bash
   # Run a native test scenario (handles full profile isolation):
   node scripts/graph-engineering/pre-z8-u4-native.mjs --scenario=cancel
   # For manual pilot, use the native-bootstrap.cjs harness which applies the same isolation:
   ZCODE_GRAPH_DIALOG_CONTROL=<control.json> node scripts/graph-engineering/native-bootstrap.cjs
   ```

4. **Controlled provider**: the pilot must NOT configure real provider credentials. The native
   scripts use controlled-provider fixtures that return scripted responses. The network sandbox in
   `native-bootstrap.cjs:96-103` blocks all non-localhost HTTP/HTTPS by default; this is a sandbox
   boundary, not evidence of zero background activity.

---

## Journey A — Agent-led workflow without JSON editing

**Goal:** create and run an agent-assisted workflow entirely through Guided controls, without
editing JSON. Verify the workflow completes, evidence is captured, and the final gate requires
explicit human approval.

### Steps

1. **Open Graph Engineering** in a local workspace. The header shows the workspace where
   operations will happen.

2. **Open Workflows → Agent-assisted task.** Enter a concrete request (e.g. "Add a synthetic
   marker to fixture.mjs"). Optional references are under **Documents, native guidance and skills**.

3. **Choose Create workflow.** This saves a version-pinned definition. If the design has unsaved
   changes, choose Save and replace, Discard and replace, or Cancel. A failed save keeps the
   original draft.

4. **In Design**, inspect the steps (Analyze → Implement → Review → final approval). Use Guided
   view only — do not open Advanced/JSON. Start the run only after reviewing the captured preflight
   and its unknowns.

5. **In Runs**, open the exact native conversation. Answer native questions or permissions there.
   The final Graph gate is a separate decision over captured evidence and requires a comment.

6. **Inspect source changes and agent findings.** This path is agent-led review; configured test
   evidence is not included.

### Expected evidence

- The run reaches `Completed` status with `agent-reported` evidence and `configuredTestCount=0`.
- The final gate shows `Approved` only after explicit human action with a comment.
- The captured request, result, and source changes are frozen — later conversation messages do not
  replace them.
- No JSON editing was required at any step.

### Failure indicators

- The run gets stuck at a gate that cannot be approved.
- Guided controls lose text or bindings when switching steps.
- The captured prompt differs from what was shown in the draft preview.

---

## Journey B — Configure .NET check + interpret pass/fail

**Goal:** configure a .NET VSTest check through the Guided preset, run it, and interpret the
pass/fail report. Verify that a genuine pass produces accepted evidence and a genuine fail is not
upgradable.

**Prerequisite:** SDK 8.0.425 installed (see Prerequisites above).

### Steps

1. **Open Project setup** in Graph Engineering. Choose **Scan project** to read bounded local
   metadata. Inspect every candidate and its runner, target frameworks, source coverage and
   unresolved imports. Scan never evaluates MSBuild, restores packages, or executes project code.

2. **Open the .NET preset.** Select explicit projects/frameworks. Review the complete source/output
   manifest. Add up to seven explicit Test scopes after one Build. Each scope needs its exact test
   assembly and acceptance counts/required identities.

3. **Inspect the generated Build/Test arguments.** The preset uses Rebuild with restore disabled
   and Test with both build and restore disabled. Apply, validate, and save. No step here starts a
   process.

4. **Check tool availability** reads existing native environment metadata. If the native
   environment is unavailable, open an empty task in native Chat with a configured provider/model
   to initialize this workspace, then try again.

5. **In Run checks now**, choose checks in execution order and map each Test to an earlier selected
   Build. Review exact executable/arguments/cwd, source/output scopes, configuration and remaining
   unknowns; acknowledge them explicitly and start.

6. **Interpret the report:**
   - **Pass:** the appended calibration run shows accepted passing Test evidence. The TRX report
     shows `passed > 0, failed = 0`. The preview digest matches the original digest (clean TRX →
     `redacted: undefined`, `validation: "valid"`).
   - **Fail:** the run shows accepted failing Test evidence (not upgradable). The TRX shows
     `failed > 0`. `tests-failed` projection is displayed. The run cannot be approved as a pass.
   - **Zero/skipped/missing-required:** these do not pass. Each has a distinct state and message.

### Expected evidence

- A passing run produces fresh native execution with a unique report path and a complete
  normalization receipt.
- A failing run's evidence is accepted as a genuine fail — it cannot be upgraded to a pass.
- Zero results, all skipped, and missing required tests each produce a distinct non-passing state.
- Original reports containing private absolute paths are redacted in previews; the retained receipt
  separately identifies original bytes, safe preview, and normalized evidence.

### Failure indicators

- A failing run can be approved as a pass.
- A zero-result or all-skipped run shows as passing.
- The preview digest does not match the original digest (tampering or truncation).

---

## Journey C — Real Windows file dialogs: export/import + different request

**Goal:** use the real Windows file dialog to export a workflow, import it into a different
workspace, and make a different request without inheriting old results. Verify that the exported
file is a valid workflow envelope and the imported workspace explicitly rebinds references rather
than silently inheriting.

**Note:** the automated native tests use a controlled dialog seam (`ZCODE_GRAPH_DIALOG_CONTROL`).
This journey uses the real OS dialog — that is the human-pilot-only part.

### Steps

1. **Create a workflow** with at least one reference role (document or instruction). Save it.

2. **Export:** In the workflow library or transfer controls, choose **Export to file**. The real
   Windows Save dialog appears. Choose a location and filename (e.g.
   `workflow.zcode-workflow.json`). Verify the dialog respects overwrite warnings and focus
   behavior.

3. **Inspect the exported file** (optional): open it in a text editor. It should be a valid JSON
   envelope with `kind: "zcode-workflow"`, `version: 1`, the graph definition, and exported
   references with `required: true`, `kind`, and non-empty `nodeIds`.

4. **Import into a different workspace:** open a new isolated workspace. In the transfer controls,
   choose **Import from file**. The real Windows Open dialog appears. Select the exported file.
   Verify the import validates the file (size ≤ 256,001 bytes, valid UTF-8, stat-unchanged
   tamper check) and creates a new workflow with rebound references.

5. **Make a different request:** in the imported workflow, change the Start request text. Start a
   new run. Verify the new run uses the new request — it does not inherit the old run's results,
   captured prompt, or evidence.

6. **Cancel mid-run (optional):** start a run, then choose **Cancel**. Verify:
   - `Stop requested — awaiting confirmation` appears.
   - Already-written files remain.
   - The run reaches `Cancelled` / `completedInterrupted` state.
   - Restarting selects the same cancelled history without replay.

### Expected evidence

- Exported file is valid JSON with the correct envelope structure.
- Imported workflow has rebound references (not silent inheritance).
- New run's captured prompt matches the new request text, not the old one.
- Cancel produces the correct terminal state without replay.

### Failure indicators

- The Save dialog treats a cancel as success (shows "file saved" after cancel).
- The import silently inherits old run results.
- A cancelled run auto-replays on restart.
- The exported file's references lack `required`, `kind`, or `nodeIds`.

---

## Distinctions to keep clear during pilot

| Concept | What it means |
|---|---|
| **Config** | Setting up checks, references, repair policy. No process starts. |
| **Execution** | Running a check or workflow. Native tools execute. |
| **Native permissions** | Tool/permission prompts in the native conversation. Separate from Graph gate. |
| **Graph approval** | The final gate decision over captured evidence. Requires a comment. |
| **Verification** | Interpreting test evidence (pass/fail/zero/skip). Accepted evidence ≠ approval. |

## What to record after pilot

For each journey, record:
- Actual steps taken (with any deviations).
- Pass/fail per expected evidence item.
- Observed failure messages and their exact text.
- Screenshots of key states (gate, evidence, dialog).
- Usability observations (only if a person performed the steps — do not invent times/feedback).
- Any defects found, with reproduction steps.

Do not mark a journey PASS without a person performing it and recording observations.
