// UX-M2 browser interaction tests (Cloud-runnable; no Electron, no native runtime, no Windows).
//
//   node --import tsx scripts/graph-engineering/ux-m2-browser.mjs \
//     --chromium=/opt/pw-browsers/chromium [--only=<name>] [--shots=<dir>] [--summary=<file>]
//
// Same real-component harness, fixture Host and labelled stubs as the UX-M1 suite
// (ux-browser-runner.mjs); only the scenarios differ. None of this is Windows native acceptance.
import { runUxBrowserSuite } from "./ux-browser-runner.mjs";
import { uxM2Scenarios } from "./ux-m2-all-scenarios.mjs";

await runUxBrowserSuite({ suite: "UX-M2", scenarios: uxM2Scenarios });
