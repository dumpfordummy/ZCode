// UX-M1 browser interaction tests (Cloud-runnable; no Electron, no native runtime, no Windows).
//
//   node --import tsx scripts/graph-engineering/ux-m1-browser.mjs \
//     --chromium=/opt/pw-browsers/chromium [--only=<name>] [--shots=<dir>] [--summary=<file>]
//
// Bundles the real GraphEditor and useGraphEngineering (ux-m1-browser/main.tsx) with the repository's
// own Vite and drives real Chromium via playwright-core. The Graph Host, workflow service and file
// boundary are fixtures (ux-m1-host.mjs; what is real and what is not is listed there and in the
// summary). Three modules irrelevant to UX-M1 are replaced by labelled stubs (ux-m1-browser/stubs).
// None of this is Windows native acceptance.
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs, runBrowserHarness, writeSummary } from "./browser-harness-common.mjs";
import { createUxM1Host } from "./ux-m1-host.mjs";
import { uxM1Scenarios } from "./ux-m1-all-scenarios.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const harnessDir = path.join(here, "ux-m1-browser");
const args = parseArgs();
const host = await createUxM1Host();

const bridged = [
  "getWorkspace",
  "saveDefinition",
  "validateDefinition",
  "recipes",
  "run",
  "list",
  "instantiate",
  "prepare",
  "projectSetup",
  "searchFiles",
  "pickFile",
  "record",
];
const { results, chromium } = await runBrowserHarness({
  harnessDir,
  aliases: [
    {
      find: /^\.\/GraphConfiguration\.js$/,
      replacement: path.join(harnessDir, "stubs/GraphConfiguration.tsx"),
    },
    {
      find: /^\.\/GraphDesignPanel\.js$/,
      replacement: path.join(harnessDir, "stubs/GraphDesignPanel.tsx"),
    },
    {
      find: "@/hooks/useSettingService.js",
      replacement: path.join(harnessDir, "stubs/useSettingService.ts"),
    },
  ],
  args,
  scenarios: uxM1Scenarios,
  host,
  async preparePage(page) {
    host.attachPage(page);
    for (const name of bridged)
      await page.exposeFunction(`__ux_${name}`, (...params) => host.bridge[name](...params));
    await page.addInitScript(
      ({ names, workspaces }) => {
        window.__WORKSPACES__ = workspaces;
        window.__ux = Object.fromEntries(
          names.map((name) => [name, (...params) => window[`__ux_${name}`](...params)]),
        );
      },
      { names: bridged, workspaces: host.workspaces },
    );
  },
});

const failed = results.filter((item) => !item.ok);
await writeSummary(args, {
  environment: {
    kind: "cloud-linux-chromium-harness",
    windowsNativeAcceptance: "PENDING",
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    chromium,
    real: [
      "GraphEditor, GraphRunsDestination, GraphLibrary, GraphTemplateBindings, Context picker, checks editor, inline review, Needs-you, draft store, view store, i18n",
      "useGraphEngineering (the real hook, including its single-flight, retained-submission and admission guards)",
      "Graph Host code over real temp workspaces: instantiateTemplate, validateReadiness, recipe store (.zcode/config.json, digest conflicts, schema), project-setup reference validation",
    ],
    fixtures: [
      "Graph engineering service: workspace view, run list, definition revision counter, run admission, change events",
      "Graph workflow service: library view (from the real built-in templates), preflight (built from the real reference validation and recipe store, fixture native environment)",
      "run records: the UI tests' summaryRun() (unit-only captured records), not native runs",
      "file search, platform.selectFile, transport (Playwright bridge instead of RPC)",
    ],
    stubs: [
      "GraphConfiguration (composer model/mode configuration hook)",
      "GraphDesignPanel body (Workflows editor)",
      "useSettings",
    ],
  },
  passed: results.length - failed.length,
  failed: failed.length,
  results,
});
