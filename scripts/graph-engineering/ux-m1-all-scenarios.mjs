import { checkScenarios } from "./ux-m1-scenarios-checks.mjs";
import { draftingScenarios } from "./ux-m1-scenarios-drafting.mjs";
import { setupScenarios } from "./ux-m1-scenarios-setup.mjs";
import { shotScenarios } from "./ux-m1-scenarios-shots.mjs";

export const uxM1Scenarios = [
  ...draftingScenarios,
  ...checkScenarios,
  ...setupScenarios,
  ...shotScenarios,
];
