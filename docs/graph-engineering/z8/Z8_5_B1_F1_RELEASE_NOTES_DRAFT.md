# Draft prerelease notes — 3.14.3-z8.305

**BLOCKED — NOT FOR PUBLICATION.** This unsigned Windows x64 internal-pilot candidate combines U1 run-view improvements and U2 Quick .NET Build/Test setup with the focused TRX duration correction.

Build source: 563f604f93baa0dc6d3bef7e8bf0499f3d741e2d.
Installer: ZCode Graph-3.14.3-z8.305-win-x64.exe, 149910882 bytes.
SHA-256: 547188cea1218a9189556ba915b7d4a6cd567ae5e702c2fe4a66beb2a320ab08.

The parser now validates duration independently of result timestamp differences while preserving duration bounds, freshness, identity and source/Build/operation checks. A fresh controlled dependency install prevents unintended ssh2 build metadata. Final content inspection passes: 147 raw findings, all precisely classified, zero unexpected findings.

Actual native Quick Save/reopen, three passing .NET assertions, fresh passing recovery, representative wide/reduced U1 run view and ordinary Chat passed. A deliberately failing assertion correctly exits Test with code 1, but its xUnit RunInfo diagnostic is rejected as invalid evidence. Accepted failing Test evidence remains blocked. This candidate must not be distributed even if PR CI passes.

Quick remains limited to supported literal .NET project shapes and compatible pinned VSTest adapters. Advanced remains available. Arbitrary company solutions, SDK.Web, MTP and Directory.Build/Packages customizations were not verified.

Known first-run Save As warning, coexistence/running-app maintenance uncertainty and deferred credential work remain pilot limitations. This is not whole-application egress certification. Company-PC acceptance has not happened. No installer lifecycle was repeated. The working .303 pilot and blocked .304 artifact/evidence remain unchanged.

No publication staging folder, tag or release was created; no installer was executed or uploaded. Retained output is investigation evidence. Any further product correction requires its own candidate identity and native acceptance; never silently replace .305 or substitute a CI rebuild for tested bytes.
