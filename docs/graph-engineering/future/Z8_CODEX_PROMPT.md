# Z8 entry prompt — internal release hardening and upstream compatibility

Use this prompt only when the user explicitly selects Z8. Merely reading/copying the future pack does not authorize implementation or later stages.

Continue the existing ZCode fork. Read applicable repository instructions, architecture/design rules, current Graph specs and actual predecessor reports, then:

1. docs/graph-engineering/future/ROADMAP.md
2. docs/graph-engineering/future/EXECUTION_RULES.md
3. docs/graph-engineering/future/Z8_TASK.md
4. docs/graph-engineering/future/REPORT_TEMPLATE.md

Implement Z8 only. Required prerequisites: Z6 sequential product; Z7 only if parallelism is shipped/enabled. Verify the actual implementation and baseline; task files alone do not prove completion. If a prerequisite is genuinely absent, report it and stop rather than silently implementing several milestones or replacing the existing application.

Preserve user changes, prior source/history, native Chat, settings/provider ownership, current packaging work and the separate old Vue/C# prototype. Update only stale scope statements overridden by the current explicit instruction; never rewrite historical results.

Define/adjust specs and contracts before implementation. Reuse current native APIs and verify exact symbols. No second agent engine, provider store, C# sidecar or embedded Vue app. Do not mistake a multi-call native agent task for one model request.

Implement the complete bounded task, not only scaffolding or a plan. Keep source/permission/evidence/attempt identities explicit, preserve uncertainty, and never replay unknown work, bypass approvals or cancel unrelated sessions. Handle a real blocker with evidence, not a guessed API or weakened guard.

Use isolated app data, synthetic workspaces, controlled providers and real native tools for acceptance tests. Do not access installed credentials, company projects, private integrations or application-triggered live model accounts without separate authorization. Do not stage, commit, push, merge, publish or install over the live app automatically.

Run the selected task's full verification matrix and the required repository checks. Keep baseline CLI lint/format failures visible and distinguish new regressions. Perform native rather than fixture-only checks where required. Never invent a live-user PASS or infer it from a screenshot of a different operation.

Review the final diff and fix in-scope defects. Write docs/graph-engineering/Z8_REPORT.md using the shared template, update current progress/specs, and provide actual screenshots and exact manual instructions. If required native checks are missing, report that accurately rather than unqualified readiness.

Stop after Z8. Identify the next eligible milestone but do not begin it.
