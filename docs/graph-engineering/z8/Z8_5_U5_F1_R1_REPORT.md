# Z8.5-U5-F1-R1: v3 Save coverage follow-up

## Disposition and scope

The authoritative independent review `Z8_5_U5_F1_INDEPENDENT_REVIEW_REPORT(1).md`
identified one nonblocking P2 coverage overstatement at reviewed source
`a277735bc98daf83292a6063d80c68e5ca6c435d`. It did not demonstrate a bypass.
The guards were present; the prior proof test never called `store.save`.
This follow-up adds direct behavioral coverage and corrects the original report
prospectively. No separate functional defect was reproduced.

The sole configuration owner remains `createGraphRecipeStore`. Runtime defaults
remain Date.now and the existing restore/runtime provenance checks. Optional
adapter-instance dependencies permit deterministic Save time and a named controlled
installed-provenance observation. The tests do not substitute the real private proof,
workspace scan, before/after membership checks, byte fingerprint, digest comparison,
configuration concurrency check, file lock or atomic replacement. No production caller
supplies these test dependencies. No public RPC/schema/history or authority change.

## Direct behavioral results

All six tests are in the unchanged CI-selected adapter directory, in
`packages/services/src/graph-engineering/adapters/web-profile-save.test.ts`.
Each uses a small real filesystem Web/Test fixture, 12 prepared input files, a real
immutable workspace-bound proof and the real Save/read entry points. Synthetic restore
metadata is not claimed to be valid installed provenance; only that expensive external
observation is controlled. No SDK scan, MSBuild evaluation or native acceptance is claimed.

| Exact test name                                                                              | Branch and observation                                                                                                                                                                     | Local result |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| v3 Save fresh positive control persists exact recipes and unrelated configuration            | Both membership observations, matching fresh byte digest, real atomic Save, fresh default-store read, unrelated fields preserved                                                           | PASS         |
| v3 Save expired before verification preserves existing config and releases lock              | Exact pre-expiry error at equality, zero installed-provenance calls, byte-identical original config and proof, subsequent new-store Save succeeds                                          | PASS         |
| v3 Save expired before verification preserves absent config and releases lock                | Same pre-expiry boundary; configuration remains absent, no temporary/lock residue; subsequent new-store Save succeeds                                                                      | PASS         |
| v3 Save expires during real verification before replacement and releases lock                | Deferred provenance confirms entry with valid review; instance clock advances to expiry; both membership observations and matching byte verification complete; exact post-expiry rejection | PASS         |
| v3 Save rejects actual prepared Content byte drift and releases lock                         | Real static Content bytes mutate while membership digest stays equal; fresh fingerprint reaches prepared-byte comparison and exact mismatch rejection                                      | PASS         |
| v3 Save cold reopen after review expiry reads without verification or retained-file rewrites | Successful Save then expired instance clock, cold read exact recipes; no provenance calls or file additions/rewrites; subsequent Save still rejects expiry                                 | PASS         |

Every rejection preserves configuration bytes or absence and private proof bytes.
The during-verification and drift cases also prove lock release with a successful
new-store Save after restoring only the fixture clock/Content. No real review lifetime
is shortened; no shared global clock is modified. Cold read has no native/model/run
dependency and does not create or alter execution artifacts. It does not approve a run.
Existing preview/admission/evidence revalidation remains required; see
`project-large.test.ts`, `project-declarative.test.ts`, `web-profile-inputs.test.ts`
and `web-trx-association.test.ts`, plus the separately retained F1 native freshness record.

## Mutation controls

Temporarily removed each targeted guard independently and ran its named tests:

- Pre-expiry removal: both pre-expiry tests failed because they reached the different
  post-expiry rejection, proving the specific earlier boundary is required.
- Post-expiry removal: during-verification test failed with missing expected rejection.
- Prepared-byte comparison removal: real Content drift test failed with missing expected rejection.

All three mutated runs exited 1. Each restoration used exact original file bytes in
a finally block. Restored recipes.ts SHA-256:
`7df3dbe56c30463b74c8429aa29df24c6a507b00d6d7a1215f10c75bf2cfed62`.
The restored six-test run passed. Mutants are not committed. Local TAP and mutation
summary are retained privately under `.tmp/f1-r1`; no raw local paths are published.

## Validation and identities

Verified Node **24.14.0** / pnpm **10.33.2**. Local results on the R1 changes:

- New Save file: 6/6 passed; restored mutation-control run also 6/6 passed.
- Focused eight-file run: **30/30 passed**, 0 skipped, 66.771 seconds. Files:
  adapter `web-profile-save`, `web-profile-proof`, `recipes`, `web-profile-inputs`,
  `project-declarative`, `project-large`, and app `web-profile`, `recipe-compatibility` tests.
  This includes legacy v1 reconstruction, literal configuration compatibility, v2
  large-scope Save/reload and current content/membership revalidation.
- `pnpm typecheck`: passed. `pnpm lint`: 75 warnings, **0 errors**.
- Changed-file `oxfmt --check`: passed. Architecture changed-file check: 0 violations;
  PR-scoped architecture check is also run against the integration base after committing.
- Unchanged full selector on this Windows checkout: **1,045 total; 1,041 passed,
  2 failed, 2 skipped**, 0 cancelled. Scripts 161/163; services 632 passed/2 skipped;
  UI 248/248. All six new Save names passed in the services TAP. Inventory has no errors.
  The selector exits 1: existing ASAR header-key test reads an undefined hash;
  electron-builder configuration test rejects a raw Windows path as an ESM URL;
  Linux skip baseline expects 4 while Windows executes two platform tests, leaving 2 skips.
  No exclusions or skip expectations were changed. Background-sync passed in this run.

The full selector command was `node scripts/ci/graph-cloud-suite.mjs`, with its result
directory isolated under `.tmp/f1-r1/full-suite`. Focused tests used `node --import tsx
--test --test-reporter=tap` and the eight files above. The new file is selected by
the existing adapter-directory rule; the selector itself is unchanged.

Final-head CI is a distinct delivery gate: the final delivery attachment and PR R1
section record exact source/base/merge identities, all four job outcomes and fetched
individual test-output evidence after the normal push. This committed report does
not predict those outcomes or claim historical CI ran tests that did not yet exist.

The independent review's historical Windows results remain separate: full selector
1,009 passed / 28 failed / 2 skipped; targeted rerun 85 passed / 3 failed / 1 skipped.
Its native process-owner modules did not load because compiled exports were missing,
so it executed zero native ownership assertions. These are not new R1 results.
No unrelated Windows ASAR/ESM or background-sync repair is part of this follow-up.

Base remains `f7279c79824e518abc6f4fdeb2c6cf66b86bac31`; original reviewed merge was
`6a54436e5686335fca75c2b9cc9525b0f95b2c10`.
All previous native successes, failures, expiries and disconnect records remain intact.
R1 is focused Save/read coverage, not a new native ownership, Web execution or large-scope proof.
PR #23 stays draft, auto-merge off. No merge, installer, tag, release, publication,
SDK/package restore, employer-source access, native build, or installed .308 change.
