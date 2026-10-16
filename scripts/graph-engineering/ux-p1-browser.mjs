// Z8.5-UX-P1 rendered evidence: real Graph components in the existing synthetic Host harness.
// Synthetic display records only; never native execution, permission or verification evidence.
// The same scenarios run unchanged before and after the presentation change (--shots=<dir>).
// UXP1_CAPTURE_ONLY=1 skips the UX-P1 semantic assertions so the unchanged tree can be recorded.
import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { runUxBrowserSuite } from "./ux-browser-runner.mjs";
import {
  boot,
  chooseGeneric,
  preparedDraft,
  T,
  until,
  flush,
  setState,
  selectValue,
  admissionCalls,
  assertClean,
} from "./ux-m1-helpers.mjs";
import { u1Run } from "./u1-runs.mjs";
import { approvalWaitRun, invalidEvidenceRun } from "./ux-m1-runs.mjs";
import { inspectionArguments } from "../../packages/shared/src/project-inspection.ts";

export const captureOnly = process.env.UXP1_CAPTURE_ONLY === "1";
/** Matrix used for rendered captures. `gallery` marks the variants kept as committed evidence. */
export const variants = [
  {
    tag: "1366",
    width: 1366,
    height: 768,
    locale: "en-US",
    theme: "zai-dark",
    gallery: true,
  },
  {
    tag: "1600",
    width: 1600,
    height: 900,
    locale: "en-US",
    theme: "zai-light",
  },
  {
    tag: "1093-zh",
    width: 1093,
    height: 614,
    locale: "zh-CN",
    theme: "zai-light",
  },
];

export async function reserveSidebar(page) {
  // Harness-only shell: reserve the same 268px application sidebar before and after.
  await page.locator("#root > div > aside").evaluateAll((elements) => {
    for (const element of elements)
      Object.assign(element.style, {
        display: "block",
        width: "268px",
        flexShrink: "0",
      });
  });
}

/** Settled capture: no transitions, scroll position top, plus layout facts in a same-name JSON. */
export async function capture(page, dir, name, { scrollTo, region } = {}) {
  await reserveSidebar(page);
  await page.addStyleTag({
    content: "*,*::before,*::after{transition:none !important;animation:none !important}",
  });
  await page.mouse.move(0, 0);
  if (scrollTo) await T(page, scrollTo).scrollIntoViewIfNeeded();
  await flush(page);
  const metrics = await page.evaluate((selector) => {
    const root = document.querySelector(selector) ?? document.querySelector("[data-view]");
    const text = (root?.innerText ?? "").replace(/\s+/g, " ").trim();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      scrollHeight: root?.scrollHeight,
      visibleChars: text.length,
      visibleText: text,
    };
  }, region ?? "[data-view]");
  if (dir) {
    await mkdir(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, `${name}.png`) });
    await writeFile(path.join(dir, `${name}.json`), JSON.stringify(metrics, null, 2));
  }
  return metrics;
}

async function eachVariant(page, dir, name, options, before = async () => {}) {
  const facts = [];
  for (const variant of variants) {
    await setState(page, { locale: variant.locale, theme: variant.theme });
    await page.setViewportSize({
      width: variant.width,
      height: variant.height,
    });
    await before(variant);
    facts.push(await capture(page, dir, `${name}-${variant.tag}`, options));
    assert.equal(facts.at(-1).horizontalOverflow, false, `${name} ${variant.tag} overflows`);
  }
  return facts;
}

const pick = async (page, id) => {
  await page.locator(`[data-testid="graph-run"][data-run-id="${id}"]`).click();
  await T(page, "graph-run-summary").waitFor();
  await page.locator("[data-view]").evaluate((element) => {
    element.scrollTop = 0;
  });
};

const runScenario = (name, build) => ({
  name: `UX-P1 run view: ${name}`,
  async run({ page, host, url, shotsDir }) {
    const run = build();
    host.setRuns("A", [run]);
    await boot(page, host, url);
    await reserveSidebar(page);
    await pick(page, run.id);
    await eachVariant(page, shotsDir, `run-${name}`, {}, () =>
      page.locator("[data-view]").evaluate((element) => {
        element.scrollTop = 0;
      }),
    );
    assert.equal(admissionCalls(host).length, 0);
    assertClean(host);
  },
});

// Evidence and approval requests bind to the run id: never re-id a fixture after construction.
const dated = (run) => {
  run.createdAt = Date.UTC(2026, 9, 1, 8);
  run.updatedAt = run.createdAt + 120000;
  return run;
};
export const staleRun = () => {
  const run = approvalWaitRun("uxp1-stale");
  run.status = run.approvalAttempts[0].status = "StaleEvidence";
  return dated(run);
};
export const failedTest = () => u1Run("sequential", "failed");
export const invalidEvidence = () => {
  const run = invalidEvidenceRun("uxp1-invalid-evidence");
  run.startInput = "Fix the request parser and preserve existing API behavior";
  run.definition.nodes[0].request = run.startInput;
  return dated(run);
};

const WEB =
  '<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>';
const TESTS =
  '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup><ItemGroup><PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.11.1"/></ItemGroup></Project>';
async function webWorkspace(host, withTests = true) {
  const files = withTests
    ? { "Api/Api.csproj": WEB, "Tests/Tests.csproj": TESTS }
    : { "Api/Api.csproj": WEB };
  // The synthetic workspace directory persists between scenarios: make the file set exact.
  await rm(path.join(host.workspaces.A, "Tests"), {
    recursive: true,
    force: true,
  });
  for (const [file, xml] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(host.workspaces.A, file)), {
      recursive: true,
    });
    await writeFile(path.join(host.workspaces.A, file), xml);
  }
}
export async function openChecks(page, host, url, withTests = true, patch) {
  await webWorkspace(host, withTests);
  await boot(page, host, url, patch);
  await chooseGeneric(page);
  await reserveSidebar(page);
  await T(page, "graph-template-setup-checks").click();
  await T(page, "graph-quick-scan").click();
}

const unsupportedScenario = {
  name: "UX-P1 checks: unsupported selected Web project",
  async run({ page, host, url, shotsDir }) {
    // Locale/theme changes remount the page (by design), so each variant runs the whole flow.
    for (const variant of variants) {
      await page.setViewportSize({ width: variant.width, height: variant.height });
      await openChecks(page, host, url, true, { locale: variant.locale, theme: variant.theme });
      await T(page, "graph-quick-build").waitFor();
      await selectValue(page, "graph-quick-build", "Api/Api.csproj");
      await until(
        async () =>
          (await T(page, "graph-quick-dotnet").getAttribute("data-preparation")) === "unsupported",
        "Web rejection",
      );
      assert.equal(await T(page, "graph-quick-save").isEnabled(), false);
      const facts = await capture(page, shotsDir, `checks-unsupported-${variant.tag}`, {
        scrollTo: "graph-quick-dotnet",
      });
      assert.equal(facts.horizontalOverflow, false, `unsupported ${variant.tag} overflows`);
      assert.equal(admissionCalls(host).length, 0);
    }
  },
};

/**
 * Controlled inspection records (UI fixture only): the real GraphProjectInspection talks to this
 * stand-in for the Host. `final` is the status a confirmed review settles in. Always `restore()`.
 */
export function controlledInspection(host, final) {
  const original = host.bridge.projectSetup;
  const control = {
    calls: [],
    row: undefined,
    final,
    restore: () => (host.bridge.projectSetup = original),
  };
  host.bridge.projectSetup = async (input) => {
    if (input.action === "inspection-history")
      return {
        kind: "inspection-history",
        records: control.row ? [structuredClone(control.row)] : [],
      };
    if (input.action !== "inspection") return original(input);
    control.calls.push(input.command.action);
    if (input.command.action === "review") {
      const binding = {
        ...input.command.selection,
        purpose: "project-configuration-inspection-v1",
        sdkDirectory: "C:/Synthetic/dotnet/sdk/8.0.426",
        observationDigest: "a".repeat(64),
        observedFiles: 3508,
        observedBytes: 405626873,
        expiresAt: Date.UTC(2026, 9, 1, 9, 5),
      };
      const id = randomUUID();
      control.row = {
        version: 1,
        kind: "project-inspection",
        id,
        sessionId: "synthetic-inspection-session",
        target: { workspacePath: "C:/Synthetic/Web" },
        selection: input.command.selection,
        status: "review-ready",
        reserved: false,
        scopeComplete: false,
        timings: [],
        message: "Controlled UI fixture",
        requestDigest: "b".repeat(64),
        request: {
          operationId: id,
          inspection: binding,
          recipe: {
            id: binding.purpose,
            executable: "C:/Synthetic/dotnet/dotnet.exe",
            args: inspectionArguments(binding),
            cwdRelative: ".",
            timeoutMs: 30000,
          },
        },
      };
    } else if (input.command.action === "start") {
      control.row = {
        ...control.row,
        status: control.final,
        reserved: ["verifying-sources", "awaiting-permission", "running", "executor-lost"].includes(
          control.final,
        ),
      };
    } else if (input.command.action === "cancel")
      control.row = { ...control.row, status: "cancelled", reserved: false };
    return structuredClone(control.row);
  };
  return control;
}

export const CONFIRM =
  /^(Confirm inspection and request native permission|确认检查并请求原生权限)$/;
/** Open Checks on a Web-only workspace, choose SDK/framework, review, and (optionally) confirm. */
export async function driveInspection(page, host, url, variant, control, { confirm = true } = {}) {
  control.row = undefined;
  control.calls.length = 0;
  await page.setViewportSize({ width: variant.width, height: variant.height });
  await openChecks(page, host, url, false, { locale: variant.locale, theme: variant.theme });
  await until(async () => await T(page, "graph-project-inspection").count(), "inspection");
  const panel = T(page, "graph-project-inspection");
  await panel.getByRole("combobox").nth(0).click();
  await page.getByRole("option", { name: "8.0.426", exact: true }).click();
  await panel.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: "net8.0", exact: true }).click();
  await panel.getByRole("button").first().click();
  await until(
    async () => (await panel.getAttribute("data-status")) === "review-ready",
    "review ready",
  );
  if (confirm && control.final !== "review-ready") {
    await panel.getByRole("button").filter({ hasText: CONFIRM }).click();
    await until(
      async () => (await panel.getAttribute("data-status")) === control.final,
      control.final,
    );
  }
  return panel;
}

function inspectionScenario(name, finalStatus) {
  return {
    name: `UX-P1 inspection: ${name}`,
    async run({ page, host, url, shotsDir }) {
      const control = controlledInspection(host, finalStatus);
      try {
        // Locale/theme changes remount the page (by design), so each variant runs the whole flow.
        for (const variant of variants) {
          await driveInspection(page, host, url, variant, control);
          const facts = await capture(page, shotsDir, `inspection-${name}-${variant.tag}`, {
            scrollTo: "graph-project-inspection",
          });
          assert.equal(facts.horizontalOverflow, false, `${name} ${variant.tag} overflows`);
          assert.equal(
            control.calls.filter((call) => call === "start").length,
            finalStatus === "review-ready" ? 0 : 1,
            "viewing never starts or replays inspection",
          );
        }
      } finally {
        control.restore();
      }
    },
  };
}

/** Keyboard focus on the primary inspection action, reached with a real Tab (keyboard modality). */
const focusScenario = {
  name: "UX-P1 focus: inspection command review",
  async run({ page, host, url, shotsDir }) {
    const control = controlledInspection(host, "review-ready");
    try {
      for (const variant of variants.filter((item) => item.gallery || item.locale === "zh-CN")) {
        const panel = await driveInspection(page, host, url, variant, control, { confirm: false });
        await panel.getByRole("combobox").nth(1).focus();
        await page.keyboard.press("Tab");
        const focusedText = await page.evaluate(() => document.activeElement?.textContent);
        // The unchanged baseline orders actions differently: only record it there.
        if (!captureOnly)
          assert.match(
            focusedText ?? "",
            /^(Confirm inspection and request native permission|确认检查并请求原生权限)$/,
          );
        await capture(page, shotsDir, `inspection-focus-${variant.tag}`, {
          scrollTo: "graph-project-inspection",
        });
      }
    } finally {
      control.restore();
    }
  },
};

const newRunScenario = {
  name: "UX-P1 new run: prepared draft",
  async run({ page, host, url, shotsDir }) {
    await preparedDraft(page, host, url);
    await reserveSidebar(page);
    await eachVariant(
      page,
      shotsDir,
      "new-run",
      { region: '[data-testid="graph-new-run-pane"]' },
      () =>
        page.locator("[data-view]").evaluate((element) => {
          element.scrollTop = 0;
        }),
    );
    // The lower half of the pane: selected Build/Test checks and the primary action.
    await eachVariant(page, shotsDir, "new-run-checks", {}, () =>
      page.locator("[data-view]").evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      }),
    );
    assert.equal(admissionCalls(host).length, 0);
    assertClean(host);
  },
};

const checksPane = {
  name: "UX-P1 checks: saved Build/Test selection in New run",
  async run({ page, host, url, shotsDir }) {
    await preparedDraft(page, host, url);
    await reserveSidebar(page);
    await T(page, "graph-template-setup-checks").click();
    await flush(page);
    await eachVariant(page, shotsDir, "checks-setup", {
      scrollTo: "graph-checks-setup",
    });
    assert.equal(admissionCalls(host).length, 0);
  },
};

export const scenarios = [
  runScenario("running", () => u1Run("sequential", "running")),
  runScenario("permission", () => u1Run("sequential", "permission")),
  runScenario("approval", () => u1Run("sequential", "approval")),
  runScenario("failed-test", failedTest),
  runScenario("invalid-evidence", invalidEvidence),
  runScenario("stale-review", staleRun),
  unsupportedScenario,
  inspectionScenario("review", "review-ready"),
  inspectionScenario("verifying", "verifying-sources"),
  inspectionScenario("permission", "awaiting-permission"),
  inspectionScenario("expired", "expired"),
  focusScenario,
  newRunScenario,
  checksPane,
];

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename))
  await runUxBrowserSuite({
    suite: "Z8.5-UX-P1 rendered operator view",
    scenarios,
  });
