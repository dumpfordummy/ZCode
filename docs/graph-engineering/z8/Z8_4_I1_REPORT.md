# Z8.4-I1 — report: isolated Windows installer lifecycle acceptance

**Headline.** Staging and plan are complete. **No lifecycle case was executed.** The one prerequisite for execution — an isolated disposable Windows guest — is not available on this PC, and the assignment forbids both enabling it automatically and falling back to the host. Cases A, B and C are **BLOCKED**. No installer or uninstaller was run anywhere.

Status words: PASS / FAIL / UNVERIFIED / BLOCKED / OPERATOR-PENDING.

## 1. Provenance

| Item                     | Value                                                                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Integration base         | `bca3f43` (PR #16 merged), branch `feature/z8-4-i1-local-prompt-1a0ba6`                                                                                                                                                         |
| Candidate 3 installer    | `3.14.3-z8.303`, SHA-256 `7c42e4b5…c6386` — **matches** the assignment and `SHA256SUMS.txt` / `latest.yml` size 149906516                                                                                                       |
| Candidate 3 build source | `f7cd061a6cf6c59ba66a636e515554aa805aac7d` (build record: clean at build; not rebuilt)                                                                                                                                          |
| Old installer (Case B)   | `3.14.3-z8.2` from `dist-graph-z82c`, SHA-256 `90d75fb0…f413b` — **matches** the recorded hash; build source `7df406255093e83f7907779a53e1103c4f524663`. `dist-graph-z82` (`84cba525…`) is the superseded build and is not used |
| Harness                  | `scripts/graph-engineering/i1/` in this PR (PowerShell host staging + guest driver); harness SHA = the PR head commit                                                                                                           |

Installed-payload hashes (`ZCode Graph.exe`, `app.asar`, `zcode.cjs`, `graph-build-identity.json`) were **not** checked: that needs an installed copy.

## 2. Environment findings (why the cases are blocked)

- Windows 11 Education build 26300; `HypervisorPresent = True`; `vmms` is running.
- `C:\Windows\System32\WindowsSandbox.exe` is **absent**, so the Windows Sandbox optional feature is not enabled. Querying the feature state itself requires elevation, which this session does not have.
- Hyper-V VMs cannot be enumerated (`Get-VM` is denied; the Hyper-V data directory is access-denied), so no existing disposable VM with a clean checkpoint can be verified. No `.vhdx/.vmdk/.vdi/.wsb` was found under the user profile. No third-party hypervisor CLI was found.
- No Graph install, Graph profile (`%USERPROFILE%\.zcode-graph-engineering`) or `C:\i1` exists on the host.

## 3. What was prepared

- `Z8_4_I1_PLAN.md` — artifacts, isolation design, install scope, expected behavior, cases.
- `scripts/graph-engineering/i1/i1-stage-host.ps1` — hash-verifies and copies both installers into `C:\Users\USER\Desktop\Personal\ZCode-i1-staging\input`, creates the empty `evidence-export`, and writes `z8-4-i1.wsb`. Run once; it never launches the Sandbox or any installer.
- `.wsb`: networking, clipboard, audio, video, printer, vGPU disabled; `input` read-only; `evidence-export` writable and initially empty; nothing else mapped.
- `scripts/graph-engineering/i1/guest/i1-guest.ps1` — in-guest steps `Preflight | Inventory | Install | Uninstall | Export`. It re-checks isolation (guest user, no host profiles, read-only input mapping, no default route, no external reachability) before every step. **Exercised once on the host with a throwaway work directory: it refused (all isolation checks false, exit 1) and made no install, registry or profile changes.** The remaining steps are unexecuted and untested beyond a parse check.
- Operator-reported acceptance and the credential deferral were appended to `Z8_3_W1_REPORT.md` §11 without changing the original evidence.

## 4. Lifecycle contract recorded from source and the pinned builder (not observed at runtime)

- Per-user assisted NSIS; all-users/UAC is not covered.
- Upgrade removes only files in the previous `.zcode-install-manifest`; with no manifest it preserves everything. Which z8.2 uninstaller behavior actually occurs is unobserved.
- Ordinary uninstall `RMDir /r`s the install directory, so unrelated files inside it are removed; files outside it are not touched by the script.
- `%APPDATA%\ZCode Graph` is removed only with `--delete-app-data`, which is neither configured nor passed; Graph's private profile is outside AppData. **Predeclared expectation: default uninstall and upgrade both retain all profile data.** No deletion option will be chosen.
- Uninstall registry key is builder-derived; it must be read from the real package.

## 5. Case status

| Case | Status                                                   | Reason                                                                                            |
| ---- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| A    | **BLOCKED**                                              | No verified disposable guest                                                                      |
| B    | **BLOCKED**                                              | Same; installer pair is identified and hash-verified (z8.2c → z8.303)                             |
| C    | **BLOCKED** (reinstall step and coexistence not started) | Same. No ordinary-ZCode installer is retained locally; coexistence would be UNVERIFIED or limited |

## 6. Single prerequisite and next steps

**Prerequisite (operator-controlled):** enable Windows Sandbox on this PC — from an elevated PowerShell, `Enable-WindowsOptionalFeature -Online -FeatureName Containers-DisposableClientVM -All`, then reboot. (Alternatively provide a clearly disposable Windows VM with a clean checkpoint and external networking disconnected.) I did not do this: enabling optional features and rebooting the host are outside the authorization.

After that, from a normal shell: `Start-Process C:\Users\USER\Desktop\Personal\ZCode-i1-staging\z8-4-i1.wsb`; the guest runs the isolation preflight automatically.

Still to do, not done: guest-side driver for the installed-app smoke (CDP attach feasibility unproven; otherwise one grouped operator click checklist), staging Node/harness tools and an official ordinary-ZCode installer with recorded provenance, the three cases, and an evidence summary with path-sanitized synthetic data. Z8.4 as a whole and release readiness are **not** declared.
