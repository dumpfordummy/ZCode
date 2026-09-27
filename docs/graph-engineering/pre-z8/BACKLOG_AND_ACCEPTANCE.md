# Pre-Z8 backlog and acceptance matrix

All entries are proposed work. **Every acceptance check is NOT RUN for this planning delivery.** P0 means immediate usability/correctness priority; P1 means required for the selected supported scope; C1 means conditional on shipping parallel as supported. An item is complete only when implementation, negative tests, actual native evidence where appropriate, and user-facing help agree.

## U0 — baseline, product contract and risk decisions

| ID | Priority | Deliverable | Decisive acceptance |
|---|---|---|---|
| U0-01 | P0 | Exact checkout/package/guide identity and source delta | Record commit, installed version if user supplies it, changed files, supported schemas and existing publication changes; no rollback to the historical tag |
| U0-02 | P0 | Baseline journeys and failure reproduction | Distinguish recipes not loaded, empty, incompatible and read-failed through controlled fixtures; do not infer the user's local state |
| U0-03 | P0 | Evidence-policy and state vocabulary decision | Agent-led review, command result, valid test pass/fail, invalid evidence and human approval have different labels/contracts |
| U0-04 | P0 | Supported-project matrix and test-runner choice | A user-authorized sample establishes VSTest vs MTP, solution shape, reports and dependencies; unresolved private facts remain unknown |
| U0-05 | P0 | Wireframes and ownership/contract map | Guided forms compile to the existing definition; no second scheduler, runtime or credential store |
| U0-06 | P1 | Reproducible baseline and release-scope decision | Existing failures and NOT RUN checks retained; sequential-supported vs parallel-supported scope is explicit |

## U1 — first useful workflow, without recipes

| ID | Priority | Deliverable | Decisive acceptance |
|---|---|---|---|
| U1-01 | P0 | New Agent-assisted task template | Request -> Analyze -> Implement -> Review -> final gate works through native sessions; zero recipes required; test evidence shown as not configured |
| U1-02 | P0 | Guided task creation and workspace header | No model calls/commands from opening/configuring/saving; actual workspace visible before dispatch |
| U1-03 | P0 | Library intent separation and version defaults | Use template does not require Duplicate name; new instances pin a compatible version and existing runs never float |
| U1-04 | P0 | Explicit recipe-loading/empty/error states | Each fixture state shows a different cause/action; opening a read-only config panel cannot execute a recipe |
| U1-05 | P0 | Readiness issues with corrective navigation | Every disabled Run/Create action has a reason linked to the relevant control; no raw internal ID required to resolve common issues |
| U1-06 | P0 | Draft preservation | Opening setup, changing template, dismissing overwrite warning, failed save and workspace change do not silently discard or transplant a draft |
| U1-07 | P0 | No automatic downgrade | Choosing missing verified checks offers a distinct agent-led workflow or keeps verified creation blocked; existing template requirements stay intact |

## U2 — project checks and a real .NET report adapter

| ID | Priority | Deliverable | Decisive acceptance |
|---|---|---|---|
| U2-01 | P0 | Bounded read-only project discovery | Recognize supported metadata, show multiple candidates and uncertainty; no MSBuild/package/script/model/MCP execution during scan |
| U2-02 | P0 | Build/Test forms over existing recipe config | Executable/args/cwd/timeout/source/output fields compile and round-trip without dropping custom settings; concurrent save preserves unrelated config |
| U2-03 | P0 | Compatibility and Build-reference mapping | Command-only and wrong-kind recipes cannot fill verified Test/Build requirements; renamed/remapped Build node resolves by identity without mutating shared recipes |
| U2-04 | P1 | Supported .NET toolchain/calibration flow | Tool availability probe, Save and Run checks now are separate; exact arguments and restore/network effects reviewed |
| U2-05 | P1 | Deterministic genuine-report normalization | Parse actual supported test reports and attach exact invocation/source/build identity; original report remains inspectable |
| U2-06 | P1 | Test identity/aggregation/freshness | Multi-project/framework results cannot overwrite or conflate identities; previous report, partial report, duplicate identity and wrong build fail correctly |
| U2-07 | P0 | Evidence cannot be manufactured by status mapping | Failure, crash, cancelled, zero tests, all skipped, missing required tests and invalid report never become pass; valid failed assertions remain distinct from invalid evidence |
| U2-08 | P1 | Capacity and secure parsing | Oversized reports/test counts, external XML entities, path traversal and missing outputs fail without truncating into pass or reading outside the allowed root |
| U2-09 | P1 | Recipe provenance and invalidation | Changes to target/framework/filter/check definition/source scope invalidate the relevant calibration/readiness/approval; prior run snapshots unchanged |
| U2-10 | P1 | Harness feasibility decision | Restricted shell/script is either unsupported with explanation, or introduced by an explicitly reviewed capability and verified adapter; no wrapper bypass |
| U2-11 | P1 | Native environment diagnostics | Different PATH/private home/missing packages/feed auth are explained without copying original credentials or auto-installing tooling |

## U3 — editor and explicit handoff ergonomics

| ID | Priority | Deliverable | Decisive acceptance |
|---|---|---|---|
| U3-01 | P1 | Context selections/chips | Original request and earlier outputs produce real bindings; captured values reach the next native prompt exactly once |
| U3-02 | P1 | Guided/Advanced round trip | Supported custom definitions remain equivalent; advanced-only fields are preserved and marked, not silently erased |
| U3-03 | P1 | Prompt preview | Future output is visibly unresolved before run; actual run inputs come from captured predecessor evidence, not later Chat text |
| U3-04 | P1 | Guided references/skills | Use existing file/platform and skill catalog APIs; missing/duplicate guidance is visible, no automatic install or new MCP connection |
| U3-05 | P1 | Canvas editing and keyboard alternative | Insert/reconnect/delete/update End with visible dependencies; Delete in text input cannot delete a node; undo edits does not undo file operations |
| U3-06 | P1 | Existing routing/repair presets | Generated declarations validate against current schema; initial vs repair attempts, supported limits and final gate remain explicit |
| U3-07 | P0 | No unsafe implicit routes | Unknown, invalid evidence, missing output and permission waits do not take a failure/default route or start a repair |

## U4 — execution, approval and recovery clarity

| ID | Priority | Deliverable | Decisive acceptance |
|---|---|---|---|
| U4-01 | P0 | Three-axis status model in UI | Input completed + no tests + no approval never renders as verified engineering success |
| U4-02 | P1 | Run summary, changes and evidence inspector | Show selected run's actual inputs/output, changed file references, checks/results and next action; historical records immutable |
| U4-03 | P0 | Native interaction action area | Permission/question routes to exact existing session; same IDs and no extra input when navigating |
| U4-04 | P0 | Gate review and revision binding | Stale evidence, duplicate approve/reject and concurrent decisions cannot admit extra work or approve a changed source silently |
| U4-05 | P0 | Cancellation/inactivity states | Stop requested differs from stopped; unrelated sessions survive; late completion cannot start a forbidden successor |
| U4-06 | P0 | Recovery decision table | Only safe existing checkpoints continue; unknown inputs are never replayed; release needs confirmed inactivity and an audit reason |
| U4-07 | P1 | Large output/history handling | Summaries remain responsive with bounded/virtualized UI; canonical artifacts are never silently dropped to meet UI budgets |
| U4-08 | P1 | Keyboard, scaling, themes and focus | Primary actions/errors readable and reachable on agreed Windows viewports/scaling, without color-only status or inaccessible canvas-only operations |

## U5 — reuse, import/export and parallel scope

| ID | Priority | Deliverable | Decisive acceptance |
|---|---|---|---|
| U5-01 | P1 | Sequential file export/import | Native file selection/save with preview; malformed/unsupported/cancelled input preserves current draft; no execution side effects |
| U5-02 | P1 | Portable/local distinction | Missing destination model/recipe/skill/context binding resolved explicitly; no credentials/history/integration workspace are presented as included in a template |
| U5-03 | P1 | Versioning and repeat-run flow | New request reuses stable selected workflow/project checks without altering earlier run settings; repeat uses new explicit run intent |
| U5-04 | P0 | Visible parallel limitations | Until the conditional work passes, advertise no Fork/Join transfer; offer no sequential-export fallback that loses a plan |
| U5-P01 | C1 | Parallel plan transfer schema | Round-trip branch/ownership/new-file/concurrency/Join/integration/budget semantics; imports create neither clones nor sessions |
| U5-P02 | C1 | Parallel setup and result UX | Original vs worker vs integration paths visible; conflicts require existing explicit decisions; combined verification mandatory |
| U5-P03 | C1 | Parallel lifecycle and retention | Cleanup obeys ownership/inactivity/retention; result retrieval described without inventing Apply to original or automatic merge |

## U6 — pilot, documentation and Z8 entry report

| ID | Priority | Deliverable | Decisive acceptance |
|---|---|---|---|
| U6-01 | P1 | Novice task-based usability pilot | Three unfamiliar engineers complete agreed scenarios; record help requests, errors, misunderstanding and timing honestly |
| U6-02 | P1 | Supported .NET workflow pilot | User-operated authorized project/synthetic equivalent produces a real change, native checks and independent evidence; no fixture claim substituted for live behavior |
| U6-03 | P1 | Built-artifact feature check | Verify the enabled pre-Z8 paths in the actual local built artifact; no install over user's app; broader installer matrix remains Z8 |
| U6-04 | P1 | Current user/LLM guide and examples | Every common control maps to actual UI; supported reports/commands, data boundaries and failure paths documented |
| U6-05 | P0 | Consolidated gate report | Exact source/artifact identity, results, baseline exceptions, open risks and supported/experimental capability matrix; no unsupported ready-for-production claim |

## Cross-cutting regression matrix

Run the relevant subset after each phase, and the combined matrix at U6. Test layers must be labeled: pure domain/unit; controlled adapter/service; real native runtime with controlled provider; built artifact; user live provider. A pass at one layer does not establish another.

| Scenario | Must remain true |
|---|---|
| Create/view/save/import/scan | Zero new native agent/check submissions; scans do not execute project code |
| Duplicate click/lost acknowledgement | No duplicate run/session/input; retain ambiguous identity rather than recreate |
| Workspace switch while loading | Late data cannot bind to another workspace |
| Source/check/provider changed after review | Relevant preview/acknowledgment invalidated before new work |
| Agent claims tests passed but report failed | Failure wins; no false approval readiness |
| TRX/report missing or invalid | No inferred counts, passing status or repair trigger |
| All tests skipped or filtered to zero | Explicit inadequate verification |
| More than supported test count | Explicit unsupported/oversized; no quiet truncation |
| Program exits nonzero after writing partial report | Native outcome and evidence reconciled conservatively |
| Advanced custom fields / unknown schema | Preserve supported custom state; reject unsupported imports without mutation |
| New template version | Old runs and definitions stay pinned |
| Native conversation navigation | Opens existing session; no extra prompt or configuration override |
| Permission / question / graph approval | Three distinct authorized response paths |
| Restart while running / safe gate | Unknown stays unknown; only supported explicit checkpoint continuation |
| Cancel and late completion | Stop state not reversed into successor execution |
| Competing windows and external edit | Existing ownership/conflict protections retained; external source mutation detected where required |
| Export/diagnostics secret sentinel | Default output excludes secrets, auth files and unreviewed private content |
| Form keyboard and canvas Delete | Input editing cannot remove graph; focus/error navigation preserved |
| Upgrade/import/migration failure | Original state retained; no partial record activation or native work |
| UI metrics/history | Render summaries without changing/truncating source-of-truth evidence |
