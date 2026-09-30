// UX-M1.4 native acceptance runner. One fresh isolated Electron profile per journey.
//   node scripts/graph-engineering/ux-m1-native.mjs --journey=draft
// Requires the freshly built Desktop (packages/desktop/out) and CLI/runtime; never runs a typecheck itself.
import assert from "node:assert/strict";

const journey = process.argv.find((arg) => arg.startsWith("--journey="))?.slice(10);
const journeys = {
  draft: async () => (await import("./ux-m1-native-draft.mjs")).draftWhileRunning(),
  checks: async () => (await import("./ux-m1-native-checks.mjs")).checksJourney(),
  runs: async () => (await import("./ux-m1-native-runs.mjs")).runsJourney(),
  "presentation-en": async () =>
    (await import("./ux-m1-native-presentation.mjs")).presentationJourney("en-US"),
  "presentation-zh": async () =>
    (await import("./ux-m1-native-presentation.mjs")).presentationJourney("zh-CN"),
  "scale-1.25": async () => (await import("./ux-m1-native-presentation.mjs")).scalingJourney(1.25),
  "scale-1.5": async () => (await import("./ux-m1-native-presentation.mjs")).scalingJourney(1.5),
  "states-en": async () => (await import("./ux-m1-native-states.mjs")).statesJourney("en-US"),
  "states-zh": async () => (await import("./ux-m1-native-states.mjs")).statesJourney("zh-CN"),
  context: async () => (await import("./ux-m1-native-context.mjs")).contextPicker(),
};
assert.ok(journey && journeys[journey], `Choose --journey=${Object.keys(journeys).join("|")}`);
assert.equal(
  process.env.Z1_PACKAGED_EXE,
  undefined,
  "Use only the newly built isolated application.",
);
await journeys[journey]();
