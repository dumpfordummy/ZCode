# Source basis and verification boundary

Prepared 2026-09-24. This is a lead-authored task pack, not a completed code audit or executable implementation. The implementation must pin and report its own checkout; a moving main URL is a discovery aid, not a version lock.

## Directly checked official sources

ZCode repository and English README:
```text
https://github.com/zai-org/ZCode
https://raw.githubusercontent.com/zai-org/ZCode/main/README.en.md
```
The accessed documentation describes a desktop/web/terminal application with shared React/Zustand UI and agent source. It lists Node 24.14.0 and pnpm 10.33.2; the checked-out mise.toml and manifest are the implementation authority. It documents ZCODE_DATA_BASE_DIR and distinguishes desktop production/test launch configurations. In particular, ordinary dev:desktop uses production service configuration; a developer launch is not automatically an isolated/offline launch.

ZCode root instructions and tool pins, read through the GitHub connector:
```text
https://github.com/zai-org/ZCode/blob/main/AGENTS.md
https://github.com/zai-org/ZCode/blob/main/mise.toml
```
The inspected instructions require spec-first behavior changes, repository architecture governance, service access through UI hooks, exact workspace identity propagation, preserving host/runtime ownership, and actual typecheck/lint results. Follow all applicable instructions in the actual checkout. Do not overwrite them with this pack or the old project's rules.

React Flow official quick start:
```text
https://reactflow.dev/learn
```
The current package documented is @xyflow/react. This identifies a candidate canvas dependency; no specific version or existing ZCode dependency is asserted by the pack. Reuse an existing compatible graph dependency when appropriate and record any new lockfile changes.

## Prior session inspection — recheck in the pinned checkout

```text
packages/services/src/zcode-session/zcodeSession.ts
packages/services/src/session/zcodeTaskService.ts
packages/services/src/accessor.ts
NOTICE.md
LICENSE
```
Earlier inspection found native session/task interfaces and disclosures about execution/network limits. These are starting locations, not guaranteed stable APIs. This pack does not assert that a complete native graph extension API exists or that every feature in a released binary is supplied by public source. Verify actual dispatch, input IDs, subscriptions, terminal and cancellation semantics rather than implementing against assumed signatures.

## Previous implementation as reference

The user's M3 report describes explicit data binding, immutable run snapshots and conservative restart recovery. Subsequent user screenshots and confirmation established the manual two-node and restart checks for development progression. Preserve the old repository, reports and artifacts unchanged; report text may predate those operator checks.

Those are prior implementation/user-report results, not proof that the new React/ZCode feature inherits those guarantees automatically. Port requirements and add new tests at the new integration boundary. No old credentials, databases, code or reports are bundled here.
