# Z8 plan — approved scope and decisions

Status: Z8.1 approved (2026-10-01). Z8.2–Z8.5 are **not** approved and not started. [Z8_DELTA_AUDIT.md](Z8_DELTA_AUDIT.md) is the audit record and is not edited by later work; this file records what was approved and what changed relative to the audit's proposals.

Branch policy: Z8.1 work happens on the local branch `claude/z8-1-release-package`, started from the accepted UX integration commit `51f6ed67f63ff3500abca1bd86023f40bb29543d` (the remote-tracking branch `origin/claude/zcde-graph-ux-audit-be80d8` points there; the _local_ branch of that name is stale at `8bf69e5`, UX-M2, and was deliberately not used). Normal scoped local commits are allowed. No push, merge, tag, signing, publication or installation.

## Approved decisions (Z8.1)

1. **Upstream identity.** Adopt root version `3.14.3` and candidate version `3.14.3-z8.1`, because a focused check substantiated the audit's content finding (evidence in the Z8.1 report). Record the pinned upstream comparison SHA and the actual merge-base separately. State only what was compared. Do not claim whole-tree equality or upstream ancestry, and do not merge, rebase or fabricate ancestry.
2. **Version policy.** The existing policy owner (`resolveGraphDistributionVersion`) accepts `z8` in addition to `z1`/`z2`/`z7`. No arbitrary milestone numbers. Every caller (builder, packaged smoke, publisher, CI validation) is covered by tests.
3. **Parallel capability.** One authoritative capability policy. The supported Graph package defaults to parallel **disabled**: UI hides/disables unsupported actions with an explanation, the Host rejects new parallel admissions even for direct service calls, the manifest records the package's actual policy. Historical parallel records stay readable, inspectable, cancellable and conservatively recoverable. Ordinary Chat subagents and other native features are untouched. An explicit, unsupported development opt-in may exist; it cannot enable the supported package.
4. **z7.6.** The unreleased "prepare z7.6" notes commit (`bca9a73` on `origin/main`) is inspected and its relevant corrections carried into Z8 release notes. z7.6 is not released and unrelated `main` changes are not merged.

## Z8.1 deliverables (summary; the contract is [Z8_1_SPEC.md](Z8_1_SPEC.md))

Release identity and manifest (builder extension), packaged-content inspection, deliberate Graph-flavor telemetry policy, two serialized local builds with comparison, and validation. Final justified status: **Z8.1 LOCAL CANDIDATE BUILT AND INSPECTED — UPGRADE, SECURITY AND INSTALL ACCEPTANCE PENDING.**

## Refinements recorded for later stages (documentation only — nothing here is authorized)

- **Credential key derivation** (`platform:homedir:username`, or `ZCODE_CREDENTIAL_SECRET`) is a named **Z8.3 security decision** that must be taken before any real-credential pilot use. It must not be described as OS-protected storage. No credential migration is authorized.
- **Graph-data backup** is not a whole-profile or native-session backup. Consistency (a copy taken while no Host owns the lock) and restore limits must be defined before implementation.
- **No migration framework** unless an actual schema need appears. Z8.2 proves old data opens; it does not add machinery.
- **Retention/deletion UI** is deferred from the initial internal release unless measured storage or performance needs justify it. The acceptance requirement stays explicit and open: active or uncertain evidence must never be silently purged, separate stores (Graph records, artifacts, native sessions/logs, backups) must be disclosed, and logical deletion must not be described as removal from all copies. Until implemented, the release must say retention controls are absent.
- **Support bundles** are allowlisted metadata by default. Logs, source, prompts and raw records each need separate explicit selection. Credentials and provider configuration are never included.
- **Installer download/execution and VM/Sandbox setup** remain later authorization checkpoints. An extracted executable in a temporary home is not OS isolation.
- Production-egress measurement and the Feedback-uploader review are **Z8.3** items.

## Still pending after Z8.1

Z8.2 upgrade/backup/conservative recovery; Z8.3 diagnostics, security decisions, upstream compatibility suite; Z8.4 isolated Windows package acceptance; Z8.5 user pilot. Nothing in Z8.1 is evidence for these.
