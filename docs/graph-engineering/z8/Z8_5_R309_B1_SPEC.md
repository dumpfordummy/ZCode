# Z8.5 R309 B1: bundled CLI Koffi contract

## Owner and order

Desktop packaging owns the installed CLI dependency closure. The existing
`stageAgentBundle` is the single destructive owner of `bundled-agents/<target>/glm`.
Both development and package preparation await that owner:

```text
compiled CLI -> clear glm -> copy CLI -> stage locked CLI Koffi -> write metadata
                                         |
                                         +-> hash inventory -> package verifier
package preparation -> same owner -> official plugin assets -> extraResources/glm
afterPack -> existing native/node-pty checks -> CLI Koffi check -> existing integrity
```

No runtime execution owner, permission, Node mode, project scope or evidence
semantics change. No new environment setting or dependency installation is added.

## Package contract

For Windows targets, resolve Koffi from the adapters package's normal dependency
lookup and require the exact declared version to equal its root lockfile importer
resolution. No version search, global installation or NODE_PATH fallback is a
staging input. The installed lookup root is `resources/glm/node_modules/koffi`.

Copy the installed package recursively, including runtime JavaScript, declarations,
source/vendor license and notice metadata. Exclude nested `node_modules` and all
build outputs except `build/koffi/<os>_<arch>`. This avoids a guessed minimal
runtime file list. Require index.js, package.json, LICENSE.txt and the target
addon; validate Windows PE machine type before staging. Record a sorted SHA-256
inventory of all staged files in `glm/.koffi-runtime.json`. A failed staging pass
must not leave the previous runtime usable as a successful stage.

The general `glm` extra-resource copy excludes its root `node_modules` in
electron-builder's real FileMatcher. Add a Windows-only explicit resource mapping
from the staged Koffi package root to `glm/node_modules/koffi`; both mapping and
verification live in the existing Koffi helper. Exercise the actual FileMatcher
copy in regressions, including failure without this mapping. This is asset staging,
not a distributable build.

The existing verifier must check the CLI root, exact identity/version, native
machine, complete inventory and hashes. A plugin-only copy cannot satisfy it.
An explicitly requested or present CUA plugin Koffi root is checked separately;
the current staging flow does not seed that plugin. Existing ASAR/native checks
remain active; Koffi native bytes must never be packed inside ASAR. Extra-resource
hashes are a separate integrity subject from ASAR header integrity.

Windows x64 and arm64 require their respective addon; absent assets fail closed.
Non-Windows CLI staging does not require Koffi because the lazy inspection owner
is Windows-only. An independently staged plugin retains its own runtime check.

## Regression and acceptance boundary

Tests cover clean/repeated staging, stale output, reproducibility, CJS lookup,
plugin-only output, missing package/addon, incorrect identity/version, wrong PE
machine, altered hashes and smoke failures. Structural fixture binaries never
constitute successful native-load evidence. Real installed locked package staging
and a detached Electron Node load provide separate evidence, including actual
compiled dynamic-import behavior, resolved paths and native hashes.

Run source checks and the unchanged Graph CI. Native owner tests use the existing
compiled prerequisite entry. No installer, NSIS, upgrade, real profile, company
project, release acceptance or publication is authorized by this source task.
