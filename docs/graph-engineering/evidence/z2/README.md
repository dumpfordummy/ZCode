# Z2 evidence

These artifacts were collected on Windows from this checkout's synthetic profiles and workspaces. No installed credentials or company source are included. They document controlled-provider native execution, not user-operated real-provider acceptance.

- `baseline/`: commands run before product edits, including failing CLI lint and whole-repository formatting.
- `checks/`: final source checks/build logs and normalized baseline comparisons. `.txt` preserves command output without depending on ignored `.log` files.
- `native/`: actual Electron/Host/CLI results, screenshots, frozen metadata, native input ledgers, tool output and independent tests. `index.json` maps retained case names to original command logs and synthetic profile paths. JSON indentation may be normalized for repository formatting; field values are preserved.
- `native/complete/`: the primary Analyze → Implement → Verify mapping used by the report, real fixture diff and independent test. The before/after `.mjs.txt` files preserve the actual sample bytes as evidence, not application source.
- `native/question/` and any detail rerun: separate fresh handoff marker and native AskUserQuestion case. Each case has its own fresh profile and IDs; screenshots across cases must not be treated as the same run.
- `native/recovery/`: terminal metadata fault, refusal while active, and explicit confirmed-inactive release. The saved run remains Interrupted and the final task is not submitted.
- `native/manual-setup/`: actual manual-launcher setup/reopen only, with zero initial native inputs and no configured provider. U01/U02 remain NOT RUN.
- `failures/`: retained failed invocations and corrections. A test-harness locator or launch-environment failure is distinguished from a product defect in the report.

Screenshots are original native window captures; they are not composited or edited. Original detailed ignored logs/profiles remain at the paths recorded in the summaries on the implementation machine. See [Z2_REPORT.md](../../Z2_REPORT.md) for commands, exact claims, limitations and the verification matrix.
