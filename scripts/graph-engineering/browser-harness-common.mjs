// Shared driver for the Graph browser harnesses (Context picker, UX-M1).
//
// Bundles a harness page with the repository's own Vite (real components and hooks), serves it,
// launches Chromium through playwright-core, and runs scenarios. No new dependency, no Electron.
// A harness supplies: the page directory, optional module aliases (labelled stubs), a host object
// (fixture services, call log, reset/dispose) and a `preparePage` that exposes the bridge.
import { createServer } from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "../..");

export function parseArgs(argv = process.argv.slice(2)) {
  return Object.fromEntries(
    argv
      .filter((arg) => arg.startsWith("--"))
      .map((arg) => {
        const [key, ...value] = arg.slice(2).split("=");
        return [key, value.length ? value.join("=") : true];
      }),
  );
}

export async function buildHarness({ root, outDir, aliases = [] }) {
  const { build } = await import("vite");
  const react = (await import("@vitejs/plugin-react")).default;
  const tailwind = (await import("@tailwindcss/vite")).default;
  await build({
    configFile: false,
    root,
    base: "./",
    logLevel: "warn",
    mode: "development",
    plugins: [react(), tailwind()],
    // Specific (stub) aliases first; "@" is the packages/ui source alias the app itself uses.
    resolve: {
      alias: [...aliases, { find: "@", replacement: path.join(repoRoot, "packages/ui/src") }],
    },
    define: {
      "process.env.NODE_ENV": JSON.stringify("development"),
      __ZCODE_ENDPOINT_ENV__: "{}",
      __ZCODE_VERSION__: JSON.stringify("browser-harness"),
      __ZCODE_COMMIT__: JSON.stringify("harness"),
      __ZCODE_ENV__: JSON.stringify("test"),
    },
    build: {
      outDir,
      emptyOutDir: true,
      minify: false,
      sourcemap: false,
      chunkSizeWarningLimit: 1e6,
    },
  });
}

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
async function serve(dir) {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      const file = path.join(dir, url.pathname === "/" ? "index.html" : url.pathname);
      if (!file.startsWith(dir)) throw new Error("outside root");
      const body = await fs.readFile(file);
      response.writeHead(200, {
        "content-type": types[path.extname(file)] ?? "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

/**
 * Builds, serves and launches, then runs `scenarios` one page each. `preparePage(page)` exposes the
 * harness bridge before navigation. Returns `{ results, chromium }`; the caller writes the summary.
 */
export async function runBrowserHarness({
  harnessDir,
  aliases,
  args,
  scenarios,
  host,
  preparePage,
  scenarioContext = () => ({}),
}) {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "zcode-browser-harness-"));
  const results = [];
  let served;
  let browser;
  let chromiumVersion = "unknown";
  try {
    await buildHarness({ root: harnessDir, outDir: scratch, aliases });
    served = await serve(scratch);
    browser = await chromium.launch({
      headless: true,
      ...(typeof args.chromium === "string" ? { executablePath: args.chromium } : {}),
    });
    chromiumVersion = browser.version();
    const shotsDir = typeof args.shots === "string" ? path.resolve(args.shots) : undefined;
    if (shotsDir) await fs.mkdir(shotsDir, { recursive: true });
    for (const scenario of scenarios) {
      if (typeof args.only === "string" && scenario.name !== args.only) continue;
      if (typeof args.match === "string" && !scenario.name.includes(args.match)) continue;
      const started = Date.now();
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(String(error)));
      page.on("console", (message) => {
        if (message.type() === "error") pageErrors.push(`console.error: ${message.text()}`);
      });
      await preparePage(page);
      await host.reset();
      let error;
      try {
        await scenario.run({
          page,
          host,
          url: served.url,
          shotsDir,
          pageErrors,
          ...scenarioContext(),
        });
        if (pageErrors.length) throw new Error(`Unexpected page errors:\n${pageErrors.join("\n")}`);
      } catch (cause) {
        error = cause;
        // 场景自身失败时页面错误往往是根因：一并输出。
        if (pageErrors.length && !String(cause).includes("Unexpected page errors"))
          error = new Error(`${cause?.stack ?? cause}\nPage errors:\n${pageErrors.join("\n")}`);
      }
      await context.close();
      results.push({
        name: scenario.name,
        ok: !error,
        ms: Date.now() - started,
        ...(error ? { error: String(error?.stack ?? error) } : {}),
      });
      console.log(`${error ? "FAIL" : "PASS"}  ${scenario.name}  (${Date.now() - started} ms)`);
      if (error) console.log(String(error?.stack ?? error).replace(/^/gm, "      "));
    }
  } finally {
    await browser?.close();
    served?.server.close();
    await host.dispose();
    await fs.rm(scratch, { recursive: true, force: true });
  }
  return { results, chromium: chromiumVersion };
}

export async function writeSummary(args, summary) {
  if (typeof args.summary === "string") {
    await fs.mkdir(path.dirname(path.resolve(args.summary)), { recursive: true });
    await fs.writeFile(path.resolve(args.summary), `${JSON.stringify(summary, null, 2)}\n`);
  }
  console.log(`\n${summary.passed} passed, ${summary.failed} failed`);
  process.exitCode = summary.failed ? 1 : 0;
}
