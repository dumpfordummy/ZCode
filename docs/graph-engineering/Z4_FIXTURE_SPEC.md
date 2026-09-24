# Z4 native C# fixture verification

Status: implementation contract, 2026-09-24. This fixture validates Z4 only. It is a synthetic test executable, not an application sidecar, provider, agent engine, or replacement for ordinary native tools.

## Prerequisites and isolation

Read-only `dotnet --info` and `dotnet --list-sdks` confirmed `C:\Program Files\dotnet\dotnet.exe`, SDK 8.0.425 (also 9.0.311, 9.0.318 and 10.0.401), and .NET 8.0.31 runtime. The independent fixture suite then passed 7/7 checks with genuine compilation and processes; its current log is `.tmp/z4-fixture-checks/fixture-tests.log`. Pin SDK 8.0.425 with no roll-forward and target `net8.0`.

Use the existing `createIsolation` helper. All source, outputs, reports, HOME/USERPROFILE, APPDATA/LOCALAPPDATA, TEMP, DOTNET_CLI_HOME, NUGET_PACKAGES and MSBuild user-extension paths belong to its newly created profile. Supply an explicit private NuGet.Config with cleared feeds and no PackageReferences. Do not read installed NuGet configuration/caches, import credentials, install a toolchain, or restore from a remote package source. Disable CLI telemetry, first-run certificate generation, workload update notifications and persistent compiler/build servers within this process environment. Empty local Directory.Build.props/targets and Directory.Packages.props prevent ancestor project configuration discovery. Existing loopback-only proxy isolation remains active.

Only `scripts/graph-engineering/z4-*` and this specification belong to this work item. Shared isolation helpers require separate coordination before edits. The parent owns product contracts and builds; emitting typechecks and desktop bundling must not overlap.

The first genuine build exposed NuGet's Windows default-path initializer requiring `PROGRAMFILES(X86)` / `PROGRAMFILES`, which the minimal native test environment deliberately omitted. The fixture supplies private empty machine-program-files and machine-data directories rather than importing installed machine configuration. This follows the environment-derived paths in [NuGet's native configuration source](https://github.com/NuGet/NuGet.Client/blob/dev/src/NuGet.Core/NuGet.Common/PathUtil/NuGetEnvironment.cs). The initial failed build is retained in the fixture check logs.

A later fresh-compilation run exposed a fixture observer reading a partially written readiness receipt. The actual C# runner now writes a temporary file and atomically renames it before an observer can consume it. That failed run remains in `fixture-tests-readiness-race.log`; the corrected suite passed. Readiness proves a real process started, not that its assertions or report completed.

## Genuine C# test project

`Z4Fixture.csproj` builds a BCL-only console test executable with explicit compile items `MathOps.cs` and `Runner.cs`. No external test framework or package is required. This is accurately described as a C# assertion runner, not `dotnet test`, xUnit or MSTest.

The immutable runner executes three independently specified assertions:

| Required test name | Actual assertion          |
| ------------------ | ------------------------- |
| `add-positive`     | `MathOps.Add(2, 3) == 5`  |
| `add-negative`     | `MathOps.Add(-2, 2) == 0` |
| `add-zero`         | `MathOps.Add(0, 0) == 0`  |

Correct source returns `left + right`. Seeded faulty source returns `left + right + 1`, causing real failed assertions. A native Agent Task may read/edit MathOps.cs in the positive workflow; the runner remains unchanged and its digest is checked independently. A controlled model claiming PASS does not determine the assertions, report, native exit, or acceptance rule.

The Build fixture explicitly uses `--no-incremental` so stale-report setup cannot turn the required compilation into an up-to-date check. The native Test command executes the exact built `bin/Release/net8.0/Z4Fixture.dll`. The runner returns exit 0 only when its selected assertions pass, or when explicitly running the zero-test negative fixture. Failed assertions return exit 1. It writes an actual JSON file using this agreed format:

```json
{
  "format": "zcode-test-v1",
  "operationId": "native-operation",
  "sourceDigest": "captured-source",
  "buildDigest": "captured-build",
  "tests": [{ "name": "add-positive", "status": "passed" }]
}
```

The illustrative array above is not the accepted positive count. Positive evidence requires all three unique names, exactly three tests, no failures and no skipped required tests. Optional failure messages are plain data. Report identity/digest fields are native-owned fixed arguments, not model interpolation and not sufficient proof by themselves.

## Source, build and report provenance

Declared source paths are `Z4Fixture.csproj`, `MathOps.cs`, `Runner.cs`, `global.json`, `NuGet.Config`, `Directory.Build.props`, `Directory.Build.targets`, and `Directory.Packages.props`. Scope is those declared build inputs; it is not a claim to capture every workspace file. Build output paths are `bin/Release/net8.0/Z4Fixture.dll`, `bin/Release/net8.0/Z4Fixture.deps.json`, and `bin/Release/net8.0/Z4Fixture.runtimeconfig.json`.

The Host owns operation identity, exact argv/cwd, permission, lifecycle and artifact metadata. The existing native command service owns actual process execution and targeted cancellation. The fixture owns only its source and assertion/report code. Independent harness checks read genuine files and actual process results; they never write runtime databases or supply fake exit objects.

```mermaid
sequenceDiagram
  participant H as Graph Host
  participant N as Native command service
  participant C as Actual dotnet / C# process
  participant A as App-owned artifacts
  H->>H: Capture declared source fingerprint; persist operation intent
  H->>N: Exact configured Build recipe
  N-->>H: Separate native permission request
  H->>N: User permits exact operation
  N->>C: Start actual Build process
  C-->>N: Actual exit and bounded output
  H->>H: Recheck source and fingerprint declared build outputs
  H->>A: Persist exact Build evidence before Test
  H->>N: Test with operation/source/build/report placeholders
  N->>C: Start exact built assembly after native permission
  C-->>N: Actual exit; fresh report written by assertions
  H->>H: Recheck source/build; parse report and required names/count
  H->>A: Persist accepted or failed evidence before dependencies
```

Recipes use fixed configured argument arrays and the placeholders `{operationId}`, `{sourceDigest}`, `{buildDigest}`, `{reportPath}`. The fixed report path is declared inside the synthetic workspace; each captured report is bound to the exact native operation. The Test verifier compares the native operation, current source and build fingerprints, matching completed Build node, actual exit, bounded report identity and all required test names. The independent fixture harness also records before/after source and build fingerprints and reruns the unchanged runner outside the application. Matching checks at two instants do not lock unrelated editors or constitute an OS sandbox.

## Required native cases

| Case                 | Genuine process/artifact setup                                                               | Required outcome                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| A04 positive         | Actual native Build, then actual C# Test; independent runner agrees                          | Exactly three passed required tests with fresh matching provenance                           |
| A05 model claim      | Faulty source compiled; controlled Agent text says PASS; real C# Test executes               | Exit/report failure blocks success regardless of prose                                       |
| A06 zero             | Real runner `--zero` writes an empty result array and exits 0                                | No passing test evidence                                                                     |
| A06 missing          | Real runner executes assertions with `--omit-report`                                         | Missing expected output blocks success                                                       |
| A06 stale            | A real earlier invocation creates a report; later real invocation omits replacement          | Old operation/report cannot become fresh success                                             |
| A06 wrong source     | Real successful build followed by a source change; old built assembly still genuinely passes | Source/build mismatch blocks success                                                         |
| A06 wrong build      | Another genuine build replaces a declared binary output                                      | Build digest mismatch blocks success                                                         |
| A08 cancellation     | Real C# `--hold` writes an operation/PID readiness receipt, then waits                       | Exact owned operation cancelled; companion remains usable                                    |
| A08 lost reply/crash | Scoped test-only interception after real native start and before accepted metadata           | Actual start receipt survives; uncertainty blocks dependents and no automatic restart occurs |

For boundary fault injection, reuse the Z3 pattern: an exact-profile bootstrap wrapper loads a test-only metadata write hook before importing the unchanged Host bundle. A persisted checkpoint, native operation result/receipt and actual process-created file are evidence. A wall-clock sleep alone is not evidence. Never use process-name kills, guessed PIDs, synthetic accepted rows, or fabricated reports.

The lost-acknowledgement scenario pauses the accepted metadata write after the real native operation exists and is waiting for permission. Its earlier persisted `sending` intent already holds the operation/session identity. The Graph inspector cannot publish its new snapshot while that write is paused, and ordinary native Search filters this session because it contains no input. The test therefore invokes the already-mounted Graph panel's existing `onOpenConversation` callback, supplied by `WorkspaceShellLayout.handleSelectTaskInChat`, with the exact persisted target. This is a disclosed harness navigation seam, not a new product API. It asserts the visible native pane's session ID, grants its actual permission through the ordinary UI, observes the actual C# operation/PID readiness receipt, and closes only its owned app. Reopening uses the normal bootstrap and must retain uncertainty without another native start. The separate interruption scenario waits for both a real process receipt and persisted running state before closing/reopening. These are controlled test interruptions, not evidence of an uncontrolled user crash.

The synthetic-redaction fixture places a freshly generated value only in `Z4_FIXTURE_SECRET` in the owned process environment. A fixed C# flag emits it to stdout/stderr; the recipe names that environment variable for native redaction. No installed secret store is read or modified. Native operation, artifact preview and exported manifest must omit the value. The strict-output HTML case retains literal markup in text; the native page must create no corresponding DOM element or handler execution.

## Reproducible entry points

Run from the checkout using its approved Node/pnpm environment. The parent must complete its coordinated CLI/desktop builds before native runs.

```powershell
node --test scripts/graph-engineering/z4-fixture.test.mjs
node scripts/graph-engineering/z4-native-smoke.mjs --scenario=build-only
node scripts/graph-engineering/z4-native-smoke.mjs --scenario=complete
node scripts/graph-engineering/z4-native-boundaries.mjs --scenario=crash
node scripts/graph-engineering/z4-native-boundaries.mjs --scenario=lost-ack
node scripts/graph-engineering/z4-launch-manual.mjs
```

Other main native scenarios are `model-pass`, `zero`, `missing`, `stale`, `wrong-source`, `wrong-build`, `cancel`, `redaction`, `json-field`, `json-whole`, `json-invalid`, `json-oversized`, `json-html`, and `tool-agent`. The last case binds the actual Test artifact as a whole value into a fresh native Agent Task, verifies the exact SQLite input/session attribution, and leaves model opinion separate from machine evidence. Each automated entry creates its own synthetic profile and uses only loopback controlled providers where an Agent Task is required. The manual launcher instead configures no provider and sends no input; it prints explicit editor/recipe/independent-test/reopen instructions. It intentionally permits a provider connection for the user's later explicit manual checks. Its `--profile` path must be an existing marked manual profile directly below this checkout's `.tmp`.

For manual recipes, copy the readonly Build node ID from the Tool editor and run `z4-manual-recipes.mjs --profile "<printed profile>" --build-node-id "<copied Build ID>"`. The helper only prints the recipe array for normal project configuration UI. After a saved run, `--verify` independently executes the unchanged C# runner in the private .NET environment; no model is involved. Reopening the launcher reapplies only process environment isolation and preserves source, tests, settings and recipes.

The automated setup-only mode is `z4-launch-manual.mjs --verify-setup`; repeat with the printed `--profile` and `--verify-setup` to verify preservation. It submits no work and configures no provider. It records source/config/sentinel hashes, compares the complete reopened settings object and retains actual settings byte hashes. It captures the existing native window without resizing: the first helper reused a screenshot utility that resized the window and consequently changed native geometry settings, so that failed assertion remains recorded. The corrected final-bundle setup/reopen checks both passed with zero native inputs/model requests and identical reopened settings bytes. This does not count as a user-operated project/provider check.

Actual automated results are 7/7 independent C# fixture checks, 16/16 main native scenarios, and 2/2 native interruption boundaries. The final setup/reopen checks also passed. Sanitized summaries and unedited native screenshots are under `evidence/z4/native`; that directory retains the actual passing and failing C# report bytes, with operation/source/build identity, alongside the intermediate failed native attempts. All model traffic used controlled loopback responses. The standard complete case independently reran all three assertions outside the app and confirmed the runner remained unchanged.

Unit/fixture results, actual native UI/Host results and user-operated provider/project checks remain separate. User-operated checks remain NOT RUN unless supplied. Raw reports and synthetic output stay local; artifact export checks must exclude raw private content by default. No repository staging, publication, installed-app overwrite, or Z5 work is authorized.
