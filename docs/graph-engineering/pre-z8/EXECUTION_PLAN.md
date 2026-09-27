# Pre-Z8 persistent execution plan

## Authorization and preservation

The current user assignment authorizes U0–U6 in dependency order and supersedes the planning pack's U0-only and stop-after-phase wording. Z8, staging, commits, pushes, publication, installed credentials, live paid models, company projects, dependency installation and relaxed approvals are not authorized. User-operated/live pilot results remain NOT RUN without actual evidence.

Checkout: `C:\Users\USER\Desktop\Personal\ZCode`, branch `main`, starting HEAD `7e5f02d76abf20d567df1a9e6ddb868ab3421205`. Preserve the existing modified `README.md`, untracked `LLM_USER_GUIDE.md`, entire pre-Z8 planning pack and ignored `.tmp` contents. Historical handoff results are context only.

## Decisions

- D01: Follow the recommended sequential supported scope; existing parallel plans remain explicitly experimental. Preserve Z7-A12 FAIL; conditional U5-P01–P03 do not become completed supported features.
- D02: Native services remain the only session/input/tool/permission owners. Graph Host remains definition/run/evidence owner. UI owns only unsaved drafts and projections.
- D03: Agent-led and verified engineering are separate templates/policies. No automatic downgrade or test PASS inferred from agent prose/human approval.
- D04: Target a bounded standard VSTest/TRX integration through genuine reports and existing native Tool execution. MTP/private harness support requires separate evidence; do not change project runners or wrap restricted shells.
- D05: Coordinator owns contracts, integration, spec decisions and all emitting builds/typechecks. Agents receive disjoint implementation paths after contracts are established. Never run conflicting builds concurrently.
- D06: Guided/Advanced share the canonical definition. Unsupported guided fields remain intact and editable in Advanced; imports/reads/scans do not execute.
- D07: Per the latest user direction, omit separate stage reports. Maintain this compact resume plan and actual command/test receipts; deliver the requested consolidated report at completion.

## Checkpoints

| Phase | State                                 | Required result / next action                                                                                                     |
| ----- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| U0    | COMPLETE (bounded automated baseline) | Fresh baseline, source audits, spec/flow map and native Build permission reproduction recorded; private/live facts remain unknown |
| U1    | COMPLETE (automated checkpoint)        | Services195/UI48/scripts74, typecheck/lint/architecture/build and controlled native journey PASS; durable screenshots/receipts |
| U2    | COMPLETE (automated checkpoint)        | Services307/UI63/evidence52 and root checks/build PASS; eight genuine isolated native scenarios and preservation PASS |
| U3    | COMPLETE (automated checkpoint)        | Services336/UI74 and root checks/build pass; full isolated editor + real context handoff/later Chat pass; durable50-file evidence |
| U4    | IN PROGRESS                           | Ratified three-axis projections, scoped evidence reads, history and exact-action UI; native cancellation/other-session proof next |
| U5    | NOT STARTED                           | Safe sequential file transfer, repeat-run reuse and visible experimental parallel boundary                                        |
| U6    | NOT STARTED                           | Integrated automated regression, built-artifact checks/screenshots, current guide, prepared human pilot and consolidated report   |

## Fresh evidence ledger

Evidence from prior reports is not promoted into this table without a new run. Detailed new command logs go in `.tmp/pre-z8-current/`; durable summaries and selected screenshots go in `docs/graph-engineering/evidence/pre-z8/`.

| Check                                         | Actual result      | Qualification                                                                                                                                                  |
| --------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial freshness on default Node             | FAIL               | Default Node 24.11.1; sandbox denied `.git/FETCH_HEAD` write. No source/index mutation                                                                         |
| Pinned tools                                  | PASS               | Node 24.14.0, pnpm 10.33.2 using inspected project-local helper                                                                                                |
| Freshness `--no-fetch`                        | PASS               | Cached main/origin/main ahead 0, behind 0                                                                                                                      |
| Freshness normal, approved metadata fetch     | PASS               | Remote fetch completed; main/origin/main ahead 0, behind 0                                                                                                     |
| `pnpm architecture:check --changed`           | PASS               | 0 violations / 0 baseline / 0 new                                                                                                                              |
| `pnpm architecture:context graph-engineering` | READ               | Contract/workflow/parallel/node public surfaces; domain → app → adapters boundary                                                                              |
| Root typecheck / root lint                    | PASS               | Fresh typecheck exit 0; lint 70 warnings / 0 errors                                                                                                            |
| Graph/Git services / UI / scripts             | PASS               | Fresh 189 / 34 / 63 tests respectively                                                                                                                         |
| CLI typecheck / CLI build / Desktop build     | PASS               | Serialized; 27 / 16 tasks and successful desktop build                                                                                                         |
| CLI lint / full formatting                    | FAIL (baseline)    | CLI diagnostics retained; formatting 2,874 files; no suppression or blanket fix                                                                                |
| U0 native permission initial attempt          | FAIL (environment) | Renderer crashed before DOM/native/model work; Ctrl+C closed owned session; no product verdict                                                                 |
| U0 native permission approved retry           | PASS               | Same harness unchanged, fresh isolated profile `.tmp/z1-native-1790449608051-bed6ce`; exact Tool session/permission/process, zero Agent inputs/model requests  |
| U1 focused workflow tests                     | PASS               | 15 tests; new agent-assisted sequence/gate and shared compatibility + preflight/library negatives                                                              |
| U1 no-Tool independence                       | PASS               | Two fresh RED cases reproduced unrelated invalid-recipe blocking; 9 focused tests pass after explicit no-recipes sentinel and conservative historical handling |
| U1 integration typecheck / UI tests           | PASS               | Root typecheck exit 0; UI lane 44 tests, before final draft reconciliation/extraction follow-up                                                                |
| U1 integration lint                           | FAIL (new, fixing) | 70 baseline warnings plus GraphEditor/GraphLibrary max-lines errors; UI owner extracting cohesive sections                                                     |
| U1 full services, first integration           | 193/194 PASS       | Deadline fixture depended on removed no-Tool recipe read; changed to explicit Tool dependency, same asynchronous deadline assertion now 7/7 routing PASS       |
| U1 final pre-native integration               | PASS               | Services195/UI48, root typecheck, lint70warnings0errors, architecture0; desktop build:no-runtime-assets exit0. New native run now pending actual evidence      |
| Genuine VSTest feasibility                    | PASS               | 9 isolated fixture tests, SDK 8.0.425/VSTest 17.11.1, two projects/frameworks; actual pass/fail/zero/skip reports retained, no U2 product claim                |
| U1 controlled native checkpoint              | PASS               | Run 2eba82da-9ed7-48d6-9762-6c73974513d1; 3 native admissions, 11 controlled requests, zero Tool/test claims; restart without replay |
| U1 no-Tool malformed-configuration native probe | PASS             | Configuration unchanged, no run/admission/model request; actual preflight acknowledgement remains required |
| U1 durable evidence                         | PASS               | 28 files with SHA-256 manifest, 18 passing screenshots and 3 retained driver failure receipts in evidence/pre-z8/u1 |
| U2 entry freshness/architecture/context       | PASS               | Pinned freshness --no-fetch, architecture 0 violations; controlled module context read |
| U2 full Graph/Git regression                 | PASS               | 307 tests, zero skipped, genuine fixture manifest supplied; `u2-services-final.log` |
| U2 independent TRX evidence review           | PASS after fixes   | 52 cases; contradictory Build flags, future output timestamps and unsupported VSTest crash exits reproduced then fixed; initial failure receipts retained |
| U2 UI / parser and capture                  | PASS               | 63 UI tests; 49 parser/capture tests plus retained genuine seven-report replay |
| U2 root typecheck/lint/architecture/build     | PASS               | Typecheck0, lint70 existing warnings/0errors, architecture0, serial desktop build0; build signal sent to native lane |
| U2 native acceptance                        | PASS               | Eight scenarios: pass/probe/stale-review/restart, multi, failed assertions, source drift, Build drift, zero, all skipped, missing required identity. Zero Agent inputs/models. Two earlier driver failures retained. Durable 253-file SHA manifest includes 110 verified retained artifact wrappers. |
| U3 entry architecture/context               | PASS / READ        | Zero violations; public contract, draft owner and read-only reference port ratified before implementation |
| U3 reference owner / compatibility          | PASS               | Ten service/preflight tests, including catalog with zero state/recipe/execution access, safe file negatives, exact native guidance identity and unchanged legacy digest. `u3-reference-red.log` retains three initial failures; `u3-reference-green.log` has 10 PASS/0 skipped. Focused13-file lint0; initial local-bin PATH command failure retained and corrected. |
| U3 pure context/prompt/routing               | PASS (focused)     | 26 new cases plus prior relevant regressions =59 PASS0 skipped in `u3-domain-final.log`; public shared topology/scanner, mixed reference delivery, 34-node/32-executable-path capacity verified. Focused lint and architecture0 after capacity-test split. |
| U3 combined Graph/Git / UI                   | PASS               | Services336 PASS0 skipped in `u3-services-integrated.log`; UI71 PASS in `u3-ui-tests.log`. Native journeys remain pending. |
| U3 first root typecheck                     | FAIL (new, fixing) | Three GraphReferenceField diagnostics: file-search inferred state omitted loading/error. UI owner fixing explicit type and scoped transient state before retry. `u3-typecheck.log`. |
| U3 final pre-native integration             | PASS               | Compiler issues fixed; UI72 PASS0 skipped, root typecheck0, lint70 baseline warnings/0 errors, architecture0 and serialized desktop build0. Logs `u3-typecheck-retry.log`, `u3-lint.log`, `u3-architecture.log`, `u3-desktop-build.log`. Source frozen for native journeys. |
| U3 native editor attempts 1–2               | FAIL (driver)      | Attempt1 assumed a persisted graph file before explicit create/save; corrected to verify continued absence. Attempt2 checked asynchronous reference validation while still Reading. Both isolated profiles/screens/receipts retained; zero model calls. No native product acceptance inferred. |
| U3 final UI review                          | PASS after fix     | Search and native selection now have independent owned sequences; deterministic overlap and lifecycle tests pass. Full UI74 PASS0 skipped, root typecheck/lint/architecture/build pass after change. |
| U3 native editor attempt 3                  | FAIL (new, fixed)  | Actual repeated Condition controls after workspace/mode/node round-trip: duplicate sibling React keys. Role+node keys fixed with source comment; root typecheck/build/architecture passed. Exact-one native assertion verified in attempt4. |
| U3 native editor attempt 4                  | FAIL (driver)      | Buffer round-trips, exact-one controls and repair/two-Test preservation passed. Legacy selector helper could not escape JSON edge identity; driver fixed to match exact data value, same build retry pending. No model or native execution. |
| U3 final native checkpoint                  | PASS               | Editor attempt5 zero native/model execution; handoff run4909f6be-f89d-4421-af93-f8290e314935 has3 Graph inputs +1 later ordinary Chat input,12 controlled requests,5 native tool calls. Context/braces/native guidance once; entire completed Graph record unchanged after later Chat. Same final artifact hashes. Durable50-file/2,801,144-byte manifest,21 final screenshots,6 receipts and3 verified artifact wrappers. |
| U4 entry architecture/context              | PASS / READ        | Zero violations; U4_RUN_SPEC ratifies captured-only independent axes, current iteration selection, bounded history and scoped read errors. Prior service approval/recovery races reviewed rather than reimplemented. |
| U4 integrated source checks                | PASS               | Services336/UI112, root typecheck0, lint70 baseline warnings/0errors, architecture0. Projection32 includes9 retained native replays and test-first Unknown cancellation intent fix. Scoped evidence reads3 and presentation/history/race3 pass. Desktop build and current-artifact native/browser checks remain pending. Logs `u4-services.log`, `u4-ui-tests.log`, `u4-typecheck.log`, `u4-lint.log`, `u4-architecture.log`. |
| U4 independent review and final build       | PASS after fixes   | Three findings fixed: no-Tests pending wording, old-artifact fallback when current attempt is missing, genuine-failure guidance. UI115PASS, final typecheck0/lint70baseline0errors/architecture0/build0. `u4-independent-review.json` retains review scope and original reproduction; `u4-final-*` command receipts. Native five-journey sequence now active. |
| U4 actual500-history UI fixture             | PASS with limits   | Final `.tmp/pre-z8-u4-history-U4RlLX`:25controls,19 keyboard page transitions, unchanged500props, focus border/background and actual themes at1280×720/1920×1080,0browser errors. Initial visible231ms/max page16ms/max React render12ms on Win32/AMD9800X3D/Edge153 (development UI fixture only). Final images visually reviewed. Initial sandbox GPU failure and functional-pass/incomplete-theme fixture receipts preserved; durable `evidence/pre-z8/u4/history/manifest.json`12files452862bytes. Human/OS conformance NOT RUN. |

## Agent ownership

- `u0_ui_audit`: U4 summary/actions/history/evidence presentation, locales and UI tests; no shared contracts or emitting builds.
- `u0_dotnet_audit`: U4 pure UI run/evidence projections and adversarial tests; no IO or components.
- `u0_safety_audit`: U4 isolated native cancellation/concurrent Chat and built UI evidence; awaits root build signal.
- Coordinator: all shared contracts/specs, scoped evidence hook, integration and serial validation.

## Resume instructions

Read this file, `IMPLEMENTATION_HANDOFF.md`, relevant implementation spec and actual `git status`. Inspect running agents/processes and `.tmp/pre-z8-current/` command receipts before repeating work. Complete each checkpoint's implementation, negative tests and review before advancing; continue independent safe work if a required live check is blocked. Never mark a blocked requirement complete.

Exact next actions: finish U4 independent source review and serialized desktop build; root runs actual-component500-history fixture, then signals native lane for serial cancellation/concurrent Chat, complete/no-Tests and genuine pass/fail/source-drift journeys. Preserve failing receipts and inspect screenshots before checkpoint. U5_REUSE_SPEC.md is prepared only; implement after U4 checkpoint. Use PRE_Z8_TRX_FIXTURE_MANIFEST=`.tmp/pre-z8-dotnet-jPnICP/evidence.json` for combined tests. Adapted z4/z5/z6 native regressions remain for U6. HUMAN_PILOT.md is prepared; human/live/company-project and OS conformance checks remain NOT RUN. Do not repeat completed U3 fixture operations without a new defect or combined-regression reason.
