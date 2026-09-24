# Z7 setup and verification

Z7 adds the optional **Fork / Join** mode in the existing Graph Engineering tab. The implementation contract and ownership diagram are in [Z7_SPEC.md](Z7_SPEC.md). No `Z7_REPORT.md` is required by the current instruction. No Z8, release, installer overwrite or repository publication is included.

Recorded acceptance results and exact native identities are in [verification.json](evidence/z7/verification.json), with the [timing/resource experiment](evidence/z7/experiment.json) and [baseline diagnostic comparison](evidence/z7/checks/baseline-comparison.json). Each native scenario has its own retained records and screenshots under `evidence/z7/native/`.

The subsequently requested Fork/Join export/import requirement **Z7-A12 fails**: the existing portable library transfers only the sequential definition. See the [portability audit and reproduction instructions](evidence/z7/portability/README.md). Earlier native execution checks do not establish portability, and the full expanded acceptance set is not complete.

## Local prerequisites

Use the existing checkout and dependency installation. Required for the recorded Windows fixture: Node **24.14.0** (`mise.toml`), pnpm **10.33.2**, Git, the installed repository dependencies including Electron/Playwright, Git Bash on PATH for native Bash, and .NET SDK **8.0.425**. The C# program is only an independent synthetic test project; the feature does not add a C# runtime or sidecar to ZCode. Fixture builds use an empty NuGet package source configuration and private CLI/cache directories.

From the repository root, if this checkout still has its isolated toolchain helper:

```powershell
. .\.tmp\z1-env.ps1
$env:PATH="$PWD\node_modules\.bin;$env:PATH"
node --version
pnpm --version
dotnet --list-sdks
```

On another development checkout, place the matching tools on that terminal's PATH and use its existing dependency installation. The `.tmp` helper is local and is not a tracked prerequisite. Do not copy an installed application's data or credentials into a test profile.

Build in this order; emitting typecheck and desktop bundling share generated outputs:

```powershell
node scripts/check-workspace-freshness.mjs
pnpm typecheck
pnpm --dir apps/zcode-cli typecheck
pnpm --dir apps/zcode-cli build
pnpm --filter @zcode/desktop build:no-runtime-assets
```

## Automated native checks

Each command creates a fresh `.tmp/z1-native-*` profile and synthetic Git repository. Only that new fixture gets a seed commit. The harness owns Electron startup/shutdown, supplies a loopback controlled provider and minimal private environment, clicks actual native permissions, and uses real native Read/Edit/Bash and Build/Test operations. It retains the profile, Graph records, native input ledger, reports and screenshots for inspection. It never uses the installed ZCode profile.

```powershell
node scripts/graph-engineering/z7-native-smoke.mjs --scenario=complete
node scripts/graph-engineering/z7-native-smoke.mjs --scenario=complete --concurrency=1
node scripts/graph-engineering/z7-native-smoke.mjs --scenario=conflict
node scripts/graph-engineering/z7-native-smoke.mjs --scenario=failure
node scripts/graph-engineering/z7-native-smoke.mjs --scenario=restart
node scripts/graph-engineering/z7-native-smoke.mjs --scenario=combined-failure
```

Run the two complete scenarios separately for a timing comparison. Read each printed `home` directory's `z7-summary.json`; exit zero and `status: PASS` establish that scenario's assertions. `combined-failure` passes only when actual integrated tests fail and final approval is blocked. These controlled responses establish native integration behavior, not live-model quality or cost. A permissioned desktop environment is required: the sandbox used during development could not start Electron's renderer, so only these isolated launch commands were run outside it.

Source and repository verification:

```powershell
$graphTests=Get-ChildItem packages/services/src/graph-engineering -Recurse -Filter '*.test.ts' | Select-Object -ExpandProperty FullName
$gitTests=Get-ChildItem packages/services/src/git -Recurse -Filter '*.test.ts' | Select-Object -ExpandProperty FullName
node --import tsx --test @graphTests @gitTests
$uiTests=Get-ChildItem packages/ui/test/graph*.test.ts | Select-Object -ExpandProperty FullName
node --import tsx --test @uiTests
node --test scripts/graph-engineering/*.test.mjs
pnpm lint
pnpm --dir apps/zcode-cli lint --continue
pnpm fmt:check
pnpm architecture:check --changed
```

Keep the existing CLI lint and formatting failures visible. The evidence folder contains exact results and diagnostic comparisons; no rules were suppressed and no whole-repository formatting was performed.

## Manual check with the controlled provider

```powershell
node scripts/graph-engineering/z7-launch-fixture.mjs --scenario=complete
```

This opens another fresh isolated profile with the same controlled provider. The operator performs the following actions; these manual actions remain **NOT RUN** until the user supplies results. Terminal commands are `restart` (same profile/provider), `fail` (failure scenario only), and `quit` (close the private app/provider, retain files).

1. Open **Graph Engineering → Fork / Join**. Confirm the plan starts disabled and preview cannot execute. The **Sequential graph** button returns to the existing graph without converting its definition.
2. Enable the plan. Set the request to `Implement independent contributions A=1 and B=2; preserve all independent tests.` Set the shared contract to `Only PartA.cs and PartB.cs may change; preserve Runner.cs and MathOps.cs.` Require all three independent combined tests and final review. Set concurrency `2`, deadline `1200000`, budget `5`, Build recipe ID `fixture-build`, Test recipe ID `fixture-test`.
3. Keep both workers selected. Worker A owns `PartA.cs`; worker B owns `PartB.cs`. Leave additions empty. For each instruction use `Read the owned source, update the requested Value, run actual offline Build/Test, preserve the tests and report the result.` The launcher already created the reviewed synthetic project recipes. Expand **Existing native model and permissions** to inspect the configured fixture model and normal permission mode.
4. **Save plan → Preview base and configuration**. Review the pinned clean base, complete configuration and Unknowns. Acknowledge preparation, then **Prepare owned workspaces**. Inspect three distinct real directories and captured configuration. Preparation must not send Agent input.
5. Enter a review comment, acknowledge the plan, then **Approve plan and start selected workers**. Use each worker's **Open existing conversation** to answer its native permission requests. Verify the conversation opens that worker's existing session and returns to the original Graph via its workspace. Workers edit only their own clone in this tested path.
6. At Join, expand **Complete proposed changes** on both workers. Review before/after contents. Enter a comment and explicitly approve integration. Answer the integration Agent's native permissions. Verify original `PartA.cs` and `PartB.cs` still contain `Value = 0`.
7. Inspect the validation child. Answer actual Build and Test permissions. Select the final review node; inspect source, test artifacts and three passing assertions. Approve with a comment. The parent should show **Combined result approved** with five admissions.
8. Open a worker conversation again. The native session/input must be the same. Type `restart` in the launch terminal and inspect retained completed history; no new work should start.
9. In **Workspace retention and cleanup**, select preservation and check that deletion is refused. Remove preservation explicitly when appropriate. A still-open native runtime also blocks cleanup: use each child workspace's **More → close** action, then restart the private app so only the original workspace opens. Add an audit reason and delete only worker A. Its directory should disappear while worker B, integration, original source and retained Graph proposals remain. Frozen history includes retention and cleanup reasons.

Additional scenarios use a new launcher invocation with the matching `--scenario`:

- `conflict`: both workers own `PartA.cs`; request A proposes `1`, B proposes `2`, and `PartB` remains `0`. At Join, try approval without choosing a proposal: no integration should start. Choose worker B explicitly for `PartA.cs`; the integrated file must contain `2` and combined tests must pass.
- `combined-failure`: request A=`1`, B=`1`. Each branch's independent tests pass alone; combined tests fail. Final approval and parent success must remain blocked.
- `failure`: keep worker B waiting at its native Edit permission, then type `fail`. Worker A fails; Graph targets only B for cancellation. Do not authorize integration. The automated acceptance also keeps an unrelated Chat question alive and answers it afterward.
- `restart`: leave both workers at native permissions and type `restart`. Parent becomes Interrupted, directories and exact ownership remain, and no work resubmits. **Inspect recovery** and **Release confirmed-inactive run** require actual inactivity and an audit reason; release never claims unknown work succeeded.

Z7 currently supports local clean Git roots, one or two selected workers and complete bounded text proposals. It refuses dirty bases, linked worktrees, symlinks, unsupported modes/binaries, unapproved additions, stale source/configuration and uncertain replay. Native tools remain capable of reaching other same-user locations; these directories are coordination boundaries, not OS sandboxes. Partial preparation failures retain their ownership-intent markers/directories for inspection instead of deleting uncertain state.

Real provider/project validation, another PC, installed EXE/update paths, actual phone/Web/macOS/Linux interaction and external MCP/network behavior are **NOT RUN** for Z7. Existing packaging work is preserved; no Z7 release has been published.
