# Delivery plan and engineering ownership

## Order

**U0 -> U1 -> U2 -> U3 -> U4 -> U5 -> U6 -> Z8**

Complete an independently inspectable slice at each step. U1 provides immediate value; U2 is the highest integration risk and should not be hidden behind an overly broad UI rewrite. Read-only investigation of U2's report adapter can begin during U0; parallel implementation requires agreed contracts and disjoint files.

| Phase | Primary outcome | Relative risk | Handoff |
|---|---|---|---|
| U0 | Baseline, contracts, usability acceptance and supported-profile decision | Medium; resolves uncertainty | `U0_BASELINE.md`, product/spec delta, architecture/flow map |
| U1 | A new user creates a no-recipe supervised task; setup blockers actionable | Medium | `U1_REPORT.md` + native workflow evidence |
| U2 | Guided supported .NET Build/Test with genuine reports | High | `U2_REPORT.md`, support matrix, failing/pass/invalid report evidence |
| U3 | Common edits/context/routing presets without raw JSON | Medium | `U3_REPORT.md` + semantic round-trip tests |
| U4 | Understand current run, required action, correctness and recovery | High due to lifecycle state | `U4_REPORT.md` + race/restart/ownership evidence |
| U5 | Reuse and safe sequential transfer; optional parallel completion | Medium sequential, high parallel | `U5_REPORT.md`, portable fixtures, capability decision |
| U6 | Actual user success and verified supported scope | Medium; may reopen earlier defects | `PRE_Z8_READINESS_REPORT.md` + updated guide |

Do not promise a duration from the number of AI tokens available. Estimate after U0 using the actual code delta, report tooling, test environment and pilot project. Record implementation time, build time, model time and user interaction time separately. Report relative effort/risk, blockers and dependencies instead of inventing dates.

## Minimum viable pre-Z8 scope

Mandatory: all P0 and sequential P1 backlog items, a supported standard .NET verified route, one user's authorized end-to-end workflow, common-path no-JSON UX and a truthful current guide. Conditional: parallel portability and advanced Join usability only when parallel is to be a supported release feature.

A PowerShell/game harness integration is not automatically within the standard .NET adapter. Resolve feasibility in U0/U2, then either scope and verify a real adapter or explicitly exclude it. The release cannot claim support for the user's actual game pipeline until the pipeline-specific gap is closed.

Preserve the old roadmap's separate Z8 work. Do not put signing, live updates, clean-machine installer trials, broad retention tooling or upstream rebases into every UI phase. Equally, a newly discovered credential/data-loss/execution bug is fixed or blocks progression immediately.

## Ownership and implementation discipline

One coordinator owns canonical contracts, state transitions, graph/template migrations, admission semantics and final integration. Suggested independent work lanes are:

- UI forms/accessibility/layout after contracts are stable.
- Domain discovery/compatibility/compilation tests.
- Report-adapter development and invalid-evidence fixtures.
- Read-only security/lifecycle review and acceptance-test design.

Do not let separate workers edit the same graph state owner or silently define different schema interpretations. Typecheck and desktop builds must follow the actual repository's output-ownership requirements; historical evidence recorded collisions when run concurrently. Reverify the current requirement rather than treating parallel validation as automatically safe.

Use current upstream AGENTS.md, DESIGN.md and architecture policy. Update specs before behavior. Reuse existing public module interfaces, hooks, platform abstractions and native interactions. Do not replace ZCode's instructions with instructions from the earlier Vue/C# prototype.

## Per-phase entry gate

1. Inspect working-tree changes and preserve unrelated work.
2. Record actual source/ref and compare the preceding report with current implementation.
3. Confirm owned isolation, available tooling and test commands; do not read installed secrets.
4. Record the baseline honestly, including known lint/format failures.
5. Agree on contracts, no-side-effect previews and exact acceptance scope.
6. Implement only the chosen phase; add tests with behavior changes.

## Per-phase exit gate

Actual commands/results, baseline-vs-regression classification, negative-path tests, screenshots where useful, source diff review, updated relevant guide, unresolved risks and the next safe manual task. A screenshot is not identity, ownership or test-evidence proof.

A phase report must include NOT RUN checks, not simply omit them. Only the user or an explicitly authorized isolated fixture may perform live provider or company-workspace checks. Never fabricate paid/live outcomes from controlled fixtures.

## Architectural decisions to resolve explicitly

1. Exact canonical version used by the new agent-led template, preserving final gate constraints.
2. Location/owner of read-only project discovery and check-compatibility diagnostics.
3. Whether Test-to-Build resolution uses an existing execution snapshot or needs an additive versioned binding contract.
4. Initial .NET runner and normalized report identities, including multi-target aggregation and capacity limits.
5. Supported-vs-advanced-only field projection rules and lossless Guided/Advanced editing.
6. How preflight acknowledgments bind to changed commands, executable resolution, sources and policy.
7. Parallel release scope and transfer envelope; never silently treat a sequential definition as a parallel plan.

## Scope explicitly deferred

A second runtime/provider store; blanket shell/script permission; AI authoring/verifying its own reports; arbitrary remote execution; nested/unlimited agents; automatic merge/publication; same-session task continuation; unrestricted manual takeover; always-on services; a complete arbitrary expression/schema language; replacing all storage/state libraries; reconstructing all ZCode UI.

## Definition of Done

A feature is done when it is implemented in the authorized scope, tested at the necessary layers, has negative-path coverage, preserves existing records and native behavior, has accessible explanatory UI, has no new critical in-scope failure, and is documented with real evidence. User-friendly wording never replaces backend validation.
