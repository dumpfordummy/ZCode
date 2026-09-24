# M3 lead acceptance — 2026-09-24

## Decision

**ACCEPTED FOR DEVELOPMENT PROGRESSION. M4 IS AUTHORIZED.**
This is not production release approval, an independent repository audit, or math certification.

## Evidence available to the lead

1. M3_REPORT(1).md reports a passing integrated suite: 269 backend tests, 81 frontend
   tests, 22 browser tests, and A01–A16 coverage. The lead has not rerun that suite or
   independently inspected all referenced artifacts.
2. The earlier user screenshot shows an actual Start → Model Call → End greeting run.
3. The latest user screenshot shows second-node resolved inputs {"varX":14}, a prompt
   explicitly containing 14, assistant text {"varY":140}, and local JSON validation.
4. The user replied “restart works as well” to the combined completed-history and
   same-profile credential restart instructions. Accept this as operator confirmation
   of the requested restart checks. Do not fabricate a new duration, timestamp, request
   count, run ID, or exact CLI transcript from this short confirmation.

The screenshot supports the binding/value check, not an independent network request-count
measurement. The latter remains fixture evidence in the implementation report.

## Recordkeeping

Add this acceptance to PROGRESS.md. Preserve the original M3 implementation report as a
historical report: its NOT RUN labels were accurate before the user supplied subsequent
evidence. Link this acceptance rather than silently rewriting old results as if Codex
had performed the human checks. The M2/M3 human progression gates are closed on the
above operator evidence; do not ask the user to repeat them again without a new defect.

## Carry-forward invariants

- Keep existing explicit bindings and legacy document preservation.
- Keep provider credentials, exact destination checks, local sessions, CSRF, and hub security.
- Do not replay ambiguous external work after crashes or browser refreshes.
- Retain exact process-handle/job ownership cleanup. Never infer termination ownership
  from process name, PID alone, or parent-PID ancestry.
- Preserve reported limitations: local plaintext run data, same-user trust boundary,
  no exactly-once external execution claim, and no general arbitrary-code sandbox.

## M4 authorization

Add Coding Agent, fixed Tool recipes, durable Human Approval, and their run inspection.
Use one fresh synthetic repository per run. Implement the installed local Codex adapter
without reading/copying authentication files or modifying the developer's global settings.
No company repository pilot, arbitrary command editor, repair routing, automatic merge,
production deployment, or M5 work is authorized.
