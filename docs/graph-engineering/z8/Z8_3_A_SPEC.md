# Z8.3-A — Graph Windows ASAR integrity repair (spec and implementation contract)

Status: bounded implementation of Decision 3 in `Z8_3_DECISIONS.md`. The rest of that document stays proposal-only. This is **not** "Z8.3 complete" and **not** release-ready.

## Problem (from Decision 3, [source])

electron-builder 26.8.1 writes the `ELECTRONASAR` integrity resource into the Windows executable before `afterPack`. The repo's `afterPack` then rewrites `app.asar` twice, so the recorded header hash is stale. No `electronFuses` is configured, so `EnableEmbeddedAsarIntegrityValidation` stays off.

## Product rules

1. **Graph Windows only.** Everything below applies when the product flavor is `graph` and the electron-builder target is `win32`. Production, Preview, macOS and Linux configurations are byte-for-byte unchanged (no hook behaviour, no fuse setting).
2. **Replace, never append.** The `INTEGRITY/ELECTRONASAR` entry already present is replaced in place (its language and codepage are kept). A second entry is never created. All other PE resources are preserved.
3. **One header-hash definition.** Recorded value = lowercase hex SHA-256 of the archive header JSON string exactly as stored in `app.asar` (`@electron/asar` `getRawHeader().headerString`). This is the definition electron-builder's `hashHeader` uses and `scripts/graph-engineering/verify-asar-integrity.mjs` already verified equal on a synthetic archive. A test cross-checks it against electron-builder's own `computeData`.
4. **Fail closed.** A missing, duplicated, malformed, unsupported-algorithm or stale record, a signed or malformed PE, a missing/duplicated/malformed fuse wire, or a fuse that is off when required all throw a `WindowsAsarIntegrityError` with a stable `code`. Nothing is silently accepted or skipped.
5. **Fuse scope.** Only `enableEmbeddedAsarIntegrityValidation: true` is set. `RunAsNode` (the agent and CUA helpers run as `ELECTRON_RUN_AS_NODE`) and every other fuse, including the unnamed ninth, are left to the Electron default by omission (`@electron/fuses` leaves unspecified fuses untouched). The ninth fuse is neither identified nor changed.

## Owner and lifecycle

State owner: `packages/desktop/scripts/windows-asar-integrity.mjs`. `electron-builder.config.js` only wires it in.

```
beforePack ─▶ pack app ─▶ beforeCopyExtraFiles: builder appends ELECTRONASAR (stale from here)
           ─▶ afterPack  (existing steps: inject modules ▶ strip sourcemaps ▶ policy asserts ▶ install manifest)
                       └─▶ NEW LAST STEP  refreshWindowsAsarIntegrity   (replace record, re-read, assert record == header hash)
           ─▶ sanityCheckPackage
           ─▶ builder flips fuses (electronFuses: only integrity validation on)
           ─▶ builder signs the app (if configured; unchanged)
           ─▶ target.build ─▶ artifactBuildStarted (NSIS)
                       └─▶ NEW  assertFinal: record == header hash AND fuse on   ← first stage after fuses
```

- The refresh is the last `afterPack` step, after the final `app.asar` rewrite. Nothing after it rewrites the archive.
- The fuse-on assertion runs in `artifactBuildStarted`, which electron-builder emits only from `target.build`, strictly after `doPack` (fuses, then signing). It is deliberately not in `afterPack`, and not in `afterSign` (skipped by the builder when nothing was signed). A thrown error there aborts the build before the installer is produced. No signing or publication step is added, moved or changed.
- If `artifactBuildStarted` arrives for an arch whose refresh never ran, the build fails.
- The refresh refuses an already-signed executable, because rewriting resources would silently drop the signature.

## Dependency

`resedit` becomes a direct build-time `devDependency` of `@zcode/desktop`, pinned `1.7.2`, the version already resolved in `pnpm-lock.yaml` through `app-builder-lib`. The lockfile delta is the one importer entry (3 lines). No other version changes.

## Acceptance scenarios (portable, synthetic)

All PE and archive fixtures are synthetic, generated in the test, and labelled SYNTHETIC. No Electron binary, installer, signing or network is involved.

| #   | Scenario                                                                                                                                       | Expected                                                                                                                                                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Stale record, refresh                                                                                                                          | record value equals header hash; exactly one `ELECTRONASAR` entry afterwards (replace, not append)                                                                                                                                                                                       |
| 2   | Unrelated resources present                                                                                                                    | all other entries, their bytes, language and codepage unchanged                                                                                                                                                                                                                          |
| 3   | Refresh twice                                                                                                                                  | second run reports unchanged; file bytes identical to the first result                                                                                                                                                                                                                   |
| 4   | Missing / duplicate entry, malformed JSON, unsupported alg, bad hash, no `app.asar` entry, ambiguous `app.asar` entry, malformed PE, signed PE | throws with the specific code; file not modified                                                                                                                                                                                                                                         |
| 5   | Archive changed after the record was written                                                                                                   | final assertion throws `record-stale`                                                                                                                                                                                                                                                    |
| 6   | Header definition                                                                                                                              | equals an independent raw-byte header parse and electron-builder `computeData`                                                                                                                                                                                                           |
| 7   | Fuse wire                                                                                                                                      | real `flipFuses` with only the integrity option flips index 4 and leaves the other 8 states (including the ninth) byte-identical; missing/duplicate/malformed wire and fuse-off are rejected                                                                                             |
| 8   | Graph-only configuration                                                                                                                       | Graph+Windows config enables only the one fuse and installs the hooks; Production/Preview and non-Windows get none                                                                                                                                                                       |
| 9   | Ordering                                                                                                                                       | afterPack calls the refresh after the sourcemap/asar rewrite steps; installed electron-builder still orders `afterPack` → fuses → signing → `target.build` → `artifactBuildStarted`; the lifecycle controller refuses the fuse-on assertion before a refresh, and rejects a fuse-off exe |

## Deferred, not passed

One later Windows validation item: a real Windows build and launch with validation enabled, native-agent launch under the fuse, and packaged smoke. Until then the fuse-on launch behaviour (including `ELECTRON_RUN_AS_NODE` helpers and the unpacked native files) is unproven.

## Out of scope

Credential store, network policy/egress gates, Feedback/support bundle, native protocol, other fuse hardening, Windows CI dispatch, installer execution, signing, tags, publication.
