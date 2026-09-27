# Codex assignment — U0 only

Continue the existing ZCode Graph fork. The user has requested a thorough pre-Z8 improvement plan. Do not assume all proposed phases are authorized for implementation.

Read applicable AGENTS.md, DESIGN.md and architecture-governance instructions. Then read all of:
- docs/graph-engineering/pre-z8/MASTER_PLAN.md
- docs/graph-engineering/pre-z8/BACKLOG_AND_ACCEPTANCE.md
- docs/graph-engineering/pre-z8/DELIVERY_PLAN.md
- docs/graph-engineering/pre-z8/SOURCE_REGISTER.md
- docs/graph-engineering/pre-z8/REPORT_TEMPLATE.md

Perform U0: audit the actual baseline and prepare implementation-ready specifications. Do not implement U1–U6, rewrite the application, change execution permissions, run paid models or start Z8.

Before editing any documentation, inspect and preserve the working tree, exact source commit, package/installed-version information available without accessing private settings, existing guides and already-authorized distribution changes. The plan references 3.14.0-z7.2; reconcile against your actual checkout instead of resetting to that ref.

Investigate and document:
1. The exact current path from template selection to recipe loading, compatibility, validation, instantiation, preflight and native dispatch.
2. Whether unloaded/empty/read-failed/incompatible recipe states are distinguishable and where they are owned.
3. An agent-only supervised template using existing native Tasks and final approval, without falsely labeled verified testing.
4. Canonical Guided/Advanced projection and the preservation rule for advanced-only fields.
5. The existing source/build/test evidence contracts. Keep recipe `zcode-json-v1` distinct from payload `zcode-test-v1` if still present; inspect actual current source instead of assuming.
6. The integration boundary for a trusted .NET report adapter; discover supported test-platform candidates only from authorized non-confidential fixtures. Do not guess the user's company harness or inspect it without authorization.
7. Native paths/permissions/private-home behavior, unsafe script-wrapper shortcuts, cancellation/recovery and no-implicit-execution constraints.
8. A separate supported/experimental decision for parallel mode and the current portability limitation.
9. A narrowly mapped first U1 implementation task with relevant files, tests, wireframes and acceptance criteria.

Use read-only source inspection and existing controlled fixtures where available. Before running scripts/tests, inspect isolation and side effects. Use only approved project-local tools and synthetic workspaces. Do not use installed credentials, change global tool settings, auto-install packages or execute unknown repository code to measure discovery. Ask through normal approval when setup is genuinely needed; mark unavailable tests NOT RUN.

Write U0_BASELINE.md and update the corresponding repository-owned product/architecture specs following upstream instructions. Clearly distinguish confirmed source behavior, observed runtime evidence, proposed design, and unresolved questions. Record test results only when actually run. Preserve historic reports and baseline failures.

Return the U1-ready scope plus blockers and decisions that require the user. Do not automatically stage, commit, push, merge, publish, sign, install over a live application, or continue into another phase.
