// UX-M4.4: before/after boards from the SAME native states (same script, same request, same context,
// same saved checks, same controlled runtime): ux-m4-baseline.mjs ran on the UX-M3 build (before) and on
// the final UX-M4 build (after).
//   node scripts/graph-engineering/ux-m4-compare.mjs --before-main=<dir> --before-failure=<dir> \
//        --after-main=<dir> --after-failure=<dir> [--out=<dir>]
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = fileURLToPath(new URL("../../", import.meta.url));
const arg = (name) => process.argv.find((item) => item.startsWith(`--${name}=`))?.split("=")[1];
const dirs = {
  beforeMain: path.resolve(arg("before-main")),
  beforeFailure: path.resolve(arg("before-failure")),
  afterMain: path.resolve(arg("after-main")),
  afterFailure: path.resolve(arg("after-failure")),
};
const out = path.resolve(
  arg("out") ?? path.join(root, "docs/graph-engineering/ux-audit/ux-m4/compare"),
);
await mkdir(out, { recursive: true });
const screens = [
  ["new-run", "New run", "main"],
  ["library", "Workflow library", "main"],
  ["run-waiting", "Run waiting for a native permission", "main"],
  ["run-failed", "Run whose Test failed", "failure"],
];
const data = async (file) => `data:image/png;base64,${(await readFile(file)).toString("base64")}`;
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const size of ["1280x720", "1920x1080"])
    for (const theme of ["dark", "light"])
      for (const [key, title, group] of screens) {
        const file = `${key}-${theme}-${size}.png`;
        const before = path.join(group === "main" ? dirs.beforeMain : dirs.beforeFailure, file);
        const after = path.join(group === "main" ? dirs.afterMain : dirs.afterFailure, file);
        const cols = [
          ["BEFORE — UX-M3 build", await data(before)],
          ["AFTER — UX-M4 build", await data(after)],
        ];
        const page = await browser.newPage({ viewport: { width: 2000, height: 600 } });
        await page.setContent(
          `<body style="margin:0;background:#888;font:600 15px Segoe UI,sans-serif;color:#111"><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;padding:10px"><div style="grid-column:1/-1;font-size:18px;color:#fff">${title} · ${theme} · ${size.replace("x", "×")} · same request, context, saved checks and runtime state</div>${cols.map(([label, src]) => `<figure style="margin:0"><figcaption style="padding:6px 2px;color:#fff">${label}</figcaption><img src="${src}" style="width:100%;display:block;border:1px solid #0006"></figure>`).join("")}</div></body>`,
        );
        await page.waitForLoadState("load");
        await page.screenshot({
          path: path.join(out, `compare-${key}-${theme}-${size}.png`),
          fullPage: true,
        });
        await page.close();
      }
} finally {
  await browser.close();
}
console.log(out);
