# TASK_009 — U6 integrated verification, current user documentation, and human-pilot preparation

## Authorization

This task supersedes the previous stop-before-U6 restriction. It authorizes U6 integrated
verification, current user documentation, and human-pilot preparation. Z8, publication and
actual human/live-provider acceptance remain excluded.

Security/operational constraints (in effect throughout):

- 不访问现有凭证，不调用真实付费模型，不操作公司项目。
- 不放宽审批或沙箱，不 reset、stage、commit、push、发布。
- 不新增依赖; 若确认生产安全缺陷，报告并暂停依赖部分。
- 不得删除断言、吞异常或修改预期来迎合产品错误。
- 不修改生产脱敏规则来满足测试。
- 本任务不新增 SDK/引用包安装授权。
- 不因纯文档修正重跑全部 native 场景。
- net6.0 fixture 和 SDK 历史校验例外保留给后续处理.
- Do not access installed credentials, call live paid models, operate on company repositories,
  install new dependencies, relax safeguards, reset work, stage, commit, push or publish.
  Complete this authorized batch without asking to continue after every scenario. Report
  genuine blocking decisions; do not silently expand scope.

## Parts

1. **Establish final integration baseline.** Actual HEAD, working-tree, tool versions, test
   entry points, .NET prerequisites. Repository-pinned local tooling. Check .NET fixture
   prerequisites early; reuse authorized project-local SDK. If net6.0 remains unavailable,
   record exact missing prerequisite and affected check; do not skip/change/relax; continue
   independent U6 work and report blocker. Do not reconstruct missing historical evidence.

2. **Reconcile TASK_008 evidence.** Correct distinctions: controlled dialog values ≠ real OS
   dialog testing; controlled provider is a test fixture; 3-vs-10 requests explained by actual
   endpoint/stage/phase counts; identify actual idle/zero-dispatch checks after assertU3Idle
   removal. Map absence of Agent input/Tool/worker/plugin/MCP to observations. Network blocking
   alone is not zero-attempt; process counts alone are not workspace-creation evidence. Add
   narrow test-only observation where needed without broadening production permissions. Fill
   genuine U5 criteria gaps (destination rebinding, draft preservation, async
   workspace/version).

3. **Handle flaky test and lint exceptions honestly.** Preserve original z4-review failure and
   later passing runs. Do NOT conclude "cannot be U5 regression" solely from missing imports —
   inspect wait condition, execution order, fixture isolation, shared state. Use bounded
   diagnostic, not retries-until-green. If local fixture sync defect confirmed, fix minimally
   with meaningful completion condition and bounded failure deadline. Do not delete assertions,
   suppress failures, add fixed sleeps, blindly increase timeouts, or change product evidence
   semantics. For max-lines suppression: check repository policy, record rationale; if violates,
   extract cohesive helpers. Run scoped and repo-wide checks separately.

4. **Build + verify combined implementation.** Use documented build sequence with emitting
   checks serialized. Resolve pnpm via project-local tooling (corepack). Record
   source/worktree identity. Build app; record Main/Host/preload/renderer JS bundles/chunks
   and native runtime identities (not index.html alone). Run U6 regression: eight-scenario
   .NET matrix, agent-led workflow without recipes, guided/advanced preservation + context
   handoffs, run status/approval/cancellation/stale evidence/safe restart, U5 file
   transfer/repeat-request/new-input identity, ordinary Chat + native-bootstrap regression.
   Use independent synthetic workspaces + controlled providers. Distinguish
   fixture-intentional-failure vs harness-verifying-failure vs invalid-evidence vs
   harness-failing. Fix local confirmed harness defects + rerun affected; small product defects
   within U0-U5 spec with reproduction + regression test. Stop and report before changing
   security/permission/persistence/identity/approval-freshness/recovery contracts.

5. **Prepare actual user-facing handoff.** Update user guide against current implemented UI
   (not planned/old z7.2). Identify as documentation for this dev build/checkpoint. Provide
   exact local startup with isolated pilot profile. Do not configure/access real provider
   credentials. Prepare three human-pilot journeys: A. agent-led workflow without JSON editing;
   B. configure .NET check + interpret pass/fail; C. real Windows file dialogs export/import +
   different request without inheriting old results. Include cancellation, overwrite/focus,
   failure messages, expected evidence. Distinguish config/execution/native permissions/graph
   approval/verification. Measure usability only when a person performs pilot — do not invent
   times/feedback/screenshots/PASS.

6. **Deliver one consolidated result.** Write TASK_009.md, TASK_009_REPORT.md, update
   EXECUTION_PLAN.md, provide current guide, evidence index, human checklist. Compact report:
   current implementation + tested build; actual commands + PASS/FAIL/SKIP/BLOCKED/NOT RUN;
   observed failures/fixes/baseline exceptions/unresolved hypotheses; current native evidence +
   screenshots; exact manual steps + remaining prerequisites. Use "READY FOR HUMAN PILOT" only
   when required automated checks satisfied with nonblocking exceptions disclosed. If required
   automated check unverified, state BLOCKED or INCOMPLETE. Human acceptance NOT RUN until user
   supplies observations. U6 completion does not authorize Z8.
