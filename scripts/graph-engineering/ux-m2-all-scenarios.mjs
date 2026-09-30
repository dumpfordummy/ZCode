import { checksScenarios } from "./ux-m2-scenarios-checks.mjs";
import { historyScenarios } from "./ux-m2-scenarios-history.mjs";

export const uxM2Scenarios = [...historyScenarios, ...checksScenarios];
