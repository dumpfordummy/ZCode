# TASK_008 — U5 native integration acceptance

## Objective

Verify the real U5 product path through the existing native Electron isolation harness.
Tests must call actual components, hooks, and related product services — no equivalent
implementation substituted. The system-dialog-return-path / cancel boundary may be replaced
by a controlled test seam; normal success scenarios must use real temporary files and actual
file read/write implementations.

## Required scenarios

1. Export → file → import round trip
2. Cancel and failure protection
3. Async lifecycle
4. New request (pinned AND unpinned) + run-identity proof

## Side-effect verification

Prove dynamically that the tested operations cause no Agent input, Tool command execution,
worker workspace, plugin install, or MCP connection. Separate app-startup activity from
tested-operation activity.

## Authorized defect scope

May fix local UI/file-wiring/lifecycle defects within U5 spec scope: reproduce first,
minimal fix, add targeted check, rerun. No fixed sleeps, no swallowed exceptions, no
deleted assertions, no modified expectations to accommodate product errors.

## Delivery

Write `TASK_008_REPORT.md`, update `EXECUTION_PLAN.md` (preserving TASK_007's original
report). Deliver: exported synthetic template file + independent read result; screenshots;
evidence; actual commands/build-identity/pass-fail-skip counts; OS dialog human-check
checklist.
