# Paste into Codex in the separate ZCode checkout

The user has approved a native Graph Engineering feature in ZCode and accepts React. The previous standalone Vue/C# M4 implementation is superseded; preserve that project and any in-progress changes.

Read the applicable upstream AGENTS.md and required architecture/design instructions first, then:
- docs/graph-engineering/PRODUCT_DIRECTION.md
- docs/graph-engineering/Z1_NATIVE_AGENT_TASK.md
- docs/graph-engineering/Z1_REPORT_TEMPLATE.md
- docs/graph-engineering/SOURCES.md

Implement Z1 only. Follow both phases of the task.

First inspect the working tree, exact upstream revision, toolchain and startup behavior. Use isolated development data. Build/smoke-test the relevant unmodified application and trace normal chat from workspace/model selection through dispatch, events, permissions, questions, cancellation and conversation navigation. Record Z1_INTEGRATION_MAP.md with actual paths and symbols.

If that establishes a viable native integration, update the required specs and implement a real Graph Engineering tab with Start -> Agent Task -> End. Do not stop after writing a plan. If a relevant baseline or integration boundary blocks implementation, report the exact blocker; do not invent APIs or substitute another runtime.

Reuse the same native ZCode agent/session services as ordinary chat. Reuse existing provider settings, credentials, workspace instructions, tool capabilities, permissions and conversation UI. Do not add a C# sidecar, embed Vue, build another tool loop, or simulate execution.

Persist graph metadata and exact workspace/session/input correlation. Support honest progress/waiting states, duplicate protection, cancellation and conservative restart reconciliation. Open conversation must show the same session without resubmitting. Do not infer task completion from assistant prose or a session's old terminal state.

Use controlled fixtures and synthetic workspaces. Do not inspect installed auth files, copy credentials, change my installed ZCode/Codex configuration, weaken permissions, run paid agent tasks, or open company repositories. The user performs the real-provider check through the isolated app after implementation.

Follow the current repository tests, typecheck, lint, architecture and native smoke requirements. Review the final diff. Write docs/graph-engineering/Z1_REPORT.md with real evidence, screenshots, precise setup steps and remaining limitations. Mark unavailable tests NOT RUN.

Do not automatically stage, commit, push, merge, publish a fork, or start Z2.
