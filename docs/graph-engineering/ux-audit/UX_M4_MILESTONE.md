# UX-M4 — Visual clarity and reduced overload

Status: **Planned. Local Claude only.** The user has reported that their UX-M3 manual test passed, while also reporting that the interface still feels overloaded and visually flat. That is functional feedback and visual feedback about different qualities; neither cancels the other.

Priority: **Next product milestone after the UX-M3 Git/documentation closeout.** Pause unrelated feature expansion until this milestone's visual direction and main implementation are accepted. This milestone does not authorize a release or rename the Z-series.

## 1. Outcome

The main task, current state and next useful action should be apparent without reading a wall of text. ZCode should look and behave like one deliberately designed engineering application, not a black canvas containing differently styled labels and buttons.

Preserve the accepted product model:

- Chat is interactive engineering; Graph is structured, repeatable, supervised engineering.
- Runs, Workflows and Checks remain the primary Graph destinations.
- The primary user is a solo engineer doing repeated local engineering work.
- Advanced capabilities remain available without dominating ordinary work.

This is an information-design and visual-system milestone, not just a theme recolor. The latest screenshots and native app must be inspected before claiming a specific current-layout defect. The user's feedback establishes a real dissatisfaction; it does not establish every proposed root cause.

## 2. What changes in the design brief

Earlier instructions emphasized reuse of the existing tokens, compact layouts and narrow functional changes. For this milestone, existing styling is a starting point, not an immutable contract.

After direction approval, colors, surface roles, spacing, typography hierarchy, layout proportions, component presentation and redundant explanatory copy may change within the agreed scope. Update DESIGN.md accordingly rather than writing isolated overrides around it.

“Dense engineering tool” means efficient use of space, not maximum simultaneous text. Do not reduce overload by making fonts smaller or lowering text contrast.

Execution, evidence, identity, permission, approval and recovery contracts remain fixed. Separate those guarantees from the incidental way they are currently drawn.

## 3. Scope

Primary production surfaces:

1. Runs: new-run preparation, review/preflight, progress, waits, results and history.
2. Workflows: canvas, inspector, the consolidated library, versions and sharing.
3. Checks: selection, editing, dirty-state summary, save/discard and conflict handling.
4. Adjacent application chrome: the header/sidebar/context bar and Graph-owned conversation return surface where necessary for visual coherence.

Do not redesign unrelated plugin-store, account, remote-control or Chat features. Shared-token changes require inspection of affected non-Graph consumers; a Graph improvement must not silently degrade the surrounding application.

## 4. Information priority

Inventory the visible content on representative screens. For each item record its purpose and place it in one of four categories:

- **Needed now:** task, actual state, blocker, next action, invalid required field, dirty-state or version-change information affecting the decision.
- **Useful summary:** chosen workflow/version, context/check summaries, execution/check/reviewer/human outcomes.
- **Inspection detail:** raw output, full commands when not currently authorizing them, technical identities, hashes, full event history and captured evidence.
- **Redundant explanation:** repeated statements or instructional copy already communicated clearly in the same context.

Remove genuine duplication. Move optional inspection material into a clearly named, easily reached detail view. Use concise summaries linked to the authoritative detail.

Do not classify consent-critical material as clutter. Actual pending permissions, required preflight disclosures, acknowledgment, source freshness, validation errors, unsaved-change consequences and approval scope remain available at the point of decision. Preserve their meaning and any contractually required exact wording.

No numeric percentage reduction is mandatory before measuring the current screens. Record before/after visible-content and interaction differences as observations, not as a proxy for human usability.

## 5. Checkpoints

### UX-M4.1 — Establish the visual direction

**Deliverable:** one concise content/layout assessment and two coherent visual alternatives for three representative screens:

- New run with real-shaped request, context and saved checks.
- An active run waiting for permission, plus a result/failure variant.
- Workflows library with a selected workflow/version.

Recommend one alternative and explain the principal trade-off. The options must meaningfully change hierarchy, composition and surface relationships, not merely swap accent colors.

Use the real local application/components where practical. An isolated visual prototype is acceptable; any synthetic runtime state must be labelled and must not count as native execution evidence.

Show both light and dark treatments and inspect 1280×720 and 1920×1080. Include surrounding application chrome, not just a cropped attractive card.

**One user checkpoint:** approve the visible direction before broad production restyling. A textual specification or passing tests is not a substitute for this review. Do not ask for a decision on every font size or control.

### UX-M4.2 — Implement the shared visual foundation

After direction approval, establish semantic tokens and a consistent component treatment:

- Distinguishable shell, main workspace, secondary panel and transient overlay surfaces.
- A restrained accent used for primary action/selection; semantic warning/error colors retain their own meaning.
- A small, intentional type hierarchy with readable body text.
- Consistent spacing, alignment, borders, radii, control sizing and focus treatment.
- Clear primary, secondary and destructive actions.
- Practical canvas/inspector proportions and visible graph connections.

Keep both themes usable; do not hard-code a dark-only design. Measure relevant text/control contrast. Honor the existing accessibility stance, keyboard use, localization and reduced motion without claiming certification.

Reuse existing infrastructure and dependencies. Do not adopt an entire new UI framework, install overlapping skill packs, or add external fonts simply to obtain a visual difference.

### UX-M4.3 — Apply the lower-overload interaction design

Apply the approved foundation across the primary scope. For each state, emphasize the information needed now:

| State | Main emphasis | Secondary material |
| --- | --- | --- |
| New run | Request, workflow/version, compact context/check choices, readiness and Review action | Raw bindings, full technical configuration |
| Reviewing | What will run, required disclosures and explicit acknowledgment | Detailed provenance, while remaining directly inspectable |
| Running | Current step, progress and relevant captured outcomes | Completed-step detail and logs |
| Waiting | Exact kind of wait and where to answer it | Unrelated settings and generic explanatory paragraphs |
| Failed | Cause, what is known, and supported next action | Full diagnostic/event evidence |
| Final review | Changes and separate machine/reviewer/human facts; decision scope | Technical identities and expanded evidence |
| Workflow management | Selected workflow/version and the user's current task | Format versions, digests, library revision and manual JSON |
| Checks | Selected check, actual dirty scope and Save/Discard consequence | Unneeded editor detail outside the current task |

Do not collapse distinct outcomes into a single green badge. Keep saved configuration separate from captured results and native permission separate from final human approval.

Do not implement simplification by nesting more accordions, wrapping every paragraph in a card, moving every task into a modal, or inventing an automatic “expert mode.” Preserve advanced access without maintaining two separate editors.

### UX-M4.4 — One integrated local acceptance

All development is local. Use focused checks while working, then one integrated acceptance pass after the final production changes.

- Run repository-required static checks and relevant unit/component regressions.
- Serialize emitting checks before the final Desktop build, following the verified repository procedure.
- Exercise affected native journeys: new run, context/checks, version selection, permission/return, failure, final approval and repeat request.
- Inspect actual Electron screenshots in both themes and languages at the target sizes.
- Record real Windows DPI checks separately from process-level emulation.
- Inspect shared-token effects on representative surrounding non-Graph screens.
- Retain failures and distinguish product, harness and environment issues.

The human review asks whether the interface feels less overloaded and meaningfully better designed, not merely whether clicking through succeeds. Previous M1–M3 manual passes do not automatically satisfy M4's visual acceptance.

## 6. Definition of done

Two gates must both be met:

### Functional gate

No regression in the accepted execution, draft, check, workflow/version, permission, evidence or approval flows touched by the change. Required validations, disclosures and advanced capabilities remain available. Test results report actual scope and remaining gaps.

### Visual/usability gate

- The project/task, current state and next action are readily identifiable in the representative screens.
- The main working surface, navigation and secondary inspection areas are visibly distinct.
- Repeated informational text no longer competes with the task.
- Routine work does not require opening nested disclosures.
- Secondary detail has understandable entry points; no important blocker is hidden.
- Body text and controls remain readable at ordinary window sizes.
- Light and dark themes both work; color is not the only status cue.
- The user approves the visual direction and the implemented daily workflow feels less overloaded.

Treat “recognizable within a few seconds” as a usability goal to observe with the user, not an automatically proven metric. An agent's subjective design score does not establish acceptance.

## 7. Skills and references

Use the already-installed Impeccable skill as a design aid, after checking which commands the installed version provides. Prefer hierarchy critique, simplification, layout and typography work over a generic polish pass. Do not reinstall or update plugins merely for this milestone.

The existing PRODUCT.md remains the source for product semantics. Update DESIGN.md when the approved visual decisions change. Skill opinions do not override accessibility, platform conventions or user feedback.

Reference guidance, not a mandate to adopt a framework:

- Fluent 2, Color: https://fluent2.microsoft.design/color
- Fluent 2, Color tokens: https://fluent2.microsoft.design/color-tokens/
- Impeccable official repository: https://github.com/pbakaus/impeccable

## 8. Local workflow and boundaries

First record the user's M3 manual PASS and preserve any tested local fixes. Verify the actual source/working-tree state before starting; do not assume a report or merge transferred every local change.

Use one local UX-M4 feature branch based on the current accepted integration state. Keep other agents from modifying the same working tree during builds and acceptance.

The working pattern is:

local design checkpoint → user direction approval → focused implementation commits → integrated native/visual acceptance → integration PR

No Cloud receiving/handoff phase is needed. Normal Git review remains useful even on one machine. This plan itself does not authorize merging to main, force operations, publication or release tags.

Out of scope: new execution features, permission-policy changes, reviewer retry, historical-pin auto-upgrade, concurrency/queues, a second state owner or schema, recovery changes, dependency/framework migration, packaging, release and Z8.

Keep previously BLOCKED/NOT RUN items visible in the backlog. Do not reopen all prior milestones or silently close their gaps as part of a visual change.

## 9. Deliverables

Keep documents proportionate to the work:

- UX_M4_MILESTONE.md (this plan).
- A concise visual direction record and representative comparison screens.
- Updated DESIGN.md and relevant user-guide sections.
- Implemented UI after direction approval.
- UX_M4_REPORT.md: actual source/build identity, tested behaviors, visual comparisons, human feedback, remaining gaps.

Do not deliver another lengthy audit in place of the visible design work.
