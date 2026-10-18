// Z8.5-UX-P2 rendered capture suite. Runs unchanged on the untouched #25 baseline (before) and on
// the P2 branch (after) with identical synthetic fixtures: `--shots=<dir>`.
// Captures only truths that hold on both trees; semantic assertions are in ux-p2-behavior.mjs.
import path from "node:path";
import { runUxBrowserSuite } from "./ux-browser-runner.mjs";
import { scenarios } from "./ux-p2-states.mjs";

export { scenarios };

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename))
  await runUxBrowserSuite({
    suite: "Z8.5-UX-P2 rendered operator view",
    scenarios,
  });
