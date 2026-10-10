# Z8.5-U3: bounded large .NET repositories

Status: implemented contract; measured acceptance and limitations are in [the report](Z8_5_U3_REPORT.md).
Base: `90eebe6d34ab8dea2ffce14db590aff7b7573f39`.
Authorization read through `END OF Z8.5-U3 AUTHORIZATION`.

## Ownership and limits

| Owner                                                                | Existing boundary                                                                                           | U3 contract                                                                                                                                                                                              |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `adapters/project-discovery.ts`                                      | 64 KiB/file, 512 KiB total, 64 metadata files, 2,048 entries, depth 8; stops after local read error         | Independent inventory and selected preparation jobs; 4 MiB/file, 64 MiB total, 2,048 metadata records, 16,384 reference edges, 250,000 entries, depth 32, 120 s/job; partial inventory remains browsable |
| `project-setup-types.ts`, app facade/port, existing RPC              | Arrays copied into candidates; RPC persistent replay 8 MiB/high-water 1 MiB, not a selected-scope allowance | No source inventory per candidate. Bounded progress snapshots contain stage/counts only. Existing target/workspace identity unchanged                                                                    |
| `domain/project-metadata.ts`, `project-quick.ts`                     | Regex hints plus strict 256 KiB/limited-structure TRX XML parser reused for Quick                           | Bounded project metadata parser separate from unchanged TRX evidence behavior; literal default Microsoft.NET.Sdk contract only                                                                           |
| `domain/artifact-schemas.ts`, `dotnet-recipes.ts`                    | Source paths and outputs each max 32; recipes max 32; test scopes max 7                                     | Source paths max 20,000; outputs/recipes/test-scope limits unchanged. New Quick recipes use compact versioned scope descriptor instead of repeated inventories                                           |
| `adapters/recipes.ts`, `domain/artifacts.ts`, `app/project-setup.ts` | Saved config 256 KiB, JSON 4,096 members/depth 16; validation text 256,000 chars                            | Dedicated recipe configuration budget, independent of unchanged evidence-artifact/JSON limits. Atomic save and expected-digest checks retained                                                           |
| `adapters/project-checks.ts`, `workflow-preflight.ts`                | Review digests include effective recipes and source fingerprints                                            | Descriptor integrity and source membership revalidated at preview/freshness boundaries; no hint/cache authorization                                                                                      |
| `adapters/artifact-files.ts`, recipe/evidence ports                  | Fingerprint max 32; streamed 32 MiB/file; no aggregate budget                                               | 20,000 sources, 512 MiB aggregate, 32 MiB/file; streamed digest, bounded elapsed time and small IO concurrency; unchanged legacy digest ordering                                                         |
| `observeDeclaredFiles`, `domain/tool-records.ts`                     | 32 observed outputs; separate report observation                                                            | Remains 32; source and output capacities are distinct                                                                                                                                                    |
| `adapters/repository.ts`, record schemas                             | Whole JSON read/write; no byte cap; recipes embedded in preview and attempts                                | Compact scope descriptor prevents repeated large inventories; explicitly bound and measure new record/configuration growth without rewriting history                                                     |
| `domain/artifacts.ts`, TRX capture/normalization                     | 256 KiB artifacts, 1,000 tests and existing producer semantics                                              | Unchanged; no reinterpretation of historical reports or F2 receipts                                                                                                                                      |
| `GraphQuickDotnet`, model, hook                                      | Global inventory controls eligibility; repeated warning paragraphs                                          | Specific file/subfolder scan, explicit selected preparation, bounded details, stage/count progress, cancellation, generation guards                                                                      |
| `GraphContextSection` / `GraphTemplateBindings`                      | Advanced bottom border followed by next section top border                                                  | Remove only Advanced bottom border; retain disclosure and next-section border                                                                                                                            |

Defaults above are engineering budgets, not measured throughput claims. IO is asynchronous;
directory enumeration is incremental. Every count, byte, depth, edge and deadline exhaustion
is an explicit incomplete result, never an authoritative truncated manifest. Diagnostic count
and text are capped and deduplicated. File-size and aggregate remaining budgets are checked
before allocation and while streaming. Identity and containment checks surround reads.

Final independent serialization defaults are 2 MiB for accumulated metadata/candidate DTOs,
4 MiB for the complete discovery/preparation response, 32 MiB/700,000 JSON members for recipe
configuration, and 64 MiB for persisted run-record files. The compact scope descriptor avoids
repeating source inventories in saved recipes, captured previews and attempts. Long-path inputs
can reach the response-byte budget before the 20,000-file count; that returns an explicit limited
result. Existing RPC replay/high-water limits are unchanged. Project XML has a 4 MiB input bound,
32,768 elements, 65,536 aggregate attributes, 32 attributes per element, 8,192 characters per
attribute and 16 nested elements. Framework hints stop at 32; this is independent of seven
executable Test scopes.

Selected preparation has a separate 64 MiB metadata recheck pass (at most 128 MiB metadata IO
over both passes), within the same 120-second job deadline. Each reread is bounded by its
original byte length and must retain its digest. This deliberate extra pass closes metadata
changes while sources are being enumerated; it does not enlarge the retained metadata manifest.
Visited directory identities/membership timestamps are checked again before preparation returns.
Fingerprinting uses at most four streaming readers and has one 120-second deadline shared by
membership validation, content hashing and final membership validation. Filesystem IO completion
can delay cancellation/deadline acknowledgement; these checks do not claim an atomic snapshot.

## State and event order

```text
Detect/select → existing projectSetup facade → discovery adapter job (workspace/request ID)
                                         → inventory or selected preparation snapshot
Cancel/newer request → same job owner → cancelled (never execution)
Selected complete scope → existing preset compiler → explicit recipe save
Explicit review → existing checks capture → re-enumerate membership → stream fingerprint
Explicit run → existing Host admission/native permission → before/after fingerprint → evidence
```

Inventory describes found/read metadata, not complete selected inputs or execution. Selecting a
target starts a fresh bounded closure job; unrelated inventory failures cannot authorize or deny
that job. Failed required metadata, missing references, cycles, alias collisions, unsafe links,
unknown imports or budget exhaustion block its verification. References are normalized relative
to the declaring file and must stay within the workspace. Missing-reference diagnostics are
issued only after direct access, not because another inventory path has not yet been visited.

The supported scope includes every project in the selected solution, transitive literal
ProjectReferences, files in each supported project subtree, selected metadata and applicable
ancestor inputs. Build/Test association must prove the selected Build reaches each Test.
`bin`, `obj`, `.git` and app-owned `.zcode` output/state directories are excluded by contract;
arbitrary source files and ignored files are not. Applicable Directory.Build/Packages metadata,
custom SDK/import/condition/item behaviors remain unsupported for verified Quick until their
effects can be established. An unrelated sibling Directory file does not taint the target.
Unknown ancestors outside the workspace are checked and reported rather than assumed absent.
Solution-only `Directory.Solution.props/targets` are checked against solution ancestors, and
named `before/after.<solution>.sln[x].targets` are blocked. They do not taint an independently
selected project. Custom `global.json` SDK paths/resolvers or test-runner configuration remain
unsupported. This follows Microsoft's [solution customization](https://learn.microsoft.com/en-us/visualstudio/msbuild/customize-solution-build)
and [response-file](https://learn.microsoft.com/en-us/visualstudio/msbuild/msbuild-response-files)
contracts; passive detection never evaluates those imports.

## Integrity, persistence and compatibility

New compact scope descriptors name the recipe contract version, Build target, complete membership
digest and source count. They contain neither source contents nor a mutable manifest reference.
They are immutable recipe configuration: preparation is required to replace them. Freshness
re-enumerates the same supported scope, checks metadata/reference/membership integrity and hashes
all current contents. Add/remove/rename/configuration/reference changes invalidate the old scope;
content changes invalidate preview/evidence through the existing source digest boundaries.
No atomic filesystem-snapshot guarantee is made.

Legacy recipes without the descriptor retain their literal paths and digest algorithm. Existing
records and receipts load without migration or rehashing. New descriptors/large arrays are not
readable by .306's strict recipe schema: downgrade requires retaining the original profile and
configuration, not silently converting U3 history. No destructive migration is authorized.
Oversized historical record files above 64 MiB now fail with a retained-bytes diagnostic; they
are never truncated or migrated. Existing output count (32), recipe count (32), calibration Tool
count (8), test-result count (1,000), artifact bytes (256 KiB), artifact records (2,048) and Tool
attempt count (48) remain independent limits. Record history has no new count migration.

## Required proof

Generate disposable fixtures: at least 100 projects, valid solution configuration mappings,
256 KiB solution, over 512 KiB metadata, 5,000 source files, paths below depth 8 and over 2,048
entries. Exercise selected scope despite unrelated errors, applicable versus sibling metadata,
all final budget edges, cyclic/duplicate/case references, aliases, unreadable/changing files,
cancellation, save/reload/restart, membership drift and source changes beyond file 32.
Measure repeated cold inventory/preparation/fingerprint/save/reload and peak resource use.
Native proof must include real pass/assertion-fail/restored-pass and stale evidence, using an
already restored synthetic fixture; label any scale or native limitation precisely.

Run existing focused service/UI/script tests, unchanged portable suite, typecheck, lint, changed
formatting, PR-scoped architecture/pre-push and final-head required CI. UI gallery is limited to
relevant large/partial/diagnostic/separator cases at 1366×768, 1600×900 and reduced CSS width,
including disclosure focus, English/Chinese and light/dark. No release, merge or installer work.
