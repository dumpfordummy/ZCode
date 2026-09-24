# Z6 — reusable templates and a sequential game-workflow pilot

## Objective and dependency

Dependency: verified Z5 routing/repair, Z4 artifacts/Tool nodes and Z3 gates. Package the proven components into practical, reusable workflows without replacing the native agent's project abilities.

Deliver a workflow library, versioned templates and project references, plus a source-traceable sequential engineering template. Prepare—but do not silently execute—the first company-repository pilot.

## A. Library and immutable versions

Add named saved workflows/templates through existing storage/UI conventions. Support create, duplicate, archive and instantiate-from-template. A run pins the exact template version, graph revision, parameters and referenced configuration versions; later template edits do not change it.

Separate portable definition/layout/parameter schema from local workspace/profile/skill bindings and private execution history. Import/export has a dry preview, compatibility checks and unresolved-binding diagnostics. Never export native credentials, implicit private paths, raw conversations or source artifacts by default. Optional evidence export is a separate reviewed/redacted action.

Importing or previewing never executes a node, enables a plugin, installs a skill, connects an MCP service or runs a script. Unsupported node versions remain rejected/unresolved without deleting the current draft. Referenced template versions are copied/pinned; no invisible live-linked template mutation inside existing runs.

A parameter can select an explicit run request, document reference or known project setting. It must not become arbitrary filesystem/network/command access merely because it appears in a template.

## B. Reuse native instructions, skills and tools

Use native model, skill, project-instruction, command and MCP configuration surfaces. Do not create a competing skill installer/catalog or pretend a graph prompt can enforce tool isolation. Verify the actual source paths and runtime support before adding selectors.

Where a node specifies an additional skill or instruction reference, show what is selected, where it comes from and its captured version/digest where available. Include relevant inherited project instructions in the run's provenance inventory without dumping all private content into logs. A changed reference requires a visible new-run/configuration decision when its semantics matter.

Before execution, preview selected workspace, primary and auxiliary model destinations as actually resolved, relevant hooks/plugins/MCP connections, command recipes and permissions. Verification may reveal destinations whose behavior cannot be established from local source; show Unknown and require an explicit operational decision. Do not claim a self-hosted primary model makes all traffic local.

## C. Templates to ship

1. Analyze -> Implement -> Build/Test -> Review -> Final approval.
2. Bug fix with one configured bounded repair region and mandatory verification.
3. Slot-game conversion/refinement template, sequential in this milestone.

The slot template takes selected authoritative GameDoc/math/source references, target engine/workspace, affected behaviors, chosen existing harness recipe, approved math/RTP targets where applicable, and test criteria. Do not fabricate a game specification from the example names.

Suggested slot path:

- Analyze math and existing engine; produce source-linked rules, unknowns and affected behavior IDs.
- Human approval of the interpretation and required edge cases.
- Plan affected spin tasks and shared-state ownership.
- Implement selected Normal/Free/Bonus/Respin tasks sequentially, skipping irrelevant behavior explicitly.
- Cross-spin/shared-state review.
- Build and harness; optional math/RTP comparison only with supplied target and sampling/acceptance rule.
- Classify findings; repair only within configured bounds.
- Human final review of diff, evidence and unresolved questions.

Every rule/finding links to a source reference or is clearly labelled an assumption/question. A rule such as a retrigger limit, max-win stop, or accumulated-win behavior applies only when the supplied game source requires it. Aggregate RTP agreement does not prove rule fidelity; include targeted edge-case tests. The template must not claim certification or change source math to make a target pass without approval.

Real commands are discovered from the selected repository and explicitly configured by the operator. Do not assume every project has identical filenames, SDKs, solution format, harness scripts or NuGet access. Missing tooling/specification is an actionable preflight failure.

## D. Pilot plan and authorization

Development uses synthetic or explicitly supplied non-confidential fixtures. First test the template using a C# fixture with representative state/edge cases and genuine reports. Prepare a company-pilot checklist: authorized repository/branch or scratch copy, baseline diff, files/secrets excluded from artifacts, approved network destinations, hooks/MCP review, build/test recipe, permissions, recovery steps and human reviewers.

The actual private project, provider credentials, external tools and any publication remain user-operated unless separately authorized. A missing live check is NOT RUN, not a reason to invent a sample company's outcome. Native full-project access remains available; the requirement is informed workspace selection, not a demo-only product.

A real project may contain confidential documents and secrets outside source control. Do not duplicate a home directory, scan arbitrary credentials or enable inherited integrations just to make a test pass. Keep the original user worktree unchanged unless the user explicitly chooses it as the execution target.

## Required verification

| ID | Scenario | Required result |
|---|---|---|
| Z6-A01 | Library lifecycle and concurrent edits | Stable revisions; stale save conflict; historic runs remain |
| Z6-A02 | Instantiate/edit template then update original | Existing graph/run stays pinned; new instance uses chosen version |
| Z6-A03 | Import malformed/unsupported/untrusted template | Current draft preserved; no execution/network/plugin install side effects |
| Z6-A04 | Export defaults and synthetic secret/path checks | No credentials or unintended private run/workspace content |
| Z6-A05 | Native skill/instruction references and drift | Correct native path/configuration; provenance visible; no second installer |
| Z6-A06 | Destination/hook/MCP preflight | Known configuration shown; unverified behavior not labelled safe/local |
| Z6-A07 | Generic and bug-fix templates on native fixtures | Real explicit handoffs, edits/tests, human gates and bounded routing |
| Z6-A08 | Slot-style synthetic template | Source-linked rules, selected sequential tasks, real edge-case tests and final review evidence |
| Z6-A09 | Missing source/tool/target tolerance | Blocks/asks user; no fabricated rules or success |
| Z6-A10 | User company pilot | Separate named authorization/evidence; NOT RUN until actually performed |

A07/A08 require real native execution with controlled provider responses and independent test evidence. Live model quality and company-process suitability are separate acceptance results.

## Out of scope and handoff

No public marketplace, remote execution, live template auto-update, parallel workers, automatic certification, PR creation or merge. General nested/recursive subworkflows are deferred; versioned templates provide reuse without a second scheduler.

Write Z6_REPORT.md, versioned sample templates, and a PRIVATE_PROJECT_PILOT_CHECKLIST.md. Report fixture evidence separately from the user-operated company pilot. Stop after Z6.
