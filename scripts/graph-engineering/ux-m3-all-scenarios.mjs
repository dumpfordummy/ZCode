import { libraryScenarios } from "./ux-m3-scenarios-library.mjs";
import { shareScenarios } from "./ux-m3-scenarios-share.mjs";
import { pinScenarios } from "./ux-m3-scenarios-pins.mjs";
import { m3ShotScenarios } from "./ux-m3-scenarios-shots.mjs";

export const uxM3Scenarios = [
  ...libraryScenarios,
  ...shareScenarios,
  ...pinScenarios,
  ...m3ShotScenarios,
];
