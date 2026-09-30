// UX-M1 browser interaction tests (Cloud-runnable; no Electron, no native runtime, no Windows).
//
//   node --import tsx scripts/graph-engineering/ux-m1-browser.mjs \
//     --chromium=/opt/pw-browsers/chromium [--only=<name>] [--shots=<dir>] [--summary=<file>]
//
// Bundles the real GraphEditor and useGraphEngineering (ux-m1-browser/main.tsx) with the repository's
// own Vite and drives real Chromium via playwright-core. The Graph Host, workflow service and file
// boundary are fixtures (ux-m1-host.mjs; what is real and what is not is listed there and in the
// summary). Three modules irrelevant to UX-M1 are replaced by labelled stubs (ux-m1-browser/stubs).
// None of this is Windows native acceptance.
import { runUxBrowserSuite } from "./ux-browser-runner.mjs";
import { uxM1Scenarios } from "./ux-m1-all-scenarios.mjs";

await runUxBrowserSuite({ suite: "UX-M1", scenarios: uxM1Scenarios });
