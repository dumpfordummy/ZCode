# ZCode Graph 3.14.0-z7.4 — Pre-Z8 Usability Preview (Windows x64)

This prerelease contains the committed pre-Z8 Graph Engineering improvements through U6: editable sequential Agent Tasks with Guided/Advanced context controls, human review, artifacts and native Build/Test tools, bounded conditional/repair workflows, a versioned sequential workflow library with portable export/import, repeat-request reuse, run-status/approval/cancellation/stale-evidence controls, and optional two-worker Fork/Join with separate owned workspaces and reviewed integration. Graph uses ZCode's existing native agent/session services. Conversation links open the actual existing sessions; native Chat, permissions, questions, configuration and history retain their existing owners.

## Usability improvements in this prerelease

- **Guided context controls**: select the original request, an eligible earlier step's final text or structured output, a configured Test's verification result, or declared repair feedback — all through Guided UI without JSON editing. Editing one text area preserves the other text, token order and bindings.
- **Draft input preview**: expand to see the current request with clearly marked placeholders for future step, artifact and repair results. Substitution is one pass; braces inside results are data, not a second set of instructions.
- **Portable workflow export/import**: export a versioned workflow definition to a `.zcode-workflow.json` file (envelope `format: "zcode-workflow"`, `version: 1`, byte limit 256,000). Import validates UTF-8, size, and stat-unchanged tamper check. Exported references carry `required: true`, `kind`, and non-empty `nodeIds` for explicit destination rebinding.
- **Repeat-request reuse**: pinned and unpinned repeat-request through `applyGraphRunRequest` (pure transform, no revision/pin/binding mutation). Pinned instances sync `start.request` via shared `renderStartRequest`.
- **Run status/approval/cancellation**: execution, test evidence, and human decision are separately labelled. Cancel requests a stop for the run's owned native work; already-written files remain. Stale evidence after source drift blocks approval and does not auto-recover.
- **Bounded repair policy**: Guided controls for 0–5 additional repairs, positive deadline up to 1,440 minutes, 1–64 total Task/Tool admissions.

## Verification performed

Automated native regression on the current build (HEAD `6f41ad53`, app `3.14.0`):

- **U1** agent-assisted workflow: PASS (11 controlled requests, 3 native inputs).
- **U2** eight-scenario .NET matrix: 8/8 PASS (pass/fail/zero/skipped/missing-required/source-drift/build-drift/multi) with SDK 8.0.425 restored via official `dotnet-install.ps1` and `PRE_Z8_DOTNET_ROOT` routing.
- **U3** editor controls (Guided/Advanced, reference catalog, schema/condition JSON, repair policy, canvas): PASS (editor-only, 0 model requests).
- **U4** run lifecycle: 4/4 PASS (cancel, complete, concurrent-chat, source-drift).
- **U5** file transfer and repeat-request: 6/6 PASS (export/import round trip, cancel/failure protection, async lifecycle, pinned+unpinned repeat-request, run-identity proof).
- **dotnet-fixture**: 7/8 PASS (1 known net6.0 baseline limitation — SDK 8.0.425 lacks 6.0.x ref packs; fixture is package-free; not a regression).
- **Emitting checks**: typecheck exit 0; lint 0 errors / 75 pre-existing warnings; architecture 0 violations; graph-engineering test suite 341/343 (2 pre-existing skipped, 0 fail).
- **CI workflow**: source tests, TypeScript, root lint, architecture, Windows build, and detached packaged Z1/Z2/ordinary Chat acceptance using actual native tools and controlled loopback providers.

Production defects fixed in this checkpoint:
- **D1**: `useGraphTemplateFiles.ts` mtimeMs integer check rejected Windows NTFS float mtimeMs, breaking file imports on Windows.
- **D2**: `GraphTemplateTransfer.tsx` exportToFile treated cancel as success.
- **D3**: `workflow-request.ts` pinned repeat-request did not sync `start.request`, so new request never reached model.
- **D4**: `z4-review.test.ts` test timestamp construction caused intermittent freshness-check rejection on Windows (fixture construction fix; does not prove the same timing issue is impossible in production).

## Known limitation — Fork/Join export/import is not supported (Z7-A12 FAIL)

The portable workflow library exports only the sequential definition. It does not transfer the parallel plan's branch topology, concurrency limit, Join semantics or integration configuration. Do not use sequential export as a backup or transfer of a Fork/Join plan. Existing sequential imports and rejected unsupported payloads made zero native/workspace execution calls in the isolated service audit; a valid Fork/Join import cannot be tested until implemented. The expanded Z7 acceptance is incomplete.

Fork/Join is opt-in and limited to two workers against a clean committed local Git base. Workers and integration use distinct app-owned clones. Integration requires review and fresh combined Build/Test evidence followed by human approval. Interrupted work is not automatically replayed, workspaces are retained until explicit safe cleanup, and results are not automatically merged into the original project. This coordination is not an OS security sandbox.

## Installation

Download the Windows x64 `.exe` installer and compare its SHA256 hash with `SHA256SUMS.txt`. GitHub changes the space in the build filename to a dot (`ZCode.Graph-3.14.0-z7.4-win-x64.exe`); the checksum line retains the original build filename. No Git checkout is needed to install. Each user supplies their own model provider configuration and project development tools.

The separate **ZCode Graph** app uses `%USERPROFILE%\.zcode-graph-engineering`, with a private home for the application and its tools. It does not copy an existing ZCode/Codex profile, take over the upstream URL handler/Explorer menu, or install upstream updates. Existing Graph users update manually by downloading and running this newer Graph installer. This remains an **unsigned prerelease**; upstream OAuth callbacks and signing reputation are not covered.

## NOT RUN for this release

- User-operated live-provider Read/Edit/test with a real paid model.
- Real Windows OS file dialog ergonomics (the native tests use a controlled dialog seam, not real pickers).
- A second physical PC/clean VM; installer upgrade/uninstall; code-signing reputation.
- Packaged Z3–Z7 native acceptance (CI runs Z1/Z2/ordinary Chat packaged smoke only).
- U3 native context handoff (prior-session evidence only; this checkpoint's U3 run is editor-only).
- Mobile/remote/non-Windows Graph acceptance.
- Zero Worker/Plugin/MCP activity is inferred from the absence of unexpected native inputs and tool calls, not from HTTP blocking alone — this is an explicit evidence gap.

No paid model or company-project checks were performed as part of publication. No Z8 work is included. This is a prerelease and is explicitly not Latest, not stable, not production-ready, not signed, and not Z8-complete.

[Installation and manual updates](https://github.com/dumpfordummy/ZCode/blob/main/docs/graph-engineering/WINDOWS_SETUP.md) · [User guide](https://github.com/dumpfordummy/ZCode/blob/main/docs/graph-engineering/pre-z8/USER_GUIDE.md) · [Human pilot checklist](https://github.com/dumpfordummy/ZCode/blob/main/docs/graph-engineering/pre-z8/HUMAN_PILOT_CHECKLIST.md) · [Publishing instructions](https://github.com/dumpfordummy/ZCode/blob/main/docs/graph-engineering/PUBLISH.md)
