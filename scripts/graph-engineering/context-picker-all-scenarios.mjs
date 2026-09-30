import { coreScenarios } from "./context-picker-scenarios.mjs";
import { robustnessScenarios } from "./context-picker-scenarios-robustness.mjs";

export const contextPickerScenarios = [...coreScenarios, ...robustnessScenarios];
