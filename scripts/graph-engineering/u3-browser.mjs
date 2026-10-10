import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runUxBrowserSuite } from "./ux-browser-runner.mjs";
import { baselineSource } from "./u1-baseline.mjs";
import { boot, chooseGeneric, T, until, setState, started, selectValue } from "./ux-m1-helpers.mjs";
import {
  largeProjectFixture,
  literalProject,
} from "../../packages/services/src/graph-engineering/adapters/project-large.fixture.ts";

const baseline = process.env.U3_BASELINE === "1";
const sizes = [
  [1366, 768],
  [1600, 900],
  [1093, 614],
];
async function capture(page, directory, name, size) {
  if (!directory) return;
  await page.setViewportSize({ width: size[0], height: size[1] });
  await page.screenshot({ path: path.join(directory, `${name}-${size.join("x")}.png`) });
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "No horizontal document overflow",
  );
}
const scenarios = [
  {
    name: "Advanced border ownership, keyboard disclosure, English/Chinese and light/dark",
    async run({ page, host, url, shotsDir }) {
      await boot(page, host, url);
      await chooseGeneric(page);
      for (const [index, [locale, theme]] of [
        ["en", "zai-dark"],
        ["zh-CN", "zai-light"],
      ].entries()) {
        await setState(page, { locale, theme });
        const disclosure = T(page, "graph-context-advanced");
        const summary = disclosure.locator(":scope > summary");
        await summary.scrollIntoViewIfNeeded();
        await summary.focus();
        assert.equal(await summary.evaluate((element) => element === document.activeElement), true);
        const border = await disclosure.evaluate(
          (element) => getComputedStyle(element).borderBottomWidth,
        );
        assert.equal(border, baseline ? "1px" : "0px");
        await capture(
          page,
          shotsDir,
          `${baseline ? "before" : "after"}-advanced-closed-${locale}`,
          sizes[index],
        );
        await summary.press("Enter");
        assert.equal(await disclosure.getAttribute("open"), "");
        await capture(
          page,
          shotsDir,
          `${baseline ? "before" : "after"}-advanced-open-${locale}`,
          sizes[2],
        );
        await summary.press("Space");
        assert.equal(await disclosure.getAttribute("open"), null);
      }
    },
  },
  ...(!baseline
    ? [
        {
          name: "large supported solution selection stays compact, responsive and Save-only",
          async run({ page, host, url, shotsDir }) {
            const workload = await largeProjectFixture(host.workspaces.A);
            assert.ok(workload.solutionBytes > 256 * 1024);
            await boot(page, host, url);
            await chooseGeneric(page);
            await T(page, "graph-template-setup-checks").click();
            await T(page, "graph-quick-scan").click();
            await T(page, "graph-quick-dotnet").locator('[role="status"]').first().waitFor();
            await capture(page, shotsDir, "large-progress", sizes[0]);
            const cancelledAt = performance.now();
            await T(page, "graph-quick-cancel").click();
            await until(
              async () => (await T(page, "graph-quick-proposal").count()) === 0,
              "cancelled proposal cleared",
            );
            console.log(JSON.stringify({ cancelUiMs: performance.now() - cancelledAt }));
            assert.equal(started(host, "graph.recipes.save").length, 0);
            await T(page, "graph-quick-scan").click();
            await until(
              () => T(page, "graph-quick-save").isEnabled(),
              "5,101 input preparation",
              90000,
            );
            assert.match(await T(page, "graph-quick-proposal").innerText(), /5,?101/);
            assert.ok((await page.locator("input").count()) < 100);
            for (const size of sizes) await capture(page, shotsDir, "large-selection", size);
            await T(page, "graph-quick-save").click();
            await T(page, "graph-quick-saved").waitFor();
            const saved = await host.readRecipes("A");
            assert.equal(saved.recipes[0].sourceScope.sourceCount, 5101);
            assert.equal(started(host, "graph.run").length, 0);
            assert.equal(started(host, "prepare-checks").length, 0);
          },
        },
        {
          name: "partial inventory retains an independently complete subtree and bounded details",
          async run({ page, host, url, shotsDir }) {
            const root = host.workspaces.A;
            await mkdir(path.join(root, "good"));
            await mkdir(path.join(root, "bad"));
            await writeFile(
              path.join(root, "good/Tests.csproj"),
              literalProject(
                '<PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.11.1" />',
              ),
            );
            await writeFile(path.join(root, "bad/Huge.sln"), "x".repeat(4 * 1024 * 1024 + 1));
            await writeFile(
              path.join(root, "bad/Web.csproj"),
              literalProject().replace("Microsoft.NET.Sdk", "Microsoft.NET.Sdk.Web"),
            );
            await boot(page, host, url);
            await chooseGeneric(page);
            await T(page, "graph-template-setup-checks").click();
            await T(page, "graph-quick-scan").click();
            await T(page, "graph-quick-proposal").waitFor();
            await selectValue(page, "graph-quick-build", "good/Tests.csproj");
            await until(
              () => T(page, "graph-quick-save").isEnabled(),
              "independent complete subtree",
            );
            assert.match(await T(page, "graph-quick-proposal").innerText(), /incomplete/i);
            await capture(page, shotsDir, "partial-independent", sizes[0]);
            await T(page, "graph-quick-details").locator(":scope > summary").click();
            assert.ok((await T(page, "graph-quick-details").locator("li").count()) <= 20);
            await capture(page, shotsDir, "partial-details", sizes[1]);
            await selectValue(page, "graph-quick-build", "bad/Web.csproj");
            await until(
              async () =>
                /Microsoft.NET.Sdk/.test(await T(page, "graph-quick-proposal").innerText()),
              "selected unsupported cause",
            );
            assert.equal(await T(page, "graph-quick-save").isDisabled(), true);
            await capture(page, shotsDir, "unsupported-selected", sizes[2]);
          },
        },
      ]
    : []),
];
await runUxBrowserSuite({
  suite: "Z8.5-U3 large repositories",
  scenarios,
  sourceRoot: baseline
    ? await baselineSource("90eebe6d34ab8dea2ffce14db590aff7b7573f39")
    : undefined,
});
