// UX-M3 Windows acceptance runner. One fresh isolated Electron profile per journey.
//   node scripts/graph-engineering/ux-m3-native.mjs --journey=library
// Requires the freshly built Desktop (packages/desktop/out) and CLI/runtime; never runs a typecheck itself.
import assert from "node:assert/strict";

const journey = process.argv.find((arg) => arg.startsWith("--journey="))?.slice(10);
const journeys = {
  library: async () => (await import("./ux-m3-win-library.mjs")).libraryJourney(),
  share: async () => (await import("./ux-m3-win-share.mjs")).shareJourney(),
  pins: async () => (await import("./ux-m3-win-pins.mjs")).pinsJourney(),
  "presentation-en": async () =>
    (await import("./ux-m3-win-presentation.mjs")).presentationJourney("en-US"),
  "presentation-zh": async () =>
    (await import("./ux-m3-win-presentation.mjs")).presentationJourney("zh-CN"),
};
assert.ok(journey && journeys[journey], `Choose --journey=${Object.keys(journeys).join("|")}`);
assert.equal(
  process.env.Z1_PACKAGED_EXE,
  undefined,
  "Use only the newly built isolated application.",
);
await journeys[journey]();
