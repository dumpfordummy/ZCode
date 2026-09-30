# Cloud handoff: Graph Engineering UX implementation

Read this first in a new environment. The Cloud session has no access to the original machine's worktree, build outputs, `.tmp` profiles, sibling checkout or conversation. Everything needed to continue is in this branch.

## Source identity

|                               |                                                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Base commit                   | `558347d94bd5d341a3e12c151db6ba40fa7612b8` (`pilot transfer`), equal to `origin/main` when the work started          |
| Source branch                 | `claude/zcde-graph-ux-audit-be80d8`                                                                                  |
| Origin                        | `https://github.com/dumpfordummy/ZCode.git`                                                                          |
| Implementation payload commit | recorded in the section "Recorded SHAs" at the end (a commit cannot contain its own hash)                            |
| Final handoff tip             | `git rev-parse HEAD` on the branch; compare with `git ls-remote origin refs/heads/claude/zcde-graph-ux-audit-be80d8` |

Nothing was merged to `main`, tagged or published. Product source was changed only in `packages/ui` (plus test/harness scripts). `packages/services`, the CLI/runtime, lockfiles, dependencies and `architecture-policy.yaml` are unchanged.

## Read in this order

1. [PRODUCT.md](../../../PRODUCT.md), [DESIGN.md](../../../DESIGN.md) (section _Graph Engineering workbench_)
2. [IMPLEMENTATION_SPEC.md](IMPLEMENTATION_SPEC.md), especially **section 8 (recorded deviations)**
3. [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md), [USER_GUIDE.md](USER_GUIDE.md)
4. [UX_AUDIT.md](UX_AUDIT.md) and [DESIGN_DIRECTION.md](DESIGN_DIRECTION.md) for the reasoning; [BEFORE_AFTER.md](BEFORE_AFTER.md) for screenshots

## What is implemented

- Destinations **Runs / Workflows / Checks** (internal mode ids `runs`, `design`, `setup`; `graph-view-workflows` was removed). Default landing is Runs → New run.
- **Review and run**: existing instantiate + preflight; inline review with a sticky, explicit, per-run, initially unticked acknowledgment and Start. An unchanged form/design creates no new definition, and the redundant revision-bumping save in preflight preparation is skipped (renderer-side).
- **Needs-you** strip on every destination, derived from the complete `view.runs`; **Back to run** in graph-owned conversations restores workspace, run and step and answers nothing.
- Gate state derived from gate facts: `pending | not-reached | not-requested | approved | rejected | unknown`.
- One **result block** for rejected reviewer output / failed Test / invalid evidence / other stops.
- **Step trail** (actual visits in execution order, repair iterations labelled) with read-only **View run graph**.
- **Run again** (seeds the form from the frozen template instance; starts nothing), context bar, Checks as list + one editor, focus/`aria-current`, en/zh-CN strings, Chinese display names for built-in workflows.

## Changed-file map

Production, `packages/ui/src/`:

- New, `graph-engineering/`: `GraphContextBar`, `GraphNeedsYou`, `GraphRunPermissionBlock`, `GraphRunResultBlock`, `GraphRunTrail`, `GraphRunsDestination` (components); `graphCommandLine`, `graphInstantiationMemo`, `graphNeedsYouQueue`, `graphPermissionInfo`, `graphRunAgain`, `graphRunResult`, `graphRunTrailModel`, `graphSessionOwner`, `graphTemplateText` (models).
- Modified, `graph-engineering/`: `GraphEditor` (orchestrator, now delegates Runs to `GraphRunsDestination`), `GraphEditorNavigation`, `GraphEditorSurface`, `GraphEngineeringPanel`, `GraphLibrary`, `GraphTemplateBindings`, `GraphTemplateRecipeBindings`, `GraphReferenceBindings`, `GraphReferenceField`, `GraphProjectRecipes`, `GraphRecipeForm`, `GraphRunActions`, `GraphRunConfirmation`, `GraphRunHistory`, `GraphRunOverview`, `GraphWorkflowProvenance`, `GraphWorkflowSummary`, `graphFocus`, `graphRunSummary(+Types)`, `useGraphRunActions`.
- State and hooks: `store/graphEngineeringViewStore.ts`, `hooks/useGraphEngineering.ts`, `hooks/useGraphSessionOwnership.ts`.
- Back-to-run threading (one optional callback, same pattern as `onOpenAutomationsMain`): `app-shell/WorkspaceShellLayout.tsx` → `v4/V4WorkspaceChatArea.tsx` → `v4/WorkbenchPane.tsx` → `v4/SessionPane.tsx`.
- Locales: `i18n/locales/en-US.ts`, `zh-CN.ts`, `graphPreZ8.ts`, `graphRunClarity.ts`.

Tests: `packages/ui/test/graphRunSummary.test.ts` (updated); new `graphRunResult`, `graphNeedsYou`, `graphRunTrail`, `graphSessionOwner`, `graphInstantiationMemo` tests.

Harness (`scripts/graph-engineering/`): `reviewer-native-ui.mjs`, `reviewer-native.mjs` (evidence directory now `docs/graph-engineering/ux-audit/evidence/`), `z6-native-ui.mjs` migrated to the new flow. New tooling in `docs/graph-engineering/ux-audit/tools/` (`tour-after.mjs`, `tour-first-use.mjs`, `tour-returning.mjs`, `tour-extras.mjs`, `focus-probe.mjs`, `capture-prototype.mjs`, `record-prototype.mjs`, `final-pipeline.ps1`).

Docs: root `PRODUCT.md` (new) and an appended section in `DESIGN.md`; everything under `docs/graph-engineering/ux-audit/`; a pointer note in `docs/graph-engineering/pre-z8/USER_GUIDE.md`.

## Constraints that must not be weakened

- **Graph Host remains authoritative** for admission, attempts, immutable artifacts, evidence validation and the approval request.
- **Native sessions own permissions and tools.** Graph opens the existing conversation; it never answers, defaults or suppresses a permission.
- **Strict reviewer/evidence semantics are unchanged:** one JSON object, schema validation, evidence references limited to explicitly bound artifacts, source freshness, pinned template versions and historical definitions, conservative recovery. A valid `needs_changes`/`needs_human` is a reviewer result that reaches the human gate; an invalid reviewer output or failed Test is a different fact and requests no approval.
- **No permission-policy work has been implemented.** Three prompts per Sequential Engineering run remain.
- **The exact pending permission payload is still not exposed to Graph.** Graph shows only the step's _configured_ command, labelled as configuration. Showing the real request needs a lease on the session projection and an ownership review.
- Workspace identity rules apply: key on `workspaceIdentity?.trim() || workspacePath`; the Back-to-run link carries `workspacePath`, `workspaceIdentity` and `remoteSessionId`.
- Build order: `pnpm typecheck` (which emits into `packages/desktop/out/host`) must run **before** the Desktop build and never between the build and a native run.

## Known limitations

See IMPLEMENTATION_REPORT.md "Limitations" and IMPLEMENTATION_SPEC.md section 8. In short: no exact permission preview; nine historical `pre-z8-u1..u5` native drivers not migrated (they use removed controls); pagination verified by unit test only; new-run form fully disabled while a run is unresolved; no context chip picker, no "since your last run" line; Chat composer "Run as a workflow…" and reviewer retry deferred; partial Chinese localisation; four-interaction repeat is a target, not a measured result. The prototype (`prototype/index.html`) contains a fictional example path `C:\Users\dev\...` as synthetic data.

## Tests previously run (Windows, this machine, final build)

| Check                                                                                                                                                      | Result                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `node scripts/check-workspace-freshness.mjs`                                                                                                               | exit 0                                                                                                                  |
| `pnpm typecheck`                                                                                                                                           | exit 0                                                                                                                  |
| `pnpm lint`                                                                                                                                                | exit 0, 75 warnings, 0 errors (baseline unchanged)                                                                      |
| `pnpm architecture:check --changed`                                                                                                                        | exit 0, 0 violations, no exceptions                                                                                     |
| `node --import tsx --test packages/ui/test/graph*.test.ts`                                                                                                 | 138 pass, 0 fail                                                                                                        |
| `node --import tsx --test <all packages/services/src/graph-engineering/**/*.test.ts>`                                                                      | 358 pass, 0 fail, 2 skipped (genuine-TRX replay needs `PRE_Z8_TRX_FIXTURE_MANIFEST`)                                    |
| `node --test scripts/graph-engineering/pre-z8-u2-proof.test.mjs pre-z8-u2-fixture.test.mjs z6-provider-responses.test.mjs`                                 | 19 pass, 0 fail                                                                                                         |
| `oxfmt --check` on the changed/new files                                                                                                                   | pass (repo-wide `pnpm fmt:check` fails on the CRLF Windows checkout; pre-existing)                                      |
| `pnpm --filter @zcode/desktop build:no-runtime-assets`                                                                                                     | exit 0                                                                                                                  |
| `node scripts/graph-engineering/reviewer-native.mjs --scenario=<pass\|prose-fence\|unbound-report\|needs_changes\|needs_human\|test-failure>`              | 6/6 PASS                                                                                                                |
| `docs/graph-engineering/ux-audit/tools/tour-after.mjs` for the six scenarios, plus `--theme=light` (prose-fence) and `--locale=zh-CN` (pass, test-failure) | 9/9 PASS; asserts Back to run, Needs-you, Run again, inline preflight geometry, no duplicate revision, approval binding |

Compact receipts: `results/pipeline-results.json`, `results/reviewer-native-final.json`, `results/artifact-hashes.json`.

## Evidence that is Windows-native historical evidence only

Every native result above, and all screenshots (`screenshots/audit` = before, `screenshots/after`, `screenshots/prototype`), come from the built Electron Desktop app on **Windows 11** with the **controlled loopback provider** and real native sessions, tools, permissions and artifacts. They prove UI behaviour and native integration, not live-model behaviour, and they are **not** evidence for Linux/macOS, the packaged installer, mobile web, or any other build. Screenshots show the original machine's path in the app header.

Built artifacts for that pass: Desktop main/host/preload/renderer were **built fresh**; **the CLI runtime (`apps/zcode-cli/packages/cli/dist/zcode.cjs`) was reused, not rebuilt** (copied from a sibling checkout; hash `a60c0ba495bd8b6a3d7b871e5a8eb67d0637f7705e79761e07336a62c8e366ee` equals the accepted closeout's). The CLI sub-workspace's own lockfile does not match its `package.json` (pre-existing), so `pnpm install --frozen-lockfile` fails there. Do not "fix" that without a decision.

## What the Cloud environment should and should not try to reproduce

Should:

- `pnpm install --frozen-lockfile` at the repo root (not in `apps/zcode-cli`), then `pnpm typecheck`, `pnpm lint`, `pnpm architecture:check --changed`, the UI tests and the Graph services tests. These are platform-independent and are the useful regression signal.
- Read the spec and report, review the diff against them, and implement follow-up work with focused tests first.

Should not:

- Re-run the native Electron scenarios or the screenshot tours unless the environment is Windows with a display, Electron 41.0.3 and a prebuilt CLI runtime. They are not portable, and a failure there is not a product regression.
- Rebuild or replace the CLI runtime, alter lockfiles/dependencies, edit `architecture-policy.yaml`, or migrate the historical drivers as a side effect of other work.
- Treat prototype behaviour as product behaviour; the spec's section 8 wins.
- Commit raw native summaries or logs (`docs/graph-engineering/ux-audit/evidence/`, `evidence-logs/`): they contain machine paths. The reviewer harness writes to `evidence/` by default.

## Left local on the original machine (deliberately not committed)

`.tmp/` (isolated profiles), `node_modules/`, `packages/*/dist` and `tsconfig*.tsbuildinfo`, `packages/desktop/out/`, `apps/zcode-cli/packages/cli/dist/`, the extracted Electron binary, `docs/graph-engineering/ux-audit/evidence/` (raw per-run summaries, native logs), `docs/graph-engineering/ux-audit/evidence-logs/` (UTF-16 command logs), `tools/proto-main.cjs` (regenerated by the capture script), and the "after" screenshots for the unbound-report, needs_changes and needs_human tours (their outcomes are in `results/`).

## Recommended next tasks

1. Confirm in a Windows environment the same pipeline (`tools/final-pipeline.ps1`) or accept the recorded receipts.
2. Migrate the nine historical `pre-z8-u1..u5` native drivers, one at a time, updating their assertions first.
3. Ownership review, then a spec, for exposing the exact pending permission request (read-only) to Graph.
4. Native pagination test with more than 25 runs; native checks for workspace switch and instantiate-failure draft preservation.
5. Context chip picker and localisation of the remaining Host-authored template text.
6. Separate, gated workstreams: permission policy, reviewer retry, Chat composer "Run as a workflow…", the app-wide focus reset.

## Recorded SHAs

Filled in by a documentation-only follow-up commit after the implementation commit exists.
