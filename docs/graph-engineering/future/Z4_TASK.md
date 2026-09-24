# Z4 — inspectable artifacts, typed results and deterministic Tool nodes

## Objective and dependency

Dependency: verified Z3 gates and Z2 sequential native orchestration. Extend the graph's evidence without narrowing normal Agent Task capabilities.

Target workflow:

`Start -> Implement -> Review code -> Build -> Test -> Review evidence -> End`

Build/Test are optional Tool nodes using existing native execution facilities. They do not ask an LLM to imitate a command result. Existing Agent Tasks can still use native tools internally as usual.

## A. Immutable artifacts and provenance

Extend current metadata/storage rather than automatically importing the old C# schema. Define immutable run-scoped artifact records: type, ID, node/attempt identity, source provenance, byte length, content digest, capture time, relevant workspace/source baseline and validation status. Initial types: final text, structured JSON, bounded file/diff snapshot, command result and test result.

Store bounded content in app-owned artifact storage under the existing graph data owner. Never treat a model-provided path as an authorized arbitrary file read. Capture only declared workspace/native-tool artifacts through validated paths, with explicit handling of symlinks/reparse points, traversal, external references, binary files and size limits. Display unsupported entries; do not silently omit them.

An artifact is a captured observation, not a guarantee of source truth. Native command evidence and model-reported claims have different provenance. Logs may be incomplete or secret-bearing; keep private content local, use native redaction where available, and exclude raw content from telemetry/export by default.

Add explicit binding sources for whole artifacts and, for validated JSON, a selected field/path using a documented bounded parser. Referenced content belongs to the exact completed node attempt, not the latest session message/file. Large content requires explicit selection; never silently concatenate entire transcripts or repositories. Output caps produce a visible failure/incomplete result, not hidden truncation that changes a routing decision.

## B. Optional structured Agent output

Ordinary agents remain text-first. A node may opt into a declared local JSON-object schema. Validate the final text for the exact owned input using the current parser/library, bounded bytes/depth and explicit duplicate-key policy. Reject prose/fences/trailing data when strict mode is selected. Do not make new provider-specific structured-output support a prerequisite or silently change model parameters.

A native input can finish while output validation fails. Preserve both states: `input completed` is not `valid output` or `verified code`. Missing/invalid output stops dependent bindings. No automatic extraction fixup, extra prompt, schema relaxation or inference retry.

A suggested reviewer record can contain outcome `pass | needs_changes | needs_human`, summary, findings and evidence references. Validate types, allowed references and referenced source/attempt. A model's `pass` is still a reviewer opinion, never a substitute for a test result or human approval.

## C. Tool node contract and native adapter

Inspect the current terminal/tool/session services for an authoritative non-agent command entry. Prefer a typed public native service that provides a handle/operation ID, cwd, exit outcome, output and targeted cancellation. If no suitable interface exists, propose the smallest native service extension. Do not add a separate process supervisor or scrape chat prose. A service that only writes characters into a terminal without authoritative completion is insufficient.

Configure named recipes with executable/tool identity, argument array, selected-workspace-relative cwd, timeout, expected output artifacts and verifier kind. Provide editable project-level recipes through existing configuration conventions; examples such as Restore/Build/Test are starters, not a permanent allowlist on agents.

Never concatenate raw model text into a shell command or use arbitrary expression evaluation. Any explicitly supported script-shell recipe needs separate visible authorization, a fixed configured script/arguments and the normal native trust boundary. Keep credentials in existing secret/config owners; do not display substituted secrets in command previews or artifacts.

Persist intent/operation identity before starting. Obtain normal user/recipe permissions before execution. Graph gate approval is not native tool approval and cannot bypass it. Use real exit status and match the exact tool invocation, source baseline and artifacts. Cancellation targets only the owned operation; after a lost start/finish reply preserve uncertainty and block dependents. Do not assume a native operation is idle because a terminal window closed.

## D. Verification semantics

Separate these facts in UI and contracts:

1. The process was actually started and its outcome is known.
2. The command exited successfully.
3. The expected fresh report exists and parses.
4. The configured acceptance rule passes.

A Build recipe may use exit code and fresh outputs. A Test recipe must verify its declared report, execution identity and minimum/expected discovered tests. Zero tests, skipped required tests, stale reports from a previous attempt, failed report parsing or missing outputs must not show `Tests passed`. A configured intentional no-test command must use a different verifier classification.

For the synthetic C# proof, make a clean fixture with a known positive test count. Ensure Test uses this run's source/build outputs, not an unrelated stale `--no-build` artifact. Validate source/build provenance before and after execution where possible. Record limits if unrelated writes can occur; a matching digest at two instants is not a complete filesystem isolation guarantee.

Do not let model output choose an executable, replace the recipe, change its pass criterion or authorize network/package operations. A command can execute repository code; this remains a trusted-workspace execution feature, not an OS sandbox.

## Required verification

| ID | Scenario | Required result |
|---|---|---|
| Z4-A01 | Z3 baseline, old text bindings/gates/history | Preserved and no work on open/migrate |
| Z4-A02 | Text and strict JSON including malformed/oversized content | Exact attempt attribution; invalid output blocks dependents with no additional agent input |
| Z4-A03 | Artifact persistence, digest/ownership mismatch | Immutable old evidence; tampering detected; references cannot cross unauthorized runs/workspaces |
| Z4-A04 | Actual native Build/Test of synthetic C# repository | Genuine process results and fresh parsed report; positive known test count; independent test agrees |
| Z4-A05 | Model says PASS while tests fail | Process/report failure remains visible and blocks required success path |
| Z4-A06 | Zero tests, missing/stale report, wrong source/build | None become passing test evidence |
| Z4-A07 | Traversal, outside path, symlink/reparse, HTML content | No implicit external capture/execution; unsafe content rendered as data |
| Z4-A08 | Tool cancellation, lost acknowledgement, crash | Only owned operation targeted; unknown outcomes retained; no automatic restart |
| Z4-A09 | Duplicate dispatch, write failures, competing views | One owned operation intent; persistence precedes side effects; correct conflict responses |
| Z4-A10 | Synthetic secret and export checks | Secret store untouched; configured synthetic secret not exposed; exports exclude raw content by default |
| Z4-A11 | Native agent tools and ordinary Chat | No regression or new demo-only capability limit |

A04/A05/A06/A08 need actual native command execution and genuine artifacts, not fake exit-code objects. Inspect the command adapter's limitations before claiming same-permission behavior.

## Out of scope and handoff

No arbitrary graph scripts, autonomous repair, automatic schema-repair prompts, parallel scheduling, credential vault, general filesystem indexer or certification engine.

Write Z4_REPORT.md with exact native execution entry points, an actual failed and passed test example, artifact provenance, baseline exceptions and user verification steps. Stop after Z4.
