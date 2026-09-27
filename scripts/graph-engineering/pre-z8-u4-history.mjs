import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = fileURLToPath(new URL("../../", import.meta.url));
const requireCli = createRequire(path.join(root, "apps/zcode-cli/package.json"));
const { build } = requireCli("esbuild");
const home = await mkdtemp(path.join(root, ".tmp/pre-z8-u4-history-"));
const output = path.join(home, "fixture.js");
const renderer = path.join(root, "packages/desktop/out/renderer");
const html = await readFile(path.join(renderer, "index.html"), "utf8");
const cssPaths = [...html.matchAll(/<link[^>]*href="([^"?#]+\.css)"/g)].map((match) => match[1]);
assert.ok(cssPaths.length, "Build the actual desktop CSS before the UI fixture.");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const evidence = {
  status: "NOT RUN",
  layer: "isolated actual-component UI fixture; no native/runtime/pilot acceptance",
  home,
  node: process.version,
  machine: {
    platform: os.platform(),
    release: os.release(),
    architecture: os.arch(),
    logicalCpus: os.cpus().length,
    cpuModel: os.cpus()[0]?.model,
  },
  startedAt: Date.now(),
  compiledSource: [],
  builtStyles: [],
  screenshots: [],
  interactions: [],
  browserErrors: [],
  notRun: ["Windows OS scaling", "screen-reader conformance", "human task timing", "installed app"],
};
let context, server, page;
try {
  const bundle = await build({
    absWorkingDir: root,
    entryPoints: ["scripts/graph-engineering/pre-z8-u4-history.fixture.tsx"],
    outfile: output,
    bundle: true,
    metafile: true,
    platform: "browser",
    format: "esm",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' },
    alias: { "@": path.join(root, "packages/ui/src") },
    nodePaths: [path.join(root, "packages/ui/node_modules")],
    logLevel: "silent",
  });
  for (const file of Object.keys(bundle.metafile.inputs).filter(
    (file) => !file.includes("node_modules"),
  ))
    evidence.compiledSource.push({ file, sha256: sha(await readFile(path.resolve(root, file))) });
  evidence.bundle = {
    sha256: sha(await readFile(output)),
    mode: "development, React Profiler enabled",
  };
  for (const file of cssPaths)
    evidence.builtStyles.push({ file, sha256: sha(await readFile(path.resolve(renderer, file))) });
  const markup = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">${cssPaths.map((file) => `<link rel="stylesheet" href="${file}">`).join("")}<title>Isolated Graph history UI fixture</title></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>`;
  server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      const name = url.pathname;
      if (name === "/") {
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end(markup);
      } else if (name === "/fixture.js") {
        response.setHeader("content-type", "text/javascript; charset=utf-8");
        response.end(await readFile(output));
      } else if (name === "/favicon.ico") {
        response.statusCode = 204;
        response.end();
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
  const profile = path.join(home, "browser-profile");
  await mkdir(profile);
  context = await chromium.launchPersistentContext(profile, {
    channel: "msedge",
    headless: true,
    chromiumSandbox: true,
    viewport: { width: 1280, height: 720 },
    locale: "en-US",
  });
  evidence.browser = context.browser()?.version() ?? "Microsoft Edge persistent context";
  await context.route("**/*", (route) => {
    const request = new URL(route.request().url());
    return request.origin === origin ? route.continue() : route.abort();
  });
  page = context.pages()[0] ?? (await context.newPage());
  page.on("pageerror", (error) => evidence.browserErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") evidence.browserErrors.push(message.text());
  });
  const started = performance.now();
  await page.goto(origin);
  await page.getByTestId("graph-history-range").waitFor();
  await page.evaluate(() => document.fonts.ready);
  evidence.initialVisibleMs = performance.now() - started;
  assert.equal(await page.getByTestId("graph-run").count(), 25);
  assert.equal(await page.getByTestId("graph-history-previous").isDisabled(), true);
  const next = page.getByTestId("graph-history-next");
  for (let index = 1; index < 20; index++) {
    const begin = performance.now();
    await next.focus();
    await next.press("Enter");
    await page.locator(`[data-testid="graph-run"][data-run-id="ui-only-${index * 25}"]`).waitFor();
    assert.equal(await page.getByTestId("graph-run").count(), 25);
    evidence.interactions.push({
      action: "keyboard-next-page",
      page: index + 1,
      durationMs: performance.now() - begin,
    });
  }
  assert.equal(await next.isDisabled(), true);
  assert.equal(await page.getByTestId("fixture-selection").textContent(), "Selected: ui-only-0");
  await page.getByTestId("graph-history-selected").focus();
  await page.keyboard.press("Enter");
  const first = page.locator('[data-testid="graph-run"][data-run-id="ui-only-0"]');
  await first.waitFor();
  await first.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="fixture-selection"]')?.textContent ===
      "Selected: ui-only-1",
  );
  assert.equal(
    await page.locator('[data-run-id="ui-only-1"]').getAttribute("aria-current"),
    "true",
  );
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    for (const theme of ["light", "dark"]) {
      if (
        Boolean((await page.locator("html").getAttribute("class"))?.includes("dark")) !==
        (theme === "dark")
      )
        await page.getByTestId("fixture-theme").click();
      await page.waitForFunction(
        (value) => document.documentElement.classList.contains(`theme-zai-${value}`),
        theme,
      );
      await page.getByTestId("fixture-theme").focus();
      const focusTarget = page.locator('[data-run-id="ui-only-1"]');
      const unfocusedBorder = await focusTarget.evaluate(
        (element) => getComputedStyle(element).borderColor,
      );
      await first.focus();
      await page.keyboard.press("Tab");
      await page.waitForFunction((before) => {
        const target = document.querySelector('[data-run-id="ui-only-1"]');
        return (
          target === document.activeElement &&
          target?.matches(":focus-visible") &&
          getComputedStyle(target).borderColor !== before
        );
      }, unfocusedBorder);
      const image = path.join(home, `history-${viewport.width}-${theme}.png`);
      await page.screenshot({ path: image, fullPage: true, animations: "disabled" });
      evidence.screenshots.push(image);
      evidence.interactions.push({
        action: "actual-theme-tokens",
        viewport,
        theme,
        colors: await focusTarget.evaluate((element) => ({
          color: getComputedStyle(element).color,
          background: getComputedStyle(element).backgroundColor,
          border: getComputedStyle(element).borderColor,
          focusVisible: element.matches(":focus-visible"),
          rootClasses: document.documentElement.className,
        })),
      });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        true,
      );
    }
  }
  const snapshot = await page.evaluate(() => window.preZ8HistoryFixture());
  assert.equal(snapshot.count, 500);
  assert.equal(snapshot.current, snapshot.initial);
  assert.equal(await page.getByTestId("graph-run").count(), 25);
  evidence.canonicalProps = {
    count: snapshot.count,
    beforeSha256: sha(snapshot.initial),
    afterSha256: sha(snapshot.current),
  };
  evidence.renders = snapshot.renders;
  assert.deepEqual(evidence.browserErrors, []);
  evidence.status = "PASS";
} catch (cause) {
  evidence.status = "FAIL";
  evidence.error = cause instanceof Error ? cause.stack : String(cause);
  if (page) {
    const failure = path.join(home, "failure.png");
    await page
      .screenshot({ path: failure, fullPage: true })
      .then(() => evidence.screenshots.push(failure))
      .catch(() => {});
  }
  process.exitCode = 1;
} finally {
  await context?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  evidence.completedAt = Date.now();
  await writeFile(path.join(home, "evidence.json"), JSON.stringify(evidence, null, 2));
  console.log(
    JSON.stringify(
      {
        status: evidence.status,
        home,
        error: evidence.error,
        interactions: evidence.interactions.length,
        screenshots: evidence.screenshots,
      },
      null,
      2,
    ),
  );
}
