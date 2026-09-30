// UX-M2 Windows acceptance runner. One fresh isolated Electron profile per journey.
//   node scripts/graph-engineering/ux-m2-native.mjs --journey=history
// Requires the freshly built Desktop (packages/desktop/out) and CLI/runtime; never runs a typecheck itself.
import assert from "node:assert/strict";

const journey = process.argv.find((arg) => arg.startsWith("--journey="))?.slice(10);
const journeys = {
  history: async () => (await import("./ux-m2-native-history.mjs")).historyJourney(),
  checks: async () => (await import("./ux-m2-native-checks.mjs")).checksJourney(),
  failures: async () => (await import("./ux-m2-native-failures.mjs")).failuresJourney(),
  "presentation-en": async () =>
    (await import("./ux-m2-native-presentation.mjs")).presentationJourney("en-US"),
  "presentation-zh": async () =>
    (await import("./ux-m2-native-presentation.mjs")).presentationJourney("zh-CN"),
  "scale-1.25": async () => (await import("./ux-m2-native-presentation.mjs")).scalingJourney(1.25),
  "scale-1.5": async () => (await import("./ux-m2-native-presentation.mjs")).scalingJourney(1.5),
};
assert.ok(journey && journeys[journey], `Choose --journey=${Object.keys(journeys).join("|")}`);
assert.equal(
  process.env.Z1_PACKAGED_EXE,
  undefined,
  "Use only the newly built isolated application.",
);
await journeys[journey]();
