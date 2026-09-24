# Future roadmap — native ZCode Graph Engineering

## Product boundary

Graph and ordinary Chat use the same native agent runtime. A graph Agent Task is a complete tool-using task, not a single model response. The graph supplies task sequencing, explicit handoffs, checkpoints, and evidence. It does not draw every internal file read or tool call, replace native Chat, or create another provider/credential store.

The selected workspace can be a complete project. Test fixtures are deliberately small; the product must not be permanently hardcoded to those fixtures or a demo-only tool allowlist. Real private-project execution nevertheless requires the user's explicit authorization and a deployment/data-flow check.

## Baseline known when this pack was prepared

- Z1: native single-task integration was accepted for development progression based on a report and screenshots, not an independent code audit. The report describes Host-owned graph state, CLI-owned agent execution, native tools and same-session navigation. A greeting alone is not live project-tool verification.
- Z2: assigned, not reported complete. Its target is an editable sequential graph, one fresh native session per task, explicit Start/prior-final-text bindings, frozen runs, and safe inactive-only release of interrupted work.
- The old Vue/C# M1–M3 prototype is preserved separately. Standalone M4 was not started and is not a prerequisite.
- The Z1 report recorded root checks passing with separate CLI-lint and checkout-format baseline failures. Actual future baselines must be rerun; historical counts are not guaranteed current results.
- Later packaging/publication changes may exist. Inspect and preserve them; do not recreate or revert them from memory.

## Delivery order

| Milestone | Dependencies | User-visible result | Decisive acceptance |
|---|---|---|---|
| Z3 — Human checkpoints | Verified Z2 implementation | An explicit Approve/Reject pause bound to the displayed evidence; safe restart of a pending gate | An approved gate admits one successor; reject, stale evidence, duplicate clicks, and unknown activity cannot do so |
| Z4 — Evidence and deterministic tools | Z3 | Tool nodes for configured commands, real command/test artifacts, optional structured outputs | A real fixture test failure remains failure even when an agent says it passed; stale/missing reports never become success |
| Z5 — Routing and bounded repair | Z4 | Conditions, exclusive branches, and a finite repair region | A seeded defect is repaired, rebuilt, and retested; invalid decisions, exhausted limits, or ambiguous work stop without extra dispatch |
| Z6 — Templates and game pilot | Z5 | Versioned workflow library, project/skill references, sequential slot-game engineering template | Instantiate a template, preserve frozen versions, and prepare a traceable game workflow; live company execution is a separate user gate |
| Z7 — Controlled parallelism | Z6 plus proven workspace isolation | Explicit fork/join, separate worker workspaces, reviewed integration | Two workers cannot overwrite the same working tree; conflicting changes require a decision; the combined result is tested again |
| Z8 — Internal release and upkeep | Z6 minimum; Z7 only if shipped/enabled | Reproducible Windows delivery, safe upgrades/backups, compatibility tests and support diagnostics | An isolated install/upgrade preserves historical runs and never launches agent work or replays unknown inputs |

Z8 can precede Z7 for a sequential-only internal release. That release must not expose or advertise unverified parallel behavior. No need to wait for parallelism to obtain practical value from the product.

## Practical usability targets

After Z2: Analyze -> Implement -> Verify as normal native tasks, with explicit text handoffs.

After Z4: insert a human checkpoint and machine-inspectable Build/Test results. This is a useful supervised development workflow, not yet autonomous repair.

After Z5: a bounded reviewer/repair cycle can run on approved test workspaces without turning transient errors into repeated side effects.

After Z6: instantiate an engineering workflow rather than repeatedly configuring every node. Prepare the first authorized sequential game-project pilot.

After Z7: selectively split independent spin-type tasks; keep integration and combined validation explicit.

## Intended game workflow

Analyze approved math/source material -> Produce source-linked rules -> Human approval of interpretation -> Implement selected behavior -> Build and harness -> Review actual results -> Human final decision.

Z5 adds a bounded repair route around implementation/verification. Z7 may replace the sequential implementation section with approved independent workers and a required integration node. Math/RTP evidence is evaluated against an explicit target, sample configuration and acceptance rule; it does not certify correctness by itself. Game-specific retrigger/max-win rules come from the selected source, never from a universal template assumption.

An optional repository publication action is outside these tasks. Final human approval is not automatic permission to push, merge, release, or bypass branch protection.

## Work intentionally deferred

Remote/SSH/mobile Graph execution, always-on/background service ownership, scheduled launches, public multi-user hosting, a plugin marketplace, arbitrary workflow code execution, automatic PR/merge actions, and Computer Use are separate proposals. Their availability in normal ZCode, where present, does not establish Graph orchestration support.

Fresh sessions remain the default for independent nodes and repair attempts. Same-session continuation/forking and manual takeover are later features unless a named assignment explicitly adds their ownership semantics.

## Changes to this roadmap

Each task starts with a short delta review against the actual preceding implementation. Update plans when facts change; do not delete past verification results. Record a concrete deviation and its implications rather than silently expanding scope. No speculative mass rewrite is authorized by this roadmap.
