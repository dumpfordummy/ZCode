# Native Graph Engineering Z1 — Windows x64 prerelease

This fork adds **Graph Engineering** to ZCode: Start → Agent Task → End using the same native agent/session services as Chat. **Open conversation** opens the exact session belonging to the attempt. Native permissions, questions, cancellation and conservative restart recovery are preserved.

Download the `ZCode Graph-<version>-win-x64.exe` installer and verify it against `SHA256SUMS.txt`. There is no need to clone the source to install. Model credentials and project development tools are supplied by each user.

The separate **ZCode Graph** app uses `%USERPROFILE%\.zcode-graph-engineering`, with a private home for the application and its tools. It does not copy an existing ZCode/Codex profile, take over the upstream URL handler/Explorer menu, or install upstream updates. Use personal provider settings; upstream account OAuth callbacks are not covered. This is an **unsigned prerelease**.

The release workflow checks TypeScript, lint, architecture, distribution unit tests and the detached packaged app against a local provider fixture. Real native tools run in a synthetic workspace. Paid providers, a second physical PC/clean VM, installer uninstall/upgrade behavior and signing reputation remain **NOT RUN** unless explicitly recorded otherwise in the distribution report. Full-workspace formatting and supplemental CLI lint have documented preexisting failures.

[Installation, source build and manual test instructions](https://github.com/dumpfordummy/ZCode/blob/main/docs/graph-engineering/WINDOWS_SETUP.md) · [Z1 implementation report](https://github.com/dumpfordummy/ZCode/blob/main/docs/graph-engineering/Z1_REPORT.md) · [Distribution report](https://github.com/dumpfordummy/ZCode/blob/main/docs/graph-engineering/WINDOWS_DISTRIBUTION_REPORT.md)

Z2 and the separate Vue/C# prototype are outside this release.
