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
