import { checkScenarios } from "./ux-m1-scenarios-checks.mjs";
import { focusScenarios } from "./ux-m1-scenarios-focus.mjs";
import { draftingScenarios } from "./ux-m1-scenarios-drafting.mjs";
import { setupScenarios } from "./ux-m1-scenarios-setup.mjs";
import { stateScenarios } from "./ux-m1-scenarios-states.mjs";
import { stateShotScenarios } from "./ux-m1-scenarios-shots-states.mjs";
import { shotScenarios } from "./ux-m1-scenarios-shots.mjs";

export const uxM1Scenarios = [
  ...draftingScenarios,
  ...checkScenarios,
  ...setupScenarios,
  ...focusScenarios,
  ...stateScenarios,
  ...shotScenarios,
  ...stateShotScenarios,
];
