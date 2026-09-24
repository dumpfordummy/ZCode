# Graph Engineering — future Codex assignments, Z3–Z8

Prepared 2026-09-24. These are proposed implementation assignments, not application code or evidence of completed features.

## Use

Merge `docs/graph-engineering/future/` into the existing ZCode fork. Do not replace AGENTS.md, Z1/Z2 documents, application source, or user changes. No new clone or migration from the old Vue/C# prototype is required.

Z2 remains the current assignment. No Z2 implementation report was supplied when this pack was prepared. Z1 was accepted for development progression from the user's screenshots and implementation report, with live repository-tool acceptance still outstanding. Historical reports remain historical: do not rewrite their NOT RUN entries without attributable new evidence.

The user requested future assignments in advance. That request creates a backlog; it does not instruct Codex to run all six assignments automatically. The user can select any next eligible milestone without waiting for another document from the lead. An explicit instruction to implement a named milestone authorizes that milestone only, after its prerequisites are checked. Follow the narrower scope if another instruction authorizes only Z2.

1. Complete and verify Z2 in the current checkout.
2. Select one eligible task, normally Z3, and issue its CODEX_PROMPT.
3. Implement and verify that task; produce its report and stop.
4. Keep human-operated/live-provider checks separately recorded. They cannot be invented or silently waived to enable a private-project rollout.

Example instruction:

> Implement Z3 only by following docs/graph-engineering/future/Z3_CODEX_PROMPT.md. First verify the actual Z2 implementation and report. Preserve current work. If prerequisites are not met, report the specific blocker rather than implementing later stages or undoing Z2.

## Files

- `ROADMAP.md`: sequence, dependencies, product outcomes, and deferred work.
- `EXECUTION_RULES.md`: common architecture, ownership, security, evidence, and stopping rules.
- `Z3_TASK.md` … `Z8_TASK.md`: bounded assignments and acceptance matrices.
- `Z3_CODEX_PROMPT.md` … `Z8_CODEX_PROMPT.md`: milestone-specific entry prompts.
- `REPORT_TEMPLATE.md`: honest, source-linked implementation handoff.

Z3 adds durable human checkpoints. Z4 adds trustworthy evidence and Tool nodes. Z5 adds conditional routes and bounded repairs. Z6 packages reusable workflows and prepares a sequential game-project pilot. Z7 adds explicitly isolated parallel work. Z8 hardens an internal release and upstream maintenance.

These documents deliberately avoid freezing unverified future ZCode API names or dependency versions. Inspect the actual checked-out source and upstream instructions before each change. Product requirements are fixed here; implementation symbols must be verified there.
