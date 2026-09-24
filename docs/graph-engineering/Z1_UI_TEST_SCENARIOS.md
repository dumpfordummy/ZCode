# Z1 native UI scenarios

These are executable operator scenarios for the isolated desktop application, not a claim that they have all passed. See Z1_REPORT.md for actual execution results and screenshots. No scenario permits a paid task or a real company workspace. Use the controlled provider fixture where available; the real-provider scenario belongs to the user.

## Editor and navigation without a provider

1. Start the isolated application using the report's exact commands and select the synthetic workspace.
2. Select **Graph Engineering** (`data-testid="graph-engineering-open"`). Confirm the existing workspace sidebar and shell remain visible.
3. Confirm Start → Agent Task → End on `graph-canvas`; confirm the displayed workspace is the selected synthetic directory.
4. Change `graph-name`, the Agent Task name and `graph-instructions`. Drag the task node, or focus it, press Enter or Space to select it, then use arrow keys. Click `graph-save`.
5. Click Back to chat, then Graph Engineering. Confirm the three text values and positions survive reopening. Confirm there are no runs, no new session and no submitted prompt.
6. With no model configured, confirm `graph-run-button` is disabled and existing Model settings is the offered configuration path. Do not run a connectivity check or supply credentials during automated verification.
7. Confirm the requirement to disable automatic AskUserQuestion answers is explained and linked to General settings. Merely opening the graph must not change this setting.
8. Repeat at a narrow viewport, with keyboard navigation, and in light/dark themes. Confirm labels, controls, status text and canvas remain readable.
9. On a remote workspace, confirm an explicit local-only message and no local graph-service command for the remote path.
10. With a controlled delayed graph save/run response, switch to a second synthetic workspace and edit/save there. The second editor must not remain disabled after the first response or have its own pending state cleared by that response.

## Controlled native attempt and conversation parity

1. Configure the controlled native fixture according to the report; make no live model calls. Use the normal new-chat model and permission selectors, then inspect the graph selectors for the same values.
2. Give the graph a uniquely identifiable synthetic instruction and click Save and run once. A same-frame second click must not create another native session/input.
3. Read `graph-run` attributes `data-session-id` and `data-input-id`. Expand Native session and frozen configuration to inspect captured workspace, model, mode, instructions and command ID.
4. Switch to ordinary chat and return. Confirm the attempt progresses without another dispatch.
5. Click `graph-open-conversation`. Compare the native `[data-testid^="v4-session-pane-"]` element's `data-session-id` attribute with the graph's stored session ID. Confirm the existing history/tool renderer appears and no new task or prompt is submitted.
6. While the graph owns an active or unresolved attempt, confirm the `graph-input-owned` explanation and disabled composer, model, reasoning and permission/plan selectors. Confirm inline input edit/retry is unavailable, including a picker opened before ownership became visible. Native permission/question dialogs must remain interactive.
7. For waiting fixtures, answer through those native dialogs and confirm only the matching attempt leaves its waiting state.
8. Cancel the attempt and confirm the graph waits for native cancellation evidence. An unrelated synthetic session must remain available.
9. For a completed attempt, inspect actual tool/file/test evidence in the same conversation. Confirm the UI says input completion is not independent proof of task correctness.
10. Reopen the completed conversation and continue it after the graph releases ownership. Confirm the graph's original result and input ID stay frozen.
11. Restart the isolated app. Confirm persisted terminal proof remains visible and an unresolved attempt is conservative, with no automatic replay.

## Focused source-layer tests

Automation must wait for the native Save acknowledgement: the name input is enabled again, the status reads Saved, and Save is disabled because there are no pending changes. Save being disabled alone also occurs while the Host request is pending and is not acknowledgement. After Enter selects a canvas node, wait for its selected state before sending an arrow key. Retain failing scenario summaries/screenshots before terminating packaged acceptance; do not increase timeouts or bypass publication gates to hide a missing state transition.

```powershell
. .\.tmp\z1-env.ps1
node node_modules/tsx/dist/cli.mjs --test packages/ui/test/graphEngineeringView.test.ts
```

These tests cover local/remote scope classification and preservation of frozen native navigation identity. They are not a browser rendering test, native Electron smoke result, or runtime execution proof. Host lifecycle/dispatch tests and the native screenshots are recorded separately.
