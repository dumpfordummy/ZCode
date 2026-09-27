# U1 controlled native evidence

Captured on 27 September 2026 against the coordinator's rebuilt U1 outputs. These are synthetic, private-profile, loopback-provider desktop results. No live model, installed credentials, company project or installed application data was accessed. Application and OS sandbox settings and native approval semantics were unchanged.

| Evidence                               | Actual result                                                                                                                                                                                         |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `native-agent-assisted-pass.json`      | PASS, exit 0; run `2eba82da-9ed7-48d6-9762-6c73974513d1` Completed; three fresh native admissions, 11 controlled model requests, zero provider errors; completed restart with zero replay.            |
| `native-recipe-independence-pass.json` | PASS, exit 0; valid JSON with invalid unrelated recipe data does not block actual Agent-only creation/preflight; empty recipe inventory, unchanged config, unchecked acknowledgement, zero execution. |
| `native-save-restoration.json`         | Actual Save-and-replace atomic-write failure; finally restoration verified identical saved bytes.                                                                                                     |
| `malformed-recipe-config.txt`          | Exact synthetic invalid configuration used for the distinct read-failed/retry state.                                                                                                                  |
| `native-evidence-receipt.json`         | Base commit, actual tested CLI/Main/Host/renderer SHA-256 identities, original fixture paths and SHA-256 for each preserved evidence file.                                                            |
| `screenshots/`                         | 17 full-scenario screenshots plus one preparation-only screenshot; actual 1280×720 and 1920×1080 renderer viewports recorded in the raw summary.                                                      |
| `failures/`                            | Three failed driver attempts, preserved separately with their original FAIL statuses and screenshots.                                                                                                 |

The full scenario exercises empty/read-failed/incompatible/compatible recipes, real configuration-save conflict, two-workspace draft isolation, replacement Cancel, failed Save-and-replace with exact restoration, canonical Agent-assisted v1 creation, side-effect-free preflight, native question/Edit permission, actual source change, captured handoffs, required-comment Graph approval, explicit agent-led/no-configured-test evidence and restart without replay. No native inputs or model requests occur during preparation. Native interaction identities and full persisted run/provenance are retained in the passing raw summary.

The earlier failures are harness defects, not new product regressions: `first-edit-cache-summary.json` required a redundant Read after successful native Edit; `second-negated-status-summary.json` matched `tests passed` inside a sentence explicitly denying that claim; and `preflight-first-save-race-summary.json` read the first saved record before the actual UI acknowledgement. Each correction follows the checked-out native/UI contract, and each original failed result remains preserved. All retries used fresh profiles and the same coordinator-built product.

The actual output hashes identify the tested implementation. The recorded Git base is `7e5f02d76abf20d567df1a9e6ddb868ab3421205`; existing uncommitted changes were present, so that commit alone is not the tested tree. Raw summaries retain original owned `.tmp` paths without rewriting captured facts. Their durable screenshot equivalents are in this directory.

NOT RUN: the synthetic `fixture.test.mjs` (no configured machine tests in this workflow); user-operated novice, live-provider and real-project pilots; installed-artifact/platform checks; OS scaling/accessibility conformance; deliberately held in-flight RPC while switching workspaces. The targeted recipe probe intentionally performs no graph execution. These results do not declare U6's human pilot complete or authorize Z8.

Reproduce only after the coordinator's fresh serial build, using the pinned local toolchain and an approved native launch environment:

```powershell
. .\.tmp\z1-env.ps1
$env:PATH="$PWD\node_modules\.bin;C:\Program Files\Git\bin;$env:PATH"
Remove-Item Env:Z1_PACKAGED_EXE -ErrorAction SilentlyContinue
node --test scripts/graph-engineering/pre-z8-u1-provider.test.mjs scripts/graph-engineering/pre-z8-u1-record-fault.test.mjs
node scripts/graph-engineering/pre-z8-u1-native.mjs
node scripts/graph-engineering/pre-z8-u1-recipe-independence.mjs
```

Commands create new private profiles; they must not reuse installed credentials or real projects. The native commands ran serially with command-sandbox escalation needed by this environment's Electron renderer, without application-sandbox flags. Existing z4/z5/z6 navigation adaptations require their separately recorded native regressions; the U1 pass does not substitute for those checks.
