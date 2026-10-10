import { literalSolution } from "../../packages/services/src/graph-engineering/adapters/project-large.fixture.ts";
// Actual components + real bounded discovery/compiler/store/preview, fixture native environment.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { runUxBrowserSuite } from "./ux-browser-runner.mjs";
import { baselineSource } from "./u1-baseline.mjs";
import {
  boot,
  chooseGeneric,
  T,
  flush,
  selectValue,
  templateDraft,
  started,
  stepRows,
  until,
  setState,
} from "./ux-m1-helpers.mjs";
import { projectSetup } from "../../packages/services/src/graph-engineering/app/project-setup.ts";
import { createProjectSetupPort } from "../../packages/services/src/graph-engineering/adapters/project-checks.ts";
import { compileDotnetRecipes } from "../../packages/services/src/graph-engineering/domain/dotnet-recipes.ts";
import { quickDotnetPreset } from "../../packages/ui/src/graph-engineering/graphQuickDotnetModel.ts";

const baseline = process.env.U2_BASELINE === "1";
const sizes = [
  { width: 1366, height: 768 },
  { width: 1600, height: 900 },
  { width: 1093, height: 614 },
];
const project =
  '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework><IsTestProject>true</IsTestProject></PropertyGroup><ItemGroup><PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.11.1" /></ItemGroup></Project>';
async function fixture(host, extra = false) {
  const root = host.workspaces.A;
  await fs.rm(path.join(root, "Other.sln"), { force: true });
  await fs.writeFile(path.join(root, "Demo.sln"), literalSolution());
  await fs.writeFile(path.join(root, "Tests.csproj"), project);
  if (extra) {
    await fs.writeFile(path.join(root, "Other.sln"), literalSolution());
    await fs.writeFile(
      path.join(root, "Tests.csproj"),
      project.replace(
        "<TargetFramework>net8.0</TargetFramework>",
        "<TargetFrameworks>net8.0;net9.0</TargetFrameworks>",
      ),
    );
  }
  const port = createProjectSetupPort({
    agentService: {
      previewExecutionEnvironment: async ({ executables }) => ({
        version: 1,
        status: "available",
        configDigest: "1".repeat(64),
        executables: executables.map((executable) => ({
          executable,
          status: "available",
          path: executable,
        })),
        instructions: [],
        skills: [],
        plugins: [],
        hooks: [],
        mcp: [],
        unknowns: ["Synthetic environment; native Tool permission is still required in the app."],
      }),
    },
  });
  const original = host.bridge.projectSetup;
  host.bridge.projectSetup = async (request) => {
    if (request.action !== "prepare-checks" && request.action !== "availability")
      return original(request);
    host.log(request.action, "start", { workspace: "A" });
    const result = await projectSetup(request, {
      project: port,
      digest: (text) => createHash("sha256").update(text).digest("hex"),
      graph: {
        recipes: (params) => host.bridge.recipes(params),
        getWorkspace: (target) => host.bridge.getWorkspace(target),
      },
    });
    host.log(request.action, "done", { workspace: "A" });
    return result;
  };
  return port;
}
async function captures(page, shotsDir, name) {
  if (!shotsDir) return;
  for (const size of sizes) {
    await page.setViewportSize(size);
    if (name.startsWith("new-run-"))
      await T(page, "graph-template-checks-heading").evaluate((element) =>
        element.scrollIntoView({ block: "start" }),
      );
    await page.addStyleTag({
      content: "*,*::before,*::after{transition:none!important;animation:none!important}",
    });
    await flush(page);
    await page.screenshot({
      path: path.join(shotsDir, `${name}-${size.width}x${size.height}.png`),
    });
  }
}
async function open(page, host, url) {
  await boot(page, host, url);
  await chooseGeneric(page);
  await T(page, "graph-template-parameter-request").fill(
    "Keep my New run request while setting up checks",
  );
  await T(page, "graph-template-setup-checks").click();
  await T(page, "graph-project-recipes").waitFor();
}
const scenarios = [
  {
    name: "simple solution: compact targets, save only, return with draft and sole checks selected",
    async run({ page, host, url, shotsDir }) {
      await fixture(host);
      await boot(page, host, url);
      await chooseGeneric(page);
      await captures(page, shotsDir, "new-run-empty");
      await T(page, "graph-template-parameter-request").fill("Preserve this request");
      const before = await templateDraft(page, host);
      await T(page, "graph-template-setup-checks").click();
      if (baseline) {
        await T(page, "graph-project-scan").click();
        await page
          .locator('[data-testid="graph-project-discovery"][data-state="complete"]')
          .waitFor();
        await T(page, "graph-dotnet-preset").locator(":scope > summary").click();
        await T(page, "graph-dotnet-preset").scrollIntoViewIfNeeded();
        await captures(page, shotsDir, "preset-before");
        return;
      }
      await T(page, "graph-quick-scan").click();
      await T(page, "graph-quick-proposal").waitFor();
      await until(() => T(page, "graph-quick-save").isEnabled(), "selected scope preparation");
      assert.equal(await T(page, "graph-dotnet-assembly").count(), 0);
      assert.equal(await T(page, "graph-recipes-json").isVisible(), false);
      await captures(page, shotsDir, "quick-proposal");
      await T(page, "graph-quick-save").click();
      await T(page, "graph-quick-saved").waitFor();
      assert.equal(started(host, "graph.run").length, 0);
      assert.equal(started(host, "prepare-checks").length, 0);
      const saved = await host.readRecipes("A");
      assert.equal(saved.recipes.length, 2);
      assert.ok(saved.recipes.every((recipe) => recipe.args.includes("--no-restore")));
      await T(page, "graph-return-to-workflow").click();
      await until(async () => (await stepRows(page, "test")).length === 1, "sole tests default");
      assert.equal((await templateDraft(page, host)).parameters.request, before.parameters.request);
      assert.equal((await stepRows(page, "build"))[0].id, "dotnet-build");
      assert.equal((await stepRows(page, "test"))[0].id, "dotnet-test-1");
      await captures(page, shotsDir, "new-run-selected");
    },
  },
  ...(!baseline
    ? [
        {
          name: "ambiguity and ordered scopes require explicit choices; cancel writes nothing",
          async run({ page, host, url, shotsDir }) {
            await fixture(host, true);
            await open(page, host, url);
            await T(page, "graph-quick-scan").click();
            await T(page, "graph-quick-proposal").waitFor();
            assert.equal(await T(page, "graph-quick-save").isDisabled(), true);
            await captures(page, shotsDir, "ambiguous");
            await selectValue(page, "graph-quick-build", "Demo.sln");
            await T(page, "graph-quick-test-1").click();
            await T(page, "graph-quick-test-0").click();
            await until(
              () => T(page, "graph-quick-save").isEnabled(),
              "selected scope preparation",
            );
            await T(page, "graph-quick-cancel").click();
            assert.equal((await host.readRecipes("A")).recipes.length, 0);
            assert.equal(started(host, "graph.recipes.save").length, 0);
          },
        },
        {
          name: "custom configuration is retained byte-for-byte by viewing Quick and Advanced",
          async run({ page, host, url, shotsDir }) {
            const port = await fixture(host);
            const discovery = await port.scan({ workspacePath: host.workspaces.A }, "custom", {
              selectedProject: "Demo.sln",
            });
            const preset = quickDotnetPreset(discovery, "Demo.sln", ["Tests.csproj|net8.0"], "[]");
            preset.timeoutMs = 234567;
            preset.tests[0].filter = "Category=Unit";
            preset.tests[0].requiredTests = ["Demo.Case"];
            const custom = compileDotnetRecipes(preset);
            await host.seedRecipes("A", custom);
            await open(page, host, url);
            await captures(page, shotsDir, "custom-default");
            await T(page, "graph-checks-advanced").locator(":scope > summary").click();
            await T(page, "graph-recipes-json").evaluate((element) => {
              element.closest("details").open = true;
            });
            assert.deepEqual(JSON.parse(await T(page, "graph-recipes-json").inputValue()), custom);
            await T(page, "graph-recipes-json").scrollIntoViewIfNeeded();
            await captures(page, shotsDir, "custom-advanced");
            await T(page, "graph-checks-advanced").locator(":scope > summary").click();
            await T(page, "graph-quick-add").click();
            await T(page, "graph-quick-scan").click();
            await T(page, "graph-quick-proposal").waitFor();
            await T(page, "graph-quick-cancel").click();
            await T(page, "graph-return-to-workflow").click();
            assert.deepEqual((await host.readRecipes("A")).recipes, custom);
            assert.equal(started(host, "graph.recipes.save").length, 0);
          },
        },
        {
          name: "save and run reaches exact existing preview then rechecks before existing admission",
          async run({ page, host, url, shotsDir }) {
            await fixture(host);
            await open(page, host, url);
            await T(page, "graph-quick-scan").click();
            await T(page, "graph-quick-proposal").waitFor();
            await T(page, "graph-quick-save-run").click();
            await T(page, "graph-check-preview").waitFor();
            assert.equal(started(host, "graph.run").length, 0);
            assert.equal(await T(page, "graph-check-confirm").isDisabled(), true);
            await captures(page, shotsDir, "exact-preview");
            await T(page, "graph-check-ack").click();
            await T(page, "graph-check-confirm").click();
            await until(
              () => started(host, "graph.run").length === 1,
              "existing calibration admission",
            );
            assert.equal(started(host, "prepare-checks").length, 2);
          },
        },
        {
          name: "unsupported project displays precise uncertainty and never offers a runnable Quick recipe",
          async run({ page, host, url, shotsDir }) {
            await fixture(host);
            await fs.writeFile(
              path.join(host.workspaces.A, "Tests.csproj"),
              project.replace("Microsoft.NET.Test.Sdk", "Microsoft.Testing.Platform"),
            );
            await open(page, host, url);
            await T(page, "graph-quick-scan").click();
            await T(page, "graph-quick-proposal").waitFor();
            assert.equal(await T(page, "graph-quick-save").isDisabled(), true);
            assert.match(
              await T(page, "graph-quick-proposal").innerText(),
              /Microsoft.Testing.Platform/,
            );
            await captures(page, shotsDir, "unsupported");
            assert.equal(started(host, "graph.recipes.save").length, 0);
          },
        },
        {
          name: "late scan after Cancel and failed Save preserve saved checks and run draft",
          async run({ page, host, url }) {
            await fixture(host);
            await open(page, host, url);
            host.hold("scan");
            await T(page, "graph-quick-scan").click();
            await until(() => host.waiting("scan") === 1, "held scan");
            await T(page, "graph-quick-cancel").click();
            host.release("scan");
            await until(
              () => host.calls.some((call) => call.op === "scan" && call.phase === "done"),
              "late scan reply",
            );
            await flush(page);
            assert.equal(await T(page, "graph-quick-proposal").count(), 0);
            await T(page, "graph-quick-scan").click();
            await T(page, "graph-quick-proposal").waitFor();
            host.fail("graph.recipes.save", "Synthetic save failure");
            await T(page, "graph-quick-save-run").click();
            await page.getByTestId("graph-recipes-save-error").waitFor();
            assert.equal((await host.readRecipes("A")).recipes.length, 0);
            assert.equal(started(host, "prepare-checks").length, 0);
            assert.equal(started(host, "graph.run").length, 0);
            await T(page, "graph-return-to-workflow").click();
            assert.equal(
              (await templateDraft(page, host)).parameters.request,
              "Keep my New run request while setting up checks",
            );
          },
        },
        {
          name: "light theme and Chinese reduced viewport preserve primary actions",
          async run({ page, host, url, shotsDir }) {
            await fixture(host);
            await open(page, host, url);
            await setState(page, { locale: "zh-CN", theme: "zai-light" });
            await T(page, "graph-quick-scan").click();
            await T(page, "graph-quick-proposal").waitFor();
            await captures(page, shotsDir, "quick-chinese-light");
            await until(
              () => T(page, "graph-quick-save").isEnabled(),
              "selected scope preparation",
            );
          },
        },
      ]
    : []),
];
await runUxBrowserSuite({
  suite: "Z8.5-U2 Quick .NET checks",
  scenarios,
  sourceRoot: baseline
    ? await baselineSource("dbe6c51ca0ea54f3afa92867b66a1fd2aeb6f045")
    : undefined,
});
