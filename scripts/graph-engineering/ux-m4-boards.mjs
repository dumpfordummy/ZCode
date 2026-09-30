// UX-M4.1: side-by-side comparison boards (Current real app | Alternative A | Alternative B).
//   node scripts/graph-engineering/ux-m4-boards.mjs --main=<baseline dir> --failure=<baseline failure dir> [--out=<dir>]
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = fileURLToPath(new URL("../../", import.meta.url));
const arg = (name) => process.argv.find((item) => item.startsWith(`--${name}=`))?.split("=")[1];
const main = path.resolve(arg("main"));
const failure = path.resolve(arg("failure"));
const preview = path.join(root, ".tmp/m4-evidence/preview");
const out = path.resolve(arg("out") ?? path.join(root, ".tmp/m4-evidence/boards"));
await mkdir(out, { recursive: true });
const screens = [
  ["newrun", "New run", (t, z) => path.join(main, `new-run-${t}-${z}.png`)],
  [
    "waiting",
    "Run waiting for a permission",
    (t, z) => path.join(main, `run-waiting-${t}-${z}.png`),
  ],
  ["failed", "Run whose Test failed", (t, z) => path.join(failure, `run-failed-${t}-${z}.png`)],
  ["library", "Workflow library", (t, z) => path.join(main, `library-${t}-${z}.png`)],
];
const data = async (file) => `data:image/png;base64,${(await readFile(file)).toString("base64")}`;
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const size of ["1280x720", "1920x1080"])
    for (const theme of ["dark", "light"])
      for (const [key, title, current] of screens) {
        const cols = [
          ["CURRENT — real Electron app, synthetic fixture data", await data(current(theme, size))],
          [
            "ALTERNATIVE A — Focus page (prototype)",
            await data(path.join(preview, `a-${key}-${theme}-${size}.png`)),
          ],
          [
            "ALTERNATIVE B — Workbench (prototype)",
            await data(path.join(preview, `b-${key}-${theme}-${size}.png`)),
          ],
        ];
        const page = await browser.newPage({ viewport: { width: 2700, height: 600 } });
        await page.setContent(
          `<body style="margin:0;background:#888;font:600 15px Segoe UI,sans-serif;color:#111"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:10px"><div style="grid-column:1/-1;font-size:18px;color:#fff">${title} · ${theme} · ${size.replace("x", "×")}</div>${cols.map(([label, src]) => `<figure style="margin:0"><figcaption style="padding:6px 2px;color:#fff">${label}</figcaption><img src="${src}" style="width:100%;display:block;border:1px solid #0006"></figure>`).join("")}</div></body>`,
        );
        await page.waitForLoadState("load");
        await page.screenshot({
          path: path.join(out, `board-${key}-${theme}-${size}.png`),
          fullPage: true,
        });
        await page.close();
      }
} finally {
  await browser.close();
}
console.log(out);
