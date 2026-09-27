# ZCode Graph — pre-Z8 improvement plan

Planning documents only. No application source was modified and no tests were run while producing this pack.

Reference release: **3.14.0-z7.2**. Proposed phases: **U0–U6**, then the existing **Z8** release-hardening assignment.

## Read first

1. `docs/graph-engineering/pre-z8/MASTER_PLAN.md` — product direction, source-backed problems, UX/verification architecture and Z8 entry gate.
2. `BACKLOG_AND_ACCEPTANCE.md` in the same directory — individual deliverables and negative-path tests.
3. `DELIVERY_PLAN.md` — dependencies, ownership, boundaries and exit gates.
4. `SOURCE_REGISTER.md` — what was actually inspected and what remains unknown.

`CODEX_U0_PROMPT.md` is the optional next assignment. It authorizes only a scoped baseline/specification task when the user chooses to give it to Codex; it does not instruct one unrestricted implementation of all phases. `REPORT_TEMPLATE.md` is shared across future phases.

## Add to the existing fork

Merge the supplied `docs/graph-engineering/pre-z8/` directory into the actual ZCode Graph checkout. Preserve existing files, current application code and upstream `AGENTS.md`. Do not reset the checkout to the reference release. No new clone or Vue/C# sidecar is required.

## Core decision

Offer an easy agent-led supervised workflow without recipes, and an explicit verified workflow with guided project-check setup. Simplify configuration, not evidence or permissions. Keep parallel support conditional until its specific gaps are resolved. Continue using the native ZCode runtime and the existing authoritative graph model.
