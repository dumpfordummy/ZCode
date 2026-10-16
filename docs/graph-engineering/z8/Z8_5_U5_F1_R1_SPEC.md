# Z8.5-U5-F1-R1: direct v3 Save coverage

This follow-up addresses the independent review's nonblocking P2 coverage
overstatement at a277735bc98daf83292a6063d80c68e5ca6c435d. It does not establish
a bypass or alter supported profiles, authority, native behavior or expiry semantics.

## Ownership and implementation decision

The existing graph-engineering adapter recipe store remains the sole configuration
writer. Its private-proof reader, exact-recipe checks, pre-verification expiry,
fresh source digest comparison, post-verification expiry, file lock, optimistic
configuration digest and atomic replacement remain on the same path.

Add only instance-local optional adapter dependencies: the Save clock (default
Date.now) and installed restore/runtime provenance observation (default existing
readWebProfileRestore plus revalidateWebProfileRuntime). Thread the latter through
the existing fingerprint/scope adapters. Workspace membership validation, real
file hashing, before/after membership checks and proof reads are not substituted.
No RPC, domain, persisted schema, public module contract or production caller changes.

## Test event order and invariants

A small synthetic Web/Test workspace is scanned and fingerprinted, and its real
immutable private proof is written. Save uses the real store. Installed provenance
alone is a named controlled dependency, not installed-engine acceptance.

- Fresh Save succeeds and a new store reads exact recipes, retaining unrelated fields.
- At expiry before Save, the pre-check rejects without provenance observation;
  existing configuration bytes remain identical, and absent configuration stays absent.
- A deferred provenance observation holds Save in verification. Only that store's
  clock advances to expiry. Matching bytes finish verification; the post-check rejects.
- Mutating actual static Content after preparation leaves membership valid but
  causes the prepared-byte comparison to reject before replacement.
- After successful Save, an expired clock and cold store still read exact recipes;
  no provenance observation or retained-file rewrite occurs. This is no run approval.

Every rejection checks exact error and configuration bytes/absence, then performs
a successful Save through a new store after restoring the fixture clock/bytes to
prove lock/resource release. No global-clock mutation or five-minute sleep.
Temporary local removal of each guard must be caught and restored byte-for-byte.

## Validation and delivery

Use the existing CI-selected adapter test directory, unchanged selectors and gates,
Node 24.14.0 / pnpm 10.33.2. Run focused Save/proof/config/preparation and legacy tests,
typecheck, lint, changed-file format, PR architecture and the existing suite with
actual Windows limitations recorded. Confirm four final-head CI jobs and individual
new test names in graph-tests logs. Correct the historical report prospectively;
retain independent-review failures and all prior native evidence. No native build,
installer, SDK/package restore, merge, tag, release, or installed .308 change.
