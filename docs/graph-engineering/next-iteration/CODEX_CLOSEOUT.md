# Codex native reviewer closeout

Date: 2026-09-28. **Focused acceptance PASS; no release published.** The corrected built-in Sequential Engineering flow and all five requested negative cases passed through the actual built Desktop application, Host, CLI/runtime, native tools and artifact store. Model replies came exclusively from a controlled loopback provider. This proves native integration and validation behavior, not live-model adherence.

The happy run remains at **Final human review / WaitingForApproval**. It was not approved to manufacture a Completed result. The secondary existing .NET native regression also passed after correcting an erroneous harness expectation about generated TRX metadata. Its initial failure remains retained.

## Checkout, prior work and preservation

- Branch: `main`; HEAD: `ed3bd3a86ea8556f5ebd4e070c177270f1a1586d` (`UI enhancement for graph engineering to remove collapsible`). HEAD did not change during this task.
- The prior reviewer/template/UI implementation was already committed in HEAD. It was not an uncommitted implementation awaiting reconstruction. TASK.md's older z7.5 release baseline is contextual, not the checkout identity.
- At takeover, the only tracked modifications were `docs/graph-engineering/pre-z8/glm-handoff/BACKLOG.md` and `HANDOFF.md`. The only untracked files were their evidence directory's `document-format-check.log`, `handoff-validation.json`, and `work-time-estimate.json`. Their contents identify the earlier documentation-only handoff validation/time-estimate task. All five were preserved untouched by this task.
- The next-iteration directory contained TASK.md and prior screenshots, but no next-iteration closeout/report/handoff. Relevant pre-Z8 reports, handoff, specs, current diff, source, native drivers and local tooling were inspected independently. Earlier reports were not treated as native proof.
- [Source identity and per-file attribution](evidence/source-identity.json), [full working-tree status](evidence/git-status-closeout.txt), and [tracked diff](evidence/tracked-changes.patch) identify all current changes. New evidence files are enumerated separately. The current code remains uncommitted.
- The initial required freshness command could not write `.git/FETCH_HEAD` in the sandbox. Its cached `--no-fetch` check passed. The final authorized retry of the full freshness command also exited 0: `main` synchronized with `origin/main`, ahead 0 / behind 0. No working files or checked-out commit changed.
- The shell initially resolved the wrong Node/pnpm installation. Verification used the already-present `.tmp/z1-toolchain/node-v24.14.0-win-x64` and `.tmp/z1-toolchain` (Node 24.14.0, pnpm 10.33.2), matching `mise.toml`. No installation was performed.

No reset, discard, staging, development-checkout commit, push, tag, publication, new dependency, live paid provider, company workspace access, new permission model or Z8 work was performed. Existing isolation helpers' synthetic Git initialization stayed inside disposable workspaces.

## What the prior implementation got right

1. Built-in template version **2** and the reviewer helper already bind `request` and current Test `verification`. New built-in instantiation pins v2; existing inline saved definitions/history remain unchanged. Old built-in-version pins fail explicitly rather than silently changing their meaning.
2. Strict parsing, schema validation, native ownership, current attempt binding, artifact digest/byte checks, source/build freshness and same-run/workspace evidence-reference validation remain intact. No product validation needed to be weakened or replaced.
3. Declared local source fingerprints use file paths and bytes. Ignored/untracked source is valid when the selected check declares it. The reviewer prompt correctly avoids inventing a universal Git-tracking criterion.
4. Existing native isolation, controlled-provider transport, recipe execution, permission helpers, ledger inspection and UI artifact readers were useful and reused.
5. Project setup's saved-check list and focused editor, normal navigation, and inspector tab fallback were worth preserving. Native acceptance now exercises them rather than replacing those surfaces.

## Incorrect conclusions and bounded corrections

| Finding                                                                                                                 | Correction and evidence                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A roughly 900-line service reproduction had a dedicated architecture exception and could be mistaken for Desktop proof. | Removed the exception; split scenarios, data and service-port fixtures into cohesive files. Retained the seven existing reviewer cases. The service fixture remains explicitly service-level. Added native coverage using existing infrastructure.                                                                                                               |
| Workflows labeled the request as Context.                                                                               | Added a separate task preview. Context now lists explicitly selected document/instruction/skill references. Native test uses `Context.md` and verifies it differs from the request.                                                                                                                                                                              |
| Saved-check names could imply results; the run button displayed missing key `graph.z4.run`.                             | Added saved/not-run wording and reused the existing translated `graph.run` action. Native screenshots and label assertions verify both.                                                                                                                                                                                                                          |
| Runs history previewed the envelope header rather than the task; table rows lost keyboard activation.                   | Display the task only when the frozen input matches the existing canonical request transform; otherwise retain actual raw input. Preserve the expandable raw request. Restore Enter/Space selection.                                                                                                                                                             |
| Reviewer parser warnings were derived from invalid machine checks.                                                      | Project persisted current-attempt `outputValidation` separately. Valid `pass`, `needs_changes`, `needs_human` and invalid output have distinct presentation/actions. Do not fall back to old iterations.                                                                                                                                                         |
| Whole-graph fitting made text too small; selected-node focus initially failed.                                          | Readable minimum zoom 0.85 and selection-centered viewport, using the selected node's actual measurements and canvas dimensions. No saved positions/topology changes. Native visibility assertions cover both sizes and mode/node transitions.                                                                                                                   |
| Prompt instructions could be read as a tool prohibition.                                                                | Native reviewer requests actually contain tool definitions. The no-command text is guidance, not an enforced capability boundary. Controlled reviewer replies make no tool calls; no new permission system was introduced.                                                                                                                                       |
| A prior .NET proof assumed generated TRX was clean because fixture source had no secrets.                               | VSTest adds user-directory assembly paths. The original failing report had eight such paths; its preview differed only by user-path redaction and line endings. The proof now classifies original generated bytes independently of product output and still asserts redaction/validation/digest consistency and path removal. Product privacy code is unchanged. |

The [acceptance spec](CODEX_ACCEPTANCE_SPEC.md) was updated before behavior changes. It documents state ownership and event order with a sequence diagram. Changes are confined to presentation, test organization and acceptance harnesses; the existing reviewer/template/runtime contract was preserved.

## Actual reviewer and native execution contract

Source anchors:

- `packages/services/src/graph-engineering/app/workflow-service.ts`: built-in library version 2.
- `domain/workflow-sample-nodes.ts` and the binding resolver: original request plus current verification; explicitly enumerated permitted artifact IDs.
- `app/artifacts.ts` / `domain/artifacts.ts`: exactly one strict JSON object, schema checks and explicit v5 evidence bindings. Prose/fences are not extracted. A nested `reportArtifactId` is not a binding.
- `adapters/native.ts`: ordinary native session creation and correlated V4 sendText admission, retaining session/runtime/input/command identities.
- `app/tools.ts` -> `adapters/tools.ts` -> native `startRecipe` -> `apps/zcode-cli/packages/bootstrap/src/app/native-recipe-operations.ts` / `native-recipe-tool.ts`: native GraphRecipe scheduling, existing always-ask permission, real process execution and terminal observation. Graph observes those exact operation facts and captures artifacts.
- `app/routing.ts`: generic v5 has no repair region. A failed Test or invalid reviewer attempt stops the run as **NeedsHuman**, without dispatching a final-gate request. This differs from a valid reviewer `needs_human` result, whose attempt is Completed/valid and reaches the final gate.

The driver uses the actual Workflows UI to instantiate built-in `generic`, template version 2, graph version 5, with saved Node Build/Test recipes. It asserts the exact edges:

`Start → Analyze → Implement → Build → Test configured criteria → Review current verification → Final human review → End`

The original task is exactly `Modify zz-demo.txt file content to after`. Start retains the product's existing explicit-parameter envelope. The reviewer receives that envelope containing the original task, not an invented bare-input format.

The disposable fixture starts with ignored/untracked `zz-demo.txt` containing `before`. Analyze and Implement use native sessions, Read and Edit. Implement changes that file to `after`; scripts are checked unchanged. Graph Tool/native runtime alone executes Build/Test. The driver never invokes those scripts or seeds machine evidence. Git commands in the proof are read-only checks that `zz-demo.txt` remains untracked and ignored.

## Final native scenarios

Every row uses a fresh isolated profile and the same frozen built artifacts. Each acceptance command exited **0**. “PASS” here is the acceptance scenario result; the negative workflow itself does not pass.

| Scenario                          | Run ID                                 | Observed result                                                                                                                                                                     |
| --------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Happy path                        | `2535e508-4717-46e0-ab9b-9391b2301d68` | Test: 1 passed, 0 failed. Reviewer Completed/valid `pass`. Final gate WaitingForApproval, no decision.                                                                              |
| Prose + fenced JSON               | `f0b3ad3a-2984-4992-9c25-33299c8f5586` | Reviewer Failed, outputValidation invalid, strict JSON error. Run NeedsHuman; no final-gate request.                                                                                |
| Embedded unbound report reference | `be9f0186-bc6f-4c18-ab3a-be5b622a7e9e` | Reviewer Failed, evidenceReferences rejected. Run NeedsHuman; no final-gate request.                                                                                                |
| Valid needs_changes               | `35b3a12b-9122-41f2-85c9-59889859a1b0` | Reviewer Completed/valid `needs_changes`. Final human gate pending. No parser alert.                                                                                                |
| Valid needs_human                 | `ed2d29ab-ca8a-438b-85f9-880ad6853aae` | Reviewer Completed/valid `needs_human`. Final human gate pending. No parser alert.                                                                                                  |
| Genuine Test failure              | `a7b199ff-8fe9-46d8-bee4-b6038d780655` | Native Edit leaves wrong content; real Test exits 1 with one failed assertion. Test attempt Failed; run NeedsHuman. No reviewer session/provider request and no final-gate request. |

[Final scenario receipts](evidence/final-scenarios.json) contain exact artifact IDs and outcomes, and link each run to its evidence directory. Each directory has its full summary, native log, provider replies/offered tools, native ledger/sessions, command facts, captured attempts and artifacts. [Primary evidence](evidence/primary-evidence.json) extracts the happy path without the large build manifest.

### Happy-path identities and genuine machine evidence

| Step      | Native session                              | Input/command or operation ID                          |
| --------- | ------------------------------------------- | ------------------------------------------------------ |
| Analyze   | `sess_734c5147-6409-43fe-9d07-f3880e49e8ae` | input = command `6d701d96-cf8e-4325-96fb-7dc097dde153` |
| Implement | `sess_f9497e91-6a27-46f8-8a4e-0beeb83a6dc7` | input = command `82005406-94fe-48d4-a16f-48ebfd89de00` |
| Build     | `sess_3b256886-0faf-4678-87e7-cac2279134a2` | operation `94a1336d-db9a-43a1-96a5-b2bbd635e7dd`       |
| Test      | `sess_16ae2802-1a90-4b61-a300-660c140b87c5` | operation `ff26ca31-01f8-4e8b-a7e7-f468c6a976e3`       |
| Reviewer  | `sess_eb2f317c-0034-45b5-a573-7abda6c7330d` | input = command `9706ada6-2d1c-4ba1-ab90-5107490d199a` |

All attempt IDs and terminal proof identities are retained in primary-evidence.json. Build runs `node build.mjs <operationId> <sourceDigest>`; Test runs `node test.mjs <operationId> <sourceDigest> <buildDigest> results/report.json`, with the exact resolved arrays and synthetic cwd recorded. Both have processStarted/processExitObserved true and exit code 0.

- Source digest: `faee973b2cc33732ed0404cb2e10507d1d02dd5285828b3dcdc4ffa96e1804d2`.
- Build output/Test build digest: `f8a9afa8a79925b1f8518eb6dab20ed4400927eeecb0b3a261c49930ecef3463`.
- [Report artifact b34348e0-819b-4b94-85a8-463a17fb0f19](evidence/pass-z1-native-1790566588657-b664be/report-b34348e0-819b-4b94-85a8-463a17fb0f19.json): genuine `zcode-test-v1`, criterion `zz-demo contains after`, passed. Its operation/source/build identities match the current Test.
- [Verification artifact aae5f8ed-506b-4dda-80ba-d633dcd38161](evidence/pass-z1-native-1790566588657-b664be/verification-aae5f8ed-506b-4dda-80ba-d633dcd38161.json): testCount 1, passed 1, failed 0, skipped 0, outcome pass. Native proof asserts observationValid and acceptancePassed.
- Reviewer allowed artifact list contains **only** `aae5f8ed-506b-4dda-80ba-d633dcd38161`. Resolved instructions, request binding, actual verification text and returned final message are captured verbatim in primary-evidence.json.
- Final gate request: `559eb24b-b346-4f75-b484-e6832ac9617c`, version 1, attempt `38c9f4a2-02d0-4956-b06d-f963beaec1bf`, digest `958548e694e5c1c1814fd1ec31af10d1dbc235a9e5864d859ec19093a820c742`. It includes the validated review evidence and remains undecided.

Actual reviewer final JSON:

```json
{
  "outcome": "pass",
  "findings": [],
  "evidenceReferences": ["aae5f8ed-506b-4dda-80ba-d633dcd38161"]
}
```

The controlled provider deliberately supplies the negative outputs. It does not own file edits, command execution, report capture, identity validation, workflow routing or final approval. Passing these tests is not evidence that a live model will always follow the reviewer prompt.

## Secondary .NET regression

Current filesystem inspection found neither `.tmp/dotnet-toolchain/` nor `.tmp/dotnet-toolchain/sdk-8.0.425/dotnet.exe`. That is a present-tense observation; it does not disprove the earlier report that the local copy existed. System SDKs are 8.0.425, 9.0.311, 9.0.318 and 10.0.401. `PRE_Z8_DOTNET_ROOT`/`DOTNET_ROOT` were unset; existing routing in `z4-fixture.mjs` still supports an explicit local root without altering SDK policy.

Both reruns selected `C:\Program Files\dotnet\sdk\8.0.425` with fixture `global.json` version 8.0.425 and `rollForward: disable`. The prerequisite --version, --info and offline restore exited 0; the isolated package cache stayed empty. No SDK/package install or framework change occurred.

- Initial run `614acae3-ef31-4088-8c89-46f31b3b15db`: native Build/Test exit 0, workflow Completed; harness exit **1** later at the incorrect clean-preview assertion. Retained as FAIL.
- Corrected run `3a6c5f18-983e-43bc-8724-1ece2ed593ab`: harness exit **0**, workflow Completed, Build/Test exit 0, genuine VSTest count 4 / passed 3 / failed 0 / skipped 1. Saved policy accepts that result. UI setup, stale-preflight rejection, exact evidence associations and restart without replay passed. Model requests: **0**.

[.NET result index](evidence/dotnet-results.json) links the two full summaries, prerequisite receipts, logs and screenshots. Original TRX bytes remain in their owned `.tmp` profiles; normalization receipts retain original hashes and the redacted preview's separate identity. Neither the initial artifact assertion failure nor its correction is described as an SDK failure.

## Build identities and validation

Emitting work was serialized: root typecheck → CLI typecheck → CLI build → Desktop `build:no-runtime-assets`. No emitting build ran during native acceptance. Later harness-only corrections reused the frozen artifacts, whose complete hashes were rechecked. The CLI reported 27 cached typecheck tasks and 16 cached build tasks; these are not claimed as fresh uncached compilation. Desktop Main/Host/preload/renderer were rebuilt. The build used existing runtime assets rather than downloading them.

| Artifact                                                                | SHA-256                                                            |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| CLI `apps/zcode-cli/packages/cli/dist/zcode.cjs`                        | `a60c0ba495bd8b6a3d7b871e5a8eb67d0637f7705e79761e07336a62c8e366ee` |
| Main `packages/desktop/out/main/index.js`                               | `5131e785c02ecc18401929f8e491bc1972458b8e52bc63f64570705774bb9144` |
| Host `packages/desktop/out/host/index.js`                               | `1c31abe146d40ba84c64b7d3c5e302de72c39942292768ae10ee7c4631594929` |
| Preload `packages/desktop/out/preload/index.cjs`                        | `edb7a8c06e146c6843ea01732f091b3135ddae0f2d18b552469d49c34bee0b49` |
| Renderer entry `packages/desktop/out/renderer/assets/index-MORbMlkl.js` | `2822cf3c3a9d9fe11916de97daf9f43cf7e3f018e108ddb0fd944ad52e843030` |

[Complete tested-build manifest](evidence/tested-build.json) records all 2,723 renderer JS assets plus Main/Host/preload/CLI. All six final reviewer runs have identical manifests. Native captures came from Electron `BrowserWindow.capturePage`, with asserted content viewport dimensions, not a browser-only recreation.

| Validation command / scope                                             | Final exit | Result                                                                                                                                                                                                          |
| ---------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                                                       | 0          | Required root check passed.                                                                                                                                                                                     |
| `node scripts/check-workspace-freshness.mjs`                           | 0          | Full final check: main synchronized, ahead 0 / behind 0. Initial sandbox failure retained in this report.                                                                                                       |
| `pnpm --dir apps/zcode-cli typecheck`                                  | 0          | 27 cached tasks successful.                                                                                                                                                                                     |
| `pnpm --dir apps/zcode-cli build`                                      | 0          | 16 cached tasks successful.                                                                                                                                                                                     |
| `pnpm --filter @zcode/desktop build:no-runtime-assets`                 | 0          | Actual Desktop build successful.                                                                                                                                                                                |
| `pnpm lint`                                                            | 0          | **75 warnings, 0 errors**; not warning-free.                                                                                                                                                                    |
| `pnpm architecture:check --changed`                                    | 0          | Violations 0 / baseline 0 / new 0. `exceptions: []`; no threshold/baseline weakening.                                                                                                                           |
| Graph services: `node --import tsx --test @graphTests`                 | 0          | 360 passed, 0 failed, 0 skipped. Sorted recursive `*.test.ts` list and manifest env are recorded in exits.jsonl. Existing genuine TRX fixture replay in these tests is separate from new native .NET execution. |
| `node --import tsx --test packages/ui/test/graph*.test.ts`             | 0          | 118 passed, 0 failed, 0 skipped.                                                                                                                                                                                |
| U2 proof/fixture + z6 response helper tests                            | 0          | 19 passed, 0 failed, 0 skipped. Exact command retained.                                                                                                                                                         |
| `node scripts/graph-engineering/reviewer-native.mjs --scenario=<case>` | 0 each     | Six fresh final scenarios above.                                                                                                                                                                                |
| `node scripts/graph-engineering/pre-z8-u2-native.mjs --scenario=pass`  | 0          | Corrected second attempt passed through native execution and restart.                                                                                                                                           |
| Changed-source `oxfmt --check`                                         | 0          | 28 changed/new TS/TSX/MJS/YAML files; no unrelated files reformatted.                                                                                                                                           |

[Command exits](evidence/checks/exits.jsonl) and [check logs](evidence/checks/) retain actual results, including failures. Root typecheck attempts 3 and 6 failed on interim viewport code (duplicate prop, then narrowing), and subsequent corrections passed. Initial source formatting check failed on YAML line endings; final check passed. There is no claim that the full repository test matrix, packaged installer or every pre-Z8 scenario was run.

## Native UI inspection and screenshots

I visually inspected the final screenshots myself at both sizes. Workflows shows Task request and Context separately; saved Build/Test labels explicitly describe configuration. Project setup shows both saved checks and a single opened Test editor; editing/restoring that check preserves the Build recipe. Design keeps the selected reviewer visible at readable scale and its inspector populated after Output → Start and Inputs → Guided transitions. The long graph is pannable; it is not squeezed into one microscopic all-node view. At 720px height normal scrolling is required, so the setup list/editor have separate captures.

Runs history and captured task are distinct from the workflow name. The happy run shows valid pass and a pending final human decision. Negative captures visibly identify output validation failure and its strict JSON/evidence-reference reason. Valid needs_changes/needs_human native assertions verify no parser alert. None of these actionable runs displays “No action required.” No new collapsible sections were added.

| Surface                                | 1280×720                                                                                                                    | 1920×1080                                                                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Workflows configured task              | [Screenshot](evidence/pass-z1-native-1790566588657-b664be/normal-workflows-1280x720.png)                                    | [Screenshot](evidence/pass-z1-native-1790566588657-b664be/normal-workflows-1920x1080.png)                                    |
| Project setup saved list               | [Screenshot](evidence/pass-z1-native-1790566588657-b664be/normal-project-setup-1280x720.png)                                | [Screenshot](evidence/pass-z1-native-1790566588657-b664be/normal-project-setup-1920x1080.png)                                |
| Project setup selected editor          | [Screenshot](evidence/pass-z1-native-1790566588657-b664be/normal-project-setup-editor-1280x720.png)                         | [Screenshot](evidence/pass-z1-native-1790566588657-b664be/normal-project-setup-editor-1920x1080.png)                         |
| Design + selected inspector            | [Screenshot](evidence/pass-z1-native-1790566588657-b664be/normal-design-1280x720.png)                                       | [Screenshot](evidence/pass-z1-native-1790566588657-b664be/normal-design-1920x1080.png)                                       |
| Runs valid reviewer / pending human    | [Screenshot](evidence/pass-z1-native-1790566588657-b664be/normal-runs-reviewer-pass-pending-human-1280x720.png)             | [Screenshot](evidence/pass-z1-native-1790566588657-b664be/normal-runs-reviewer-pass-pending-human-1920x1080.png)             |
| **Negative test:** prose/fenced output | [Screenshot](evidence/prose-fence-z1-native-1790566602901-d9548c/negative-prose-fence-output-validation-1280x720.png)       | [Screenshot](evidence/prose-fence-z1-native-1790566602901-d9548c/negative-prose-fence-output-validation-1920x1080.png)       |
| **Negative test:** unbound report ID   | [Screenshot](evidence/unbound-report-z1-native-1790566616075-78b2c5/negative-unbound-report-output-validation-1280x720.png) | [Screenshot](evidence/unbound-report-z1-native-1790566616075-78b2c5/negative-unbound-report-output-validation-1920x1080.png) |

## Retained failures, limits and remaining work

[All 22 reviewer attempts](evidence/attempt-index.json) are retained, alongside both .NET attempts. Early native failures include an incorrect preload extension in the driver, sandbox Electron launch failure, hidden-control selectors, an incorrect assumption about Start's request envelope, an ineffective first viewport fix, incorrect run-level Failed assertions, and one resize timeout. They are not relabeled PASS. Final runs use corrected assertions; no validation was relaxed. Native process launches used the tool's approved execution path after the sandbox launch failure, without adding no-sandbox flags or changing product permissions.

- **FAIL remaining in requested final acceptance:** none. Historical failed attempts remain evidence, not unresolved final scenario results.
- **BLOCKED verification:** none within the focused authorized scope; the initial fetch permission limitation was resolved by the final authorized check.
- **NOT RUN / intentionally pending:** live-model adherence, user-operated acceptance, final human approval, packaged/installed qualification, non-Windows or mobile Web UI qualification, the entire unrelated pre-Z8 regression matrix, publication and Z8. These are not inferred from the passing controlled suite.
- The 75 lint warnings remain reported. This closeout does not certify a warning-free repository or release readiness outside the focused request.

## Short manual acceptance checklist

1. In an independent synthetic workspace, explicitly choose built-in Sequential Engineering v2 and enter `Modify zz-demo.txt file content to after`. Confirm Context lists the selected document and both checks are shown as saved configuration.
2. In Project setup, edit one Test check; verify its arguments, source paths, report policy and associated Build remain intelligible, and the other check is unchanged.
3. In Design, navigate to Review current verification at both viewport sizes; verify readable labels and nonblank inspector after switching node/mode/tab.
4. Review preflight, then run through ordinary native permissions. In Runs, verify the real file edit, current Build/Test command facts, the named accepted assertion, and the reviewer’s sole bound verification reference.
5. Stop at Final human review. Inspect the captured request/evidence; do not approve merely to make the status Completed.
6. Inspect the labeled negative receipts: malformed output/reference rejection differs from a valid needs_changes/needs_human decision, and failed machine tests do not dispatch reviewer work.

No publication is authorized by this report.
