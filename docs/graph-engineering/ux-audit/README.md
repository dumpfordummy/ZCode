# Graph Engineering UX audit, design direction and prototype

Assignment: product UX for everyday engineering work in Graph Engineering (open a project, describe a task, select context and checks, execute, handle interruptions, inspect results, reuse). This is discovery, design and a representative prototype. **No product source changed. Nothing was committed, pushed, tagged or published. Z8 was not started.** One design-direction review is requested before any production change.

**Status update:** the approved direction is implemented in this working tree. Start with [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md) and [USER_GUIDE.md](USER_GUIDE.md); the audit, direction and prototype below are the design record.

## Read in this order

| File                                                                                 | What it is                                                                                                          |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| [UX_AUDIT.md](UX_AUDIT.md)                                                           | Prioritised findings: friction, task, root cause (confirmed or labelled hypothesis), proposal, acceptance criterion |
| [DESIGN_DIRECTION.md](DESIGN_DIRECTION.md)                                           | Recommended navigation, journeys, four wireframes, trade-offs, preserved boundaries, open decisions                 |
| [prototype/index.html](prototype/index.html)                                         | Clickable prototype (synthetic data; open it directly)                                                              |
| [PROTOTYPE_NOTES.md](PROTOTYPE_NOTES.md)                                             | What is functional vs simulated, the interaction checks, screenshot index                                           |
| [IMPLEMENTATION_SPEC.md](IMPLEMENTATION_SPEC.md)                                     | Approved contract, state derivations, layouts, event order, recorded deviations                                     |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)                                     | Batches and dependency order                                                                                        |
| [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md)                                 | What changed, built vs reused, results, limits, manual checklist                                                    |
| [USER_GUIDE.md](USER_GUIDE.md)                                                       | The current user flow                                                                                               |
| [CONTEXT_PICKER_SPEC.md](CONTEXT_PICKER_SPEC.md)                                     | Context chips and the Add context picker: contract, payload semantics, event order, verification, Windows checklist |
| [UX_M1_MILESTONE.md](UX_M1_MILESTONE.md)                                             | Approved plan for UX-M1: draft while running, one setup journey, keyboard and state clarity                         |
| [UX_M1_SPEC.md](UX_M1_SPEC.md)                                                       | UX-M1 contract written before implementation, with as-built notes                                                   |
| [UX_M1_REPORT.md](UX_M1_REPORT.md)                                                   | UX-M1 result: commits, screenshots, test outcomes, mutation results, limits, Windows checklist                      |
| [CLOUD_HANDOFF.md](CLOUD_HANDOFF.md)                                                 | Start here in a new environment: identity, file map, constraints, what to reproduce                                 |
| [BEFORE_AFTER.md](BEFORE_AFTER.md)                                                   | Before and after screenshots from the real app                                                                      |
| [../../../PRODUCT.md](../../../PRODUCT.md), [../../../DESIGN.md](../../../DESIGN.md) | Product context (new file) and a scoped, clearly-marked proposed section appended to the existing design system     |

## Evidence status (kept distinct)

| Kind                                 | What                                                                                                                                                                                                                                                                                      | Where                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Native observation, this machine** | Real built Desktop app, real native sessions and tools, scripted (controlled loopback) model replies. First use, returning user, three permission waits, reviewer-output failure, Test failure, final gate, zh-CN, keyboard focus                                                         | `screenshots/audit/`, `tools/*-notes*.json`                          |
| **Source inspection**                | Root causes cited by file and line                                                                                                                                                                                                                                                        | [UX_AUDIT.md](UX_AUDIT.md)                                           |
| **Prototype (synthetic)**            | Design demonstration only. Not native execution, not acceptance evidence                                                                                                                                                                                                                  | `prototype/`, `screenshots/prototype/`, `tools/prototype-check.json` |
| **Historical, not re-run**           | Codex acceptance closeout                                                                                                                                                                                                                                                                 | `../next-iteration/` (read for context only)                         |
| **NOT RUN**                          | Live-model behaviour; user testing with real people; Zai Light of the current app; non-Windows; mobile web; screen-reader output; automated contrast measurement; a history with many runs; `pnpm typecheck` / `pnpm lint` results are reported in the session summary, not asserted here |

## Reproducing the native observations

The worktree had no dependencies or builds. Dependencies were installed offline from the existing pnpm store (`pnpm install --offline --frozen-lockfile --ignore-scripts`, root only); Electron 41.0.3 was extracted from the cached archive; the Desktop renderer was built with `pnpm --filter @zcode/desktop build:no-runtime-assets`. The CLI runtime (`apps/zcode-cli/packages/cli/dist`) was **copied from the sibling checkout**, because the CLI sub-workspace's `pnpm-lock.yaml` does not match its `package.json` (`--frozen-lockfile` fails; not changed here). Its SHA-256 `a60c0ba4…66ee` equals the CLI hash recorded in the accepted closeout, and CLI source is unchanged between the two checkouts. That means the runtime is the previously built one, not a fresh build.

```powershell
# use the pinned toolchain from mise.toml (Node 24.14.0, pnpm 10.33.2)
node docs/graph-engineering/ux-audit/tools/tour-first-use.mjs
node docs/graph-engineering/ux-audit/tools/tour-returning.mjs --scenario=pass          # or prose-fence, test-failure
node docs/graph-engineering/ux-audit/tools/tour-extras.mjs --mode=gate                 # or --mode=locale
node docs/graph-engineering/ux-audit/tools/focus-probe.mjs
```

Each script creates a fresh disposable profile and synthetic workspace under `.tmp/`, answers native permissions one at a time through the existing "Allow" option, never approves the final gate, and makes no live model call. They write into this folder only. The `*-notes*.json` files had the local checkout path replaced with `<checkout>`; the screenshots are unedited and show the local path in the app header.

## What was deliberately not done

- No change to product code, lockfiles, architecture policy, lint thresholds or dependencies.
- No approval of a final gate to manufacture a "Completed" state.
- No permission bypass. Permission-policy improvement is only named, as a separate workstream.
- The unknown-behaviour statements are condensed in the prototype and labelled as such.
