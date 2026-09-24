# Z6 local setup and manual verification

Z6 runs inside the existing native ZCode Graph Engineering tab. The user waived `Z6_REPORT.md`; this document is setup guidance, not a claim that a user/company pilot ran. Controlled acceptance evidence is separate. The historical published installer does not contain uncommitted Z6 source changes.

## Build this checkout

Use the repository-pinned Node 24.14.0 and pnpm 10.33.2 with prepared dependencies. The synthetic C# fixture uses .NET SDK 8.0.425 with roll-forward disabled, no external package dependencies and cleared NuGet feeds. A fresh dependency installation, another PC, packaged upgrade and non-Windows execution are **NOT RUN** unless separately recorded.

In PowerShell at the repository root:

```powershell
# This optional helper exists in the prepared development checkout only.
. .\.tmp\z1-env.ps1
$env:PATH = "$PWD\node_modules\.bin;$env:PATH"
pnpm typecheck
pnpm --dir apps/zcode-cli typecheck
pnpm lint
pnpm --dir apps/zcode-cli lint --continue
pnpm architecture:check --changed
pnpm fmt:check
# Finish emitting checks before starting a bundle or any native app.
$env:ZCODE_ENV = 'test'
node scripts/build-desktop-agent-cli.mjs
pnpm --filter @zcode/desktop build:no-runtime-assets
```

On a different development machine, put the pinned tools on PATH and follow [Z1 setup](Z1_SETUP.md) for dependency preparation. `.tmp/z1-env.ps1` is a checkout-local convenience, not a portable prerequisite. Do not replace installed ZCode/Codex settings or launch verification against an installed profile. Repository-wide CLI lint and formatting have existing baseline failures; read the current verification evidence rather than assuming those commands pass.

## Provider-free isolated slot setup

```powershell
node scripts/graph-engineering/z6-launch-manual.mjs
```

The launcher prints a new private profile and synthetic workspace. It writes no installed configuration, configures no provider and submits no Agent input or Tool operation. Keep the exact printed profile path. To conduct a live user-operated check, configure only an authorized provider in that private app yourself; this is separate from controlled fixture acceptance.

A fresh provider-free profile opens the native API-key welcome screen with an empty field. Choose **Skip for now**, then **Exit onboarding** if shown, to browse Graph Engineering without credentials. Run still requires an explicitly configured native model/provider. The automated setup-only check stops at the empty welcome screen and proves zero work, not an authenticated/live execution.

1. In Graph Engineering, explicitly upgrade the initial draft to the sequential editor and then version 5. Open Project recipes. In another terminal, print the fixture’s exact existing recipe configuration:

   ```powershell
   node scripts/graph-engineering/z6-manual-recipes.mjs --profile "EXACT_PRINTED_PROFILE"
   ```

   Load recipes, paste the printed array, and Save recipes. This helper does not execute unless `--verify` is explicitly supplied. Do not substitute these fixture filenames/commands in an unrelated project.

2. Open **Workflow library**, choose **Sequential slot refinement**, version **1**, and inspect its description and digest. Set the explicit request to implement the supplied `GameDoc.md` rules R1–R5 while preserving `Runner.cs`. Set target engine to this C# `Z6Slot.csproj`/`SlotRules.cs` fixture and criteria to all **13** unchanged named Runner assertions with exact current report/source/build provenance.
3. Include **Normal** and **Free**. An unset boolean starts with a minus mark and **Not selected**; click once to choose Included. Explicitly exclude **Bonus** and **Respin**, which the supplied GameDoc does not define: click an unset choice to include it, then click again until its label says **Excluded**. Bind **Authoritative GameDoc** to `GameDoc.md`. Leave optional math/source documents unbound unless deliberately supplied. Leave math target/sampling rule absent: RTP comparison is N/A, not PASS.
4. Load recipes in the library dialog; bind Build to `slot-build` and Test to `slot-test`. Acknowledge replacing the unsaved initial draft, then Instantiate. This copies the exact version and selections into the draft; it must submit no input or execute/install anything. Excluded behaviors must be recorded without native tasks.
5. Click Run and inspect the exact saved graph revision and template digest, captured references/inherited instructions, primary and auxiliary destinations, hooks/plugins/MCP, recipes and native permissions. Unknown does not mean safe or local. Resolve missing prerequisites and make the visible operational acknowledgment before Confirm. Native permission/question controls remain separate from graph approval.
6. At **Approve source interpretation and edge cases**, verify all rules link to `GameDoc.md#R1` through `#R5`; missing rules are questions. Inspect the selected scope and required edge cases. Approve only the actual interpretation shown. The graph then runs Plan and selected tasks sequentially in fresh native sessions.
7. Inspect Normal/Free handoffs, actual source edits, cross-state findings and configured Build/Test results. The immutable runner tests reset behavior, exact trigger/retrigger counts, shared accumulated win, cap/overflow stop, inert terminal inputs and negative-input atomicity. Do not change the document, test runner or math to manufacture a pass.
8. Before final approval, independently verify the genuinely built fixture:

   ```powershell
   node scripts/graph-engineering/z6-manual-recipes.mjs --profile "EXACT_PRINTED_PROFILE" --verify
   ```

   Inspect the current native Test/reviewer artifacts and source diff, exact IDs and unresolved questions. The final human gate does not authorize Git publication. A failed check or missing source/tool remains a failure/blocker.

9. Quit and reopen the same private profile:

   ```powershell
   node scripts/graph-engineering/z6-launch-manual.mjs --profile "EXACT_PRINTED_PROFILE"
   ```

   Confirm preserved graph/version/provenance/history and zero new work. Open each node’s conversation and verify its existing session ID. Exercise cancellation/restart only in separate disposable authorized runs; unknown work must never replay automatically.

The **Sequential engineering** template uses Analyze → Implement → Build → Test → Review → Final approval. The **Bounded verified bug fix** template has one supported two-repair region; explicitly bind its real source paths and project recipes. Neither template supplies a project’s missing build system or specification. Editing an instance never changes its original template version or a historic run. Publishing a new local template version affects only a later explicitly selected instance.

## Controlled development checks

The scripts use private profiles, loopback controlled providers, actual native Read/Edit and recipe processes, plus independent C# assertions. Run native app scenarios sequentially, after all emitting checks/builds finish:

```powershell
node --test scripts/graph-engineering/z6-fixture.test.mjs scripts/graph-engineering/z6-provider-responses.test.mjs
foreach ($case in @('generic','bugfix','slot')) {
  node scripts/graph-engineering/z6-native-smoke.mjs "--scenario=$case"
  if ($LASTEXITCODE -ne 0) { throw "Native Z6 scenario failed: $case" }
}
node scripts/graph-engineering/z6-launch-manual.mjs --verify-setup
node scripts/graph-engineering/z6-native-library.mjs
```

The provider-free library command takes no options. It exercises create, duplicate, immutable new versions, current-draft preservation during rejected imports, reviewed portable export, explicit dirty-draft replacement, archive/restore and restart, then checks Chinese/light layout at 760px. It asserts zero native inputs/model requests and the difference between an unset boolean and explicit include/exclude choices. The verified final-bundle result is [the library summary](evidence/z6/native/library-current/z6-library-summary.json), with [explicit draft replacement](evidence/z6/native/library-current/z6-dirty-draft-explicit-replacement.png) and [Chinese/light library](evidence/z6/native/library-current/z6-chinese-light-narrow-library.png) screenshots. These are actual Windows desktop checks, not mobile Web acceptance.

The scripts retain exact private-profile logs/screenshots and produce JSON summaries. Setup-only checks prove no task was submitted, not live-model quality. Real provider/project, company pilot, external integrations, packaging, second-PC and unavailable platform acceptance remain **NOT RUN** until separately authorized and evidenced. Use [the private pilot checklist](PRIVATE_PROJECT_PILOT_CHECKLIST.md) before any company work.
