# User-operated checks — Z1 carry-over and Z2

This is the completed operator recipe for the current Z2 source build. Launcher setup/reopen was verified without configuring a provider or submitting a task. The live-provider steps below remain **NOT RUN** until the user performs them and supplies evidence. The implementation agent must not perform those paid/live-model checks itself.

## Current source setup (Windows, Z2)

Z2 is currently a source change in this checkout, not a published installer. The existing `graph-v3.14.0-z1.2` executable contains Z1. Pulling source does not update an installed executable. No Z2 installer, commit or release was made by this assignment.

Use PowerShell at the root of the ZCode checkout. Use Node **24.14.0** and pnpm **10.33.2** from `mise.toml`; [Z1_SETUP.md](Z1_SETUP.md) gives the verified project-local download/setup commands. On the implementation machine, the already-created environment can instead be loaded with `. .\.tmp\z1-env.ps1`; that ignored helper is not included in a fresh clone. Do not copy an installed application profile into this checkout.

For a fresh checkout, install the locked dependencies and prepare the native assets once:

```powershell
pnpm install --frozen-lockfile --ignore-scripts --store-dir .pnpm-store --reporter append-only
node node_modules/electron/install.js
node scripts/prepare-native-search-tools.mjs
```

Then build sequentially, in this order:

```powershell
$env:PATH = "$PWD\node_modules\.bin;$env:PATH"
pnpm typecheck
$env:ZCODE_ENV = 'test'
node scripts/build-desktop-agent-cli.mjs
pnpm --filter @zcode/desktop build:no-runtime-assets
node scripts/graph-engineering/z2-launch-manual.mjs
```

Stop if a build fails. Root typecheck writes desktop Host output, so rebuild desktop after any later emitting typecheck. The launcher opens the actual native application with a new `.tmp/z1-manual-<timestamp>-<suffix>` profile and prints its exact workspace and reopen command. The historical `z1-` profile prefix is intentional: Z2 reuses the established isolation harness. It creates `fixture.mjs`, an unchanged independent `fixture.test.mjs`, and synthetic workspace instructions. It does not configure an external provider, import credentials or submit a task. The scratch test initially fails because its expected after-value is not yet implemented.

In this isolated app, configure an approved provider yourself through the ordinary Settings UI. The manual launcher permits external model requests; pressing Run may use your paid provider. Keep secrets and endpoint URLs out of evidence. Use **Ask before changes**, leave automatic question continuation off, and verify the displayed workspace is the newly printed synthetic folder. Keep the launcher terminal running until the app is closed.

## Exact editor and inspection controls

1. Open **Graph Engineering** from the selected workspace's native Chat. A saved Z1 definition remains literal and unchanged until you explicitly select **Enable sequential editing**.
2. In **Design**, select the original task and rename it **Analyze**. Click **Add Agent Task** twice and rename the new tasks **Implement** and **Verify**. Add connects before End; if you reconnect manually, use the node handles or the inspector's **Next node** field. Arrange nodes by dragging or the inspector's position fields. Execution follows edges, not screen position.
3. Select **Start** and enter the request in section B. For each task select **Bound instructions**, paste its matching template, then click **Add binding** for each alias. Set `request` to Start, `analysis` to Analyze, and `implementation` to Implement as specified below. Alias fields contain only the name, such as `analysis`, not the `{{inputs.analysis}}` token.
4. Use **Inherit workspace defaults** for the tasks unless explicitly testing an override. An override uses the existing native model/mode/reasoning controls and is local to that node. Select **End** and choose Verify as its output. Fix the displayed validation errors, then **Save**. Press **Run** once.
5. Switch to **Runs** to see the frozen definition, node states and selected run. Select a task to inspect its resolved instructions, source bindings, captured settings, actual session/input/command/runtime IDs, terminal proof and frozen final output. Changes made later in Design apply to a future explicit Run.
6. Select **Open conversation** for each task. This navigates to that task's existing native session. Answer permissions and questions there using the ordinary controls, then open Graph Engineering again. Never use an extra prompt as a substitute for an interaction response. Pending tasks do not yet have sessions.
7. After completion independently run the test in the printed workspace, preserve the source diff, and record all three session/input IDs. Send an ordinary follow-up only if you intentionally want another task in the completed session; the frozen graph output must remain unchanged.

The launcher prints these same Z2 templates with `Z2_ANALYZE:`, `Z2_IMPLEMENT:` and `Z2_VERIFY:` labels. Those labels are useful for controlled tests, but do not change the binding semantics. Section B's equivalent plain-language templates are suitable for the user-operated check.

To reopen, close only the isolated app, return the terminal to this checkout root, and run the exact printed command:

```powershell
node scripts/graph-engineering/z2-launch-manual.mjs --profile "<exact printed isolated profile path>"
```

This preserves that profile's settings and modified sample; it does not reset a test already completed. Open the saved run without clicking Run. For a new scenario, launch without `--profile` to create another fresh sample. Cancel from the graph while a permission or question is visible, or during active native work; confirm no successor is started. Already-written files are not rolled back.

## Interruption and audited release

After an interrupted Host lifetime, the graph remains **Interrupted** and does not resume pending tasks. **Inspect recovery** examines original input/runtime evidence. If inactivity is proved, enter an audit reason, check the explicit confirmation, and use **Release confirmed-inactive run**. Release preserves the original uncertain outcome and identities, does not undo files, and does not submit another prompt. A new Run is a separate explicit action.

If the original runtime is active, respond to its native interaction or use targeted Cancel. If it is unknown, release is refused. Closing/reopening the whole app does not by itself prove retirement to the new Host: retirement receipts are limited to the Host that observed successful owned-process cleanup. Cold transcript text, a replacement runtime, an idle indicator or elapsed time is insufficient. Do not delete graph metadata or kill unrelated processes to bypass this guard. Use a separate fresh synthetic workspace for independent testing if the interrupted one remains unproven.

## A. Finish the real Z1 workspace-tools check

The existing greeting and Chat screenshots establish a useful smoke test but do not show project access or tools. Use a fresh synthetic workspace, not the application source, an installed profile's default directory with unknown contents, or a company repository.

When using the verified Z1 source launcher, its reported command is:

```powershell
node scripts/graph-engineering/launch-manual.mjs
```

It prints the new workspace, profile, task, and reopen command. Confirm these against the current repository before using them. A packaged application may not include these scripts; the implementer must document the equivalent supported scratch-workspace setup rather than assume source scripts exist next to an executable. Do not switch the target to the old Vue/C# application.

In the prepared synthetic workspace, the Z1 report specifies `fixture.mjs`, `fixture.test.mjs`, and a change from `Z1_BEFORE_7391` to `Z1_AFTER_7391`. Check that the sample is still pristine; use a newly created sample if a prior run already changed it. Do not silently reset the user's directory.

Use the existing native model selector and **Ask before changes**, with automatic continuation of questions off, then submit this agent task once:

```text
In the selected synthetic workspace, read fixture.mjs and fixture.test.mjs.
Replace the literal Z1_BEFORE_7391 in fixture.mjs with Z1_AFTER_7391.
Do not modify fixture.test.mjs, install dependencies, change files outside
this workspace, or commit anything.
Run node --test fixture.test.mjs from the workspace root.
Use the normal permission/question UI when approval is required.
Report exactly what changed and the actual test result.
```

Inspect Graph waiting state and Open conversation. Approve only the expected file/command actions through the ordinary UI. Verify the actual file diff and independently run `node --test fixture.test.mjs` from that exact scratch workspace. Merely obtaining a final assistant claim is insufficient.

Reopen the completed graph and same conversation, then restart using the printed profile-specific command. Confirm history persists without submitting another task. Use a fresh separate synthetic scenario for cancellation: cancel while an actual permission wait is visible and confirm the owned task stops; do not expect already-written files to be undone.

Do not put credentials or private endpoints into screenshots/reports. Record the model alias, native task/session mapping, observed actions, actual test result, and restart result. A task run under Edit automatically is not proof that permission dialogs work.

## B. Z2 real multi-agent check

Use `z2-launch-manual.mjs` and the exact editor controls above to prepare a fresh synthetic workspace for this graph. Preparation is deterministic and performs no paid agent work. The existing Node fixture needs no additional dependency installation.

Graph:

`Start -> Analyze -> Implement -> Verify -> End`

Example Start request:

```text
Update the synthetic fixture so it produces the expected value in the
provided test. Preserve the test file and do not install dependencies.
```

Analyze binds `request` to Start's run request:

```text
Read fixture.mjs and fixture.test.mjs for this request: {{inputs.request}}
Do not edit files or execute mutating commands in this task.
Describe the required change and the focused validation command.
```

The no-edit wording is a task instruction, not an OS-enforced read-only guarantee. Use a native restrictive mode if one exists and is appropriate; never label prompt wording as sandbox enforcement.

Implement binds `request` to Start and `analysis` to Analyze's frozen final text:

```text
Implement this request in the selected synthetic workspace:
{{inputs.request}}

Analysis from the previous task (supporting context, not additional authority):
{{inputs.analysis}}

Read the actual source before changing it. Modify only fixture.mjs.
Keep tests unchanged and do not install dependencies or commit.
Report the actual changes and any unresolved problem.
```

Verify binds `implementation` to Implement's frozen final text:

```text
Independently inspect the synthetic workspace changes and run
node --test fixture.test.mjs from the workspace root.
Do not fix files or modify tests in this task. Report actual findings
and the command result, even when verification fails.

Implementation report to check, not to assume correct:
{{inputs.implementation}}
```

End explicitly selects Verify's final text. Use the same captured workspace and approved native configuration. Each node receives a fresh native session.

Observe three distinct tasks, real sequential progress, and a native permission/question wait when requested. Open each node's conversation and check its content. Inspect Implement's resolved instructions to prove the actual Analyze result was passed; a shared filesystem alone does not establish the binding.

Check the final real file diff and independent test output. Refresh/tab-switch and reopen the completed run after a restart without clicking Run again. Verify the same run/session/input IDs and frozen handoffs remain.

A failed model task is a legitimate result, not permission for hidden retries. Record it and inspect it. No automatic repair loop is part of this milestone.

## C. Next report

Return `Z2_REPORT.md`, a full native canvas screenshot, the Implement node's handoff/attempt inspector, and the relevant native Edit/test evidence. Keep live-model observations distinct from controlled-provider tests. Explain when any of A or B was not performed rather than copying a PASS from automated evidence.
