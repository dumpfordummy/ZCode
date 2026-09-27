# Pre-Z8 implementation handoff

Checkpoint: **27 September 2026, approximately 02:50 Asia/Kuala_Lumpur**. This is a documentation-only handoff, not completion of U0 or authorization to implement U1–U6/Z8. Repository facts below were checked locally. No installed credentials, private account information, company workspace, or paid model was accessed.

## 1. Exact checkout and local work

- Checkout: `C:\Users\USER\Desktop\Personal\ZCode`.
- Branch: **`main`**.
- HEAD: **`7e5f02d76abf20d567df1a9e6ddb868ab3421205`** (`ci: use canonical Windows temporary paths for Graph release checks`). Local tag at HEAD: **`graph-v3.14.0-z7.2`**.
- Root package version: `3.14.0`; Graph distribution version is separately selected by packaging. Do not equate the root package version with an installed artifact's complete version.
- `node scripts/check-workspace-freshness.mjs --no-fetch`: PASS, cached `origin/main` ahead 0 / behind 0. **Remote fetch NOT RUN** during this handoff; current remote state is not established.
- No staged changes. No product-source changes in the working-tree diff.

Existing unstaged/untracked work, preserved as found:

| Path                                                      | State / meaning                                                                                                                                                                                                 |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`                                               | Modified: replaced the long upstream overview with a short pre-Z8 planning-pack README; diff reports 13 insertions / 216 deletions. This existed before the handoff. Do not restore or commit it automatically. |
| `docs/graph-engineering/LLM_USER_GUIDE.md`                | Untracked, previously written version-specific user/LLM guide. It describes Z7.2, not proposed usability controls.                                                                                              |
| `docs/graph-engineering/pre-z8/MASTER_PLAN.md`            | Untracked proposed programme.                                                                                                                                                                                   |
| `docs/graph-engineering/pre-z8/BACKLOG_AND_ACCEPTANCE.md` | Untracked U0–U6 deliverables and acceptance matrix.                                                                                                                                                             |
| `docs/graph-engineering/pre-z8/DELIVERY_PLAN.md`          | Untracked phase order, ownership and decision gates.                                                                                                                                                            |
| `docs/graph-engineering/pre-z8/SOURCE_REGISTER.md`        | Untracked external planning audit's source/evidence limits.                                                                                                                                                     |
| `docs/graph-engineering/pre-z8/CODEX_U0_PROMPT.md`        | Untracked optional U0 assignment; not executed by this handoff.                                                                                                                                                 |
| `docs/graph-engineering/pre-z8/REPORT_TEMPLATE.md`        | Untracked future phase report template.                                                                                                                                                                         |
| `docs/graph-engineering/pre-z8/IMPLEMENTATION_HANDOFF.md` | Added by this checkpoint.                                                                                                                                                                                       |

These local files will **not** arrive on another computer through `git pull`. Transfer the working files explicitly if the new session uses another checkout. `.tmp/` holds ignored tooling/build/evidence leftovers; do not blanket-clean it. Current handoff check logs are local-only under `.tmp/pre-z8-handoff-20260927/`.

## 2. Read first and U0–U6 status

Read root [AGENTS.md](../../../AGENTS.md), [DESIGN.md](../../../DESIGN.md), [architecture-policy.yaml](../../../architecture-policy.yaml), then [MASTER_PLAN.md](MASTER_PLAN.md), [BACKLOG_AND_ACCEPTANCE.md](BACKLOG_AND_ACCEPTANCE.md), [DELIVERY_PLAN.md](DELIVERY_PLAN.md), [SOURCE_REGISTER.md](SOURCE_REGISTER.md), and [REPORT_TEMPLATE.md](REPORT_TEMPLATE.md).

**Planning documents exist; U0–U6 implementation is not established.** There is no `U0_BASELINE.md`, U1–U5 report, or pre-Z8 readiness report in this directory. The planning pack explicitly marks its acceptance checks NOT RUN. Prior work in this session produced the LLM guide and source-level explanations of two usability questions; that is not a completed U0 audit, runtime reproduction, or implementation-ready spec package. No new guided forms, agent-only library template, general .NET report adapter, or permission action area was implemented here.

If the user assigns U0 in the new session, follow [CODEX_U0_PROMPT.md](CODEX_U0_PROMPT.md) only. Its tasks include baseline journeys, recipe-state ownership, existing evidence contracts, a proposed supervised agent-only template, Guided/Advanced preservation, .NET adapter feasibility, parallel support policy, and a bounded U1 handoff. This file does not satisfy those tasks or start them. The existing [future roadmap](../future/ROADMAP.md) and Z8 assignment remain separate.

## 3. Implemented baseline and known gaps

| Area                     | Actual baseline / limitation                                                                                                                                                                                                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Z1–Z2                    | Native Graph tab; original Start → Agent Task → End retained; editable sequential tasks, explicit Start/previous-output bindings, frozen runs/settings, fresh native session per task in the same captured workspace, real conversation links, cancellation and conservative recovery.                                     |
| Z3                       | Human Approval control nodes with captured evidence, revision/decision identity, comments, stale-evidence handling and explicit safe continuation. These differ from native command permissions and questions.                                                                                                             |
| Z4                       | Native Tool recipes, source/build/test evidence, strict structured output and artifact inspection. Requires project-specific recipe configuration; not a universal test runner adapter.                                                                                                                                    |
| Z5                       | Deterministic Conditions and bounded repair with limits, preserved attempts, explicit feedback and final approval. Unknown/invalid evidence is not a license to retry.                                                                                                                                                     |
| Z6                       | Profile-local immutable workflow library, three built-in sequential templates, explicit parameter/recipe binding, preflight, sequential portable JSON preview/import/export.                                                                                                                                               |
| Z7                       | Separate opt-in Fork/Join plan, maximum two workers in owned local clones, reviewed conflict/integration decisions, combined Build/Test and final gate, retention/cleanup and audited inactive release. Requires supported clean committed local Git base. No automatic apply to original, merge or publication.           |
| Known acceptance failure | **Z7-A12 FAIL:** sequential portable templates do not contain the separate parallel plan. Branch topology, concurrency, Join semantics and integration settings do not survive a Fork/Join export/import because that transfer contract/UI does not exist. Valid native Fork/Join round trip is **NOT RUN / unavailable**. |

Primary implementation contracts/specs: [module contract](../../../packages/services/src/graph-engineering/CONTRACT.md), `Z1_SPEC.md` through `Z7_SPEC.md` in the parent directory, [Z4_ARTIFACT_SPEC.md](../Z4_ARTIFACT_SPEC.md), [Z4_NATIVE_SPEC.md](../Z4_NATIVE_SPEC.md), and [Z6_NATIVE_SPEC.md](../Z6_NATIVE_SPEC.md). Z3–Z5 reports exist. Z6/Z7 formal reports were waived; use setup/spec/evidence files rather than treating missing reports alone as a blocker.

### Two current usability reports

1. **Build/Test dropdowns only show “Unresolved bindings.”** Confirmed source behavior: `GraphTemplateBindings.tsx` prepends this placeholder to `(recipes?.recipes ?? [])`; unloaded and empty recipe lists therefore look alike at the dropdown. **Load existing project recipes** populates choices. Configuration is separately edited under **Project command recipes → Load recipes → Save recipes**. The UI maps loaded recipes without per-slot compatibility filtering; full backend compatibility behavior still needs the U0 trace. The actual user's recipe data was not inspected. Do not assume their project is empty or that a load succeeded.
2. **Build stuck at “Awaiting approval,” no visible approval action.** User-reported, **not reproduced or resolved**. Source shows `GraphToolInspector.tsx` exposes **Open conversation** when the Tool attempt has a session ID. Native `PermissionDialog.tsx` renders “Awaiting approval” and permission options such as **Allow**; `GraphApprovalInspector.tsx` separately owns graph **Approve/Reject**. The prior response suggested opening the exact Build conversation and requested screenshots. No confirming screenshot/runtime state has been supplied in this session. Do not call this a confirmed permission transport defect, a proven workaround, or user error. Reproduce with a synthetic native Build permission wait, including graph → same session → native pending-interaction controls.

## 4. Architecture map and invariants

```text
Graph UI → UI hooks → public service contracts → window Host graph owner
                                                 ├─ frozen graph/run persistence
                                                 └─ adapters → existing native session/agent services
                                                                  └─ CLI admission, tools, permissions
```

The Host persists request/attempt identity and frozen settings **before dispatch**. Native completion/evidence is correlated and persisted **before a successor is admitted**. Graph gate approval binds to one captured request/evidence revision. Unknown acceptance/outcomes are never replayed automatically. Viewing/loading/importing history must not advance execution.

| Responsibility                        | Relevant paths (from repository root)                                                                                                                                      |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI entry, draft/library orchestration | `packages/ui/src/graph-engineering/GraphEngineeringPanel.tsx`, `GraphEditor.tsx`, `GraphLibrary.tsx`                                                                       |
| Recipe/template setup                 | Same directory: `GraphTemplateBindings.tsx`, `GraphProjectRecipes.tsx`, `GraphToolEditor.tsx`, `GraphTemplateTransfer.tsx`, `graphWorkflowView.ts`                         |
| Run actions/evidence                  | Same directory: `GraphRunInspector.tsx`, `GraphToolInspector.tsx`, `GraphApprovalInspector.tsx`, `GraphArtifactInspector.tsx`, `GraphRecovery.tsx`, `GraphParallelRun.tsx` |
| Native pending interactions           | `packages/ui/src/PermissionDialog.tsx`, `packages/ui/src/v4/V4InteractionDialogs.tsx`, `pendingInteractionAdapter.ts`, `SessionPane.tsx`                                   |
| UI service access                     | `packages/ui/src/hooks/useGraphEngineering.ts`; public graph/workflow/parallel contracts exported by `@zcode/services`                                                     |
| Host composition                      | `packages/services/src/node.ts`, `packages/services/src/graph-engineering/node.ts`                                                                                         |
| Graph interfaces/types                | `packages/services/src/graph-engineering/{contract,workflow-contract,parallel-contract,artifact-types,routing-types}.ts`                                                   |
| Execution owners                      | `packages/services/src/graph-engineering/app/{service,state,sequencer,approvals,tools,routing,workflow-service,parallel-service,parallel-execution}.ts`                    |
| Native/filesystem adapters            | `packages/services/src/graph-engineering/adapters/{native,tools,observer,recipes,repository,workflow-store,workflow-preflight,parallel-workspaces}.ts`                     |
| Strict contracts/evidence             | `packages/services/src/graph-engineering/domain/{artifact-schemas,tool-verification,workflow-schema,routing-schemas,parallel-schema}.ts`                                   |
| Native runtime/protocol               | `packages/services/src/zcode-agent/`, `packages/shared/src/zcode-protocol/`, `apps/zcode-cli/packages/`                                                                    |
| Fixtures/test sources                 | `scripts/graph-engineering/`, `packages/services/src/graph-engineering/**/*.test.ts`, `packages/ui/test/graph*.test.ts`                                                    |

Keep these boundaries:

- Native agent remains sole owner of sessions, tool execution, permissions/questions and input admission. No new engine, provider store, C# sidecar or embedded Vue app. Synthetic C# fixtures are test projects only.
- UI uses hooks/contracts; pure domain validates; app orchestration uses ports; adapters perform async I/O. Main handles process/window transport, not task business state. Preserve owner/lease, stale-runtime and idempotency checks.
- Identity key is `workspaceIdentity?.trim() || workspacePath`; path is for file operations/cwd. Keep remote identity/session propagation at existing boundaries even though Graph execution currently rejects unsupported remote targets.
- Ordinary Chat/configuration/history and existing Z1–Z7 records retain semantics. A simpler UI must not create another source of execution truth, silently rewrite advanced fields, broaden permissions or turn uncertain evidence into success.
- Parallel plan is separate from the sequential definition. Child runs remain native attempt owners. Owned clones provide coordination, not an OS sandbox; cleanup requires confirmed inactivity, ownership and absent runtime.
- Before future code changes, apply `.agents/skills/architecture-governance/SKILL.md`: architecture check → relevant `architecture:context <module-id>` → contract/spec update → tests/implementation. Documentation-only checkpoint did not require a code-change context package.

## 5. Tooling, build order and test entry points

Use **Node 24.14.0 / pnpm 10.33.2**, from `mise.toml`. Both were verified in this checkpoint. This checkout already has dependencies. Local helper exists, but is ignored and not portable:

```powershell
. .\.tmp\z1-env.ps1
$env:PATH="$PWD\node_modules\.bin;$env:PATH"
node --version
pnpm --version
```

The helper puts the private Node toolchain on PATH and uses project-local npm/Electron caches; it also sets `HUSKY=0` and disables pnpm pre-run dependency verification. It does not grant permission to publish or change the Git index. On another machine, use matching tools; do not copy installed application credentials. `rg` was unavailable in this environment; `git grep`, `git ls-files` and bounded PowerShell reads worked.

**Build/typecheck must run serially**, because emitting typecheck and desktop bundling share generated outputs. The recorded sequence in [Z7_SETUP.md](../Z7_SETUP.md) is:

```powershell
node scripts/check-workspace-freshness.mjs
pnpm typecheck
pnpm --dir apps/zcode-cli typecheck
pnpm --dir apps/zcode-cli build
pnpm --filter @zcode/desktop build:no-runtime-assets
```

Check each exit code before proceeding. When fetching is unavailable or intentionally omitted, use documented `--no-fetch` and explicitly classify the result as cached. `build:no-runtime-assets` assumes runtime assets already exist; clean setup must follow current package scripts and [WINDOWS_SETUP.md](../WINDOWS_SETUP.md), not silently reuse missing outputs or install dependencies. Root `pnpm dev:desktop` selects **production** services by default; use the inspected isolated fixture launch path for programme tests.

Source verification commands (from root; inspect fixture isolation before executing):

```powershell
$graphTests=Get-ChildItem packages/services/src/graph-engineering -Recurse -Filter '*.test.ts' | Select-Object -ExpandProperty FullName
$gitTests=Get-ChildItem packages/services/src/git -Recurse -Filter '*.test.ts' | Select-Object -ExpandProperty FullName
node --import tsx --test @graphTests @gitTests
$uiTests=Get-ChildItem packages/ui/test/graph*.test.ts | Select-Object -ExpandProperty FullName
node --import tsx --test @uiTests
node --test scripts/graph-engineering/*.test.mjs
pnpm lint
pnpm --dir apps/zcode-cli lint --continue
pnpm fmt:check
pnpm architecture:check --changed
```

Controlled native entry points: `node scripts/graph-engineering/z7-native-smoke.mjs --scenario=complete` (also concurrency 1, conflict, failure, restart, combined-failure; full commands in Z7_SETUP). Interactive: `node scripts/graph-engineering/z7-launch-fixture.mjs --scenario=complete`; `quit` closes that owned app/provider, `restart` restarts its private profile. These harnesses use fresh `.tmp/z1-native-*` data and synthetic repositories, local controlled providers, actual native tools and explicit permissions. They need Electron/Playwright, Git Bash and the fixture's .NET SDK **8.0.425**; .NET/tool availability was **not rechecked** for this handoff. They seed commits only in their synthetic repositories. Run elevated only when required for the owned Electron fixture; never launch against installed data or company code.

Diagnostic portability audit: `node --import tsx scripts/graph-engineering/z7-portability-audit.mjs`. Its **exit 1 is intentional while Z7-A12 remains unmet**; see [portability/README.md](../evidence/z7/portability/README.md). Do not alter assertions to make it pass.

Distribution sources: `.github/workflows/graph-windows-release.yml`, `scripts/graph-engineering/build-windows.mjs`, `packaged-smoke.mjs`, `packages/desktop/scripts/desktop-product-identity.mjs`, [PUBLISH.md](../PUBLISH.md). Read them when separately authorized; **do not run publication from this handoff**. Preserve the HEAD fix canonicalizing Windows `TEMP`/`TMP` so `RUNNER~1` aliases do not trip valid path guards.

## 6. Verification ledger

### Fresh checkpoint checks (27 September)

| Check                                                                       | Result                               | Evidence / qualification                                                              |
| --------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------- |
| Branch, HEAD, tag, full status, staged/unstaged diff                        | Verified as section 1                | Local Git commands; no reset/index/commit/push operation                              |
| Freshness `--no-fetch`                                                      | PASS                                 | Cached origin/main only; remote fetch NOT RUN                                         |
| `pnpm typecheck`                                                            | PASS, exit 0                         | `.tmp/pre-z8-handoff-20260927/typecheck.log`                                          |
| `pnpm lint`                                                                 | PASS, exit 0; 70 warnings / 0 errors | `.tmp/pre-z8-handoff-20260927/root-lint.log`; warning count matches recorded baseline |
| `pnpm architecture:check --changed`                                         | PASS; 0 violations/baseline/new      | `.tmp/pre-z8-handoff-20260927/architecture.log`                                       |
| CLI checks, desktop build, service/UI/native/package tests, full formatting | **NOT RUN at this checkpoint**       | No product change; historical results below are not fresh executions                  |
| User's Build approval failure reproduction                                  | **NOT RUN**                          | Source trace only; runtime cause unconfirmed                                          |

No product regression was introduced by this documentation-only checkpoint; no claim is made that it establishes full runtime regression coverage. The prior guide-only turn also passed root typecheck, lint (70/0), scoped formatting, two actual runtime JSON example validators and 13 release-tag source-path checks; its scratch validator is `.tmp/validate-llm-guide.mjs`. Those checks were not repeated as a usability test.

### Historical recorded evidence, read from disk

Authoritative index: [evidence/z7/verification.json](../evidence/z7/verification.json). Logs are under `docs/graph-engineering/evidence/z7/checks/`:

- PASS: root typecheck; CLI typecheck (27 tasks); CLI build (16 tasks); desktop build; Graph/Git service tests (189); UI graph tests (34); script fixture tests (63); architecture (0 violations).
- Root lint: 70 warnings / 0 errors.
- **Known baseline FAIL:** CLI lint **85 errors / 53 warnings**. **Known baseline FAIL:** whole-repo formatting **2,869 files**, no newly added failing paths in that historical comparison. [baseline-comparison.json](../evidence/z7/checks/baseline-comparison.json) compares Z7 to recorded Z6 diagnostics; do not claim those failures were fixed or that these are fresh counts after the new planning files.
- Z7-A01–A11 recorded PASS under bounded fixtures/native controlled providers. `native/{complete,sequential,conflict,failure,restart,combined-failure}/` contains `summary.json`, child identities and screenshots. These establish the tested native paths, not live model quality or the user's installed run.
- **Known feature failure, not a lint baseline:** Z7-A12 portable Fork/Join transfer FAIL. Evidence: `evidence/z7/portability/{README.md,result.json}`. Supported sequential transfer/rejected unsupported payloads made zero native/workspace execution calls; that does not prove a valid Fork/Join round trip.

Publication receipt `.tmp/z7-publication-receipt.json` records the [Z7.2 Windows prerelease](https://github.com/dumpfordummy/ZCode/releases/tag/graph-v3.14.0-z7.2), published 24 September 2026, installer digest matched. It was inspected locally; GitHub publication/assets were **not reverified over the network** during this handoff. [WINDOWS_RELEASE_NOTES.md](../WINDOWS_RELEASE_NOTES.md) documents packaged controlled Z1/Z2/ordinary Chat coverage and the remaining limits. Historical Z7_SETUP statements saying no Z7 release was published are superseded by that later publication record, not reasons to republish.

**Still NOT RUN unless new evidence is supplied:** user's live-provider project Read/Edit/test/restart; current approval failure reproduction; packaged Z3–Z7 acceptance; another physical PC/clean VM; installer upgrade/uninstall; actual mobile/remote/macOS/Linux Graph acceptance; external MCP/hooks/network behavior and model quality/cost benchmarks. Greeting/navigation screenshots do not establish these checks.

## 7. Pitfalls and decisions for the next assigned phase

- Recipe verifier format **`zcode-json-v1`** and test-report payload format **`zcode-test-v1`** are different, confirmed in `artifact-types.ts` and `domain/tool-verification.ts`. The report parser caps entries at 1,000. Do not rename either by guesswork or manufacture passing reports from text/exit zero. Required source/build identity, positive executed tests, failure/invalid distinction and freshness remain mandatory.
- Recipe ID is not Build node ID. Test `buildNodeId` maps to the actual graph Build node; parallel combined validation uses `build`. U0 must trace compatibility/remapping before proposing a shared-recipe mutation.
- Direct executable/argv recipes restrict shell/script wrappers. A .NET/TRX/MTP adapter is a planned capability, not supplied by the synthetic fixture's report generator. Do not bypass restrictions using PowerShell/Bash wrappers or guess the user's private harness.
- Loading recipes, static validation, saving, template import/instantiation, preparation and dispatch are distinct actions. Preserve zero-execution behavior for reads/imports; preparation of parallel workspaces is explicitly a filesystem mutation.
- Existing approval navigation may be difficult to discover; prove transport/state/render behavior before changing it. Never auto-answer native requests or issue a new agent input to recover a missing button.
- Workflow settings freeze at run start. A later Chat follow-up is not a new graph result, and changing Design does not rewrite a run's evidence.
- Future Guided/Advanced forms need lossless projection and an explicit advanced-only-field policy. Preserve unsaved drafts, immutable versions/history and existing data shape semantics.
- Decide sequential-supported vs parallel-supported release scope explicitly. Parallel support requires its outstanding portability/UX/packaged evidence; choosing experimental status must retain the recorded failure.
- Resolve .NET runner scope, real report normalization, multi-target identity/aggregation and the authorized pilot workspace before making support claims. Company harness and credentials remain outside current scope.
- The root README replacement is a preexisting local documentation choice, not a product migration. Reconcile it separately if requested. Do not silently restore the original.
- `SOURCE_REGISTER.md` lists a hypothetical release-tag URL for `LLM_USER_GUIDE.md` but says the attachment was its actual source. The guide is **untracked here and absent from that historical tag**; use the local file, not that URL as verified publication evidence.
- Read current source/package scripts over old reports. Do not whole-repo format, suppress lint, erase evidence, reset files, auto-install tools or infer authorization for all phases from the planning pack.

## 8. Processes, unfinished operations and stopping point

- Collaboration status check: **only this root agent running; no active subagents**. Historical names in conversation environment metadata do not establish active work.
- At `2026-09-27T02:46:30+08:00`, Windows process metadata inspection found **zero non-shell processes whose executable/command line referenced this checkout**. No matching ZCode/Electron process appeared in the name-based snapshot. Four generic Node processes existed; they were not attributed to this project or terminated. This is a point-in-time process check, not proof about a run on another computer or persisted native state.
- Initial sandbox process query was denied; the read-only metadata query succeeded with approved elevation. Full command lines were not printed or copied into this document. No processes were started/stopped as part of recovery.
- No build/dev server/provider fixture/release operation was launched or left running by this checkpoint. Check commands completed. The user's previously reported waiting Build run remains **unresolved**; installed run storage was not accessed and no approval, cancellation, release or replay was attempted.
- Product files and preexisting local work remain unchanged. No staging, commit, push, reset, release, U0 implementation or Z8 work was performed. The safe continuation is to read this handoff and obtain the actual next assignment; stop here for this session.
