# ZCode Graph 3.14.0-z7.6 — Pre-Z8 Usability Preview (Windows x64)

This prerelease completes the corrected Sequential Engineering reviewer contract and the accompanying run/design clarity improvements. The built-in generic Sequential Engineering template is **version 2**; new instantiation pins it explicitly, while historical saved definitions and runs are preserved unchanged. Graph continues to use ZCode's existing native agent/session services, native Build/Test tools, and the existing native permission model. Conversation links open the actual existing sessions; native Chat, permissions, questions, configuration and history retain their existing owners.

## Reviewer contract in this prerelease

- **Reviewer receives the original request plus the current Test verification.** Only the explicitly bound verification artifact ID is permitted as an evidence reference; a nested `reportArtifactId` does not establish a binding.
- **Strict JSON output remains strict.** The reviewer must return exactly one schema-valid JSON object. Prose or fenced output is rejected as invalid output, distinguishable from a valid reviewer outcome.
- **Valid `needs_changes` and `needs_human` remain valid review outcomes** that complete the reviewer attempt with valid output and reach the final human gate. Invalid output fails the reviewer attempt and routes the run to NeedsHuman without that gate. These are different facts despite similar labels.
- **A genuine failed Test cannot become a passing reviewed workflow.** The generic template stops on a failed machine Test before reviewer dispatch; the run routes to NeedsHuman with no reviewer session and no final-gate request.
- **Declared untracked/ignored local source does not automatically fail review.** Declared local source fingerprints use file paths and bytes; ignored/untracked source is valid when the selected check declares it. Git tracking is not a universal acceptance criterion.
- **Historical saved definitions and runs are preserved.** Built-in generic Sequential Engineering version 2 is selected explicitly for new instantiation; old built-in-version pins fail explicitly rather than silently changing meaning. Existing inline saved definitions and run history are not rewritten or silently migrated.
- **Reviewer "do not run commands" wording is prompt guidance**, not an enforced tool-capability boundary. Native reviewer requests contain ordinary tool definitions; no new permission model or Build/Test permission-policy change was introduced. Build/Test continue to use the existing native manual permission prompts.

## UX clarity improvements

- **Workflows**: the task request is shown separately from Context. Context lists only explicitly selected document/instruction/skill references, with an empty-state label otherwise. Saved Build/Test check names carry saved/not-run wording — they are configuration and do not imply execution. The run button uses the existing translated `graph.run` action.
- **Project setup**: a saved-check list and a single focused editor; editing/restoring a check preserves the other check and the Build recipe association.
- **Design**: readable minimum zoom (0.85) with a selection-centered viewport that responds to actual node measurements and canvas dimensions. Saved positions/topology are unchanged; users pan the long graph instead of shrinking every label. The selected node stays visible after mode/tab/window-size transitions.
- **Runs**: the workflow name is distinct from the actual captured request, with expandable raw input retained. Runs distinguishes machine-evidence problems, reviewer-output validation failure, valid reviewer outcomes (`pass`/`needs_changes`/`needs_human`), and the final human decision. Actionable approval/failure states do not show "No action required." Reviewer output summaries select only the current iteration's exact attempt and use its persisted validation result.

These are Renderer projections and harness/test-organization changes; no service state owner, permission model, or runtime contract was added or weakened.

## Verification performed

Acceptance was performed on the accepted source (Codex native reviewer closeout, 2026-09-28), integrated into `main` through the Graph pre-Z8 handoff with byte-identical product source. The happy path remains at **Final human review / WaitingForApproval**; it was not approved to manufacture a Completed result.

### Codex controlled-provider/native acceptance

Six native reviewer scenarios, each on a fresh isolated profile/workspace with **genuine native Read/Edit and Graph Tool Build/Test execution**; only model responses came from a controlled loopback provider. Every scenario exited 0.

1. **Happy pass** — Test 1 passed / 0 failed; reviewer Completed/valid `pass`; final human gate `WaitingForApproval`, no decision.
2. **Prose + fenced JSON** — reviewer Failed; `outputValidation` invalid (strict JSON error); run NeedsHuman; no final-gate request.
3. **Embedded unbound report reference** — reviewer Failed; evidence reference rejected; run NeedsHuman; no final-gate request.
4. **Valid `needs_changes`** — reviewer Completed/valid; final human gate pending; no parser alert.
5. **Valid `needs_human`** — reviewer Completed/valid; final human gate pending; no parser alert.
6. **Genuine Test failure** — native Edit left wrong content; real Test exit 1 with one failed assertion; Test attempt Failed; run NeedsHuman; no reviewer session/provider request and no final-gate request.

Passing these controlled scenarios proves native integration and validation behavior, not live-model adherence.

### Accepted .NET native regression

System SDK **8.0.425** (fixture `global.json` pins 8.0.425, `rollForward: disable`); no SDK/package install or framework change. Native VSTest result: **4 discovered / 3 passed / 0 failed / 1 skipped**. The TRX redaction proof was corrected in the harness — VSTest adds absolute assembly paths even for synthetic source, so the proof now classifies original generated bytes independently of product redaction output, while still asserting redaction/validation/digest consistency and user-path removal. **Product redaction behavior was not weakened.** The initial run's harness assertion failure is retained as evidence; the corrected run passed.

### Automated counts (frozen accepting build)

- Graph services: **360 passed / 0 failed / 0 skipped**.
- Graph UI: **118 passed / 0 failed / 0 skipped**.
- U2 proof/fixture + z6 response helper tests: **19 passed / 0 failed / 0 skipped**.
- Lint: **75 warnings / 0 errors**.
- Architecture: **0 violations; `exceptions: []`** (no threshold/baseline weakening).
- Root typecheck: exit 0.

### Pre-release packaged smoke

Detached packaged smoke against the locally built z7.6 installer (packaged identity `name: ZCode Graph`, `isPackaged: true`, version `3.14.0-z7.6`, Graph profile paths): all 11 cases passed — ordinary Chat, no-provider, Z1 literal compatibility, and eight Z2 scenarios (complete, question, cancel-question, cancel-permission, cancel-progress, restart-interrupted, restart-permission, persistence-recovery). These use actual native tools and controlled loopback providers in disposable profiles; no paid/live provider task was run. This is receiving-machine controlled smoke against the local pilot installer; GitHub CI runs its own packaged smoke against the freshly built installer.

### User-operated live-model manual pilot

**User-operated live-model manual pilot: PASS** through the disposable Sequential Engineering Node workflow, after the correct ZCode Graph z7.6 local package and a clean manual Node workspace were prepared. This is one user-operated manual pilot with a live model, recorded as manual acceptance. It is not an automated cross-provider conformance test, and it does not guarantee that every model/provider will follow the reviewer prompt. No provider/model name, run ID, latency, token counts, or screenshots are claimed beyond the user's PASS report.

## Known limitations

- This remains an **unsigned prerelease**: not Latest, not stable, not production-ready, not signed, and not Z8-complete. Windows x64 publication only.
- No code-signing reputation qualification. No broad provider/model matrix. No non-Windows/mobile qualification. No Z8 work.
- Build/Test continue to require the **existing native manual permission prompts**. Run-scoped Build/Test preauthorization is not implemented; it is a future UX/security-policy topic. Do not describe it as available.
- Reviewer "do not run commands" wording is prompt guidance; there is no structural reviewer tool-capability restriction.
- Fork/Join export/import remains unsupported (Z7-A12). The portable workflow library exports only the sequential definition; it does not transfer parallel branch topology, concurrency, Join semantics, or integration configuration. Do not use sequential export as a backup or transfer of a Fork/Join plan.

## Installation

Download the Windows x64 `.exe` installer and compare its SHA256 hash with `SHA256SUMS.txt`. GitHub normalizes the installer filename from `ZCode Graph-3.14.0-z7.6-win-x64.exe` to `ZCode.Graph-3.14.0-z7.6-win-x64.exe`; the file bytes and hash are unchanged. No Git checkout is needed to install. Each user supplies their own model provider configuration and project development tools.

The separate **ZCode Graph** app uses `%USERPROFILE%\.zcode-graph-engineering`, with a private home for the application and its tools. It does not copy an existing ZCode/Codex profile, take over the upstream URL handler/Explorer menu, or install upstream updates. Existing Graph users update manually by downloading and running this newer Graph installer. App auto-update remains disabled.

## NOT RUN for this release

- Packaged Z3–Z7 native acceptance beyond ordinary Chat / Z1 / Z2 (CI runs those packaged smoke cases only).
- A second physical PC/clean VM; installer upgrade/uninstall; code-signing reputation.
- Real Windows OS file dialog ergonomics (native tests use a controlled dialog seam, not real pickers).
- Mobile/remote/non-Windows Graph acceptance.
- Automated cross-provider reviewer conformance (one user-operated live-model pilot passed; not a matrix).
- The full unrelated pre-Z8 regression matrix and Z8.

No Z8 work is included. This is a prerelease and is explicitly not Latest, not stable, not production-ready, not signed, and not Z8-complete.

[Installation and manual updates](https://github.com/dumpfordummy/ZCode/blob/main/docs/graph-engineering/WINDOWS_SETUP.md) · [User guide](https://github.com/dumpfordummy/ZCode/blob/main/docs/graph-engineering/pre-z8/USER_GUIDE.md) · [Human pilot checklist](https://github.com/dumpfordummy/ZCode/blob/main/docs/graph-engineering/pre-z8/HUMAN_PILOT_CHECKLIST.md) · [Publishing instructions](https://github.com/dumpfordummy/ZCode/blob/main/docs/graph-engineering/PUBLISH.md)
