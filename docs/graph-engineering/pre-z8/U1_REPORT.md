# U1 implementation and verification checkpoint

Status: COMPLETE for the automated U1 checkpoint. Root reviewed the source, actual native summary and screenshots. Human/live/company-project and OS conformance checks remain NOT RUN; this checkpoint does not claim those results.

## Implemented scope

- Independent `agent-assisted` built-in v1: canonical v5 Start → Analyze → Implement → Review → required final human gate → End. Three native tasks, one-pass explicit handoffs, no Tool recipes and no machine-test evidence claim. The existing generic/bugfix/slot v1 definitions are unchanged.
- Shared recipe compatibility used by template creation, UI choices and preflight. Command-only recipes cannot fill existing verified Test or Build slots. Explicit test-artifact consumers retain test requirements even when their display names change.
- New no-Tool/no-region runs explicitly capture a no-recipes dependency marker. Unrelated recipe-read errors do not block them; native settings, references, saved definition and source/gate evidence remain checked. Historical records without that marker retain recipe drift protection.
- Workflows, Design, Runs and Project setup navigation; visible workspace/workflow/saved state; use-template-first form, pinned latest compatible version and management details; distinct recipe read/loading/empty/error/incompatible states.
- Workspace/template-keyed Renderer drafts and explicit Save/Discard/Cancel replacement. Host remains the sole saved-definition and execution owner. Final UI review is checking stale acknowledged revisions and failed-save interaction.

## Actual evidence so far

| Check                                | Result                                    | Receipt                                                                                                                              |
| ------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| New no-Tool regression before fix    | RED                                       | `.tmp/pre-z8-current/u1-no-tool-config-red.log`                                                                                      |
| Agent-assisted/preflight after fix   | 9 PASS                                    | `.tmp/pre-z8-current/u1-no-tool-config.log`                                                                                          |
| Full Graph/Git services              | 195 PASS                                  | `.tmp/pre-z8-current/u1-services.log`                                                                                                |
| Existing asynchronous deadline test  | PASS after fixture correction             | `.tmp/pre-z8-current/u1-routing-regression.log`; fixture now declares a Tool dependency, retains the same no-send deadline assertion |
| Historical no-Tool recipe dependency | PASS                                      | `app/recipe-independence.test.ts`; no new native work                                                                                |
| Root typecheck                       | PASS                                      | `.tmp/pre-z8-current/u1-typecheck.log`                                                                                               |
| Architecture changed                 | PASS, 0 violations                        | `.tmp/pre-z8-current/u1-architecture.log`                                                                                            |
| Graph UI pure tests                  | 48 PASS, independently integrated         | `.tmp/pre-z8-current/u1-ui-tests.log` and `u1-ui-integrated.log`                                                                     |
| Root lint                            | PASS after two new max-lines errors fixed | `.tmp/pre-z8-current/u1-lint.log`; 70 existing warnings, 0 errors; cohesive component extraction, no suppressions                    |
| Desktop build                        | PASS                                      | `.tmp/pre-z8-current/u1-desktop-build.log`; `build:no-runtime-assets`, no installed app overwritten                                  |
| Controlled provider tests            | 6 PASS                                    | Safety-agent receipt; included again in final phase suite                                                                            |
| Script regression suite              | 74 PASS                                   | `.tmp/pre-z8-current/u1-scripts.log`; genuine VSTest fixture has a separate 9-test receipt |
| New native journey                   | PASS                                      | `../evidence/pre-z8/u1/README.md`; completed run 2eba82da-9ed7-48d6-9762-6c73974513d1, 3 native admissions, 11 controlled requests, zero provider errors |
| Native unrelated malformed recipes  | PASS                                      | Same evidence directory; no run/admission/model requests, configuration unchanged |

Source baseline remains `7e5f02d76abf20d567df1a9e6ddb868ab3421205` plus the preserved working tree. Nothing staged, committed, pushed or published. Build hashes/screenshots will be added from the actual native run.

## Review and remaining work

The independent safety review found the unnecessary recipe dependency at preflight/admission/routing; the fix and new negative tests are above. UI review found an external conflict could disable Cancel in a replacement dialog; the UI owner is separating operation-pending state from destructive-action eligibility. No scope requirement was removed to resolve either finding.

Independent integration review then reproduced the cross-workspace first-render projection risk: the previous workspace could be stored under the next workspace key before an effect reset, especially with unequal revisions. The hook now synchronously tags the captured service/target projection and checks action ownership after awaited reload. New deferred-read/dirty-return/retry tests pass. Acknowledged definitions do not regress to an older projection; mutation errors survive successful read refreshes. The reviewer reread the final source and reported no remaining actionable U1 finding. The native fixture's raw-Start-request assertion was corrected to the existing structured materialization contract, without changing product behavior.

The native harness covers real configured-runtime preflight, empty/error/wrong-kind recipes, dirty replacement consent, native question and Edit permission, captured handoffs, required final gate, actual synthetic source changes and completed restart without replay. Additional actual workspace-switch and failed-save/configuration-conflict checks are being added with owned-profile fault injection. The original independent fixture test file must remain untouched and NOT RUN in this agent-led scenario.

The expanded native journey now passed real workspace switching, dirty forms, configuration conflict, failed Save-and-replace with byte-exact restoration, Cancel/Discard, question/Edit permission, final gate, source change and completed restart. The evidence directory retains 18 passing screenshots, three prior driver failure receipts and a SHA-256 manifest. The prior failures were corrected against actual contracts without weakening product safety or acceptance. The agent-led fixture's independent test file stayed unchanged and NOT RUN.

User-operated novice/live-provider/company-project and OS accessibility conformance checks remain NOT RUN. Deliberately held in-flight native RPC switching remains NOT RUN; pure deferred ownership tests and ordinary native workspace switching passed. Adapted z4/z5/z6 native regressions are scheduled for the combined suite. U2 product implementation is now authorized to advance from this verified checkpoint; genuine isolated VSTest feasibility is preparatory evidence and is not U2 completion.
