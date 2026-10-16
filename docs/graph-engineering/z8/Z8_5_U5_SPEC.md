# Z8.5-U5: realistic roots and trustworthy Quick selection

Spec written before implementation. Fresh remote integration base:
`f7279c79824e518abc6f4fdeb2c6cf66b86bac31`, tree
`28936fbb8abe945ea4f199ef011ee7e0f9aebf2a`. Synthetic fixtures only.

## Source-based owner and failure map

| Owner                                                                        | Current predicate / failure                                                                                                                            | U5 contract                                                                                                                                           |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain/project-declarative.ts`                                              | `Project`, empty root text, exactly one attribute `Sdk=Microsoft.NET.Sdk`; imports require zero root attributes. All failures share one generic error. | Pure structural root analysis reports actual SDK/attribute/shape and next action. No resolver or process.                                             |
| `domain/project-quick.ts`                                                    | Historical literal SDK policy                                                                                                                          | Unchanged v1 reconstruction.                                                                                                                          |
| `adapters/project-scan-job.ts`, `project-declarative-load.ts`                | Bounded original metadata; nearest Directory imports; catches unsupported shapes into candidate diagnostics                                            | Retain IO owner, budgets, identity checks and U4 evaluation. Inventory is not a source manifest.                                                      |
| `adapters/project-scope.ts`                                                  | Direct selected dependency closure, conservative subtree inputs, rereads metadata, versioned membership digest                                         | Unchanged v1/v2 digests, exclusion and freshness semantics.                                                                                           |
| `graphQuickDotnetModel.ts`                                                   | All inventory VSTest scopes offered; reachability enforced only during preset generation after preparation guard                                       | Expose only complete prepared linked scopes as selectable; retain final preset rejection. Preserve actual selected failure ahead of generic guidance. |
| `GraphQuickDotnet.tsx`                                                       | Root errors may be replaced by choose-target copy; stale scopes survive Build changes; inventory count and prepared state visually conflated           | Main-view selected blocker; clear old scopes on explicit Build change; generation guards; narrower scans invalidate old target authority.             |
| `GraphQuickContinuation.tsx` and existing Advanced editor                    | Notes retain unknowns but cannot finish unsupported setup                                                                                              | Explain concrete manual recipe fields and existing Advanced path; no guessed output paths or checkbox authority.                                      |
| `project-setup-types.ts`, `app/project-setup.ts`, native Tool/Host contracts | Setup has passive scan/availability/compile/preview; no owned evaluation-result operation                                                              | Inspect feasibility; no second runner. Inspection cannot become source, Build or Test evidence.                                                       |

## Bounded compatibility decision

Continue the U4 pure SDK item/property/import contract. Investigate additive support for
the documented MSBuild namespace and exact explicit SDK imports: first child is
`Import Project="Sdk.props" Sdk="Microsoft.NET.Sdk"`, last child is the corresponding
`Sdk.targets`, no root Sdk, no conditions/version/extra SDK imports. These positions
must preserve the same before/default/project/after evaluation order. All interior
constructs still pass U4's complete checks; accepting a root never authorizes outputs.
Root ToolsVersion, InitialTargets, DefaultTargets and TreatAsLocalProperty affect
toolchain/execution/property semantics and remain blocked with their actual value.
Unknown namespaces, SDKs, property expansion and mixed import forms remain blocked.
The standard namespace is metadata, not toolchain readiness. No new scope version.

Web SDK is a distinct SDK with implicit assets/Razor/static-web-asset targets.
An installed synthetic MSBuild oracle will establish whether the bounded static
contract can account for those effects. Until proven, no Web assembly guess or
verified-support claim. A separate pure SDK Test project can be selected only if
its own full dependency closure is supported; a Test reference to Web does not
escape this boundary. A solution containing Web remains blocked too.

## Selection, display and event order

```text
Detect/narrow scan -> existing workspace/request job -> inventory hints
Explicit Build change -> clear Test choices and prepared authority -> new generation
Prepared complete closure -> derived selectable linked tests -> explicit selection
Save -> existing preset/compiler/store -> saved configuration (not execution)
Review/run -> immutable preview -> Host admission/native permission -> genuine evidence
```

Keep all real project choices reachable, including test-project Build targets even
when a solution exists. Display identical project-file digest groups as potential
copies, not generated provenance. Grouping is opt-in display only; selected targets
remain visible. Count total/visible targets accurately. Never exclude `builds`, ignored
paths or matching metadata from source coverage. Existing file/subfolder scan input
is the explicit way to narrow inventory. A selected dependency under `builds` stays
in preparation and freshness.

Framework labels, including net10.0, are metadata only. Failed selected preparation,
static unsupported roots, missing Build/Test linkage, incomplete inventory and
unverified installed SDK/adapter readiness are separate states. No Build-only Quick
shortcut that weakens required Test semantics. Bounded Details retain diagnostics;
the selected blocker is never only in Details or replaced by test-detection copy.

## Inspection and manual fallback

Any future inspection capability must be owned by native Tool permission and Host
admission, with exact command/options/cwd disclosed, no automatic restore, bounded
stdout/stderr and result schema, runtime identity, installed SDK/environment identity,
cancellation, expiry and source/import/provenance digest revalidation. Evaluation
can execute property functions/resolvers; even a receipt cannot prove unknown dynamic
inputs. If the existing interface cannot safely deliver this, document the blocker
and do not expose a nonworking action. Manual Advanced recipes require real executable,
cwd, timeout, full declared inputs, known outputs, test assembly/project/framework,
runner and test requirements. Unknown required facts keep checks non-runnable.

## Acceptance and invariants

Focused synthetic roots: pure SDK, standard namespace, Web, ToolsVersion legacy,
exact explicit SDK imports, unknown/dynamic SDK, conditional imports and U4 literal
Directory imports. Inventory fixture includes Web/API plus unrelated test, duplicate
metadata in `builds/0/project-0`, distinct relevant projects there, narrow scan and
dependency preservation. UI tests cover selected errors, unrelated rejection before
Save, Build changes, cancellation, drafts, English/Chinese and normal/narrow widths.

Use installed MSBuild oracle only on disposable fixtures. Newly claimed verified
support requires native permission-owned Build -> genuine Test PASS -> assertion
FAIL (valid observation, acceptance false) -> fresh PASS and staleness. Do not install
SDKs or restore packages. Preserve failed attempts. Run existing U3/U4 5,000+ input,
resource, legacy, budgets, F2/negative receipt and CI selector tests unchanged.
Typecheck/lint/architecture and final-head required CI must be reported honestly.
One draft PR, auto-merge off; no merge, installed-profile change or release activity.

## Semantic references

- [Project root attributes](https://learn.microsoft.com/en-us/visualstudio/msbuild/project-element-msbuild)
- [SDK implicit and explicit import ordering](https://learn.microsoft.com/en-us/visualstudio/msbuild/how-to-use-project-sdk)

These define the syntax rationale; installed synthetic oracle and native evidence
bound the actual support claim. A documented syntax alone is not verification.
