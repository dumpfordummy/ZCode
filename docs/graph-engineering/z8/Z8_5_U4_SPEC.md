# Z8.5-U4: declarative .NET setup

Implementation specification, written before code. Base:
`452a24082f08fbcff2e2617602d464ccd158f113`. This describes the intended bounded
subset; the report must distinguish tested support from remaining work.

## Supported boundary

The existing project setup owner performs passive, bounded filesystem reads.
Detection, preparation, Save, tab changes and fingerprinting never run MSBuild,
restore, a shell, a model or a provider. A configuration is a proposal, not test
evidence. Existing native review, permission, admission and TRX owners remain intact.

| Construct             | Intended passive policy                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SDK                   | Literal Microsoft.NET.Sdk; established default output layout                                                                                                                                |
| File items            | Compile, Content, None, EmbeddedResource; ordered Include/Exclude, Update, Remove; finite lists and bounded `*`, `?`, `**`                                                                  |
| Metadata              | Literal CopyToOutputDirectory/CopyToPublishDirectory (Never, Always, PreserveNewest, IfDifferent), safe Link/TargetPath, LogicalName and DependentUpon; no transforms/generators            |
| Paths                 | Project-relative, including imported item declarations; shared inputs may leave the project directory but must remain inside the workspace                                                  |
| Properties/conditions | Explicitly supported literal properties; Configuration/TargetFramework/Platform equality or inequality; no property functions, item expressions or unknown environment properties           |
| Imports               | Bounded literal contained imports and nearest applicable Directory.Build.props/targets and Directory.Packages.props, interpreted in evaluation order; cycles and unknown execution rejected |
| Execution             | Explicit selected configuration agrees with commands, output identity, closure and saved scope; default platform AnyCPU only until other platforms have modeled command identity            |
| Unsupported           | Custom SDK/output paths, generated inputs, tasks/targets, external imports, arbitrary conditions/properties/metadata, escaping whose semantics are not established                          |

Conservative source coverage includes all regular files in the selected project
subtrees and required shared input roots, even files removed from an item list.
The UI discloses that extra coverage; it is not described as an exact item list.
Item interpretation still preserves Update as existing-item-only and Exclude as
local to its Include. Empty globs are valid and their future membership is checked.
Explicit inputs beneath bin/obj/.git/.zcode contradict the protected exclusions
and are rejected, rather than silently omitted. Case collisions, reparse aliases,
missing required literals, uncontrolled output mappings and budget exhaustion fail
closed. Imported metadata and copied non-code bytes participate in fingerprints.

## Ownership and compatibility

```text
Renderer draft → projectSetup facade → ProjectScanJob (one request owner)
                                    → pure declarative policy + bounded IO
                                    → complete versioned scope or blocker
Explicit Save → existing compiler/schema/store
Explicit review → existing scope reconstruction + source fingerprint
Explicit run → existing admission/native permission → Build/Test → existing TRX evidence
```

New scope policy is explicit v2 and binds Configuration. Historical v1 keeps its
original parser, membership, metadata and digest reconstruction. No historical
receipt is rehashed or rewritten. Old readers reject v2; downgrading requires a
retained compatible profile/configuration. No migration or installer work occurs.
U3 count/byte/depth/elapsed-time limits, cancellation and before/after identity and
membership checks remain mandatory. No timestamp cache or first-N capture is added.

Quick preparation has not-started, preparing, ready, failed, cancelled and
unsupported presentation states. A selected target's blocker takes precedence over
generic preparation guidance. Other candidates' diagnostics stay in bounded Details.
Unprepared Test choices remain visibly unresolved. Save has one current reason and
requires a complete matching prepared scope; choices are never silently substituted.

Guided continuation retains selected targets/configuration/context and known facts
without changing existing custom checks, filters, timeouts, required tests or outputs.
Unknown facts remain non-runnable local draft state. A checkbox cannot resolve an
unknown manifest. Cancelling or opening the continuation never overwrites saved data.

An MSBuild inspection action may only use existing native permission/execution
owners with exact-command warning, capability detection, bounded allowlisted results
and target/toolchain/import freshness binding. Evaluation can execute property
functions/SDK resolution and may perform IO. If those owners do not provide a safe
setup-result contract, this subpath is explicitly blocked rather than implementing
a second launcher or fabricated inspection receipt. Passive/guided work continues.

## Acceptance

Generate disposable fixtures (no private inputs): real tests consuming copied
Content/None and embedded data; shared linked sources; ordered globs/lists and empty
matches; two configurations plus literal/Directory imports; correct and wrong
Build/Test associations; missing transitive references; 5,000+ inputs with content,
imports and shared files; save/reload and freshness beyond file 32. Preserve U3's
100-project regression and unchanged F2 tests. Negative tests cover XML, aliases,
escapes, cycles, unknown properties/metadata/execution and exhausted budgets.

Use installed MSBuild on synthetic files as an oracle, reporting its actual version
without asserting universal equivalence. Record passive, prepare, fingerprint and
native timings separately. Native UI proof must exercise Save/reopen, review and
permissions, actual pass/fail/recovery and stale-input rejection. Source-native,
metadata-only and packaged claims remain separate. No packaged proof is claimed.

Run required focused/portable checks, typecheck/lint/format/architecture/pre-push,
publish one draft PR into integration with auto-merge off, and record final head,
base, tested merge and actual CI state. No merge, tag, release or installer.

## Semantics references

- [MSBuild items](https://learn.microsoft.com/en-us/visualstudio/msbuild/msbuild-items)
- [Common items](https://learn.microsoft.com/en-us/visualstudio/msbuild/common-msbuild-project-items)
- [Conditions](https://learn.microsoft.com/en-us/visualstudio/msbuild/msbuild-conditions)
- [Directory customization](https://learn.microsoft.com/en-us/visualstudio/msbuild/customize-by-directory)
- [Inspection](https://learn.microsoft.com/en-us/visualstudio/msbuild/evaluate-items-and-properties)
- [Property functions](https://learn.microsoft.com/en-us/visualstudio/msbuild/property-functions)
