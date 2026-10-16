# Z8.5-UX-P1 — operator-first Graph presentation

Presentation-only pass over the existing New run, Checks / project inspection and run view.
It runs in parallel with the Codex engine lane from the common post-R1 source
`67e570228aa8a48f96fdbbe6c89eb54023879745`. Public DTOs, RPC signatures, state/outcome
enums, permission semantics, recipe/scope formats, saved stores, admission/Save handlers,
async ownership and scope derivation are **frozen**. This lane changes what is shown first,
not what is true or what is allowed.

## Owners and invariants

| Fact                                             | Owner (unchanged)                          | UX-P1 rule                                                                       |
| ------------------------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------- |
| Run/step state, evidence, approval               | Host run record → `graphRunSummary` views  | Render only; no new derivation of verification or approval.                      |
| Inspection record status/reservation             | Host (`GraphInspection`)                   | Render only; polling/cancel/start handlers and arguments are untouched.          |
| Saved checks, Save, prepare, preview, permission | `useGraphProjectSetup`, Host, native owner | Handlers and their arguments are untouched.                                      |
| Draft (request, context, check choices)          | `graphDraftStore`                          | Navigating to Checks and back keeps it; no new writers.                          |
| Disclosure open/closed                           | Local component state                      | Expanding never calls a service, starts, saves, retries or answers a permission. |

Never collapsed into one green check: _running_, _preparing_, _source verification_,
_inspection_, _awaiting a real permission_, _Test failed_, _evidence invalid/missing_,
_reviewer outcome_ and _human approval_. A passing technical check is not human approval;
saved configuration is not executed verification.

## Information map

### Default (always visible)

- Task/project identity, the real current state, the one primary action, the secondary
  cancel/back action.
- One concise result sentence per fact: Build/Test truth, reviewer outcome, human decision.
- A selected-scope blocker (unsupported SDK/runner/version/project, failed or missing Test
  evidence, expired/stale review, uncertain executor ownership) with its one next action.
- Before any execution: exact command and arguments, target, affected/read scope, and the
  material side-effect disclosure (MSBuild evaluation can execute project processing).

### On demand (existing disclosures, nothing deleted)

Inventory counts, detected-target diagnostics, general test-selection explanations, default
input-scope explanation, operation/session identifiers, read-scope lists, observed
configuration JSON, routing internals and manifest export (already in Technical details).

## Changes

1. **Checks (quick .NET).** One blocker block (target named, exact cause and next step,
   always the first status in the proposal) replaces the stacked
   "unavailable / several targets / inventory / test link / defaults" paragraphs. The
   "several targets" hint appears only while a choice is genuinely outstanding. General
   test-selection and default-input explanations move into the existing Details
   disclosure. The inventory count stays in the default view when it differs from the
   Build choices (grouped copies hide targets) and is otherwise a detail. A single short
   "Saving does not run anything" line stays beside Save. Disclosures use the shared
   `GraphDisclosure` (real `details`/`summary`; keyboard and `:scope > summary` unchanged).
2. **Inspection.** One notice (execution-capable evaluation + no Build/Test evidence)
   instead of two paragraphs, kept before authorization; compact SDK/framework row (a
   single summary line once the operation is recorded or preset); a stage heading with the
   one thing the operator must do. The conversation action and permission instruction are
   offered only when a real native permission can exist (`awaiting-permission`, `running`);
   during `verifying-sources`/`review-ready` no permission is mentioned as pending. The raw
   session identifier moves into the command details. Status check and cancel stay for
   every owned operation (including `executor-lost`); settled records offer only a fresh
   review. Visibility rules live in the pure `graphInspectionView` helper; the original
   start/review/cancel/status handlers and arguments are unchanged. No percentages, ETA,
   polling or backend-state guesses.
3. **New run.** Draft, context, explicit choices, the verification label
   (`graph-template-verification`) and saved-check rows are unchanged (native drivers read
   them). The Checks page's return note drops its conditional second sentence: a choice
   that no longer fits is already flagged on its own row.
4. **Run view.** Unchanged. The accepted U1/UX-M4 operator view already leads with state,
   action and Build/Test/human truth, and its banner statements (for example "No approval
   was requested") and the Needs-you scope note are asserted contracts, so they stay. A
   candidate that removed the banner's "nothing to approve or reject" sentence was rejected
   by the existing UX-M4 suite and reverted.
5. **Polish.** No overflow at 1093×614 / 1366×768 / 1600×900; one primary action per
   inspection state; no duplicate headings or separators. No new theme, gradients or
   animation.

## Selector and driver contract (Codex-owned drivers read-only)

Kept: `data-testid` and `data-status`/`data-state` values; the three exact English button
labels `Inspect with installed MSBuild`, `Confirm inspection and request native permission`,
`Check original operation`; SDK-then-framework combobox order;
`graph-inspection-permission-instruction` absent during `verifying-sources`;
`graph-inspection-conversation` present in `awaiting-permission`. Removed/changed selectors:
none (see report for the verified mapping).

## Acceptance scenarios

Rendered with real components in the existing Host harness, same synthetic records before and
after, English/Chinese, light/dark, 1366×768, 1600×900 and 1093×614:

running · source verification · awaiting a real permission · unsupported selected project ·
expired inspection · stale approval evidence · assertion FAIL vs invalid evidence · final
human approval · New run · saved Checks. Plus keyboard (Tab/Enter/Escape, focus return),
selected-attempt/draft retention, disabled-action behaviour and zero extra Host calls.

Acceptance is truthful state and a clear next action, not a word-count target. A render with
less text but a hidden failure or an unclear next action fails.

## Out of scope

No service/shared/CLI change, no lockfile/root package change, no global design-system
primitive change, no workflow/CI change, no native or installer run, no new engine support
(.NET 10, gRPC, unapproved packages remain unsupported).

## F1: keyboard focus on filled Buttons

Inside the Graph focus scope a filled Button (`data-variant` default / destructive / warning) keeps
its own readable fill and label (label contrast at least 4.5:1) and marks keyboard focus with a
foreground-colour border (at least 3:1 against the page); other controls keep the accent tint plus
brand border. The ancestor focus selector must never recolour a filled Button's fill alone. Focus
indication is never removed, and handlers, disabled semantics and permissions are untouched.
