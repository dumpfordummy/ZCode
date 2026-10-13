import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runUxBrowserSuite } from "./ux-browser-runner.mjs";
import { boot, chooseGeneric, T, until, setState, started, selectValue } from "./ux-m1-helpers.mjs";
import {
  ProjectScanJob,
  metadataName,
} from "../../packages/services/src/graph-engineering/adapters/project-scan-job.ts";
import { prepareProjectScope } from "../../packages/services/src/graph-engineering/adapters/project-scope.ts";

const sizes = [
  [1366, 768],
  [1600, 900],
  [1093, 614],
];
async function capture(page, directory, name, size) {
  if (!directory) return;
  await page.setViewportSize({ width: size[0], height: size[1] });
  if (name.startsWith("guided-draft"))
    await T(page, "graph-quick-continuation").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(directory, `${name}-${size.join("x")}.png`) });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
}
async function project(host, conditional = false) {
  const root = host.workspaces.A;
  await mkdir(path.join(root, "Tests"), { recursive: true });
  await writeFile(
    path.join(root, "Tests/Tests.csproj"),
    `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup><Import Project="../inputs.props"${conditional ? ` Condition="'$(Configuration)' == 'Debug'"` : ""}/><ItemGroup><PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.11.1"/></ItemGroup></Project>`,
  );
  await writeFile(
    path.join(root, "inputs.props"),
    '<Project><ItemGroup><Content Include="value.txt" CopyToOutputDirectory="Always"/></ItemGroup></Project>',
  );
  await writeFile(path.join(root, "Tests/value.txt"), "expected");
}
async function open(page, host, url) {
  await boot(page, host, url);
  await chooseGeneric(page);
  await T(page, "graph-template-parameter-request").fill("U4 synthetic request retained");
  await T(page, "graph-template-setup-checks").click();
}
const scenarios = [
  {
    name: "legacy Content blocker rendered through current components",
    async run({ page, host, url, shotsDir }) {
      await project(host);
      await writeFile(
        path.join(host.workspaces.A, "Tests/Tests.csproj"),
        '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup><ItemGroup><Content Include="value.txt" CopyToOutputDirectory="Always"/><PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.11.1"/></ItemGroup></Project>',
      );
      const original = host.bridge.projectSetup;
      host.bridge.projectSetup = async (input) => {
        if (input.action !== "scan") return original(input);
        const job = new ProjectScanJob(input.target, input.requestId, undefined, 1);
        try {
          if (input.selectedProject) await prepareProjectScope(job, input.selectedProject);
          else
            await job.walk(
              "",
              async (p) => {
                if (metadataName.test(p.split("/").at(-1))) await job.metadata(p);
              },
              false,
            );
        } catch (error) {
          job.issue(error.message);
        }
        return job.finish();
      };
      try {
        await open(page, host, url);
        await T(page, "graph-quick-scan").click();
        await until(
          async () =>
            (await T(page, "graph-quick-dotnet").getAttribute("data-preparation")) ===
            "unsupported",
          "legacy rejection",
        );
        assert.match(
          await T(page, "graph-quick-proposal").innerText(),
          /Quick cannot derive source scope for Content/,
        );
        await capture(page, shotsDir, "legacy-content-blocker", sizes[0]);
      } finally {
        host.bridge.projectSetup = original;
      }
    },
  },
  {
    name: "declarative Content import Release selection Save and reopen without execution",
    async run({ page, host, url, shotsDir }) {
      await project(host);
      await open(page, host, url);
      await T(page, "graph-quick-scan").click();
      await until(() => T(page, "graph-quick-save").isEnabled(), "supported preparation");
      await selectValue(page, "graph-quick-configuration", "Release");
      await until(() => T(page, "graph-quick-save").isEnabled(), "Release preparation");
      for (const size of sizes) await capture(page, shotsDir, "content-import-ready", size);
      await T(page, "graph-quick-save").click();
      await T(page, "graph-quick-saved").waitFor();
      assert.equal(started(host, "graph.run").length, 0);
      assert.equal(started(host, "prepare-checks").length, 0);
      await capture(page, shotsDir, "saved", sizes[1]);
      await T(page, "graph-return-to-workflow").click();
      assert.equal(
        await T(page, "graph-template-parameter-request").inputValue(),
        "U4 synthetic request retained",
      );
      await T(page, "graph-template-setup-checks").click();
      await capture(page, shotsDir, "reopened", sizes[2]);
    },
  },
  {
    name: "selected conditional import failure and guided draft preserve choices",
    async run({ page, host, url, shotsDir }) {
      await project(host, true);
      await open(page, host, url);
      await T(page, "graph-quick-scan").click();
      await until(
        async () =>
          (await T(page, "graph-quick-dotnet").getAttribute("data-preparation")) === "unsupported",
        "conditional blocker",
      );
      assert.equal(await T(page, "graph-quick-save").isEnabled(), false);
      const text = await T(page, "graph-quick-proposal").innerText();
      assert.match(text, /conditional import/);
      assert.doesNotMatch(text, /Prepare the selected Build target/);
      await capture(page, shotsDir, "selected-import-failure", sizes[0]);
      await T(page, "graph-quick-continuation").getByRole("button").click();
      await T(page, "graph-quick-continuation")
        .locator("textarea")
        .fill("Need a complete reviewed import/input manifest.");
      await capture(page, shotsDir, "guided-draft", sizes[1]);
      await T(page, "graph-quick-cancel").click();
      await T(page, "graph-quick-scan").click();
      await until(
        async () =>
          (await T(page, "graph-quick-dotnet").getAttribute("data-preparation")) === "unsupported",
        "retained draft preparation",
      );
      await T(page, "graph-quick-continuation").getByRole("button").click();
      assert.equal(
        await T(page, "graph-quick-continuation").locator("textarea").inputValue(),
        "Need a complete reviewed import/input manifest.",
      );
      await setState(page, { locale: "zh-CN", theme: "zai-light" });
      await T(page, "graph-quick-scan").click();
      await until(
        async () =>
          (await T(page, "graph-quick-dotnet").getAttribute("data-preparation")) === "unsupported",
        "Chinese selected target blocker",
      );
      await T(page, "graph-quick-continuation").getByRole("button").click();
      await capture(page, shotsDir, "guided-draft-zh", sizes[2]);
      assert.equal(started(host, "graph.run").length, 0);
      assert.equal(started(host, "graph.recipes.save").length, 0);
    },
  },
];
await runUxBrowserSuite({ suite: "Z8.5-U4 declarative/guided setup", scenarios });
