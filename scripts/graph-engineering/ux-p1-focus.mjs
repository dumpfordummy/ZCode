// Z8.5-UX-P1-F1: focused-button readability. Real Graph components in the existing synthetic Host
// harness; real keyboard Tab/Enter/Space navigation. Measures computed colours, WCAG contrast and the
// matched CSS rules for normal / hover / focus-visible / focus-visible+hover in both themes, and a
// representative Button variant matrix inside and outside the Graph focus scope.
// UXP1_FOCUS_PROBE=1 prints measurements instead of asserting (used to find the owning rule).
// Synthetic Cloud Chromium only: not native, Windows or whole-app accessibility acceptance.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runUxBrowserSuite } from "./ux-browser-runner.mjs";
import { boot, flush } from "./ux-m1-helpers.mjs";
import { controlledInspection, driveInspection, capture } from "./ux-p1-browser.mjs";
import { graphFocusClass } from "../../packages/ui/src/graph-engineering/graphFocus.ts";
import { buttonVariants } from "../../packages/ui/src/components/ui/button.tsx";

const probe = process.env.UXP1_FOCUS_PROBE === "1";
const THEMES = [
  { tag: "dark", theme: "zai-dark" },
  { tag: "light", theme: "zai-light" },
];
const WIDE = { width: 1366, height: 768 };
const REDUCED = { width: 1093, height: 614 };
const MIN_LABEL = 4.5; // WCAG 1.4.3, normal-size text
const MIN_INDICATOR = 3; // WCAG 1.4.11, focus indicator against the adjacent page colour

/** In-page measurement: sRGB via canvas (Tailwind colours are oklch), composited over ancestors. */
const measure = (target) => {
  const el = document.querySelector(target);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const rgba = (css) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: a / 255 };
  };
  const over = (top, bottom) => {
    const a = top.a + bottom.a * (1 - top.a);
    const c = (k) => (top[k] * top.a + bottom[k] * bottom.a * (1 - top.a)) / (a || 1);
    return { r: c("r"), g: c("g"), b: c("b"), a };
  };
  // Opaque colour behind the control: composite its ancestors' backgrounds over white.
  const stack = [];
  for (let node = el.parentElement; node; node = node.parentElement) {
    const bg = rgba(getComputedStyle(node).backgroundColor);
    if (bg.a > 0) stack.push(bg);
  }
  let behind = { r: 255, g: 255, b: 255, a: 1 };
  for (let i = stack.length - 1; i >= 0; i -= 1) behind = over(stack[i], behind);
  const style = getComputedStyle(el);
  const fill = over(rgba(style.backgroundColor), behind);
  const text = over(rgba(style.color), fill);
  const border = over(rgba(style.borderTopColor), behind);
  const lum = ({ r, g, b }) => {
    const f = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return Number(((hi + 0.05) / (lo + 0.05)).toFixed(2));
  };
  const hex = ({ r, g, b }) =>
    "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  return {
    css: {
      color: style.color,
      backgroundColor: style.backgroundColor,
      borderTopColor: style.borderTopColor,
      borderTopWidth: style.borderTopWidth,
      outline: `${style.outlineStyle} ${style.outlineWidth}`,
      boxShadow: style.boxShadow,
      opacity: style.opacity,
    },
    resolved: { text: hex(text), fill: hex(fill), page: hex(behind), border: hex(border) },
    label: ratio(text, fill),
    fillOnPage: ratio(fill, behind),
    borderOnPage: ratio(border, behind),
    focusVisible: el.matches(":focus-visible"),
  };
};

/** Matched author rules (CDP) for the element in its current state, reduced to what is relevant. */
async function matchedRules(page, selector) {
  const client = await page.context().newCDPSession(page);
  try {
    await client.send("DOM.enable");
    await client.send("CSS.enable");
    const { root } = await client.send("DOM.getDocument", { depth: 0 });
    const { nodeId } = await client.send("DOM.querySelector", { nodeId: root.nodeId, selector });
    const { matchedCSSRules = [] } = await client.send("CSS.getMatchedStylesForNode", { nodeId });
    return matchedCSSRules
      .filter((entry) => entry.rule.origin === "regular")
      .map((entry) => ({
        selector: entry.rule.selectorList.text,
        properties: entry.rule.style.cssProperties
          .filter(
            (p) =>
              /color|background|border-color|outline|shadow|opacity/.test(p.name) && !p.disabled,
          )
          .map((p) => `${p.name}: ${p.value}${p.important ? " !important" : ""}`),
      }))
      .filter((rule) => rule.properties.length);
  } finally {
    await client.detach();
  }
}

const settle = (page) =>
  page.addStyleTag({
    content: "*,*::before,*::after{transition:none !important;animation:none !important}",
  });

/** Normal, hover, real keyboard focus-visible and focus-visible+hover for one control. */
export async function measureStates(page, selector, reach) {
  const out = {};
  await settle(page); // measure settled values, not a mid-transition frame (transition-colors)
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.activeElement?.blur?.());
  await flush(page);
  out.normal = await page.evaluate(measure, selector);
  const box = await page.locator(selector).boundingBox();
  const centre = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(...centre);
  await flush(page);
  out.hover = await page.evaluate(measure, selector);
  await page.mouse.move(0, 0);
  await reach(); // real keyboard navigation (Tab) so :focus-visible matches
  await flush(page);
  out.focusVisible = await page.evaluate(measure, selector);
  out.focusRules = await matchedRules(page, selector);
  await page.mouse.move(...centre);
  await flush(page);
  out.focusVisibleHover = await page.evaluate(measure, selector);
  await page.mouse.move(0, 0);
  return out;
}

function assertReadableFocus(states, label) {
  for (const state of ["normal", "focusVisible", "focusVisibleHover"])
    assert.ok(
      states[state].label >= MIN_LABEL,
      `${label} ${state}: label ${states[state].label} < ${MIN_LABEL}`,
    );
  assert.equal(
    states.focusVisible.focusVisible,
    true,
    `${label}: keyboard Tab reaches :focus-visible`,
  );
  const focus = states.focusVisible;
  assert.ok(
    Math.max(focus.borderOnPage, focus.fillOnPage) >= MIN_INDICATOR,
    `${label}: focus indicator ${focus.borderOnPage}/${focus.fillOnPage} < ${MIN_INDICATOR}`,
  );
  // The focus indicator must be a visible change from the unfocused control.
  assert.notDeepEqual(
    states.focusVisible.resolved,
    states.normal.resolved,
    `${label}: focus changes the look`,
  );
}

const confirmStates = ({ tag, theme }, size, sizeTag) => ({
  name: `UX-P1-F1 focus: Confirm primary button, real Tab (${tag}, ${sizeTag})`,
  async run({ page, host, url, shotsDir }) {
    const control = controlledInspection(host, "review-ready");
    try {
      const locale = sizeTag === "reduced" ? "zh-CN" : "en-US";
      const panel = await driveInspection(
        page,
        host,
        url,
        { ...size, tag: `${tag}-${sizeTag}`, locale, theme },
        control,
        { confirm: false },
      );
      const confirm = panel.getByRole("button", { name: /^(Confirm inspection|确认检查并请求)/ });
      await confirm.evaluate((node) => node.setAttribute("data-uxp1-probe", "confirm"));
      const selector = '[data-uxp1-probe="confirm"]';
      const reach = async () => {
        await panel.getByRole("combobox").nth(1).focus();
        await page.keyboard.press("Tab");
        assert.equal(
          await page.evaluate(() => document.activeElement?.getAttribute("data-uxp1-probe")),
          "confirm",
          "Tab from the framework select reaches Confirm",
        );
      };
      const states = await measureStates(page, selector, reach);
      if (probe) console.log(JSON.stringify({ tag, sizeTag, ...states }, null, 1));
      if (shotsDir) {
        await mkdir(shotsDir, { recursive: true });
        await writeFile(
          path.join(shotsDir, `focus-measure-${tag}-${sizeTag}.json`),
          JSON.stringify(states, null, 2),
        );
        await reach();
        await capture(page, shotsDir, `focus-confirm-${tag}-${sizeTag}`, {
          scrollTo: "graph-project-inspection",
        });
      }
      // Only the reported keyboard-focus states are asserted; mouse hover alone is recorded.
      if (!probe) assertReadableFocus(states, `${tag}/${sizeTag} Confirm`);
      assert.equal(
        control.calls.filter((call) => call === "start").length,
        0,
        "focus never starts",
      );
    } finally {
      control.restore();
    }
  },
});

const VARIANTS = ["default", "outline", "secondary", "ghost", "destructive", "warning"];
const COLUMNS = ["normal", "hover", "focus-visible", "focus-visible+hover"];

/** Real Button class strings, injected into the live page inside / outside the Graph focus scope. */
function matrixHtml() {
  const button = (variant, id, extra = "") =>
    `<button type="button" class="${buttonVariants({ variant, size: "sm" })}" data-variant="${variant}" ` +
    `data-uxp1="${id}" ${extra}>${variant}</button>`;
  const block = (scope, outer) => {
    const rows = VARIANTS.map(
      (variant) =>
        `<div style="display:flex;gap:12px;align-items:center;margin:4px 0"><span style="width:84px;font-size:11px">${variant}</span>` +
        COLUMNS.map((column) => button(variant, `${scope}:${variant}:${column}`)).join("") +
        `</div>`,
    ).join("");
    const disabled =
      `<div style="display:flex;gap:12px;align-items:center;margin:4px 0"><span style="width:84px;font-size:11px">disabled</span>` +
      button("default", `${scope}:disabled`, "disabled") +
      `</div>`;
    return (
      `<section data-uxp1-scope="${scope}" class="${outer}" style="padding:10px;margin:8px;border-radius:8px;background:var(--color-background);color:var(--color-foreground)">` +
      `<div style="font-size:12px;margin-bottom:4px">${scope === "graph" ? "Inside the Graph focus scope" : "Outside it (Chat / settings style)"}</div>` +
      `<div style="display:flex;gap:12px;margin-left:96px;font-size:10px">${COLUMNS.map((c) => `<span style="width:84px">${c}</span>`).join("")}</div>${rows}${disabled}</section>`
    );
  };
  return (
    `<div id="uxp1-matrix" style="position:fixed;inset:0;z-index:99999;overflow:auto;background:var(--color-background);padding:8px">` +
    block("graph", `${graphFocusClass} graph-ui`) +
    block("plain", "") +
    `</div>`
  );
}

async function forceStates(page) {
  const client = await page.context().newCDPSession(page);
  await client.send("DOM.enable");
  await client.send("CSS.enable");
  const { root } = await client.send("DOM.getDocument", { depth: 0 });
  const forced = {
    "focus-visible": ["focus-visible"],
    "focus-visible+hover": ["focus-visible", "hover"],
    hover: ["hover"],
  };
  for (const scope of ["graph", "plain"])
    for (const variant of VARIANTS)
      for (const column of COLUMNS.filter((value) => value !== "normal")) {
        const { nodeId } = await client.send("DOM.querySelector", {
          nodeId: root.nodeId,
          selector: `[data-uxp1="${scope}:${variant}:${column}"]`,
        });
        await client.send("CSS.forcePseudoState", {
          nodeId,
          forcedPseudoClasses: forced[column],
        });
      }
  return client;
}

const matrixScenario = ({ tag, theme }, size, sizeTag) => ({
  name: `UX-P1-F1 focus: Button variant matrix and keyboard behaviour (${tag}, ${sizeTag})`,
  async run({ page, host, url, shotsDir }) {
    await page.setViewportSize(size);
    await boot(page, host, url, { locale: "en-US", theme });
    await settle(page);
    await page.evaluate((html) => {
      document.body.insertAdjacentHTML("beforeend", html);
      for (const node of document.querySelectorAll("[data-uxp1]")) {
        node.dataset.clicks = "0";
        node.addEventListener("click", () => {
          node.dataset.clicks = String(Number(node.dataset.clicks) + 1);
        });
      }
    }, matrixHtml());
    const client = await forceStates(page);
    await flush(page);
    const results = {};
    for (const scope of ["graph", "plain"])
      for (const variant of VARIANTS)
        for (const column of COLUMNS)
          (results[`${scope}:${variant}`] ??= {})[column] = await page.evaluate(
            measure,
            `[data-uxp1="${scope}:${variant}:${column}"]`,
          );
    results.disabled = await page.evaluate(measure, '[data-uxp1="graph:disabled"]');
    if (probe) console.log(JSON.stringify({ tag, sizeTag, results }, null, 1));
    if (shotsDir) {
      await mkdir(shotsDir, { recursive: true });
      await writeFile(
        path.join(shotsDir, `matrix-${tag}-${sizeTag}.json`),
        JSON.stringify(results, null, 2),
      );
      const matrix = page.locator("#uxp1-matrix");
      await matrix.screenshot({ path: path.join(shotsDir, `matrix-${tag}-${sizeTag}.png`) });
    }
    if (!probe) {
      for (const variant of VARIANTS) {
        const row = results[`graph:${variant}`];
        // Every keyboard-focus state keeps a readable label and a visible indicator inside Graph.
        for (const column of ["focus-visible", "focus-visible+hover"]) {
          const value = row[column];
          assert.ok(
            value.label >= MIN_LABEL,
            `${tag} graph ${variant} ${column}: label ${value.label}`,
          );
          assert.ok(
            Math.max(value.borderOnPage, value.fillOnPage) >= MIN_INDICATOR,
            `${tag} graph ${variant} ${column}: indicator ${value.borderOnPage}/${value.fillOnPage}`,
          );
          assert.notDeepEqual(
            value.resolved,
            row.normal.resolved,
            `${tag} ${variant}: focus is visible`,
          );
        }
        assert.ok(
          row.normal.label >= MIN_LABEL,
          `${tag} graph ${variant} normal label ${row.normal.label}`,
        );
      }
      // The Graph-scoped rule must not change controls outside it.
      for (const variant of VARIANTS) {
        const plain = results[`plain:${variant}`]["focus-visible"];
        assert.equal(
          plain.css.backgroundColor,
          results[`plain:${variant}`].normal.css.backgroundColor,
          `${tag} plain ${variant}: no Graph tint leaks outside the scope`,
        );
      }
      // Disabled stays distinguishable (reduced opacity) and is not focusable.
      assert.equal(results.disabled.css.opacity, "0.5");
    }
    await client.detach();

    // Real keyboard behaviour on the Graph-scoped row: Tab order, Enter and Space activation.
    await page.evaluate(() => {
      const cls = document.querySelector('[data-uxp1="graph:default:normal"]');
      cls.dataset.clicks = "0";
    });
    await page.evaluate(() => document.querySelector('[data-uxp1="graph:default:normal"]').focus());
    const order = [];
    for (let index = 0; index < 4; index += 1) {
      order.push(await page.evaluate(() => document.activeElement?.getAttribute("data-uxp1")));
      await page.keyboard.press("Tab");
    }
    assert.deepEqual(
      order,
      [
        "graph:default:normal",
        "graph:default:hover",
        "graph:default:focus-visible",
        "graph:default:focus-visible+hover",
      ],
      "Tab order follows the DOM and skips nothing enabled",
    );
    await page.evaluate(() => document.querySelector('[data-uxp1="graph:outline:normal"]').focus());
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    assert.equal(
      await page.evaluate(
        () => document.querySelector('[data-uxp1="graph:outline:normal"]').dataset.clicks,
      ),
      "2",
      "Enter and Space each activate once",
    );
    // A disabled button is skipped by Tab and cannot be activated.
    await page.evaluate(() =>
      document.querySelector('[data-uxp1="graph:warning:focus-visible+hover"]').focus(),
    );
    await page.keyboard.press("Tab");
    assert.notEqual(
      await page.evaluate(() => document.activeElement?.getAttribute("data-uxp1")),
      "graph:disabled",
      "disabled is not in the tab order",
    );
    await page.locator('[data-uxp1="graph:disabled"]').click({ force: true });
    assert.equal(
      await page.evaluate(
        () => document.querySelector('[data-uxp1="graph:disabled"]').dataset.clicks,
      ),
      "0",
      "disabled never activates",
    );
  },
});

export const focusScenarios = [
  ...THEMES.map((theme) => confirmStates(theme, WIDE, "wide")),
  confirmStates(THEMES[1], REDUCED, "reduced"),
  ...THEMES.map((theme) => matrixScenario(theme, WIDE, "wide")),
  matrixScenario(THEMES[1], REDUCED, "reduced"),
];

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename))
  await runUxBrowserSuite({
    suite: "Z8.5-UX-P1-F1 focused-button readability (synthetic, not native acceptance)",
    scenarios: focusScenarios,
  });
