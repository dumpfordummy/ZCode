# Z5 controlled native acceptance fixture

This is an implementation contract for the Z5 harness. Results are recorded separately after execution. It extends `Z5_SPEC.md` and reuses the actual Z4 isolation, offline .NET environment, immutable C# runner and native permission/session paths. It introduces no product execution engine or provider configuration owner.

## Independent executable proof

The existing runner retains exactly `add-positive`, `add-negative` and `add-zero`. The synthetic source begins with `left + right + 2`. A real initial native Edit changes this to `left + right + 1`, producing three real failed assertions. Repair 1 changes the expression to `left < 0 ? left + right + 1 : left + right`, producing two passes and one failure. Repair 2 changes to correct addition and all three assertions pass. Every stage uses a real offline Build and execution of the generated assembly. The final unchanged runner is executed independently outside the app.

The separate permanent-failure source progresses through offsets one, two and three, all genuinely failing; this tests exhaustion without conflating different semantic failures with no progress. The no-progress scenario keeps identical source and canonical findings/test outcomes, excluding only invocation identities. All report operation/source/build provenance is supplied through the existing native recipe contract and checked independently.

## Ownership and exact feedback

```text
Native editor → Host persists frozen region/limits/iteration → native input/operation
             → actual Read/Edit/Build/Test → immutable current verification
             → native Reviewer → Host condition decision/checkpoint
             → fresh Repair session with exact prior repair-feedback
```

The controlled HTTP fixture only returns model messages/tool requests. Existing native services execute every Read, Edit and question. It derives repair actions from the exact provided verification/feedback and actual native Read output, never HTTP request counts. It must reject missing/wrong iteration references rather than silently fabricate evidence. Verification content includes its exact artifact/run/node/attempt/iteration/operation identity and source/build digests so the reviewer can quote the actual supplied artifact ID.

The native happy path has six Agent inputs and six Build/Test processes across iteration zero and two repairs. Internal model/tool calls are recorded separately. Every Agent/Tool attempt has a fresh actual session; all evidence, failed attempts and decisions remain retained. Native permissions stay separate from Graph approval. Iteration selection and Open conversation submit zero work.

## Selected native matrix

The harness covers typed true/false/default/missing/wrong-type conditions; two-repair success; permanent fault/iteration exhaustion; native-admission exhaustion; deadline expiry while a native repair question is pending; no progress; reviewer PASS with failed machine evidence; invalid reviewer JSON; accepted-input uncertainty; persisted decision/checkpoint restart and duplicate Continue; cancel/reject during repair with an unrelated Chat preserved; stale source/current-iteration references; illegal edge/gate bypass readiness; completed-history restart and iteration navigation. Unit/service fixtures cover the full operator/topology/race matrix and out-of-order exact-ID events. Mandatory A03/A07/A08/A09 are actual native checks.

Boundary instrumentation is test-only and profile-contained: wrap the unchanged real Host, capture the actual persisted/proposed checkpoint and pause one exact metadata write. Never write runtime databases, manufacture native receipts or use elapsed sleep as proof. Safe planned checkpoints need explicit Continue after restart; accepted/uncertain input must never replay. Reuse the existing exact native cancellation and only close the owned test app.

## Scope and evidence

All data resides in fresh synthetic `.tmp/z1-native-*` or marked manual profiles. The existing loopback provider isolation and cleared NuGet feeds remain active; installed settings, credentials and company repositories are out of scope. Each actual run writes a summary with source/report digests, exact sessions/inputs/operations, ledger counts, route/iteration budgets and unedited native screenshots. Preserve intermediate failures and distinguish historical prerequisite evidence, newly executed baseline checks and final Z5 acceptance. User-operated live-provider/project and packaged checks remain NOT RUN.

New source belongs to `scripts/graph-engineering/z5-*`; evidence belongs here. No product APIs, schemas, native runtime tables, provider stores or predecessor test evidence are modified by this harness.
