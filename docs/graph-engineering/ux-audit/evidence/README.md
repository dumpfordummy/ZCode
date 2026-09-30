# UX-M1.4 Windows acceptance: evidence index

Concise, reviewed evidence for [UX_M1_WINDOWS_REPORT.md](../UX_M1_WINDOWS_REPORT.md). Everything ran on one Windows 11 machine in the real Electron app with a controlled loopback provider and disposable workspaces. Raw logs, per-run receipts and about 150 further screenshots stayed local.

| File                         | What it is                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `build-identity.json`        | tested source commit, tool versions, sha256 of the CLI/runtime and Desktop artifacts, provenance (fresh versus reused) |
| `final-results.json`         | every command of the final pass with its real exit code and duration                                                   |
| `reviewer-outcomes.json`     | the six reviewer scenarios as persisted (test result, reviewer validation, decision, final gate)                       |
| `historical/*/summary.json`  | summaries of the historical drivers that were run (PASS and the three BLOCKED ones with their first failing assertion) |
| `defect-preserved/README.md` | the confirmed defect (a failed Save checks shown beside Review and run)                                                |
| `screenshots/`               | 12 native screenshots, each opened and inspected before upload                                                         |

The screenshots show the local worktree path and Windows user name in the app header (synthetic data only, no credentials).

The user's statement that their manual test runs passed is recorded in the report; it is not backed by files here.
