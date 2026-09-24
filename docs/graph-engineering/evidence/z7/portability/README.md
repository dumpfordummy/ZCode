# Z7-A12: Fork/Join portability audit

**FAIL: the requested Fork/Join round trip is not supported by the current implementation.** This additional requirement was supplied after the original Z7-A01–A11 checks. Those historical results remain intact; they do not establish Z7-A12.

## Actual observations

The audit uses the real `GraphWorkflowService`, `GraphEngineeringService`, parallel plan save/get, strict schemas and filesystem workflow library. It uses an in-memory synthetic graph repository and denies every native, Tool, parallel workspace and preflight port call. This is service-level verification, not an Electron or live-provider check.

For each concurrency limit, 1 and 2, it saves a two-branch parallel plan alongside a sequential draft, captures and exports through the existing library API, imports into a new library entry, and instantiates into a different synthetic workspace record. The original record is unchanged. Sequential edges survive, and each imported library entry has a distinct ID. Neither exported template includes the parallel plan; neither imported workspace record has one. This demonstrates the boundary of the existing sequential transfer; it is not a successful export of Fork/Join followed by data corruption.

| Required property                        | Result                                                                                                                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fork/Join branch connections             | FAIL: the portable graph schema has no Fork/Join node types or parallel-plan field                                                                                               |
| Concurrency limit                        | FAIL: neither 1 nor 2 is carried from the saved parallel plan into the exported/imported graph                                                                                   |
| Join policy                              | FAIL: all-selected is fixed executor behavior, not serialized portable configuration                                                                                             |
| Integration configuration                | FAIL: shared contract, result requirements and combined Build/Test recipe references are outside the exported sequential definition                                              |
| Import as a new graph                    | Sequential-only control passes with a fresh library ID and separate workspace record; Fork/Join path unavailable                                                                 |
| No worker workspaces or agents on import | Zero calls to all denied ports for supported sequential transfer and rejected unsupported payloads; valid Fork/Join/native UI case **NOT RUN**, because that path does not exist |

Appending a top-level parallel plan, a nested parallel plan, a Fork node or a Join node to the exported template produces strict schema errors in both cases. The complete errors, exported templates, source parallel plans and zero-call counters are retained in [result.json](result.json). No actual worker directory, native session, model request or Tool process is created by this audit. Only the synthetic library JSON is written under a newly generated `.tmp/z7-portability-*` directory.

## Cause and required follow-up

`GraphPortableTemplate.graph` and workflow capture/instantiate accept only `GraphSequentialDefinition`. Fork/Join belongs to the workspace record's separate `parallel.plan`. The parallel service has save/preview/prepare/decision/control operations but no transfer contract, and its panel has no export/import controls. `GraphWorkflowService.instantiate` only calls `saveDefinition`; it never saves a parallel plan.

Meeting this requirement needs a versioned portable representation covering the bounded branch topology, concurrency, declared Join semantics and integration settings, plus an explicit import-as-new draft path and UI. Local recipe/model/workspace references need the existing explicit binding policy. Import must remain separate from preview/preparation/admission and must never copy run history or owned session/workspace identities. This audit changes no production behavior and does not invent an unreviewed transfer API.

## Reproduction and checks

Use the repository's existing dependencies, Node 24.14.0 and pnpm 10.33.2 on the terminal PATH. From the repository root:

```powershell
node --import tsx scripts/graph-engineering/z7-portability-audit.mjs
```

The command prints the evidence path and exits **1** to indicate the unmet acceptance requirement. This is intentional diagnostic failure, not a passing acceptance test. Passing an output JSON path as the first argument writes a reviewable artifact there. It does not launch Electron, discover native configuration or use installed application data.

For eventual manual acceptance in the isolated profile described in [Z7_SETUP.md](../../../Z7_SETUP.md): save a two-branch plan with distinct instructions/files, chosen concurrency, shared contract, result criteria and Build/Test references; export it; import as a new graph; compare every field and branch connection; inspect that no workers, native sessions or runs exist before an explicit Prepare/Run operation. Repeat with concurrency 1 and 2, then restart and compare again. **NOT RUN / currently blocked at Fork/Join export:** the required controls and portable contract are absent. Do not treat exporting the sequential draft beside the plan as this test.

Fresh audit checks: root typecheck PASS; root lint PASS with the existing 70 warnings and zero errors; architecture PASS with zero violations; all 32 focused workflow/parallel tests PASS. The accompanying logs retain these results. The original CLI lint (85 errors/53 warnings) and repository formatting baseline failures remain recorded in the parent verification; CLI lint and full formatting were NOT RUN again for this audit, and no claim is made that this audit fixed them. Remote freshness fetch was unavailable because `.git/FETCH_HEAD` could not be opened under the sandbox; the supported `--no-fetch` check passed against cached refs.
