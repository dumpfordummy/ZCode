# ZCode Graph Engineering — Z1 handoff

Decision date: 2026-09-24. This archive contains project instructions, not application code or a ZCode checkout.

The user has selected a native Graph Engineering feature in a ZCode fork. React is accepted. The old standalone Vue/C# M4 assignment is superseded. Preserve the completed M1–M3 project and any subsequent in-progress changes; do not reset or delete them.

## Apply

1. Stop the old Codex assignment at a safe checkpoint; do not reset its working tree.
2. Use a separate ZCode checkout, preferably a sibling of the old Graph-Engineer directory. A local clone and branch are sufficient; do not publish a remote fork or push anything as part of this task.
3. Merge this archive's `docs/graph-engineering/` directory into that checkout. Preserve ZCode's own AGENTS.md, skills, architecture policy, and design documents. Do not copy the old application's AGENTS.md over them.
4. Open a fresh development Codex session in the ZCode checkout. The Codex used to implement the feature is distinct from the ZCode agent runtime that the feature will use.
5. Read and follow `docs/graph-engineering/Z1_CODEX_PROMPT.md`.

Z1 consists of baseline/source investigation followed by a bounded native implementation, provided the investigation establishes a workable integration. Do not stop at a plan when that gate is satisfied. Stop with a precise blocker report when it is not; do not substitute a new agent engine.

Final handoff: `docs/graph-engineering/Z1_REPORT.md`, native-tab and same-session conversation screenshots using synthetic data, and exact manual runtime-verification instructions. Never label a fixture run as a user-operated real-agent result.
