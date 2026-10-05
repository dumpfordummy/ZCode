# Z8.5-U2 Quick .NET checks delivery

Integration base: `dbe6c51ca0ea54f3afa92867b66a1fd2aeb6f045`.
Feature branch: `codex/z8-5-u2-quick-dotnet-checks`.
The draft PR records its exact final head, tested synthetic merge and required CI results.

## User flow

Before: scan, select discovery hints, open the preset, supply assembly/output paths,
review the manifest checkbox, generate, apply, validate/save, select calibration
recipes and map Tests to Build, prepare, review and confirm.

After: open Checks, Detect .NET project, confirm the Build target and ordered Test
scopes, then Save checks or Save and run checks. The latter saves first and opens the
existing exact command/environment review. Confirmation rechecks the preview and
uses existing calibration admission and native Tool permission.

Save alone writes configuration and creates no execution evidence. The saved status
explicitly says this save did not run checks. New run retains its request/context
while configuring checks, then preselects a sole compatible Build/Test. Multiple
choices remain unselected; explicit/cleared/missing/incompatible stable IDs are retained.

## Implementation and authority

- `GraphQuickDotnet` composes existing scan, preset compilation, validation and save
  APIs. A single solution covering the discovered projects is a unique aggregate
  target; other shapes require explicit Build selection. Multiple frameworks/tests
  require ordered selection (maximum seven Test scopes plus Build).
- Existing discovery adds optional `quick`/`quickIssues` metadata. The existing
  restricted XML reader checks a narrow static SDK allowlist before deriving Debug
  assembly paths. This was necessary because previous discovery exposed no assembly
  facts. No project code, MSBuild evaluation, package restore or feed lookup occurs.
- `GraphProjectRecipes` owns the existing recipe JSON draft and digest-checked save.
  Quick appends only after an explicit Add action when configuration exists, chooses
  a collision-free prefix and never replaces custom declarations. The JSON editor
  was extracted into `GraphRecipeJsonDetails` without a second storage owner.
- `GraphChecksSetup` consumes the explicit post-save review intent only after the
  saved snapshot is available. It uses its existing preview dialog, recheck and
  `runChecks` path. No new execution mechanism was added.
- `defaultGraphCheckBindings` initializes only absent binding keys, never replacing
  stable IDs or explicitly cleared slots. Existing Test/Build workflow declarations
  remain authoritative; resolved relationships are shown by Build name, with
  manual mapping retained in details.

Hidden from the default proposal: idPrefix, executable, cwd, timeoutMs, sourcePaths,
expectedOutputs, test assembly/report path, runtime, minimumTests/expectedTests,
requiredTests, generated argv, recipe IDs/JSON and internal Test/Build mapping.
All existing manual forms, filters, custom manifests, multiple scopes, runtime,
timeout, required test identities, raw/unknown fields, SDK probe and availability
remain in Advanced. Viewing either presentation does not mutate saved checks.

No verifier, evidence-classification, freshness, normalization-receipt, admission,
approval, native-permission, run-history, model/provider, network or installer behavior
changed. The preset compiler and check execution pipeline are unchanged.
The reverse-dependency architecture gate exposed the existing 403-line sequencer;
only its three blank method separators were removed. A TypeScript scanner comparison
proved identical tokens; the unchanged 400-line policy and baseline now pass.

## Validation

Pinned Windows toolchain: Node 24.14.0, pnpm 10.33.2.

| Validation                                   | Actual final result                        |
| -------------------------------------------- | ------------------------------------------ |
| Graph UI unit tests                          | 236 passed, 0 failed, 0 skipped            |
| Graph service app + adapter tests            | 438 total: 436 passed, 0 failed, 2 skipped |
| Focused pre-Z8 U1 provider / U2 script tests | 21 passed, 0 failed, 0 skipped             |
| New U2 rendered scenarios                    | 7 passed, 0 failed                         |
| Existing UX-M1 rendered regressions          | 30 passed, 0 failed                        |
| Immutable integration baseline capture       | 1 passed, 0 failed                         |
| `pnpm typecheck`                             | Passed                                     |
| `pnpm lint`                                  | 0 errors; 75 existing warnings             |
| Changed-file format check                    | Passed                                     |
| `pnpm architecture:check --changed`          | 0 violations, 0 baseline violations, 0 new |
| `pnpm verify:pre-push`                       | Passed (same 75 lint warnings)             |

The two service skips require `PRE_Z8_TRX_FIXTURE_MANIFEST` for replay of an owned
genuine report; that optional manifest was not supplied. They are not claimed as passes.
The executed regressions retain zero-result, all-skipped, missing-required, malformed,
duplicate, stale output/source/Build, absent normalization receipt and absent Build
relationship rejection. Save-only assertions confirm no preview or run admission.

New tests were written before their behavior; the initial discovery test run had
two expected failures. Iteration also caught a Windows case-insensitive module-name
collision, an omitted required UI prop, a save/refresh timing guard that suppressed
review, fixture metadata leaking between browser scenarios, the UI file-size lint
limit and the pre-existing sequencer size violation. These were repaired and final
checks rerun. Earlier failed pre-push logs are retained beside the successful log.

## Rendered evidence and limits

See [the screenshot gallery](evidence/u2/GALLERY.md). Both baseline and candidate
use real components in the existing Chromium harness, with real bounded filesystem
discovery, compiler, recipe store and check preview. Baseline UI comes from the exact
integration SHA. Native environment/admission are explicitly synthetic fixtures;
these screenshots do not claim a real native Build/Test run or native permission grant.

Captures cover 1366x768, 1600x900 and 1093x614 CSS pixels (representative of 125%
Windows scaling), plus Chinese/light-theme Quick setup. The compact proposal keeps
both save actions visible at the reduced size. The New-run evidence is scrolled to
the Checks section to show the setup action or actual selected Build/Test names.

Quick is intentionally limited to bounded static Microsoft.NET.Sdk projects with
literal frameworks and an exact Microsoft.NET.Test.Sdk reference for Tests. Directory
Build/package imports, dynamic/conditional/custom declarations, unknown outputs,
unsupported/ambiguous runner metadata, incomplete scans, sources above the existing
32-file capacity, external references and scopes not reached by the chosen Build
require Advanced. SDK/package availability is still established at the existing
review/execution boundary; no installation or restore is introduced.

No merge, auto-merge, tag, installer build/upload or release was performed.
