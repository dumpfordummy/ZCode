// UX-M4 browser captures and checks (real components, fixture Host; not Windows native acceptance).
//   node --import tsx scripts/graph-engineering/ux-m4-browser.mjs --chromium=<exe> [--only=<name>] [--shots=<dir>] [--summary=<file>]
// M4_QUICK=1 captures dark 1280x720 only (fast visual iteration).
import { runUxBrowserSuite } from "./ux-browser-runner.mjs";
import { uxM4Scenarios } from "./ux-m4-scenarios.mjs";

await runUxBrowserSuite({ suite: "UX-M4", scenarios: uxM4Scenarios });
