// Context picker browser component tests (Cloud-runnable, no Electron / Windows needed).
//
//   node --import tsx scripts/graph-engineering/context-picker-browser.mjs \
//     --chromium=/opt/pw-browsers/chromium [--only=<name>] [--shots=<dir>] [--summary=<file>]
//
// Bundles the real GraphTemplateBindings (see context-picker-browser/main.tsx) with the repository's
// own Vite and drives real Chromium via playwright-core. The service and platform boundary is a
// fixture (context-picker-host.mjs). None of this is Windows native acceptance.
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { builtinTemplates } from "../../packages/services/src/graph-engineering/domain/workflow-samples.ts";
import { parseArgs, runBrowserHarness, writeSummary } from "./browser-harness-common.mjs";
import { createContextPickerHost } from "./context-picker-host.mjs";
import { contextPickerScenarios } from "./context-picker-all-scenarios.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs();

/** Built-in agent-assisted template + a derived copy with one required document role (remove-required). */
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

const host = await createContextPickerHost();
const { results, chromium } = await runBrowserHarness({
  harnessDir: path.join(here, "context-picker-browser"),
  args,
  scenarios: contextPickerScenarios,
  host,
  async preparePage(page) {
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
});
