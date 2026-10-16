import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runUxBrowserSuite } from "./ux-browser-runner.mjs";
import { boot, chooseGeneric, T, until, setState, started, selectValue } from "./ux-m1-helpers.mjs";

const pure =
  '<Project Sdk="Microsoft.NET.Sdk" xmlns="http://schemas.microsoft.com/developer/msbuild/2003"><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup><ItemGroup><PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.11.1"/></ItemGroup></Project>';
async function fixture(host) {
  const files = {
    "Api/Api.csproj":
      '<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup></Project>',
    "Tests/Tests.csproj": pure,
    "builds/0/project-0/Tests.csproj": pure,
    "Library/Library.csproj":
      '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup></Project>',
  };
  for (const [file, xml] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(host.workspaces.A, file)), { recursive: true });
    await writeFile(path.join(host.workspaces.A, file), xml);
  }
}
async function open(page, host, url) {
  await fixture(host);
  await boot(page, host, url);
  await chooseGeneric(page);
  await T(page, "graph-template-setup-checks").click();
  await T(page, "graph-quick-scan").click();
  await T(page, "graph-quick-build").waitFor();
}
async function shot(page, directory, name, width = 1366, height = 768) {
  await page.setViewportSize({ width, height });
  await T(page, "graph-quick-proposal").scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  if (directory) await page.screenshot({ path: path.join(directory, `${name}-${width}.png`) });
}
await runUxBrowserSuite({
  suite: "Z8.5-U5 roots and linked selection",
  scenarios: [
    {
      name: "Web selected cause, manual fallback and retained Chinese draft",
      async run({ page, host, url, shotsDir }) {
        await open(page, host, url);
        await selectValue(page, "graph-quick-build", "Api/Api.csproj");
        await until(
          async () =>
            (await T(page, "graph-quick-dotnet").getAttribute("data-preparation")) ===
            "unsupported",
          "Web rejection",
        );
        const status = T(page, "graph-quick-proposal").locator('[role="status"]').first();
        assert.match(await status.innerText(), /Microsoft.NET.Sdk.Web.*Razor/);
        assert.doesNotMatch(await status.innerText(), /Test detection is incomplete/);
        assert.equal(await T(page, "graph-quick-test-0").count(), 0);
        assert.equal(await T(page, "graph-quick-save").isEnabled(), false);
        await shot(page, shotsDir, "web-selected-blocker");
        await T(page, "graph-quick-continuation").getByRole("button").click();
        await T(page, "graph-quick-continuation")
          .locator("textarea")
          .fill("Review implicit Web inputs; do not guess assembly paths.");
        await T(page, "graph-quick-open-advanced").click();
        assert.equal(await T(page, "graph-checks-advanced").getAttribute("open"), "");
        await T(page, "graph-quick-cancel").click();
        await T(page, "graph-quick-scan").click();
        await until(
          async () =>
            (await T(page, "graph-quick-dotnet").getAttribute("data-preparation")) ===
            "unsupported",
          "retained selection",
        );
        await T(page, "graph-quick-continuation").getByRole("button").click();
        assert.match(
          await T(page, "graph-quick-continuation").locator("textarea").inputValue(),
          /do not guess/,
        );
        await setState(page, { locale: "zh-CN", theme: "zai-light" });
        await T(page, "graph-quick-scan").click();
        await until(
          async () =>
            (await T(page, "graph-quick-dotnet").getAttribute("data-preparation")) ===
            "unsupported",
          "Chinese reprepare",
        );
        await shot(page, shotsDir, "web-selected-blocker-zh", 900, 720);
        assert.equal(started(host, "graph.run").length, 0);
        assert.equal(started(host, "graph.recipes.save").length, 0);
      },
    },
    {
      name: "linked tests, copy display control, Build change and narrow scan",
      async run({ page, host, url, shotsDir }) {
        await open(page, host, url);
        await T(page, "graph-quick-group-copies").click();
        assert.match(await T(page, "graph-quick-proposal").innerText(), /4 targets; 3 shown/);
        await T(page, "graph-quick-group-copies").click();
        await selectValue(page, "graph-quick-build", "Tests/Tests.csproj");
        await until(() => T(page, "graph-quick-save").isEnabled(), "linked test prepared");
        assert.equal(await T(page, "graph-quick-test-0").getAttribute("data-state"), "checked");
        await shot(page, shotsDir, "linked-tests", 1366, 768);
        await selectValue(page, "graph-quick-build", "Library/Library.csproj");
        await until(
          async () =>
            (await T(page, "graph-quick-dotnet").getAttribute("data-preparation")) === "ready",
          "library prepared",
        );
        assert.equal(await T(page, "graph-quick-test-0").count(), 0);
        assert.equal(await T(page, "graph-quick-save").isEnabled(), false);
        assert.match(
          await T(page, "graph-quick-test-alternatives").innerText(),
          /Tests\/Tests.csproj/,
        );
        await T(page, "graph-quick-scan-root").fill("builds/0/project-0");
        assert.equal(await T(page, "graph-quick-proposal").count(), 0);
        await T(page, "graph-quick-scan").click();
        await until(() => T(page, "graph-quick-save").isEnabled(), "intentional copy target");
        assert.match(await T(page, "graph-quick-build").innerText(), /builds\/0\/project-0/);
        await T(page, "graph-quick-save").click();
        await T(page, "graph-quick-saved").waitFor();
        assert.equal(started(host, "graph.run").length, 0);
      },
    },
    {
      name: "cancelled preparation cannot overwrite a newer narrow target",
      async run({ page, host, url }) {
        await open(page, host, url);
        const original = host.bridge.projectSetup;
        let release,
          held = false;
        host.bridge.projectSetup = async (input) => {
          const result = await original(input);
          if (input.action === "scan" && input.selectedProject === "Api/Api.csproj" && !held) {
            held = true;
            await new Promise((resolve) => {
              release = resolve;
            });
          }
          return result;
        };
        try {
          await selectValue(page, "graph-quick-build", "Api/Api.csproj");
          await until(() => Boolean(release), "held old result");
          await T(page, "graph-quick-cancel").click();
          await T(page, "graph-quick-scan-root").fill("Tests");
          await T(page, "graph-quick-scan").click();
          await until(() => T(page, "graph-quick-save").isEnabled(), "new target ready");
          release();
          await page.waitForTimeout(200);
          assert.equal(
            await T(page, "graph-quick-dotnet").getAttribute("data-preparation"),
            "ready",
          );
          assert.equal(await T(page, "graph-quick-save").isEnabled(), true);
          assert.doesNotMatch(
            await T(page, "graph-quick-proposal").innerText(),
            /Microsoft.NET.Sdk.Web/,
          );
        } finally {
          release?.();
          host.bridge.projectSetup = original;
        }
      },
    },
  ],
});
