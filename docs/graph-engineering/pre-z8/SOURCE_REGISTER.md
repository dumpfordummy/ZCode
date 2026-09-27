# Source register and audit boundary

## What was done

Read the user-provided 3.14.0-z7.2 guide and existing roadmap/Z8 assignment, inspected the relevant pinned public repository files through the GitHub connector, and consulted primary .NET/UI references. Reviewed the screenshot and reported friction already in this conversation. No local application was launched, no repository was compiled, and no native/automated/user tests were performed.

A direct container HTTP fetch failed because container DNS/network access was unavailable. The source review used successful connector reads instead. This does not prevent the documented source observations; it does mean there was no local source checkout/build audit.

Guide baseline: tag `graph-v3.14.0-z7.2`, guide source commit `7e5f02d76abf20d567df1a9e6ddb868ab3421205`. Main-branch changes and the user's current installation were not inferred to match the tag. U0 must reconcile them.

## Sources

**S1 — user guide, supplied attachment `LLM_USER_GUIDE.md`.** Applies to 3.14.0-z7.2. Sections 2, 4–12 cover native ownership, sequential handoffs, recipe/report requirements, approvals, repair, library, Fork/Join restrictions and evidence limitations. Repository counterpart: https://github.com/dumpfordummy/ZCode/blob/graph-v3.14.0-z7.2/docs/graph-engineering/LLM_USER_GUIDE.md (the attachment, not an unverified counterpart, is the guide actually read).

**S2 — inspected built-in Sequential engineering template.**
https://github.com/dumpfordummy/ZCode/blob/graph-v3.14.0-z7.2/docs/graph-engineering/templates/generic.v1.json

**S3 — inspected template-binding UI.** Shows loaded recipe list mapping, unresolved option, required-value gating and explicit reference fields. It does not alone prove the full backend compatibility behavior.
https://github.com/dumpfordummy/ZCode/blob/graph-v3.14.0-z7.2/packages/ui/src/graph-engineering/GraphTemplateBindings.tsx

**S4 — inspected project-recipes UI.** Separate load, JSON textarea, save and example.
https://github.com/dumpfordummy/ZCode/blob/graph-v3.14.0-z7.2/packages/ui/src/graph-engineering/GraphProjectRecipes.tsx

**S5 — inspected library UI and initial editor orchestration section.** Dialog/version/digest/duplicate/transfer controls and UI/native settings/readiness integration. Only the first 130 lines of GraphEditor were fetched; do not present that as a complete audit of the editor.
https://github.com/dumpfordummy/ZCode/blob/graph-v3.14.0-z7.2/packages/ui/src/graph-engineering/GraphLibrary.tsx
https://github.com/dumpfordummy/ZCode/blob/graph-v3.14.0-z7.2/packages/ui/src/graph-engineering/GraphEditor.tsx

**S6 — inspected artifact/recipe interfaces.** Recipe test format, native provenance and snapshots.
https://github.com/dumpfordummy/ZCode/blob/graph-v3.14.0-z7.2/packages/services/src/graph-engineering/artifact-types.ts

**S7 — inspected strict report validator.** Payload discriminator, provenance checks, distinct invalid/fail/pass outcomes, test identity and positive-count checks, 1,000-entry limit.
https://github.com/dumpfordummy/ZCode/blob/graph-v3.14.0-z7.2/packages/services/src/graph-engineering/domain/tool-verification.ts

**S8 — Microsoft `dotnet test` documentation.** Runner-specific behavior and selection; used to justify explicit VSTest/MTP detection, not a product compatibility claim.
https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-test
https://devblogs.microsoft.com/dotnet/microsoft-testing-platform-azure-retry/

**S9 — Microsoft VSTest CLI documentation.** TRX logger and multi-target fixed-name overwrite caveat.
https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-test-vstest

**S10 — W3C WAI form notifications.** Field-specific error explanation, actionable correction and accessible feedback; applied as a design reference, not a conformance audit.
https://www.w3.org/WAI/tutorials/forms/notifications/

**S11 — Dify Variable Inspector documentation.** Input/output visibility is a design reference. Do not copy editable debugging variables into immutable authorized run evidence.
https://docs.dify.ai/en/cloud/use-dify/debug/variable-inspect

**S12 — earlier future-task pack, attached `zcode-graph-future-tasks-z3-z8.zip`.** Read `docs/graph-engineering/future/ROADMAP.md` and `Z8_TASK.md` from the mounted archive. Establishes original Z8 release manifest, upgrades, backups, retention, security review, packaging and upstream maintenance scope. Historical plans are not implementation evidence.

## Evidence classification

- Source/guide fact: supported by the sources above.
- Observed usability problem: the user's repeated questions and supplied template screenshot; not a controlled usability study.
- Proposed requirement: this plan's U0–U6 work, controls, metrics and acceptance criteria.
- Unknown: actual local toolchain/project needs, current checkout delta and runtime quality not covered by observed tests.

Do not claim all proposals already exist, all Z7 features are verified, or a report parser proves the adequacy of the project test suite. Do not characterize the two existing JSON format names as a confirmed bug; they belong to different contracts.
