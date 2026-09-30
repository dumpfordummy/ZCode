// Shared runner for the UX-M1 and UX-M2 browser suites: the same real-component harness page
// (ux-m1-browser/main.tsx), the same fixture Host (ux-m1-host.mjs) and the same labelled stubs.
// Only the scenario list and the suite label differ. None of this is Windows native acceptance.
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs, runBrowserHarness, writeSummary } from "./browser-harness-common.mjs";
import { createUxM1Host } from "./ux-m1-host.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const harnessDir = path.join(here, "ux-m1-browser");

export async function runUxBrowserSuite({ suite, scenarios }) {
  const args = parseArgs();
  const host = await createUxM1Host();

  const bridged = [
    "getWorkspace",
    "saveDefinition",
    "validateDefinition",
    "recipes",
    "run",
    "list",
    "mutate",
    "preview",
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
    scenarios,
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
    suite,
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
        "Graph workflow service: only the preflight (`prepare`, built from the real reference validation and recipe store, fixture native environment). The library operations list/mutate/preview/instantiate are the REAL GraphWorkflowService over an in-memory GraphLibraryStore (same revision rule and schema validation as the file store)",
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
  return { passed: results.length - failed.length, failed: failed.length };
}
