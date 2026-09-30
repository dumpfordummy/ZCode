// UX-M4 contrast measurement on the IMPLEMENTED surfaces: computed styles of probe elements placed
// inside the real `.graph-ui` root of the running page, for both themes (not the prototype's numbers).
// Text pairs are WCAG relative-luminance ratios; translucent colours are composited over the surface.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setState } from "./ux-m1-helpers.mjs";
import { T, boot } from "./ux-m3-helpers.mjs";

const THEMES = ["zai-dark", "zai-light"];
const SURFACES = [
  ["canvas", "bg-background"],
  ["shell", "bg-sidebar"],
  ["raised", "bg-card"],
  ["overlay", "bg-popover"],
];
const TEXTS = [
  ["foreground", "text-foreground", 7],
  ["secondary", "text-foreground-subtle", 4.5],
  ["tertiary", "text-foreground-subtlest", 4.5],
  ["accent", "text-brand", 4.5],
  ["warning", "text-warning", 4.5],
  ["danger", "text-destructive", 4.5],
  ["success", "text-success", 4.5],
];

/** Runs in the page: returns rows of { theme, pair, ratio, floor }. */
const measure = () => {
  // 计算样式可能是 rgb()、color(srgb …) 或 oklab()；统一交给 canvas 解析成 8 位 RGBA。
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const parse = (css) => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = "#000";
    context.fillStyle = css;
    context.fillRect(0, 0, 1, 1);
    const data = context.getImageData(0, 0, 1, 1).data;
    return [data[0], data[1], data[2], data[3] / 255];
  };
  const over = (top, bottom) => {
    const a = top[3];
    return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)).concat(1);
  };
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const lin = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const root = document.querySelector(".graph-ui");
  const probe = (classes, parent = root) => {
    const el = document.createElement("div");
    el.className = classes;
    el.textContent = "Ag";
    parent.append(el);
    const style = getComputedStyle(el);
    const out = {
      color: parse(style.color),
      background: parse(style.backgroundColor),
      border: parse(style.borderTopColor),
    };
    el.remove();
    return out;
  };
  const rows = [];
  const surfaces = {};
  for (const [name, cls] of window.__M4_SURFACES) surfaces[name] = probe(cls).background;
  const base = surfaces.canvas;
  for (const [sname, scls] of window.__M4_SURFACES)
    for (const [tname, tcls, floor] of window.__M4_TEXTS) {
      const text = probe(`${scls} ${tcls}`);
      const bg = over(text.background, base);
      rows.push({ pair: `${tname} on ${sname}`, ratio: ratio(over(text.color, bg), bg), floor });
    }
  // 警告/失败/成功的文字也出现在各自的低透明度底色上
  for (const [tname, tcls, bcls] of [
    ["warning", "text-warning", "bg-warning/10"],
    ["danger", "text-destructive", "bg-destructive/10"],
    ["success", "text-success", "bg-success/10"],
    ["foreground", "text-foreground", "bg-warning/10"],
    ["foreground", "text-foreground", "bg-destructive/10"],
  ]) {
    const text = probe(`${bcls} ${tcls}`);
    const card = surfaces.raised;
    const bg = over(text.background, card);
    rows.push({ pair: `${tname} on ${bcls}`, ratio: ratio(over(text.color, bg), bg), floor: 4.5 });
  }
  for (const [name, cls] of [
    ["primary button label", "bg-primary text-primary-foreground"],
    ["destructive button label", "bg-destructive text-destructive-foreground"],
    ["secondary button label", "bg-secondary text-foreground"],
    ["selected row text", "bg-selected text-foreground"],
    ["focus fill text", "bg-accent text-foreground"],
  ]) {
    const p = probe(cls);
    rows.push({ pair: name, ratio: ratio(p.color, over(p.background, base)), floor: 4.5 });
  }
  // 控件边界（非文字对比）：输入框边框对它旁边的表面，以及焦点标记（品牌色边框）对卡片
  const input = probe("border bg-input border-input-border");
  rows.push({
    pair: "input border vs canvas",
    ratio: ratio(over(input.border, input.background), base),
    floor: 3,
  });
  const focus = probe("border bg-card border-brand");
  rows.push({
    pair: "focus border vs raised",
    ratio: ratio(focus.border, focus.background),
    floor: 3,
  });
  return rows;
};

export const contrastScenario = {
  name: "contrast: text, semantic colours, buttons and control boundaries meet their floors on the implemented Graph surfaces, in both themes",
  async run({ page, host, url, shotsDir }) {
    await boot(page, host, url);
    await page.evaluate(
      ([surfaces, texts]) => {
        window.__M4_SURFACES = surfaces;
        window.__M4_TEXTS = texts;
      },
      [SURFACES, TEXTS],
    );
    const all = {};
    const failures = [];
    for (const theme of THEMES) {
      await setState(page, { theme });
      await T(page, "graph-new-run-pane").waitFor();
      const rows = await page.evaluate(`(${measure.toString()})()`);
      all[theme] = rows.map((row) => ({ ...row, ratio: Math.round(row.ratio * 100) / 100 }));
      for (const row of rows)
        if (row.ratio < row.floor)
          failures.push(`${theme}: ${row.pair} ${row.ratio.toFixed(2)} < ${row.floor}`);
    }
    if (shotsDir) {
      await mkdir(shotsDir, { recursive: true });
      await writeFile(path.join(shotsDir, "m4-contrast.json"), JSON.stringify(all, null, 2));
    }
    assert.deepEqual(failures, [], failures.join("\n"));
  },
};
