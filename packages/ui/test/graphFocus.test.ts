import assert from "node:assert/strict";
import test from "node:test";
import { graphFocusClass } from "../src/graph-engineering/graphFocus.js";

const tokens = graphFocusClass.split(" ");
const FILLED = [
  ["default", "bg-primary"],
  ["destructive", "bg-destructive"],
  ["warning", "bg-warning"],
] as const;

test("filled Buttons keep their own readable fill and mark keyboard focus with a foreground border", () => {
  for (const [variant, fill] of FILLED) {
    assert.ok(
      tokens.includes(`[&_button[data-variant=${variant}]:focus-visible]:border-foreground`),
      `${variant}: foreground focus border`,
    );
    // Pinning the full-strength fill keeps the label contrast when hover applies a translucent fill.
    assert.ok(
      tokens.includes(`[&_button[data-variant=${variant}]:focus-visible]:${fill}`),
      `${variant}: own fill kept`,
    );
  }
});

test("the accent tint never applies to a filled Button (it left the label on an incompatible colour)", () => {
  const unscoped = tokens.filter((token) => token.startsWith("[&_button:focus-visible]:"));
  assert.deepEqual(unscoped, [], "no rule may recolour every descendant button");
  const tinted = tokens.filter(
    (token) => token.endsWith(":bg-accent") && token.includes("_button"),
  );
  assert.equal(tinted.length, 1);
  for (const [variant] of FILLED)
    assert.ok(
      tinted[0]!.includes(`[data-variant=${variant}]`),
      `${variant} is excluded from the tint`,
    );
});

test("other Graph controls keep a visible keyboard focus treatment", () => {
  for (const token of [
    "[&_button:not([data-variant=default],[data-variant=destructive],[data-variant=warning]):focus-visible]:border-brand",
    "[&_summary:focus-visible]:bg-accent",
    "[&_input:focus-visible]:border-brand",
    "[&_textarea:focus-visible]:border-brand",
    "[&_[role=combobox]:focus-visible]:border-brand",
    "[&_[tabindex='0']:focus-visible]:bg-accent",
    "[&_a:focus-visible]:underline",
  ])
    assert.ok(tokens.includes(token), token);
});
