# ENG-P1-I1: dependency integration and rendered harness repair

## Scope and owners

Parent #23 was authorized for one guarded normal merge. Its exact head is
`67e570228aa8a48f96fdbbe6c89eb54023879745`, base
`f7279c79824e518abc6f4fdeb2c6cf66b86bac31`. Ready-for-review run 38883964590
passed all four jobs (1,041 tests passed, four expected skips). Actual merge
`ac5907e2e37c544843eb7f9ede25422290785309` has tree
`bec8c719607dd7bb88aa049f6b55204a7a25ae18`, identical to approved source and
the historical synthetic merge. This checkout normally merges that integration.
Only #24 is retargeted; it remains draft with auto-merge off.

Before editing, the intended file/owner map is:

- `scripts/graph-engineering/ux-m1-helpers.mjs`: exact read-only history allow-list.
- `scripts/graph-engineering/context-picker-host.mjs`: narrow empty-history fixture
  through the real projectSetup facade; every other graph access remains rejected.
- `scripts/graph-engineering/ux-m2-scenarios-checks.mjs`: unique direct JSON disclosure
  summary locator and keyboard/focus/expansion assertions.
- `scripts/graph-engineering/context-picker-scenarios.mjs`: specific size rejection,
  current Host diagnostic, async completion and retained draft assertions.
- `scripts/graph-engineering/eng-p1-i1-*`: focused negative controls and sanitized
  diagnostics as needed. No second runtime owner.
- This spec, `Z8_5_ENG_P1_I1_REPORT.md`, `evidence/eng-p1/i1/`: prospective results,
  named failure ledger, identity and handoff evidence.

Codex owns these generic test harnesses. Product components, service/native code,
contracts, workflows, dependency files and Claude's ux-p1 files are read-only.
U3 is separate; investigate only if it interferes, using a bounded serial comparison.

## Acceptance

Reproduce affected suites once on the unchanged source before repair, retain failures
by actual scenario name, and run focused scenarios during iteration. Preserve the
existing scenario guards and demonstrate that injected inspection start, mutation,
admission and forbidden calls are rejected in passive views. No timeout inflation,
force clicks, strict-mode disabling or sleep-based green.

Final local candidate: relevant suites, negative controls, pinned typecheck/lint,
changed-file formatting and PR-scoped architecture. One disposable isolated checkout
may combine this code with UI snapshot `2446d0c0e0a1e8189cad137fa36436b77bb0f9ea`;
this is snapshot compatibility only. Required final #24 CI must actually run on the
published final head and synthetic merge. Parent CI is separate evidence.

Prior ENG-P1 measurements established no speedup and changed no production verification.
R1 is closed. No performance/native campaign, installer, child merge, tag or release.
