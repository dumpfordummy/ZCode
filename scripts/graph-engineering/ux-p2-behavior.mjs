// Z8.5-UX-P2 behaviour suite (synthetic, not native acceptance): run/step truth and the New run
// blocker/route behaviour with the real components. Expected to FAIL on the unchanged baseline for
// exactly the behaviours this lane changes.
import path from "node:path";
import { runUxBrowserSuite } from "./ux-browser-runner.mjs";
import { runBehaviorScenarios } from "./ux-p2-run-behavior.mjs";
import { stepBehaviorScenarios } from "./ux-p2-step-behavior.mjs";
import { newRunBehaviorScenarios } from "./ux-p2-newrun-behavior.mjs";

export const behaviorScenarios = [
  ...runBehaviorScenarios,
  ...stepBehaviorScenarios,
  ...newRunBehaviorScenarios,
];

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename))
  await runUxBrowserSuite({
    suite: "Z8.5-UX-P2 operator view behaviour (synthetic, not native acceptance)",
    scenarios: behaviorScenarios,
  });
