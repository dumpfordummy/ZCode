# Z8.5-U5-F1 — owned project configuration inspection

Status: design written before implementation. Acceptance is pending; this document
does not claim implemented inspection, Web support, or large-scope native readiness.

## Recovery and preserved baseline

Continue `codex/z8-5-u5-realworld-dotnet-projects`, draft PR #23. Fresh public PR and
Git reads on 2026-10-14 confirm source `bb31af01746f5e73de05b5134b9eab19fbb14d2d`
and integration `f7279c79824e518abc6f4fdeb2c6cf66b86bac31`; PR remains open/draft.
Retained checkout is clean. Preserve U5 files, fixtures, receipts and failed logs.
U5's 53-input PASS/assertion FAIL/recovery is separate from its two 5,013-input
observer expiries and one disconnected attempt. Those outcomes are not parser failures.

## Authority map and extension design

| Owner                                                                                   | Existing contract                                                        | F1 responsibility                                                                                                              |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `project-setup-types.ts`, `app/project-setup.ts`, `app/workflow-service.ts`             | Passive setup facade                                                     | Typed review/start/status/cancel inspection commands; passive scan/save/navigation never execute                               |
| `app/service.ts`, `app/state.ts`, `app/input-guard.ts`                                  | GraphState serial transactions, repository lease, exact one-use dispatch | Own immutable inspection intent and workspace reservation separately from Graph runs; reject conflicting active/uncertain work |
| `app/runtime-ports.ts`, `adapters/runtime-gate.ts`, `domain/native-runtime-contract.ts` | Runtime capability admission                                             | Add optional inspection capability requirement without weakening ordinary Graph requirements                                   |
| `adapters/tools.ts`, native agent service                                               | Runtime-bound create/start/inspect/cancel                                | Carry separate inspection purpose through the existing native process owner; no setup-to-startRecipe bypass                    |
| shared protocol, native `native-recipe-operations.ts`                                   | Strict request identity, one operation, session ownership                | Validate purpose and fixed inspection profile, retain exact invocation identity and bounded terminal facts                     |
| native `native-recipe-tool.ts` and ExecutionPort                                        | Ordinary always-ask permission, original process cancellation            | Reuse this sole process adapter; high-risk execution-capable evaluation warning, no new child-process launcher                 |
| `adapters/project-scope.ts`, `artifact-files.ts`, recipes and checks owners             | Full membership and byte freshness at genuine boundaries                 | Versioned supported-profile reconstruction and provenance, never receipt-as-manifest authority                                 |
| Quick UI/hooks                                                                          | Manual choices, prepared-closure Test selection                          | Explicit review and inspection states; Save only after complete supported preparation                                          |

```mermaid
sequenceDiagram
  participant UI as Quick UI
  participant Host as GraphState / lease
  participant Native as Native operation owner
  participant Tool as Permission / ExecutionPort
  UI->>Host: Prepare exact inspection review (no execution)
  Host-->>UI: Immutable identity, executable, argv, scope, warning, expiry
  UI->>Host: Explicit confirm matching review identity
  Host->>Host: Serialize / reserve workspace, revalidate provenance and runtime
  Host->>Native: One-use non-evidence inspection purpose
  Native->>Tool: Ordinary native permission
  Tool-->>Native: Denied, cancelled, or exact owned process result
  Native-->>Host: Bounded operation-bound projection
  Host->>Host: Revalidate provenance; validate structured result
  Host-->>UI: Observed configuration or distinct terminal failure
```

Native sessions remain protected from automatic question resolution. No Graph run,
Build/Test attempt, approval, reviewer output or successful check is created by
inspection. Desktop continuous and mobile replayable delivery show the same owner
state; status reads/reconnect do not dispatch. A lost start reply is uncertainty,
not retry permission. Only explicit cancellation targets the original process tree.
Unknown process exit retains ownership until read-only reconciliation proves inactivity.

Review binds workspace identity/path, runtime/process identity, exact installed
executable, selected project/configuration/framework, fixed argv, filesystem read
scope, provenance digest, request ID and expiry. Budget proposal: one operation per
workspace, one MSBuild worker (`-maxCpuCount:1`), no node reuse, 120-second process
deadline, 64 KiB projected output and at most 128 retained local receipts. Process
deadline and permission/review expiry are separate; no automatic replay or resumption.

Distinct outcomes: unsupported, capability-unavailable, denied, cancelled, expired,
source-changed, runtime-changed, malformed-result, limit-exceeded, process-failed,
executor-lost, inspection-succeeded. Only a matching fresh successful observation
can enter profile preparation. Success alone cannot enable Save.

## Installed-engine profile and privacy gates

Verify installed-version `-getProperty`/`-getItem` behavior on synthetic projects.
Fixed allowlisted properties/items only; no arbitrary switches, `-target`,
`-getTargetResult`, Restore, Build, binary logs, imported source or environment dump.
Disable auto-response files; reject unavailable local prerequisites. Evaluation can
execute property functions/resolvers and cause side effects even without targets.
Existing sandbox/network permission remains authoritative; no SDK/feed installation.

Required supported candidate profile: plain ASP.NET Core Web SDK service with ordinary
JSON/static Content, referenced by a VSTest test project. Actual SDK, target outputs,
assembly identity, configuration/framework, reference packs, public package roots,
implicit imports and generated behavior must be established, not guessed. Razor,
Blazor publishing, Protobuf/Grpc.Tools, custom generators, unknown property functions,
custom SDKs and unmodeled external imports stay blocked. Do not change a user project
to fit the profile. Keep existing supported static projects on their short path.

Full conservative membership includes relevant source/resources, JSON/static assets,
project/Directory/import metadata and future glob additions/removals/renames. Exclude
only outputs/state justified by this profile; blanket directory exclusion is not
proof. Bounded exact SDK/reference/public-package roots may be reviewed separately;
neither a whole-user-profile scan nor assets.json alone proves input completeness.

A new inspected scope must be explicitly version 3, with immutable profile identity,
resolved toolchain/import/environment commitments and complete membership policy.
Do not reinterpret v1/v2 or historical receipts. Readers must reject unsupported
v3 semantics clearly; installed .308 cannot execute this new representation. Do not
change its installation. Revalidate before Save, preview confirmation, and each
existing Build/Test boundary; no old fingerprint reuse across a real boundary.

## Large-scope investigation and acceptance

First recover retained operations read-only, then use one bounded diagnostic observer.
Record operation IDs and monotonic phase timestamps for confirmation, membership,
content fingerprint, Host admission, permission request/response, process start/exit,
successor scheduling and persistence. Mark nested/overlapping spans; do not sum them.
Show source verification as verification, not as pending user permission before a
permission exists. Compare integration and U5 on equivalent fixtures/toolchains when
needed before attributing a regression. Keep cancellation and every freshness check.

Required acceptance remains A–F from the owner authorization: lifecycle negatives;
installed-engine Web oracle plus real source UI Detect/Inspect/prepare/Save/reopen;
at least 5,000 exact inputs Build/Test PASS, real assertion FAIL with valid observation
and false acceptance, exact restoration and fresh PASS; mutations past file 32,
implicit/copied Content, imports, toolchain/configuration and future membership at all
freshness boundaries; unchanged U3/U4/U5, TRX and CI selector tests; English/Chinese
rendered gallery. Native-only results and platform failures must be labeled.

Use Node 24.14.0/pnpm 10.33.2. Recovery inventory found installed SDKs 8.0.426,
9.0.311, 9.0.319 and 10.0.401; these are not U5's 8.0.425 identity. Evaluation on
SDK 10 does not establish net10 Test execution. No installer, .309, merge, tag,
publication, employer data or credential search is authorized.

## Independent implementation slice (authorized continuation)

Implement inspection separately from the still-blocked complete Web profile. The GraphState
owner reserves the workspace under the existing lease; a version-1 private inspection sidecar
does not alter Graph run/v1/v2 schemas. Status reads never dispatch or reconstruct permission.
Cold unresolved intents become executor-lost and retain a quarantine reservation until exact
native inactivity is observed. No old runtime fallback. Native review is a read-only protocol
operation; start/observe/cancel reuse the existing recipe owner and ExecutionPort. The strict
inspection purpose accepts only a fixed query profile for demonstrated SDKs 8.0.425, 8.0.426
and 10.0.401, Debug/Release, net8.0/net10.0. No targets or arbitrary switches.

Native observation hashes bounded workspace files (excluding Git/app state), the exact
reviewed SDK directory, executable and native environment commitment. Limits: 20,000 files,
512 MiB aggregate, 64 MiB/file, depth 32, 120 seconds per observation. These observations
are explicitly incomplete Build scope; external reference packs, custom dynamic effects and
additional imported roots are not upgraded to supported Web provenance. Raw environment and
command output are never stored in the inspection receipt. Only allowlisted properties/items
are retained. Review expires after five minutes; process execution is capped at 30 seconds.
One request/owned process tree and one MSBuild worker are allowed; this is not an OS-wide
child-process-count guarantee. Unsupported effects cannot enable Save.

## Primary references

- https://learn.microsoft.com/en-us/visualstudio/msbuild/msbuild-command-line-reference
- https://learn.microsoft.com/en-us/visualstudio/msbuild/msbuild-properties
- https://learn.microsoft.com/en-us/aspnet/core/razor-pages/web-sdk

References describe semantics; installed synthetic evidence bounds actual support.

Installed 8.0.426 evidence justifies the 64 MiB per-file cap: FSharp.Compiler.Service.dll is 40,359,720 bytes. The original 32 MiB attempt failed closed. Query projection also recognizes the installed FrameworkReference Pack metadata; arbitrary extra fields still fail closed.

## Final fixed-argument boundary correction

Final review identified that a leading `@` project argument can be interpreted by MSBuild as an explicit response file despite `-noAutoResponse`. Inspection selection now rejects leading `@`, switch prefixes and leading whitespace before native admission. The eight Host/query tests pass after this correction; no target execution was attempted. Root typecheck passes. This is an additional source correction after the UI/diagnostics commit, and the actual final-head CI identity is recorded in the PR handoff.
