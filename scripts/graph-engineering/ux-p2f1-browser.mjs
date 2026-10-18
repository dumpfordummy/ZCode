// Z8.5-UX-P2-F1 rendered capture suite. Runs unchanged on the frozen UX-P2 head (before) and on the
// P2-F1 branch (after) with identical synthetic fixtures: `--shots=<dir>`.
import path from "node:path";
import { runUxBrowserSuite } from "./ux-browser-runner.mjs";
import { scenarios } from "./ux-p2f1-states.mjs";

export { scenarios };

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename))
  await runUxBrowserSuite({
    suite: "Z8.5-UX-P2-F1 rendered operator clarity (synthetic, not native acceptance)",
    scenarios,
  });
