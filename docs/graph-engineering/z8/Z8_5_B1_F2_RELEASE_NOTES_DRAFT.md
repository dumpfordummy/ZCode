# ZCode Graph 3.14.3-z8.306 — release notes draft

Publication preparation only. No release, tag or installer upload has been performed.

This candidate combines the integrated U1 run view and U2 Quick setup work with the B1-F1 duration correction and B1-F2 RunInfo correction. Quick setup uses explicitly reviewed, permissioned native Build/Test operations; the .NET fixture uses offline preparation, Build/Test --no-restore and Test --no-build.

The TRX parser now recognizes the pinned xUnit adapter's exact redundant assertion-failure diagnostic only when it maps unambiguously to one already validated failed result. Structured results remain authoritative. Unknown runner, testhost, abort and cleanup errors, mixed diagnostics, mismatched identities/counters/assemblies and stale or unbound evidence remain invalid.

A genuine failed assertion is retained as valid failing evidence: observationValid=true, outcome=fail, acceptancePassed=false. It does not become a successful test run. Existing historical .304/.305 records and reports are preserved without migration.

Build source: 203ecea873631e896a0db4031aa9934e9ef66d91. Any future distribution tag must identify this exact commit, even if the PR later gains report-only commits. Do not trigger a graph-v\* rebuilding workflow or substitute a rebuilt binary.

Prebuild verification: both retained original F1 failures replayed read-only with their own captured windows; 24 new regressions; both restrictive/permissive mutation controls; 133 focused and 470 integrated tests passed, with two explicitly reported optional skips in those suites; source native pass -> accepted failed assertion -> fresh recovered pass succeeded before packaging.

Packaged acceptance PASS: Quick Save/reopen with zero execution; real native three-pass -> two-pass/one-fail with valid failure receipt -> fresh three-pass recovery; representative U1 view at 1600x900 and 1093x640; ordinary native Chat. Configuration and prior run records unchanged; six distinct Build/Test operations and three fresh report identities. Final human approval remains pending.

Installer: ZCode Graph-3.14.3-z8.306-win-x64.exe; 149928073 bytes; SHA-256 45304d192e1939bbe4566a3587b82983f444c7763ea7eb9ae950e6836a1f5933. Content inspection: 147 raw / 147 precisely classified / 0 unexpected. ASAR record/header agreement and expected fuses pass. Installer, eight manifest components and all 86 detached files are byte-unchanged after acceptance. The two locale placeholder hits were classified externally by exact asset/literal/count; initial scan retained. .304/.305 installers, manifests and original failure evidence remain preserved.

Pilot scope: unsigned Windows x64 candidate. No Sandbox installer lifecycle or previous UX audit was repeated. The existing .303 pilot is not replaced. The representative U1 workflow retains its final human approval gate. New runner families and automatic historical reprocessing are outside this correction.
