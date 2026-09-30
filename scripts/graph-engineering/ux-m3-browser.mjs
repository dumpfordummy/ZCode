// UX-M3 browser interaction tests (Cloud-runnable; no Electron, no native runtime, no Windows).
//
//   node --import tsx scripts/graph-engineering/ux-m3-browser.mjs \
//     --chromium=/opt/pw-browsers/chromium [--only=<name>] [--match=<text>] [--shots=<dir>] [--summary=<file>]
//
// Same real-component harness, fixture Host and labelled stubs as the UX-M1/M2 suites
// (ux-browser-runner.mjs); the workflow library is the REAL GraphWorkflowService over an in-memory
// store (ux-m3-library-host.mjs). None of this is Windows native acceptance.
import { runUxBrowserSuite } from "./ux-browser-runner.mjs";
import { uxM3Scenarios } from "./ux-m3-all-scenarios.mjs";

await runUxBrowserSuite({ suite: "UX-M3", scenarios: uxM3Scenarios });
