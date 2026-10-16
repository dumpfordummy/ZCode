# Z8.5-UX-P1 report — operator-first Graph presentation

**Depends on #23; not independently mergeable to integration yet.** Child draft PR against
`codex/z8-5-u5-realworld-dotnet-projects` (head `67e570228aa8a48f96fdbbe6c89eb54023879745`,
unchanged). Presentation only: no service, shared, CLI, root package/lockfile, workflow,
persisted-store, handler, permission, admission or scope change. This pass does not expand engine
support (.NET 10, gRPC and unapproved packages remain unsupported) and does not make the product
release-ready.

Spec: [Z8_5_UX_P1_SPEC.md](Z8_5_UX_P1_SPEC.md) · Gallery: [evidence/ux-p1/GALLERY.md](evidence/ux-p1/GALLERY.md)

## What changed

| Surface                    | Result                                                                                                                                                                                                                                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Checks, unsupported target | One blocker block (target named, exact cause and next step, first status in the proposal). Four stacked paragraphs and the repeated "use Advanced" prefix are gone.                                                                                                                                      |
| Checks, details            | General test-selection and default-input explanations and the inventory count are in the existing Details disclosure. The inventory stays in the default view when it differs from the Build choices (grouped copies hide targets). The "several targets" hint shows only while a choice is outstanding. |
| Inspection                 | One pre-authorization notice, a compact SDK/framework row (one summary line once recorded or preset), a stage line with the one next action, one primary action per state. Disclosures use the shared `GraphDisclosure`.                                                                                 |
| Source verification        | Defect fixed in presentation: the old UI offered "Open permission conversation" while no permission existed. The conversation action and instruction now appear only in `awaiting-permission` / `running`.                                                                                               |
| New run                    | Only the Checks-page return note is shortened (its conditional second sentence duplicated the per-row flag). Request, context, saved-check rows and the verification label are unchanged (native drivers read them).                                                                                     |
| Run / step view            | **Unchanged.** See "Rejected candidate" below.                                                                                                                                                                                                                                                           |

Files: `GraphProjectInspection.tsx`, `GraphQuickSummary.tsx`, `GraphQuickDiagnostics.tsx`,
`GraphQuickDotnet.tsx`, new pure `graphInspectionView.ts`, locale keys in `graphM4.ts` (plus one
`graphM1.ts` string), new `graphInspectionView.test.ts`, `scripts/graph-engineering/ux-p1-*.mjs`,
this spec/report and `evidence/ux-p1/`. Original start/review/cancel/status handlers and their
arguments are untouched; visibility rules moved into the pure helper.

### Moved to Details (still reachable, nothing deleted)

Inventory count (when not hiding targets), test-selection explanation, default-input scope,
detected-target diagnostics, the operation session identifier (inside the command details),
read-scope list, observed-configuration JSON.

### Still visible for operator decisions

Selected-target blocker with cause and next step; Save disabled with its reason; the side-effect
disclosure before authorizing; exact executable, ordered arguments, read scope, file count, limits
and expiry at command review; stage and the one next action; status check and cancel for every owned
operation including `executor-lost`; expiry and failure as warning-toned stage lines; failed-Test and
invalid-evidence banners and the "No approval was requested" statement; human approval gate; native
permission ownership ("Graph never answers it for you").

### Rejected candidate (kept as a record)

I first removed the failed-Test banner's "nothing to approve or reject" sentence as a duplicate. The
existing UX-M4 suite asserts it (a stopped run must never imply an approval is pending), so I
reverted the change. The Needs-you scope note is likewise an asserted UX-M1.3 contract and was left
alone.

## Local results (Node 24.14.0, pnpm 10.33.2, Linux)

| Check                                                    | Result                                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| UI unit tests, CI environment (`packages/ui/test`)       | 254 passed, 0 failed, 0 skipped (includes 6 new `graphInspectionView` tests and locale parity)               |
| UX-P1 behaviour suite (real components)                  | 14 passed on this branch; 13 of 14 fail on the unchanged baseline (as intended: new stage/blocker behaviour) |
| UX-P1 capture suite                                      | 14 scenarios; 42 after / 40 before captures (keyboard focus is after-only); 0 horizontal overflow after      |
| `pnpm typecheck`                                         | exit 0                                                                                                       |
| `pnpm lint`                                              | 0 errors, 75 warnings (same count as the baseline)                                                           |
| `pnpm architecture:check --changed`                      | OK, 0 violations, 0 new                                                                                      |
| Changed source/test/script files, `oxfmt --check`        | clean (`docs/.../evidence/` is byte-preserved by the repo's own CI script)                                   |
| Existing rendered suites u1, u2, u4, u5, u5-f1, ux-m3    | all passed (5, 7, 3, 3, 2, 31)                                                                               |
| Existing rendered suites ux-m1, ux-m2, ux-m4, ctx-picker | 23/7, 11/7, 19/3, 13/1 failed: **identical failing scenario names on the untouched baseline** (below)        |
| u3                                                       | intermittent on both trees (failed in the baseline sweep and in some branch runs; passed in the final sweep) |

The 18 pre-existing failures (7 + 7 + 3 + 1): 13 `unexpected operation inspection-history` (the generic harness
allow-list predates F1's read-only inspection-history call), 4 ux-m2 strict-mode selector matches
(`details:has([data-testid="graph-recipes-json"]) > summary` resolves to two summaries), 1
context-picker `size error` timeout. I did not repair them (outside this
lane); they are reported, not hidden.

Not run: native .NET acceptance, installer/Sandbox, Windows rendering, the full CI manifest
(`graph-cloud-suite.mjs`), the other CI scripts' self-tests. Not claimed: Windows/Electron visual
acceptance, operator acceptance, performance.

## Interaction checks (asserted in `ux-p1-behavior.mjs`)

Enter toggles disclosures with no Host call; Escape closes the select and focus returns to its
trigger and keeps the selection; Tab order reaches the primary action first; the draft and request
survive Checks and back identically; the selected run persists across tab changes; viewing never
starts, replays, saves or admits (only the explicit confirmation produces one `start`); Save stays
disabled; English and Chinese both asserted for the inspection and unsupported states.

## Selector and driver mapping (Codex drivers read-only)

No test id, `data-status`/`data-state` value, exact English button label
(`Inspect with installed MSBuild`, `Confirm inspection and request native permission`,
`Check original operation`), or SDK-then-framework combobox order changed. Behavioural differences a
native driver could see:

- `graph-inspection-conversation` now exists only in `awaiting-permission` / `running`
  (drivers click it after `awaiting-permission`). `graph-inspection-permission-instruction` text no
  longer contains the session id (the id is in the command details).
- In `verifying-sources` / reserved states the SDK/framework comboboxes are replaced by one
  summary line (`graph-inspection-selection`), and the Inspect button is hidden while an operation is
  reserved. Settled records show no Cancel/Check buttons (the recovery panel keeps its own).
- The SDK/framework select labels were shortened ("Installed SDK", "Target framework").
- Inspection command/read-scope/observed and quick Details disclosures are now `GraphDisclosure`
  (still `details`/`summary`, `:scope > summary` and `details[open]` unchanged); new test ids
  `graph-inspection-command`, `graph-inspection-stage`, `graph-quick-blocker`.

## Dependency notes for the owner / Codex

1. **Shared Button focus style (global primitive, not changed):** a focused primary Button renders a
   dark fill with a low-contrast label (see `after/inspection-focus-1366.png`). Proposed: adjust the
   primary `focus-visible` colours in `packages/ui/src/components/ui/button.tsx`.
2. **Rendered-suite harness gap (`ux-m1-helpers.mjs`):** add `inspection-history` to `ALLOWED_OPS`
   to clear 13 pre-existing failures; separately make the ux-m2 recipes-JSON selector unambiguous.
3. **History pager and Needs-you scope note:** both noisy at 1093×614 with a single run, but both are
   asserted UX-M1/M2 contracts read by native drivers; changing them needs an explicit mapping from
   Codex, so they are untouched.

## State and CI

Head/base: see the PR. Required integration CI is **PENDING** for this child PR (the Graph workflow
triggers only for PRs targeting integration); nothing here is green by CI, and no parent CI is
claimed as child CI. After the owner merges #23: merge the integration branch into this branch
(non-rewriting), retarget to integration, and verify a supported PR event runs final-head CI. No
merge, auto-merge, installer, tag or publication was performed.
