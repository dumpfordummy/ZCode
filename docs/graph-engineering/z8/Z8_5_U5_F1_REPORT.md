# Z8.5-U5-F1 implementation follow-up — incomplete acceptance

The independent Host/native inspection boundary is implemented on the existing U5
branch and draft PR #23. F1 as a whole is **not complete or release-ready**. There
is no supported executable Web profile, no Web Save/reopen proof and no new
5,000+ input native Build/Test PASS → assertion FAIL → restoration PASS sequence.
The historical recovery-only report is retained below, explicitly superseded for
implementation status; its failed/interrupted native records remain unchanged.

## Source and authority

- Owner/capability commit: `ac25cadec5648cae5246d1e558b73670ff21965b`.
- UI/diagnostics code head: `54098e1fd80e8879410ec54128b6781610d39ac8`.
- Reviewed base remains `f7279c79824e518abc6f4fdeb2c6cf66b86bac31`; no integration
  modification, merge, installer, .309, tag, publication or installed .308 change.
- The spec preceded implementation. The final evidence-only commit and its actual
  CI/tested-merge identities are recorded in the PR handoff after checks finish.

`GraphInspections` is a helper of the existing GraphState serial/lease owner. The
setup facade sends explicit review/start/status/cancel commands to that owner;
it never calls `startRecipe` directly. A separately versioned, private, bounded
sidecar holds at most 16 observations and never alters Graph run or v1/v2 source
scope schemas. An immutable reviewed request, workspace, selected configuration,
framework, runtime identity and native environment commitment bind admission.
The Host consumes a one-use exact-request dispatch authorization. Active Graph
work and inspection exclude each other; uncertain executor outcomes retain the
original reservation and cannot replay. Cold status reads do not resume work.

Native advertises the additive `project.configurationInspection.v1` feature and
review method. Missing/old capability fails without command fallback; ordinary
runtime requirements are unchanged. Start/inspect/cancel reuse the existing
NativeRecipeOperations, GraphRecipe tool, always-ask permission and ExecutionPort.
No second product process runner was added. The diagnostic oracle is explicitly
separate from product/native acceptance.

The query is fixed to installed MSBuild.dll, a reviewed relative csproj,
Debug/Release, net8.0/net10.0 and demonstrated SDK versions; no target, Restore,
Build, getTargetResult, arbitrary switch or custom environment injection is
accepted. Evaluation can cause filesystem/network/system side effects; both UI
review and native permission warn about this. Review lasts five minutes; the
process timeout is 30 seconds, output is bounded, and raw stdout/stderr/environment
values are withheld from inspection records. Strict property/item projection
rejects malformed, oversized and unexpected fields and mismatched effective SDK,
configuration or framework. Every accepted projection has `scopeComplete=false`.

## What remains blocked

The precise Web blocker is the installed SDK's target-generated static-asset and
Razor pipeline: `ResolveStaticWebAssetsInputs`, `GenerateStaticWebAssetsManifest`,
computed assets and referenced-project/package contributions are not represented
by evaluation's empty StaticWebAsset/DiscoveryPattern lists. MSBuildAllProjects
does not prove complete imports. Reference-pack, implicit generator, dynamic
import and effective environment provenance are not closed by this inspection.
No claim is made that a repository-wide observation or restored assets file proves
arbitrary build input completeness. Custom generators/imports remain unsupported.
No company project was read, diagnosed, retargeted or changed.

The existing ExecutionPort owns one launched process tree and `-maxCpuCount:1`
limits MSBuild workers. It does **not** provide the requested hard descendant
process-count constraint. That runtime invariant remains open; the capability is
source-review work, not full lifecycle acceptance. A production native UI proof
is also still open: the UI exposes the owned session ID but has not demonstrated
the complete permission-conversation/reopen/recovery navigation. The controlled
gallery cannot substitute for that gate. There is no valid supported-profile or
Web Save/reopen screenshot because those states were not achieved.

Installed .308 lacks the new inspection capability and cannot inspect. Existing
literal/v1/v2 configurations and historical receipts retain their original
semantics. The new private sidecar is not a downgrade execution permission and
cannot be converted into a legacy recipe or approval.

## Verification and evidence

All new commands used Node **24.14.0** and pnpm **10.33.2**. No SDK/feed/browser
installation or package restore occurred. Edge already installed on the machine
was used after the default Playwright browser binary was found absent.

| Check                                   | Result                                                                                       |
| --------------------------------------- | -------------------------------------------------------------------------------------------- |
| Root typecheck                          | Passed                                                                                       |
| Root lint                               | Passed: 75 warnings, 0 errors                                                                |
| Architecture                            | Passed: 0 baseline/new violations; policy unchanged                                          |
| CI selector/aggregator tests            | 18 passed; exclusions/gates unchanged                                                        |
| Focused final tests                     | 38 passed: 7 Host/query, 10 native recipe, 4 capability, 17 network-policy tests             |
| Affected native bootstrap typecheck     | Passed using installed TypeScript directly                                                   |
| CLI aggregate typecheck/lint entrypoint | Cannot run: local turbo binary missing; nothing installed                                    |
| Direct bootstrap lint                   | Existing broad max-lines failures; changed native recipe/inspection files reported no errors |
| Full Windows selected suite             | 1,008 tests: 1,003 passed, 3 failed, 2 platform skips                                        |
| Real-component controlled gallery       | English and Chinese: 2 passed, 6 screenshots                                                 |

The Windows failures are two pre-existing ASAR platform failures and the
network-consumer positive control's timing failure under the full concurrent
suite. That entire 17-test network file passes in the final isolated focused run.
The first F1 full run also caught the old exact capability-list assertion; it was
updated to assert both additive features and passes. No assertion was disabled.
The Linux CI result for the actual delivered head must be read separately.

Native regression fixtures prove denial/cancellation and mutations after permission
review prevent process start. Mutations include input 39, new implicit content,
Directory.Build.props and SDK engine bytes. Host tests prove runtime/configuration
change, expiry, immutable requests, one-use admission, executor-loss quarantine,
no Graph evidence, and no Save authority. These are structural/native-adapter
tests, not a successful installed-engine app UI acceptance sequence.

The installed SDK observation initially failed closed at a 32 MiB/file limit.
The SDK's FSharp.Compiler.Service.dll is 40,359,720 bytes; the explicitly revised
cap is 64 MiB/file while the aggregate remains 512 MiB. The successful read-only
review observed **3,508 files / 405,626,873 bytes in 10,978.05 ms**, with no MSBuild
execution. A separate new synthetic SDK 8.0.426 / MSBuild 17.11.69 / net8.0 query
parsed five projected items in **274.44 ms**. Installed FrameworkReference `Pack`
metadata was explicitly allowlisted after an initial strict rejection. The query
ran no Build/Test/Restore and does not establish scope completeness or net10 Test.

See [implementation evidence](evidence/u5-f1/implementation.json) and the labelled
[gallery](evidence/u5-f1/gallery/README.md). Earlier `recovery.json`, `oracle.json`
and the original U5 report remain separate.

## Large-scope diagnosis and limits

No new 5,013-input native run was launched. The retained fixture still pins absent
SDK 8.0.425 with roll-forward disabled and was not retargeted. That does not block
the independent implementation above. Its three retained records were hash-checked
again unchanged; two observer expiries and one executor disconnect remain distinct.
The 53-input native PASS/FAIL/recovery proof remains valid only for its scope.

The earlier full 5,013-input byte observation measured 27.72 s: membership before
8.66 s, bytes 12.01 s, membership after 7.05 s. This supports legitimate verification
cost, not a conclusive cause of the old admission stalls or a U5 regression claim.
The existing owner now emits optional bounded monotonic phase events keyed by
operation ID (`ZCODE_GRAPH_DIAGNOSTICS=1`), including membership, hashing, Host
dispatch/reply, native process result, evidence verification and successor scheduling.
Nested intervals overlap and must not be summed as independent costs; Host and
native clocks are separately labelled. Tool dispatch is not falsely labelled as
the exact broker permission request/response. Those broker timestamps, confirmation
and all persistence boundaries still need a complete instrumented native sequence.

The app publishes source-verification progress before native admission. No old
fingerprint reuse, timestamp/Git-status shortcut, auto-permission or product timeout
increase was introduced. Instrumentation is not a performance fix. A single future
owned observer must first reconcile the original process and use the existing
status/cancel APIs; no overlapping retry or replay is authorized by this report.

---

## Historical recovery-only report (before the implementation continuation)

# Z8.5-U5-F1 recovery investigation — incomplete

F1 is **not implemented or accepted**. This follow-up recovers the existing U5
checkout, writes the required ownership design, measures retained source verification,
and records installed-engine Web evaluation. It adds no inspection button, native
capability, executable Web scope, approval, Build/Test result or release-readiness claim.
The original U5 report and all earlier evidence remain unchanged.

## Recovered state

On 2026-10-14, bounded discovery located the retained clean checkout on
`codex/z8-5-u5-realworld-dotnet-projects` at
`bb31af01746f5e73de05b5134b9eab19fbb14d2d`. Git fetch and public/connected GitHub
reads agree: PR #23 is open and draft, with integration base
`f7279c79824e518abc6f4fdeb2c6cf66b86bac31`; it has not merged or changed scope.
Its previously tested merge is `4bc1d27ca8c21e34786c3b7d71363783254a35f4`.

Read root and CLI AGENTS, the architecture-governance skill, U5 spec/report,
relevant U3/U4 contracts, setup facade/types, GraphState and input guard, runtime
gate, native recipe operation/tool owner and source/checks fingerprint boundaries.
The F1 spec names these owners and the intended extension. In particular, adding
the missing non-evidence API is authorized work; its absence is **not** treated as
an authorization blocker. That extension has not yet been implemented.

## Tooling and local checks

System Node was 24.11.1; the bundled runtime was 24.19.0. Neither was substituted
for the pin. A separate portable Node **24.14.0** was downloaded from nodejs.org
into the recovery workspace and verified against its official SHA256 list:
`313fa40c0d7b18575821de8cb17483031fe07d95de5994f6f435f3b345f85c66`.
All new Node diagnostics/checks used it with pnpm **10.33.2**.

| Check                             | Recovery result                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Repository freshness              | Passed; no configured tracking branch/origin-main, so exact authorized refs were independently fetched and compared |
| Architecture changed-files check  | Passed, zero violations                                                                                             |
| Root typecheck                    | Passed                                                                                                              |
| Root lint                         | Passed, 75 warnings and zero errors                                                                                 |
| CI selector/gate regressions      | 18 passed                                                                                                           |
| New F1 lifecycle/profile/UI tests | Not implemented or run                                                                                              |
| New native Build/Test sequence    | Not run                                                                                                             |

The prior final-head CI run `38511176607` remains U5 evidence: 997 passed, four
expected skips and all four required jobs successful. It is not new F1 native
acceptance. Full Windows/browser/native suites were not rerun in this investigation.

Installed SDK inventory is now **8.0.426, 9.0.311, 9.0.319, 10.0.401**. The retained
large fixture's unchanged `global.json` pins **8.0.425** with roll-forward disabled;
an explicit `dotnet --version` in that synthetic workspace now fails because that
SDK is absent. No SDK was installed and the retained pin/assets were not rewritten.
A future native acceptance needs a separately prepared installed-SDK fixture with
verified cached prerequisites; the old 8.0.425 proof cannot be relabeled 8.0.426.

GitHub CLI is unauthenticated in this execution environment, but the connected
GitHub tool successfully read this exact PR; no credential store was searched.

## Retained 5,013-input operations

Read the existing JSON directly, without opening the app or triggering cold
reconciliation. Process inventory found no retained harness node, Electron or dotnet
process. Existing record bytes and fixtures were preserved; raw stale `Running` or
`Starting` labels are historical state, not evidence of a live process or Test pass.

| Attempt                | Build operation                        | Build duration | Last Test state                          |
| ---------------------- | -------------------------------------- | -------------- | ---------------------------------------- |
| First observer expiry  | `c637556a-a662-4094-ba4f-e6d196da4b92` | 4,713 ms       | `Pending` / `planned`; no process start  |
| Second observer expiry | `d7c42c03-8898-4345-b493-1c1eb7e31348` | 5,015 ms       | `Starting` / `created`; no process start |
| Disconnected observer  | `68bc51b9-9fde-4e16-af5d-c3e2264ddb3d` | 5,044 ms       | `Pending` / `planned`; no process start  |

All three retained Build results have exit 0 and acceptance true. None establishes
Test execution. The second Test operation is
`55538cc7-f192-42dd-b382-334db7fba47c`; its last persisted `created` update is
121,132 ms after the Build operation's recorded completion. This is a wall-clock
record interval, not a measured pure CPU, permission or fingerprint duration.
Earlier records contain no complete monotonic phase trace from which to reconstruct
all causes. They must not be labeled a hidden permission dialog or parser failure.

A **single read-only full fingerprint measurement** on the retained third fixture
used the current source owners and their unchanged 120-second budget:

| Sequential measured phase                            | Duration      |
| ---------------------------------------------------- | ------------- |
| Revalidate complete source membership before hashing | 8,658.603 ms  |
| Hash all 5,013 inputs, 366,161 total bytes           | 12,010.411 ms |
| Revalidate complete source membership after hashing  | 7,051.730 ms  |
| End-to-end elapsed                                   | 27,721.326 ms |

These three spans are sequential. Their enclosing total overlaps them and must not
be added again. Content digest:
`612ad700b04c4dc56f2079b6a6e8fc524ba33b113ff395c0a27366ac48273c3b`.
The retained run record's bytes were unchanged after measurement. This digest is a
new read-only content observation, not an execution receipt or reusable approval.

`artifact-files.ts`, `recipe-sources.ts`, `app/tools.ts`, `tool-evidence.ts`,
`project-checks.ts` and `checks-preflight.ts` have no differences between the
authorized integration base and U5 head. Source inspection shows complete checks
capture/fingerprints at several real admission boundaries. The measurement supports
significant verification cost, but does not isolate queue/lock/observer costs or
prove a U5 regression. No fingerprint was cached across a boundary, no deadline was
increased, and no performance fix is claimed. Full operation-ID phase instrumentation,
current UI progress and the complete native large-scope sequence remain unfinished.

The independent 53-input U5 sequence remains valid for its scope: actual PASS,
genuine assertion FAIL with valid observation and false acceptance, then fresh PASS.
It does not satisfy the 5,000+ F1 gate.

## Installed Web oracle and precise unresolved effects

Created a new synthetic plain Web project with `Program.cs`, `appsettings.json` and
`wwwroot/site.txt`. Explicit diagnostic queries used the installed dotnet executable,
fixed Debug/net8.0 configuration, `-noAutoResponse`, `-maxCpuCount:1`,
`-nodeReuse:false`, and allowlisted `-getProperty`/`-getItem`. No Build targets,
`-getTargetResult`, Restore, package download, custom task injection or model call
was invoked. This standalone diagnostic is **not** a product inspection operation.

Both SDK **8.0.426 / MSBuild 17.11.69** and **10.0.401 / MSBuild 18.9.11** returned:

- Actual evaluated `bin/Debug/net8.0/Fixture.dll`, Debug/net8.0 identity.
- Implicit static Content plus copied `appsettings.json` and `global.json`.
- `StaticWebAssetsEnabled=true`, `RazorCompileOnBuild=true` and
  `UseRazorSourceGenerator=true`; SDK analyzers and ASP.NET framework reference.
- Empty evaluated `StaticWebAsset`, `StaticWebAssetDiscoveryPattern`,
  `RazorGenerate` and `AdditionalFiles` lists for this plain fixture.
- `MSBuildAllProjects` containing the project and TestPlatform import-after target,
  but omitting SDK import files visibly responsible for the returned items.

The installed SDK's `Microsoft.NET.Sdk.StaticWebAssets.targets` establishes the gap:
`ResolveProjectStaticWebAssets` invokes `DiscoverStaticWebAssets` on Content and
creates both `StaticWebAsset` and discovery patterns during target execution.
`GenerateStaticWebAssetsManifest` consumes the resolved/referenced configurations,
assets and patterns to produce build/development manifests.
`AddStaticWebAssetsManifest` contributes generated runtime JSON to
`ContentWithTargetPath`. The target dependency strings also include computed assets,
JS modules and scoped-CSS resolution. Therefore empty evaluation lists cannot be
treated as absent build effects, and `MSBuildAllProjects` alone cannot be used as a
complete import/provenance inventory.

**Unresolved supported-profile invariant:** the implementation still needs a bounded
model and freshness commitment covering these target-generated manifests and their
referenced-project/package/toolchain inputs, including future glob additions, plus
a complete import/environment identity. This investigation has not proved that
closure, Build-to-Test reachability or actual output association for a Web + VSTest
pair. It also has not implemented the newly authorized Host/native inspection
lifecycle. No observation has been promoted into Save authority. These are concrete
unfinished implementation/proof obligations, not a claim that Web support is
fundamentally impossible or that more authorization is needed to add the API.

Unknown generators, custom SDKs/property functions, unmodeled imports, Razor/Blazor
publishing and Protobuf/Grpc.Tools remain unsupported. Neither SDK-10 evaluation nor
the net8.0 target label is native Test proof. No private project was diagnosed.

## Delivery limits and remaining acceptance

Only this report, the pre-implementation F1 spec and sanitized investigation evidence
are added. Product source, native protocol, v1/v2 meanings, output/TRX acceptance and
installed `.308` remain unchanged. The proposed v3 design has no implemented reader;
`.308` cannot be claimed to understand a future inspected-profile representation.
Its existing U5 root-form downgrade limitation remains as recorded in the U5 report.

All F1 A–F implementation/native/UI acceptance gates remain open. Specifically:
no owned inspection terminal-state suite; no Save/reopen-to-executable Web proof;
no new 5,000+ PASS/FAIL/recovery; no new mutation-boundary suite; no new bilingual
rendered gallery. No installer, `.309`, merge, auto-merge, tag or publication occurred.

Evidence: [sanitized recovery measurement](evidence/u5-f1/recovery.json),
[installed-engine projections](evidence/u5-f1/oracle.json).
Local diagnostic scripts/raw outputs and check logs remain separately under
`.tmp/f1`, with the original `.tmp/u5-logs` and native fixture directories preserved.

Primary semantic references checked:
[MSBuild queries](https://learn.microsoft.com/en-us/visualstudio/msbuild/msbuild-command-line-reference),
[properties](https://learn.microsoft.com/en-us/visualstudio/msbuild/msbuild-properties),
[Web SDK](https://learn.microsoft.com/en-us/aspnet/core/razor-pages/web-sdk).

## Final fixed-argument boundary correction

Final review identified that a leading `@` project argument can be interpreted by MSBuild as an explicit response file despite `-noAutoResponse`. Inspection selection now rejects leading `@`, switch prefixes and leading whitespace before native admission. The eight Host/query tests pass after this correction; no target execution was attempted. Root typecheck passes. This is an additional source correction after the UI/diagnostics commit, and the actual final-head CI identity is recorded in the PR handoff.

## Continued implementation checkpoint — native gates now observed

This continuation supersedes the earlier unfinished status only where fresh evidence
below establishes a result. All earlier failures, observer expiries and disconnected
operations remain preserved. This is an implementation checkpoint, not final-head
acceptance or a completed Web product profile.

Commits `cb29816` and `f531324` add the Windows hard process-count owner and explicit
permission-conversation navigation/read-only recovery. The native adapter uses an
atomic Windows Job assignment at suspended process creation, maximum one active
process, no breakaway and kill-on-owner-close. It reuses ExecutionPort and existing
permission ownership; no helper process runner is introduced. Unsupported native
runtimes lack the additional capability and fail clearly. Ordinary Build/Test remain
unchanged. Native child-creation, cancellation, timeout and owner-loss tests passed,
including survival of an unrelated process.

Actual source-app inspection UI completed ordinary denial, successful owned MSBuild
inspection and reopen with no replay. No Graph runs or model calls were created.
The successful query observed SDK 8.0.426 / MSBuild 17.11.69 / net8.0 and implicit
JSON/static Content, with `scopeComplete=false`. Its operation was
`b86b439b-f977-4a80-bcdf-7a0f19c5b518`; the denied operation was
`3705ff0c-2ce1-4b9b-b5ea-669b154c8d5f`. The first harness screenshot failure occurred
before start, leaving only an unreserved review-ready record; it is retained.

### 5,013-input native sequence

A new isolated synthetic fixture used installed SDK **8.0.426**, net8.0 and the
retained public package cache. No Restore, package download or model call occurred.
The historical 8.0.425 fixtures were not retargeted or overwritten. Three real tests
consume copied Content, a copied settings file, an embedded resource and application
code. The exact original assertion source was restored by byte hash.

| Outcome        | Run ID                                 | Genuine results    | Build process | Test process |
| -------------- | -------------------------------------- | ------------------ | ------------: | -----------: |
| PASS           | `804ae077-d972-47e6-8c71-53d5c07e3575` | 3 passed, 0 failed |      4,796 ms |     2,139 ms |
| Assertion FAIL | `00d4aa19-fe55-446d-a7f1-2d2f378a7885` | 2 passed, 1 failed |      4,712 ms |     1,689 ms |
| Restored PASS  | `46650c88-f259-429c-aa1e-db1377258190` | 3 passed, 0 failed |      5,658 ms |     1,442 ms |

All three have `observationValid=true`; acceptance is respectively true, false,
true. All owned process exits were observed. Restoration SHA-256 is
`d4e6ff93ca7e5a06c33f019e77db465247056c262d196c4d59ad9d750f563f90`.
Native bundle SHA-256 is
`9e1be6d05c523ea0f13ceecea8942cefc142e89ec761d946494de03e40580676`.
The source snapshot was `f531324`; later changes require their own final validation.

Host verification before Build measured 30.780 / 29.284 / 47.221 seconds; before Test
122.525 / 34.869 / 34.512 seconds. Post-exit evidence work measured Build
18.591 / 16.851 / 17.358 seconds and Test 76.813 / 58.185 / 34.389 seconds.
Nested membership/hash intervals are included in these owner intervals, not added
to them. Host, native and observer clocks are separate monotonic domains. The first
Test permission was requested about 279 seconds after Build permission: the observed
delay includes real freshness verification, not just native process execution or
human interaction. No prior fingerprint was reused across a freshness boundary.

After the first PASS, the initial harness's inherited 30-second preview observer
expired before another run was admitted. The prior run was terminal and its owned
processes stopped before explicit continuation in a fresh app profile using the same
fixture. A single 900-second external observer then completed FAIL/recovery and a
copied-Content stale-preview rejection. This observer allowance is not a product
timeout change or a claimed performance fix. The preserved original U5 timeouts and
disconnect still do not prove a U5 regression.

### Web work still in progress

A separate installed-engine oracle now proves plain Web + referencing VSTest Build
and three genuine net8.0 tests: application result, implicit JSON copying and static
asset runtime-manifest content. Its separate fixture bootstrap generated restore
metadata from retained public cached packages with sources cleared and audit off;
product setup and inspection did not Restore. An earlier oracle disabled SDK-wide
wildcard imports and failed with missing VSTest target. Inspection of installed
`Microsoft.TestPlatform.ImportAfter.targets` identified why. The corrected oracle
keeps SDK-owned imports and disables user-extension imports only; both records remain.

New syntax and workspace membership work remains non-authoritative (`scopeComplete=false`).
It preserves v1/v2 behavior, rejects unknown generators/imports, includes nested
directories named bin/obj, and excludes only the two projects' exact SDK output roots
while retaining prior restore assets/import metadata. Nine targeted tests pass for
late source bytes, JSON/static Content, future membership, import/configuration and
unsupported effects; root typecheck passes. The existing 5,003-input v2 regression
also passed. Complete package/toolchain/environment provenance and product
Inspect/prepare/Save/reopen/Build/Test wiring are still being implemented. This
checkpoint does not claim Web Save support or release readiness.

Evidence: [large native sequence and phase timings](evidence/u5-f1/large-native-continuation.json),
[actual inspection UI outcomes](evidence/u5-f1/inspection-native-continuation.json).
Installed `.308`, prior assets, old receipts and all failed/interrupted records remain
untouched. No merge, installer, tag, release workflow or publication occurred.
