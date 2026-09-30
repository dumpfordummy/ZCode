// UX-M4.1: renders the isolated visual alternatives (ux-m4-preview/) in Edge at 1280x720 and 1920x1080,
// light and dark, for both alternatives. SYNTHETIC prototype over the real app stylesheet; not native
// acceptance. Needs the built Desktop renderer (packages/desktop/out/renderer) for the real CSS and fonts.
//   node scripts/graph-engineering/ux-m4-preview.mjs [--out=<dir>]
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = fileURLToPath(new URL("../../", import.meta.url));
const requireCli = createRequire(path.join(root, "apps/zcode-cli/package.json"));
const { build } = requireCli("esbuild");
const out = path.resolve(
  process.argv.find((arg) => arg.startsWith("--out="))?.slice(6) ??
    path.join(root, ".tmp/m4-evidence/preview"),
);
await mkdir(out, { recursive: true });
const renderer = path.join(root, "packages/desktop/out/renderer");
const html = await readFile(path.join(renderer, "index.html"), "utf8");
const cssPaths = [...html.matchAll(/<link[^>]*href="([^"?#]+\.css)"/g)].map((m) => m[1]);
const bundle = await build({
  absWorkingDir: root,
  entryPoints: ["scripts/graph-engineering/ux-m4-preview/preview.tsx"],
  write: false,
  bundle: true,
  platform: "browser",
  format: "esm",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  alias: { "@": path.join(root, "packages/ui/src") },
  nodePaths: [path.join(root, "packages/ui/node_modules")],
  logLevel: "silent",
});
const js = bundle.outputFiles[0].text;
const css = await readFile(
  path.join(root, "scripts/graph-engineering/ux-m4-preview/preview.css"),
  "utf8",
);
const page = `<!doctype html><html lang="en"><head><meta charset="UTF-8">${cssPaths.map((f) => `<link rel="stylesheet" href="${f}">`).join("")}<style>${css}</style><title>UX-M4 preview</title></head><body style="margin:0"><div id="root"></div><script type="module" src="/preview.js"></script></body></html>`;
const server = createServer(async (request, response) => {
  const name = new URL(request.url, "http://x").pathname;
  try {
    if (name === "/") {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(page);
    } else if (name === "/preview.js") {
      response.setHeader("content-type", "text/javascript");
      response.end(js);
    } else if (/^\/assets\/[\w.-]+\.(css|woff2?|ttf|png|svg)$/.test(name)) {
      response.setHeader(
        "content-type",
        name.endsWith(".css") ? "text/css" : "application/octet-stream",
      );
      response.end(await readFile(path.join(renderer, name.slice(1))));
    } else {
      response.statusCode = 404;
      response.end();
    }
  } catch {
    response.statusCode = 404;
    response.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];
try {
  for (const size of [
    [1280, 720],
    [1920, 1080],
  ]) {
    const context = await browser.newContext({ viewport: { width: size[0], height: size[1] } });
    const tab = await context.newPage();
    tab.on("pageerror", (error) => errors.push(String(error)));
    for (const v of ["a", "b"])
      for (const s of ["newrun", "waiting", "failed", "library"])
        for (const t of ["dark", "light"]) {
          await tab.goto(`${origin}/?v=${v}&s=${s}&t=${t}`);
          await tab.locator(".m4").waitFor();
          await tab.evaluate(() => document.fonts.ready);
          await tab.screenshot({
            path: path.join(out, `${v}-${s}-${t}-${size[0]}x${size[1]}.png`),
          });
        }
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(JSON.stringify({ out, pageErrors: errors }, null, 2));
process.exitCode = errors.length ? 1 : 0;
