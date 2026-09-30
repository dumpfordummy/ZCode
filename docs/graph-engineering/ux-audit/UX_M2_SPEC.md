# UX-M2 specification: pick up where you left off

Status: **2026-09-30, each section written and committed before the behaviour it describes** (AGENTS.md: spec first). Plan: [UX_M2_MILESTONE.md](UX_M2_MILESTONE.md). Baseline: integration tip `3c5cff4` (merge of PR #4), branch `claude/graph-ux-m2`. Windows acceptance is not claimed by anything here.

## 1. Vocabulary

- **History**: the Runs destination's list of this workspace's runs (`GraphRunHistory`), paged 25 at a time.
- **Explicit navigation to a run**: a user action whose purpose is to open one run: a history row, **Start** (the admitted run opens), **Go to run** (Needs-you), **View current run**, **Back to run** (a Graph-owned conversation), the "open run" link beside a blocked reason, and a check run started from Checks. Every one of them goes through the view store's `selectRun`.
- **Refresh / Host event**: `useGraphEngineering.reload` after a change event, a manual refresh, or any new `view.runs` projection. None of them calls `selectRun`.

## 2. UX-M2.1: newest-first history that follows you

### 2.1 Facts from the source (not assumptions)

- The Host appends a run to its record when it admits it (`app/service.ts`: `runs: [...record.runs, run]`) and updates runs in place (`app/state.ts`: `runs.map`). It never reorders, removes or re-inserts a run. The Host's own fixtures read the newest run as `runs.at(-1)`. **The Host array is therefore in creation order, oldest first.**
- The renderer passes `view.runs` to `GraphRunHistory` unchanged; `graphHistoryPage` slices it 25 per page. The page is component state initialised once from the selected run; nothing moves it afterwards.
- `useGraphEngineering.reload` publishes a new view without setting `loading`, so the editor and the history stay mounted across refreshes; `GraphEditor` is keyed by workspace, so page state never crosses workspaces.
- The UX-M1 browser fixture Host **prepends** admitted runs (`unshift`), unlike the real Host. It is corrected to append (a fixture fidelity fix, recorded in the report).
- Graph timestamps (`createdAt`, `capturedAt`, `decidedAt`, `releasedAt`, `deadlineAt`, `acceptedAt`) are epoch milliseconds. Five sites render them with `toLocaleString()`, which follows the OS/browser locale, not the app locale; one (`GraphWorkflowProvenance`) uses `toISOString()`, which throws on an invalid value.

### 2.2 Ownership (nothing new is stored)

| State or rule                            | Single owner                                                                                                               |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| The runs and their creation order        | Host projection `view.runs` (append order). Never mutated or re-sorted in place by the renderer                            |
| Display order                            | pure `graphRunsNewestFirst(runs)`: a new array, reverse append order                                                       |
| Which run is selected                    | view store selection `runId` (unchanged)                                                                                   |
| Which page is shown                      | `GraphRunHistory` component state (unchanged owner), clamped by `graphHistoryPage`                                         |
| "Reveal the selected run's page" request | view store selection `reveal`: a counter that `selectRun` increments. Renderer-local, navigation only, not a history store |
| Timestamp text                           | pure `graphTimestamp(value, locale)`; the stored number is never changed                                                   |

### 2.3 Rules

1. **Order.** History shows runs newest first by **creation order**: the reverse of the Host's append order. `updatedAt`, status changes and progress never reorder rows. The order is total and deterministic: two runs with the same `createdAt` (or a clock that went backwards) keep their append order, reversed. The projection returns a new array and never mutates `view.runs` (a frozen array must work).
2. **Needs-you is unchanged.** It is still derived from the complete `view.runs`, not from the page, and keeps its scope line.
3. **Reveal on explicit navigation.** Every `selectRun` increments `reveal`. When `reveal` changes, the history shows the page containing the selected run, including when that run was already selected and the user had browsed to another page since. If the run is not yet in `view.runs` (the reply of Start can precede the refreshed projection), the reveal stays pending and is applied when the run appears; it is applied once.
4. **Refreshes never move anything.** A new `view.runs`, a change event or a manual refresh does not change the page, the selected run or keyboard focus. A newer run arriving while an older page is shown shifts rows by one; that is accepted. Rows stay keyed by run id.
5. **Clamping.** A page number outside `[0, pages-1]` is clamped at render (existing `graphHistoryPage`); an empty history shows page 1 of 1.
6. **Wording.** The paging controls read **Newer runs** / **Older runs** (Chinese: "较新的运行" / "较早的运行") and match the order: page 1 holds the newest runs, **Newer** is disabled on page 1, **Older** on the last page. The range text is unchanged in meaning ("1–25 of 27 runs · Page 1 of 2").
7. **Timestamps.** Graph-owned timestamps are formatted with the **app locale** (`useZCodeIntl().locale`) and the viewer's time zone, as before (no `timeZone` option; the stored value is unchanged). A missing, non-numeric or invalid value renders a localized "Time not recorded" and never an invented date (not 1970, not "Invalid Date", no throw). `GraphWorkflowProvenance` keeps its exact ISO-8601 UTC text (it is a captured operational fact) and gains the same invalid-value handling.
8. **Keyboard.** Rows keep Enter/Space selection and keep focus on the row (UX-M1). A reveal never moves focus; the focus request of **View current run** / **Go to run** is unchanged.

### 2.4 Event order

```mermaid
sequenceDiagram
  participant U as User
  participant V as View store (renderer)
  participant H as GraphRunHistory (page state)
  participant P as Host projection (view.runs)
  U->>H: Older (page 2)
  P-->>H: refresh / change event (new array)
  Note over H: page stays 2, selection and focus unchanged
  U->>V: Start / Go to run / View current run / Back to run (selectRun)
  V->>V: runId = X, reveal += 1
  V-->>H: reveal changed
  alt X is in view.runs
    H->>H: page = page of X (applied once)
  else X not yet projected
    P-->>H: projection now contains X
    H->>H: page = page of X (applied once)
  end
```

### 2.5 Acceptance and how each is verified

1. Order is reverse append order; ties and out-of-order `createdAt` keep append order; the input (frozen) is not mutated. **Unit** (`graphRunsNewestFirst`, `graphHistoryPage`).
2. Page 1 shows the newest runs; Newer/Older wording and disabled states match. **Browser** (27-run fixture) and **unit** (locale keys).
3. Start with more than 25 runs while browsing an older page: the admitted run is on page 1, selected and visible. **Browser**, fixture Host appending like the real Host.
4. Go to run and View current run reveal the page, including an already selected run after browsing away. **Browser**.
5. A refresh and a Host change event while on an older page: page, selection and focused row unchanged. **Browser** (focus asserted by test id and `document.activeElement`).
6. Needs-you still reaches a waiting run that the shown page does not list (the user browsed to an older page), and Go to run reveals it. **Browser** (the UX-M1 scenario, re-arranged to keep its semantic assertion).
7. Timestamps: English and Chinese render differently for the same value, invalid values render "Time not recorded", the stored value is untouched. **Unit** and **Browser**.
8. Mutation checks: reversing order removed; reveal not applied; reveal applied on refresh.

The historical driver `pre-z8-u4-history.mjs` (500 synthetic rows, keyboard paging) is updated to the new order with the same assertions (bounded rendering, keyboard paging to the end, "Show selected run", Tab+Enter selects the neighbouring row). The native `ux-m1-native-runs.mjs` step E3 is updated the same way as the browser scenario; it runs only on Windows and stays pending until executed there.

## 3. UX-M2.2: explicit unsaved-check semantics

Finalized **2026-09-30**, before UX-M2.2 was implemented. Approved approach: disclosure, Discard and a Save summary; **no** blocking Save/Discard/Keep dialog on Back or on navigation to a pending run.

### 3.1 Facts from the source

- The unsaved check draft is `useGraphDraftStore().workspaces[key].recipes = { text, baseText, digest }`: `baseText` is the saved list (JSON of the snapshot at `digest`) the draft started from; `text` is the whole edited list. Dirty means `text !== baseText`. It survives navigation and is per workspace.
- **Save checks** validates `text` through the Host and then saves the **whole list** with `expectedDigest = digest`. So a save writes every retained edit, including ones made on earlier visits (Windows C9).
- A conflict is `digest !== snapshot.digest` (the saved checks changed elsewhere). The conflict block offers **Discard edits and use loaded checks** (`acceptRecipes(snapshot, text)`), and Save is blocked.
- New run reads only the Host snapshot (`recipeReadState.snapshot` when `ready`); preflight is built by the Host from the saved recipe store. Unsaved edits are never part of a review or a run. Nothing says so today.
- The dirty status is one line below the form ("Unsaved project-check edits are retained for this workspace."). No discard exists outside the conflict case. The sticky Back bar says only that choices are kept.

### 3.2 Ownership (no new store, no new write path)

| State or rule                     | Single owner                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Unsaved check edits               | draft store `recipes` (unchanged)                                                                     |
| Saved checks                      | Host recipe store via `recipes read/save` (unchanged authority, validation, digest check)             |
| What changed, by stable id        | pure `graphRecipeChanges(recipes)` over (`baseText`, `text`); derived, never stored                   |
| Discard                           | the existing `acceptRecipes(snapshot, text)` with a **ready, non-conflicting** snapshot; nothing else |
| Discard confirmation, open/closed | component state in the Checks editor (renderer-local)                                                 |

### 3.3 Rules

1. **Back is immediate.** **Back to new run** keeps the check draft and returns at once. No dialog, no prompt, on Back, on the tabs, on Needs-you, on **Go to run**, **View current run** or **Back to run**.
2. **Changes by stable id.** `graphRecipeChanges` compares `baseText` and `text` by recipe `id`: **added** (id only in the draft), **modified** (both, content differs; key order ignored), **removed** (id only in the saved base), and **order changed** (the same ids in a different order). Names come from the draft (added, modified) or the base (removed) when they are strings; otherwise only the id is shown. A draft that is not a JSON array of objects, or has a recipe without a string id, or has duplicate ids, is **unsummarizable**: the UI says the changes cannot be listed and never presents a partial list as complete. Text that differs only in formatting is reported as "only formatting".
3. **Visible near the actions.**
   - Checks editor, list: a modified row is marked "Unsaved changes", an added row "New · not saved". Removed checks, which have no row, are in the summary.
   - Checks editor, above **Save checks**: one summary block (replacing the old one-line status): the lists above; "They are not used by the next run. Review and runs use the saved checks until you save."; and the save scope: "**Save checks** writes the whole check list, including every change listed here, also those made earlier in this workspace." **Save checks** is described by this block (`aria-describedby`).
   - Sticky Back bar: when the draft is dirty, "Unsaved check edits stay in Checks and are not used by the next run."
   - New run, Checks section: when the draft is dirty, one line: "Checks has unsaved edits. Review and the next run use the saved checks shown here." A selected check whose id is modified or removed in the draft carries a marker ("Unsaved edits in Checks are not used" / "Removed in unsaved edits; the saved check is still used"). The row keeps the **saved** name, kind and "Saved · not run"; draft values are never shown there or substituted. When the draft is unsummarizable, the line says the edits cannot be listed and no per-row marker is claimed.
4. **Save is unchanged.** Enabled state, validation, digest conflict, the admission refusal while a run is unresolved, and the post-save refresh are unchanged. An unsummarizable draft does not change whether Save is enabled; Save still validates first and refuses an invalid list.
5. **Discard names its scope and is confirmed.** **Discard all unsaved check edits…** appears beside Save when the draft is dirty and there is no conflict. It opens an inline confirmation (no modal): "Discard all unsaved edits to the check list? Every check returns to the saved checks, not only the one that is open." with the same change summary, **Discard all edits** and **Keep editing**. Only **Discard all edits** changes anything: `acceptRecipes(snapshot, text)` with the current, ready snapshot. **Keep editing** changes nothing. Discard is available while a run is unresolved (it only touches the renderer draft).
6. **Stale or missing saved checks.** Discard is disabled, with its reason, unless the saved checks are loaded (`ready`); it never resets to an older `baseText` as if it were current. When the saved checks are not currently loaded, the summary says it compares with the saved checks loaded earlier. In a conflict the existing conflict block and its **Discard edits and use loaded checks** stay the only discard path (unchanged), and the summary says it compares with the version the draft started from.
7. **Open check after discard.** If the open check's index no longer exists after a discard, the editor opens the first check.

### 3.4 Event order

```mermaid
sequenceDiagram
  participant U as User
  participant C as Checks editor
  participant D as Draft store (recipes)
  participant H as Host recipe store
  participant N as New run
  U->>C: edit a check (Edit check from New run)
  C->>D: setRecipeDraft(text) (dirty)
  U->>C: Back to new run (immediate, no prompt)
  N->>D: read recipes, graphRecipeChanges
  N-->>U: saved check shown, marked "unsaved edits not used"
  U->>N: Review and run
  N->>H: instantiate/prepare (Host reads SAVED checks)
  alt Discard
    U->>C: Discard all unsaved check edits... then Discard all edits
    C->>D: acceptRecipes(ready snapshot, text) (clean)
  else Save
    U->>C: Save checks (summary lists every change)
    C->>H: validate, save(whole list, expectedDigest)
    H-->>D: acceptRecipes(new snapshot) (clean)
  end
```

### 3.5 Acceptance and how each is verified

1. `graphRecipeChanges`: added/modified/removed/order, key order ignored, names, formatting only, invalid JSON, missing and duplicate ids. **Unit**.
2. Edit check -> change -> Back: Back is immediate; the New-run row keeps the saved name and is marked; the pane line is shown; Review's preflight lists the saved check (Host payload and review text), not the edit. **Browser** with the real recipe store.
3. Save summary: after edits on two separate visits (one check changed, one added, one removed), the summary lists all of them by id and name; Save writes exactly that list (real `.zcode/config.json`). **Browser**.
4. Discard: cancel changes nothing; confirm restores the saved list; the label and confirmation name the whole list. Disabled while the saved checks are not loaded. Conflict keeps its own flow. **Browser**.
5. Unsummarizable raw JSON: the summary says so, Save is not newly enabled and still refuses. **Browser** and **unit**.
6. Save refused while a run is unresolved; Discard and editing still work. **Browser**.
7. Localization of every new message in English and Chinese; check names and ids stay verbatim. **Unit** (keys) and **Browser** (zh).
8. Mutation checks: summary drops removed checks; New-run marker missing; Discard without confirmation; Discard enabled without a ready snapshot.
