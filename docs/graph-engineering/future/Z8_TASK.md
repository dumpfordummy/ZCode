# Z8 — internal release hardening and upstream compatibility

## Objective and dependency

Dependency: Z6's usable sequential product. Require Z7 only when parallel behavior is shipped/enabled. Inspect any already-authorized Windows distribution work and extend it; do not replace it from the Z1-era assumptions.

Prepare a maintainable Windows-first internal release, not a public unattended automation service. Creating local test packages is in scope; publishing/signing with real credentials or installing over the user's live app requires separate authorization.

## A. Release manifest and capability boundary

Record exact fork/upstream commit, package/agent/protocol versions, lockfile/toolchain, build commands, supported OS/architecture, enabled Graph features and known exceptions. Check capabilities at startup through supported native interfaces. Unsupported adapter/protocol combinations must fail clearly, not scrape fallback fields or send guessed commands.

Make the distinction visible between normal native feature availability and verified Graph support. Remote Graph execution, background scheduling and optional assets stay disabled/unadvertised unless separately verified. Closing the owning Host is not an always-on guarantee.

Do not hide baseline lint/format failures. Either fix specifically authorized issues separately or include reviewed exceptions with clear provenance. Release readiness requires no new in-scope failures and explicit decisions on remaining baseline risk; a green subset is not the whole repository.

## B. Upgrade, data and recovery

Maintain old graph/template formats, node versions, artifacts, approval histories and session references. Test additive migrations on fixture copies of every supported format. Back up before mutation using an atomic/consistent native storage strategy. A failed migration must not partially advance state or start an agent.

Document restore/reentry behavior for native credentials without exporting them. A database/config backup is not necessarily a restorable credential backup. Do not copy installed auth files or bypass OS protections to make portability convenient.

Unknown/active runs remain conservative on restart or upgrade. Pending safe gates can be restored through the verified Z3 rules; updates never automatically approve, continue, replay, start scheduled work or release active guards.

Add retention controls for graph metadata/artifacts and associated native conversation references. Deleting a graph record does not automatically erase the runtime's own logs/conversation. Explain separate stores and logical deletion versus removal from all backups. Active/uncertain evidence cannot be silently purged. Default export/diagnostics excludes source, prompts, attachments, tokens and private endpoints unless explicitly reviewed.

## C. Security and operational review

Trace actual current startup/network/config flows, including primary/auxiliary models, hooks, plugins/MCP, update/catalog/telemetry and diagnostics. Validate selected-workspace access, path/artifact handling, imported templates, permission/automatic-question protections and command argument safety. Use synthetic secret canaries and non-confidential repositories.

Address confirmed in-scope vulnerabilities with tests; do not infer security from local UI or an endpoint label. Prompt instructions and worktrees do not equal an OS sandbox. Malicious same-user processes/admin access and third-party provider retention remain explicit boundaries.

Review exact licenses/notices/third-party asset requirements from the pinned source and dependency set before redistribution. Do not assert legal clearance merely from a root license label. Keep required attribution and notices in built artifacts. Signing/credentialed publication remains a separate operator step; unavailable verification is NOT RUN.

## D. Build, install and upgrade testing

Use the current supported build scripts, pinned dependency resolution and sequential output writers. Produce a manifest and digests for actual local artifacts. Do not invent a packaged-app PASS from development-mode Electron tests.

Test an isolated fresh Windows package, an upgrade over an earlier fixture installation, and uninstall/rollback behavior where supported. Preserve user-selected data and the original installed app. OS registration/protocol handling, native runtime assets, configuration paths and update endpoints must be tested in an authorized isolated environment, or listed as NOT RUN with a release blocker/exception decision.

App startup without a configured provider must allow viewing/editing and safe setup without attempting paid model work. A package must not embed fixture keys, private provider URLs, developer paths, scratch profiles or test-only network bypasses.

Review performance with a realistic saved-graph/run-history fixture and bounded logs/artifacts. Avoid speculative caches/rewrites. Record measurements and the chosen acceptable bounds; no unsupported speed or scale claims.

## E. Upstream maintenance

Keep a small adapter boundary to native session/command/permission/event APIs and a durable compatibility test suite. Document the exact integration points changed in the fork, including session ownership and automatic-question protection.

Create an upstream-upgrade checklist: inspect source/NOTICE/architecture changes, baseline build, adapter contract tests, native Chat regression, Graph send/cancel/restart/gate tests, template migration, and optional parallel tests. Test upgrades in a separate checkout/worktree. Do not auto-merge a new upstream commit or loosen validation on unknown schema fields to make an upgrade seem compatible.

Provide a support bundle generator with an explicit preview. Include versions, capability flags, IDs and sanitized errors by default, not raw source or secret stores. Report failure without automatically uploading the bundle anywhere.

## Required verification

| ID | Scenario | Required result |
|---|---|---|
| Z8-A01 | Full enabled-feature baseline and manifest | Actual results, exact build identity and visible baseline exceptions |
| Z8-A02 | Packaged isolated Windows fresh launch | Native runtime/Graph works; no fixture/private data or automatic model execution |
| Z8-A03 | Upgrade old graph/run/template/artifact/gate fixtures | Data preserved; no duplicate session/input or silent version reinterpretation |
| Z8-A04 | Interrupted/active work across upgrade/restart | No replay/approval/unsafe guard release |
| Z8-A05 | Migration/backup failure and restore test | No partial startup execution; recovery instructions verified on fixture data |
| Z8-A06 | Retention/deletion/export and support bundle | Store boundaries disclosed; active evidence protected; synthetic secrets excluded |
| Z8-A07 | Permissions/path/import/network configuration review | Confirmed behaviors tested; unresolved external behavior clearly recorded |
| Z8-A08 | Protocol mismatch/unsupported runtime | Safe explicit incompatibility, no guessed fallback execution |
| Z8-A09 | Native ordinary Chat plus full Graph regression | Enabled feature set works without duplicate agent engine/state |
| Z8-A10 | Package notice/signing/install side effects | Actual artifacts inspected; credentialed/OS checks NOT RUN when not authorized |
| Z8-A11 | Representative history/load fixture | Measured behavior within documented limits; no silent artifact loss |
| Z8-A12 | User internal pilot and release authorization | Separately recorded; package creation alone is not deployment approval |

## Handoff

Write Z8_REPORT.md, RELEASE_MANIFEST.md, OPERATIONS_RUNBOOK.md and UPSTREAM_UPGRADE_CHECKLIST.md. Preserve existing equivalent documents and update them narrowly instead of duplicating their authority. Include exact manual release/install steps, supported capability list, known issues, and rollback/recovery boundaries.

Stop after preparing local artifacts and evidence. Do not publish, auto-update installed apps, sign with user credentials, deploy to colleagues, or create an always-on service unless separately authorized.
