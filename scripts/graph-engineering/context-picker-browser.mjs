// Context picker 浏览器组件测试驱动（Cloud 可运行，无需 Electron / Windows）。
//
//   node --import tsx scripts/graph-engineering/context-picker-browser.mjs \
//     --chromium=/opt/pw-browsers/chromium [--only=<name>] [--shots=<dir>] [--summary=<file>]
//
// 用仓库自带的 Vite 打包真实的 GraphTemplateBindings（见 context-picker-browser/main.tsx），再用
// playwright-core 驱动真实 Chromium。服务/平台边界是夹具（context-picker-host.mjs）；本驱动不启动
// Electron、Agent、模型或任何项目命令。这些结果 **不是** Windows 原生验收。
import { createServer } from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createContextPickerHost } from "./context-picker-host.mjs";
import { contextPickerScenarios } from "./context-picker-all-scenarios.mjs";
import { builtinTemplates } from "../../packages/services/src/graph-engineering/domain/workflow-samples.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...value] = arg.slice(2).split("=");
      return [key, value.length ? value.join("=") : true];
    }),
);

/** 内置 agent-assisted 模板 + 一个派生模板（多一个必填文档 role），用于验证「移除必填引用」。 */
function templates() {
  const base = builtinTemplates.find((item) => item.id === "agent-assisted").template;
  const withRequired = structuredClone(base);
  withRequired.references.push({
    id: "gameDoc",
    label: "Authoritative GameDoc",
    kind: "document",
    required: true,
    nodeIds: ["analyze"],
  });
  const version = (template) => ({ version: 1, digest: "a".repeat(64), createdAt: 0, template });
  return { "agent-assisted": version(base), required: version(withRequired) };
}

async function buildHarness(outDir) {
  const { build } = await import("vite");
  const react = (await import("@vitejs/plugin-react")).default;
  const tailwind = (await import("@tailwindcss/vite")).default;
  await build({
    configFile: false,
    root: path.join(here, "context-picker-browser"),
    base: "./",
    logLevel: "warn",
    mode: "development",
    plugins: [react(), tailwind()],
    resolve: { alias: { "@": path.join(repo, "packages/ui/src") } },
    define: {
      "process.env.NODE_ENV": JSON.stringify("development"),
      __ZCODE_ENDPOINT_ENV__: "{}",
      __ZCODE_VERSION__: JSON.stringify("context-picker-harness"),
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

const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "zcode-context-picker-build-"));
const host = await createContextPickerHost();
let served;
let browser;
let chromiumVersion = "unknown";
const results = [];
try {
  await buildHarness(scratch);
  served = await serve(scratch);
  browser = await chromium.launch({
    headless: true,
    ...(typeof args.chromium === "string" ? { executablePath: args.chromium } : {}),
  });
  chromiumVersion = browser.version();
  const shotsDir = typeof args.shots === "string" ? path.resolve(args.shots) : undefined;
  if (shotsDir) await fs.mkdir(shotsDir, { recursive: true });

  for (const scenario of contextPickerScenarios) {
    if (typeof args.only === "string" && scenario.name !== args.only) continue;
    const started = Date.now();
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(`console.error: ${message.text()}`);
    });
    await page.exposeFunction("__bridge_projectSetup", (request) =>
      host.bridge.projectSetup(request),
    );
    await page.exposeFunction("__bridge_searchFiles", (params) => host.bridge.searchFiles(params));
    await page.exposeFunction("__bridge_pickFile", () => host.bridge.pickFile());
    await page.exposeFunction("__bridge_record", (op, detail) => host.bridge.record(op, detail));
    await page.addInitScript(
      ({ templatesJson, workspaces }) => {
        window.__TEMPLATES__ = JSON.parse(templatesJson);
        window.__WORKSPACES__ = workspaces;
        window.__bridge = {
          projectSetup: (request) => window.__bridge_projectSetup(request),
          searchFiles: (params) => window.__bridge_searchFiles(params),
          pickFile: () => window.__bridge_pickFile(),
          record: (op, detail) => window.__bridge_record(op, detail),
        };
      },
      { templatesJson: JSON.stringify(templates()), workspaces: host.workspaces },
    );
    host.reset();
    let error;
    try {
      await scenario.run({ page, host, url: served.url, shotsDir, pageErrors });
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

const failed = results.filter((item) => !item.ok);
const summary = {
  environment: {
    kind: "cloud-linux-chromium-harness",
    windowsNativeAcceptance: "PENDING",
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    chromium: chromiumVersion,
    fixtures: [
      "agentService.previewExecutionEnvironment (native environment preview)",
      "fileService.searchWorkspaceFiles (directory walk over temp workspaces)",
      "platform.selectFile",
      "transport: Playwright bridge instead of RPC",
    ],
    real: [
      "GraphTemplateBindings, GraphContextSection, GraphContextPicker, hooks, Radix Popover, draft store, i18n",
      "Graph Host projectSetup facade and createProjectSetupPort (validate-reference) over real temp files",
    ],
  },
  passed: results.length - failed.length,
  failed: failed.length,
  results,
};
if (typeof args.summary === "string") {
  await fs.mkdir(path.dirname(path.resolve(args.summary)), { recursive: true });
  await fs.writeFile(path.resolve(args.summary), `${JSON.stringify(summary, null, 2)}\n`);
}
console.log(`\n${summary.passed} passed, ${summary.failed} failed`);
process.exitCode = failed.length ? 1 : 0;
