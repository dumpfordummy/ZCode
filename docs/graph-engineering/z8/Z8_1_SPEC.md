# Z8.1 specification — reproducible local package and release manifest

Scope is exactly what [Z8_PLAN.md](Z8_PLAN.md) approves. Behavior changes below are specified before implementation. Z8.2–Z8.5 are out of scope.

## 1. Upstream identity

- Root `package.json` version becomes `3.14.3`; the Graph candidate is `3.14.3-z8.1`. Ordinary non-Graph builds read the root version, so this is also the version of any non-Graph build from this tree — which matches the upstream content.
- The comparison is reproducible and pinned: upstream tag `v3.14.3` resolved to a full SHA; actual `git merge-base HEAD <sha>`. The report states only (a) the number of paths upstream changed between merge-base and the pinned SHA and how many are byte-identical at HEAD; (b) for the remainder, that upstream's change is contained in the fork's version (three-way check) or is a named non-code difference (version string, README); (c) the whole-tree summary against the pinned SHA (0 deleted, N modified, M added). It does **not** claim whole-tree equality or ancestry.
- The manifest keeps `mergeBase` and `contentReference` as separate labelled fields.

## 2. Version policy

`resolveGraphDistributionVersion` is the sole owner. Accepted: `major.minor.patch-z{1,2,7,8}.number`, canonical numbers (no leading zeros). Unchanged rejections: other milestones (`z3`…`z6`, `z9`), leading zeros, suffixes/injection, missing version when Graph distribution is on. Callers that must be covered by tests: the builder, `packaged-smoke`, `publish-core.parsePublishArgs`, and the CI workflow's validation step (same function). Existing tests that asserted `z8` rejection are updated to the new rule; a negative test for `z9`/`z3` stays.

## 3. Parallel capability policy

One pure resolver, `resolveGraphParallelPolicy({ flavor, env })`, in `@zcode/shared` (`graph-capabilities.ts`), returns `{ mode: "disabled" | "experimental", source, reason }`.

| Situation                                           | Result                                                                  |
| --------------------------------------------------- | ----------------------------------------------------------------------- |
| `flavor === "graph"` (the supported package)        | `disabled`, `source: "supported-package"`. Environment is **ignored**.  |
| other flavor, `ZCODE_GRAPH_EXPERIMENTAL_PARALLEL=1` | `experimental`, `source: "development-opt-in"` (explicitly unsupported) |
| other flavor, anything else                         | `disabled`, `source: "default"`                                         |

Owners and enforcement:

- **Host (authority).** `GraphEngineeringService` options carry `parallelPolicy`; omission means `disabled`. `GraphParallelService` rejects with a clear message, in the serialized section before any effect: `save` of a plan with `enabled: true`, `preview`, `prepare`, and `decide` with `approved: true` (plan or integration). Allowed regardless: `get`, `control` (`cancel`, `inspect`, `release`, `cleanup`, `preserve`), and `decide` with `approved: false` (a rejection only stops work). `get` returns the policy as `view.policy`.
- **UI (projection).** Reads `view.policy`. When disabled: the Advanced toggle is hidden unless historical parallel data exists; the panel explains the policy, disables Save/Preview/Prepare and approval actions, and leaves inspect/cancel/release/cleanup usable. UI never decides policy.
- **Manifest.** Records the value the builder computes with the same resolver for the Graph flavor.
- Schemas, stored plans/runs, cold-load Interrupted handling and recovery are unchanged. Ordinary Chat and native subagents do not call this policy.

## 4. Automatic telemetry policy (Graph flavor)

Traced initialization: (1) `@zcode/shared` `env.ts` reads `ZCODE_ARMS_RUM_ENDPOINT` / `ZCODE_TELEMETRY_REPORT_ENDPOINT` from `process.env` **at module load**; (2) Main `appARMSBootstrap.ts` starts ARMS RUM only when `ZCODE_TELEMETRY_ENABLED && ZCODE_ARMS_RUM_ENDPOINT` and `index.ts` gates stability/resource telemetry the same way; (3) the Host `telemetryCore` sends only when `ZCODE_TELEMETRY_ENABLED && ZCODE_TELEMETRY_REPORT_ENDPOINT`; (4) the agent CLI exports OTLP traces/metrics when `OTEL_EXPORTER_OTLP_*` is present — Main captures those variables (`sanitizeZCodeRuntimeEnvInPlace`) and `buildAgentTelemetrySpawnEnv` re-injects them into the agent process.

Deliberate Graph policy, three independent layers (each sufficient for its own path; none is a claim of zero egress):

- **Entry (before any application import):** the Graph entry removes inherited `ZCODE_ARMS_RUM_ENDPOINT`, `ZCODE_TELEMETRY_REPORT_ENDPOINT`, every `OTEL_*` and `ZCODE_TELEMETRY_*` variable and sets `ZCODE_MODEL_TELEMETRY_ENABLED=0`. The key set is a pure, tested function next to the profile mapping. Child processes inherit the scrubbed environment.
- **Shared policy (`resolveAutomaticTelemetryPolicy`)**: for the `graph` flavor `ZCODE_TELEMETRY_ENABLED` is `false` and both endpoints are empty even if present. Other flavors compute exactly the previous values.
- **Agent spawn:** `buildAgentTelemetrySpawnEnv` returns `{}` for the Graph flavor.

Out of scope for Z8.1: measuring production egress, the Feedback uploader, account-based syncs, model-provider traffic (Z8.3).

## 5. Builder, embedded identity, external manifest

- `build-windows.mjs <version> [--dist-dir <name>]` extends the existing builder. `--dist-dir` (default `dist-graph`) must match `dist-graph[-A-Za-z0-9.]*` so a second build writes elsewhere; `packaged-smoke.mjs` reads the same name from `ZCODE_GRAPH_DIST_DIR`.
- The builder records the toolchain actually used (Node, pnpm, Electron, electron-builder, CLI version), refuses a non-Windows-x64 host (unchanged), and records source dirty state. The parallel policy is not configurable by the supported builder.
- **Embedded build identity** `graph-build-identity.json` is written before packaging and shipped as an extra resource. It contains: product identity, candidate version, source commit/dirty, upstream merge-base and content-reference SHAs, protocol/CLI/Electron versions, capability policy, telemetry policy. It never contains the installer's own hash, build-machine paths, or any profile path.
- **External manifest** `RELEASE_MANIFEST.json` (next to the installer) is produced after the installer exists. It adds: lockfile hashes (`pnpm-lock.yaml` and the CLI lockfile if present), relevant build configuration (the exact environment keys/values the builder sets, with no ambient variables), supported platform/arch, validation results and explicit exceptions (supplied by a results file written by the validation runner, never hand-edited into the builder), and SHA-256 of the installer and packaged components (`ZCode Graph.exe`, `app.asar`, the agent bundle, notices, default config, embedded identity, native search tools tree digest). All paths are relative to the artifact directory or to `win-unpacked`.
- Capability table in the manifest has three separate fields per capability: `enabled` (policy), `devVerified` (reference to development evidence), `packageVerified` (reference to packaged evidence, empty unless a packaged run produced it). Enabled never implies verified.
- Reproducibility is **measured, not asserted**: the compare tool lists installer and component hash equality and every differing file with an explanation; it does not rewrite the packaging toolchain to remove expected differences (timestamps, blockmap, build metadata).

## 6. Package inspection

`package-inspect.mjs` reads the real `win-unpacked` tree and the real `app.asar` (via `@electron/asar`, already a dependency). It verifies: executable name, `package.json` inside the ASAR (name, candidate version, `main` = `out/main/graph-entry.mjs`, `zcodeProductFlavor` = `graph`), presence of graph entry/profile files, required resources (agent bundle, native search tools, notices, default and built-in provider config, embedded identity), absence of test/fixture resources, and content findings.

Content scan rules (initial; the report shows the real hits): developer-specific absolute paths (the build checkout path, the build user's name/home), `.env` files, sourcemaps, private-key blocks, bearer/API-key-shaped literals, fixture identifiers (`z1-local-fixture`, `Z1_ALLOW_PROVIDER_NETWORK`, `scripts/graph-engineering`), private profile directories (`.tmp`, scratch). Each hit is **classified by context** (package, file, snippet): `leak`, or `benign` with a narrow written reason. An exception is keyed to exact rule + file path (or exact third-party package path) + matched text; no directory-wide or pattern-wide exclusions. Any unexplained hit fails inspection. The scan proves only what it searched; it is not evidence of zero network egress or isolation.

## 7. Validation

Run and record real commands, working directories and exit codes: `pnpm typecheck`, `pnpm lint`, `pnpm architecture:check --changed`, the distribution/publish/manifest/inspect node tests, the Graph service tests, the UI tests, and (existing practice, controlled loopback provider, disposable profiles) the packaged smoke on build 1. Required focused cases: accepted/rejected version labels; Graph identity; parallel disabled at the Host boundary (direct calls); historical parallel data readable without any dispatch; `control` still works; ordinary Chat path unaffected; inherited telemetry settings cannot enable Graph telemetry (entry scrub, shared policy, spawn env); manifest↔artifact consistency; scan; two-build comparison. Old counts and baseline exceptions are re-measured, not copied. Failed attempts are retained in the report.

## 8. Release notes

Candidate notes are prepared at `docs/graph-engineering/release-notes/3.14.3-z8.1.md` and are not published. The release workflow selects `release-notes/<version>.md` when present and otherwise falls back to `WINDOWS_RELEASE_NOTES.md`, which keeps serving historical z1–z7 identification unchanged. Relevant corrections from the unreleased z7.6 notes are carried forward after inspection.

## 9. Acceptance

All items in §7 pass or are reported with the exact reason; the package inspection has zero unexplained hits; two serialized builds from the same clean commit exist side by side with a comparison; the report states the justified status line from the plan and does not claim internal-release readiness.

## 10. Additions made while implementing (recorded so the spec matches the build)

- **Runtime telemetry canary.** Static policy tests are not enough for "inherited settings cannot enable Graph telemetry", so a packaged case (`telemetry-canary`, in the existing detached smoke) launches the packaged app with ARMS, warehouse and OTLP variables pointing at dedicated paths on the loopback fixture, runs one ordinary Chat turn, closes the app, and requires zero hits and no ARMS initialization. A **positive control** (`--telemetry-control`, development build of the ordinary flavor, ARMS endpoint omitted because that SDK fails to initialize in this harness and stops startup) must show hits, otherwise the canary method is not proven. The canary covers those three inherited-setting paths only.
- **Validation runner** (`run-validation.mjs`) records commands, exit codes, counts and logs, keeps failed attempts, and includes a **scoped format check**: `pnpm fmt:check` flags nearly every file in a Windows checkout because oxfmt prefers CRLF there, so the runner formats LF copies of the files this milestone changed and compares ignoring CR. The audit record is excluded from reformatting.
- **Upstream identity check** (`upstream-identity-check.mjs`) regenerates the path-level comparison; its output is kept at `evidence/upstream-identity.json`.
- **Scan-exception format.** An exception is one rule + one exact file + exact matched texts with maximum counts + a written reason; the private-address rule ignores digits inside longer numbers (an SVG path coordinate was a false positive).

## 11. Packaged-baseline follow-up (approved after the first report)

Scope: harness, tooling, evidence and docs only; the b1 binary is not rebuilt. See [Z8_1_PACKAGED_FOLLOWUP.md](Z8_1_PACKAGED_FOLLOWUP.md). Contract:

- Packaged drivers reach the editor through the real Workflows destination (`graph-view-design`) and select a run before inspecting its recovery; no assertion is weakened and legacy scenarios keep their legacy data.
- One current sequential journey runs in the packaged app by reusing the existing reviewer journey (`reviewer-native.mjs`, packaged mode); the driver never approves the final gate, seeds artifacts or runs checks itself.
- Suite semantics live in `packaged-suite.mjs`: only a complete suite with every case passing satisfies the full release gate; subsets are labelled and written separately; any failed or never-run selected case yields a nonzero exit, including under keep-going; earlier results are archived, never overwritten.
- `run-packaged-acceptance.mjs` verifies the package hashes against the unchanged manifest before and after, records the real process exit code, build-source and harness-source commits separately, and writes a generated `PACKAGED_VALIDATION_SUPPLEMENT.json` that points at the manifest by hash. Nothing is written into a manifest.
- Evidence accounting uses retained comparison data only (`reconcile-comparison.mjs`); raw and normalized comparisons stay separate; the executable integrity region is read directly (`verify-asar-integrity.mjs`).
