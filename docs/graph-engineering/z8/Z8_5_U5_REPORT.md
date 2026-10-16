# Z8.5-U5 implementation and draft review handoff

Source-only work on `codex/z8-5-u5-realworld-dotnet-projects`, based on freshly
verified integration `f7279c79824e518abc6f4fdeb2c6cf66b86bac31` (tree
`28936fbb8abe945ea4f199ef011ee7e0f9aebf2a`). No employer project, installed pilot,
installer, tag, release or merge was used or changed. All project names and browser
images in this change are synthetic.

## Supported and unsupported roots

| Shape                                                                                     | Actual boundary                                                                                                                                                           |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Literal Microsoft.NET.Sdk                                                                 | Existing U4 bounded property/item/import/source/output contract                                                                                                           |
| Same SDK plus standard MSBuild `xmlns`                                                    | Accepted; namespace does not change the modeled SDK boundaries                                                                                                            |
| No root SDK, exact first `Sdk.props` and last `Sdk.targets`, both `Sdk=Microsoft.NET.Sdk` | Accepted only as a structural equivalent; no conditions, versions, duplicate SDK imports, mixed forms or extra import attributes; all interior declarations still checked |
| Declarative imported Project with standard namespace                                      | Same U4 bounded metadata contract; no SDK imports inside imported metadata                                                                                                |
| Microsoft.NET.Sdk.Web                                                                     | Unsupported: implicit Content/Razor/static-web-assets cannot be represented by merely reusing pure SDK output assumptions                                                 |
| ToolsVersion / InitialTargets / DefaultTargets / TreatAsLocalProperty                     | Unsupported with actual attribute/value; toolchain, execution and property semantics not modeled                                                                          |
| Unknown SDK, SDK property expansion, alternate namespace, reordered SDK imports           | Unsupported with specific reason and Advanced/supported-target next action                                                                                                |
| Conditional imports, custom targets/tasks/generators/output paths                         | Existing U4 rejection remains; no execution during Detect                                                                                                                 |

This is neither general enterprise MSBuild support nor proof that an SDK or runner
is installed. A listed file or retained draft is not supported execution.

## Root cause and UI change

The prior parser combined root name/text, SDK equality and attribute-count failures
into one generic error. The new pure structural parser names the actual SDK or
attribute and preserves U4 checks. The v1 legacy parser is untouched.

Quick previously offered every inventory VSTest hint, and a choose-target sentence
could obscure a selected failure. The main view now retains the actual selected
blocker; bounded Details keep other diagnostics. Only Test scopes in the complete
matching prepared Build closure are selectable. Final preset compilation still
rejects unrelated scopes. Explicit Build changes clear old Test selections; changing
the scan root invalidates the old proposal. Cancellation/new request generation
prevents late responses from replacing current preparation.

All inventory Build targets remain available, including test-project Builds next to
solutions. Test-project alternatives are grounded in observed candidates and still
need full preparation; a Test project referencing Web remains blocked. Framework
labels explicitly do not prove SDK/adapter readiness. Quick continues to require a
Test; no weakened Build-only shortcut was introduced.

Optional identical-project-byte grouping hides only duplicate list rows, keeps a
selected duplicate visible, and reports total versus visible counts. It does not
claim generated provenance or equal effective builds. No `builds` or gitignore
exclusion was added; selected dependencies there remain inputs and freshness members.

The guided draft explains concrete Advanced recipe fields and opens the existing
editor: executable/cwd/timeout, all sources, actual outputs, test assembly/project/
framework/runner and test requirements. No new output path is prefilled. Unknown
inputs cannot become verified through notes or a checkbox.

## Inspection ownership blocker

Reviewed `project-setup-types.ts`, `app/project-setup.ts`, `app/project-ports.ts`,
`app/ports.ts`, `adapters/tools.ts`, and `tool-types.ts`. The existing native adapter
does own runtime-bound start/inspect/cancel and bounded command output. However,
`inspectRecipe` observes an existing operation; it does not inspect MSBuild metadata.
Graph Tool admission requires a frozen recipe/attempt and established source
fingerprint. Setup has no separate admission, capability, permission lifecycle or
freshness-bound structured inspection-result contract. Reusing a fake Build recipe
with guessed inputs would create a circular claim; directly calling startRecipe
from setup would bypass the current admission owner.

The optional inspection UI is therefore not implemented. A proper extension needs
an explicitly owned non-evidence operation: fixed command/options and cwd review,
runtime and toolchain/environment identity, bounded allowlisted result validation,
cancel/expiry/recovery semantics, source/import provenance revalidation and a clear
separation from authoritative Build inputs and genuine Test evidence. Even then,
unresolved dynamic effects cannot become a source manifest. No alternate launcher,
permission bypass, automatic restore or disabled permissions was added.

## Integrity and compatibility

No schema version, digest algorithm, native permission/evidence owner, TRX F2 rule,
source/output/test budget, parser budget or CI selector changed. Existing v1/v2
reconstruction remains. New accepted roots use v2; `.308` understands the descriptor
schema but its older parser cannot reprepare these new root forms, so downgrade may
block their verification. Existing previously supported v2 scopes retain their
meaning. Saved configuration is not execution proof.

## Validation status

- Initial new root tests reproduced three failures before implementation. The
  unchanged suite then caught an existing diagnostic expectation; corrected the
  diagnostic without changing its assertion. Initial lint caught the 400-line
  component limit; extracted a pure bounded summary view, with no rule suppression.
- Installed oracle: SDK 8.0.425 / MSBuild 17.11.48.46605 and SDK 10.0.401 /
  MSBuild 18.9.11.42413. All 12 pure/namespace/explicit-import × Debug/Release
  comparisons passed for target identity and Compile/Content/None/EmbeddedResource.
  Web oracle confirmed implicit wwwroot/appsettings Content and enabled Razor/static
  web assets. This is evaluation-only net10.0 evidence, not native Test proof.
- Root/discovery focused regressions: 6 passed, including the 41-total-input
  explicit-SDK save/reload/content/removal regression. Quick/model regressions: 6 passed.
- Real-component browser: unchanged U4 3/3 and U5 3/3 passed; selected Web cause,
  linked/unrelated tests, copy grouping, narrow scan, retained Chinese draft and
  cancellation/newer target. Test execution and transport/native environment are
  explicitly fixture-backed in these browser tests; they are not native evidence.
- Typecheck passed; lint 75 existing warnings, zero errors; architecture zero
  violations. Local Node 24.11.1 differs from the 24.14.0 repository pin; pnpm is
  pinned 10.33.2. Source desktop and native CLI compiled successfully.
- The full Windows portable suite ran 1,000 tests: 995 passed, 3 failed, 2 skipped.
  The initial diagnostic regression was fixed; the repeat run passed that test but
  encountered a transient `ENOTEMPTY` cleanup failure in the unchanged automatic
  network-consumer test. Its isolated repeat passed all 17 tests. The other two
  failures are existing Windows ASAR-header and absolute-ESM-path failures. The
  Linux selector expects four skips; Windows runs its two platform-specific cases.
  The additional 41-input regression was added afterward and passed separately.
  Existing U3/U4 5,000+ input, 20,000-file/512-MiB budget, v1/v2, negative-receipt and
  native-F2 unit regressions passed within that suite; CI selector regressions passed
  18/18. Baselines, exclusions and acceptance assertions are unchanged.

The first two U5 native attempts each completed a permission-approved Build with
acceptance true, then exceeded the existing 150-second observer deadline while Test
admission was pending. Neither attempt establishes Test proof. A U5-only retry uses
a 300-second permission-observer window; the U2/U4 default, product command timeout,
permissions, source checks and all native acceptance assertions are unchanged.
That third attempt was interrupted by a desktop executor disconnect: the known
harness processes disappeared, with no final summary and no Test execution in the
last retained record. It also does not establish Test proof. These are unresolved
large-scope native admission/performance limits on this machine, not a passing
5,013-input sequence. No product scheduling or freshness shortcut was introduced.

The separately labeled `scripts/graph-engineering/u5-native.mjs --source` fixture
retains 40 scale sources (53 total inputs), the same exact SDK roots, cached public
packages, copied Content/None, embedded resource and linked source. It uses the
unchanged native permission flow and `verifyB1Result` genuine-TRX assertions. It
passed the complete sequence on SDK 8.0.425 / net8.0:

| Case                                    | Native result                                                                                |
| --------------------------------------- | -------------------------------------------------------------------------------------------- |
| PASS                                    | Build exit 0; Test exit 0; 3 passed; genuine operation-bound TRX accepted                    |
| Actual assertion FAIL                   | Fresh Build exit 0; Test exit 1; 2 passed / 1 failed; observation valid and acceptance false |
| Fresh PASS                              | Restored assertion; new approved Build/Test exit 0; 3 passed and accepted                    |
| Content bytes changed after review      | Confirmation rejected; zero new runs/models                                                  |
| New matching source member after review | Confirmation rejected; zero new runs/models                                                  |

No model requests, restore, SDK installation or private-feed access occurred.
The 53-input proof does not substitute for the failed/interrupted 5,013-input
native attempts. See the sanitized [native receipt](evidence/u5/native.json).

Linux CI on source commit `1b154bc3464ad8a2e2201bf886dde48c24315127` passed all
four required jobs: `typecheck`, `static-checks`, `graph-tests` and
`graph-cloud-required`. The complete selected suite ran 1,001 tests: 997 passed,
four expected skips, zero failures. The report/standalone-native-harness follow-up
is verified again on its final PR head; exact head, integration base, tested merge
and final job links are recorded in the [draft PR handoff](https://github.com/dumpfordummy/ZCode/pull/23).
The PR remains draft and auto-merge is off. See [validation evidence](evidence/u5/validation.json)
and the [English/Chinese gallery](evidence/u5/README.md).

The first sandbox suite could not execute some Git/filesystem fixtures; browser
startup first lacked a downloaded Chromium, then hit sandbox Edge restrictions.
Retries used installed Edge and ordinary local access with isolated synthetic
profiles. Raw attempts/logs are retained under this checkout's `.tmp/u5-logs` and
isolated native fixture folders; only sanitized receipts/gallery are public.

## Performance and remaining limits

The new root check is linear in bounded root attributes/children. Display derivation
uses maps/sets for metadata digest groups and prepared graph reachability, bounded
by existing inventory/edge budgets; no extra source walk or SDK execution is added.
Full source enumeration/fingerprinting costs remain material. No new cache or
freshness shortcut was introduced. For 53 inputs, native Build durations were
3,470 / 2,696 / 2,714 ms and Test durations were 1,045 / 966 / 951 ms.
Admission-to-Build-start was 2,275–2,551 ms; Build-exit-to-Test-start was
2,413–2,440 ms, including harness/UI permission work. The 5,013-input Build commands
also finished in about five seconds, but successor admission did not complete
within the first two observer deadlines. General large-repository execution
readiness and Web SDK support are not claimed.

Reproduction uses installed tools and retained synthetic cached dependencies:
`node --import tsx scripts/graph-engineering/u5-oracle.mjs`,
`node --import tsx scripts/graph-engineering/u5-browser.mjs --chromium=<installed-browser>`,
and `node --import tsx scripts/graph-engineering/u5-native.mjs --source` with
`U3_RESTORED_FIXTURE` naming only a retained public synthetic B1 fixture.
The original large sequence remains available as `u4-native.mjs --source --u5-roots`.
