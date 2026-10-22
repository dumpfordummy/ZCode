// Z8.5-UX-P2-F1 behaviour suite (synthetic, not native acceptance): operator-clarity rules with the
// real components. Expected to FAIL on the frozen UX-P2 head for exactly the behaviours this lane
// changes (run it there with the same files to prove that).
import path from "node:path";
import { runUxBrowserSuite } from "./ux-browser-runner.mjs";
import { runBehaviorScenarios } from "./ux-p2f1-run-behavior.mjs";
import { newRunBehaviorScenarios } from "./ux-p2f1-newrun-behavior.mjs";

export const behaviorScenarios = [...newRunBehaviorScenarios, ...runBehaviorScenarios];

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename))
  await runUxBrowserSuite({
    suite: "Z8.5-UX-P2-F1 operator clarity behaviour (synthetic, not native acceptance)",
    scenarios: behaviorScenarios,
  });
