import assert from "node:assert/strict";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { runUxBrowserSuite } from "./ux-browser-runner.mjs";
import { boot, chooseGeneric, T, until } from "./ux-m1-helpers.mjs";
import { prepareWebProfileInputs } from "../../packages/services/src/graph-engineering/adapters/web-profile-inputs.ts";
const home = process.env.F1_WEB_NATIVE_HOME;
assert.ok(home, "Explicit successful synthetic native fixture required");
const source = JSON.parse(
  await readFile(
    path.join(home, process.env.F1_WEB_NATIVE_SUMMARY ?? "f1-web-native-summary.json"),
    "utf8",
  ),
);
assert.equal(source.status, "PASS");
const workspace = path.join(home, "workspace");
const root = path.join(home, "data/.zcode/v2/graph-engineering/graph-web-profile-v1");
const partition = (await readdir(root))[0];
const filename = (await readdir(path.join(root, partition))).find((n) => n.endsWith(".json"));
const proof = JSON.parse(await readFile(path.join(root, partition, filename), "utf8"));
const membership = await prepareWebProfileInputs(
  { workspacePath: workspace },
  {
    webProject: proof.scope.webProject,
    testProject: proof.scope.project,
    configuration: proof.scope.configuration,
  },
);
assert.equal(membership.membershipDigest, proof.scope.membershipDigest);
assert.equal(membership.sourcePaths.length, proof.scope.sourceCount);
const runtime = proof.scope.runtimeProfile;
const substitutions = [
  [workspace, "C:/Synthetic/Web"],
  [runtime.packageRoot, "C:/Synthetic/PublicPackages"],
  [path.dirname(runtime.executable), "C:/Synthetic/dotnet"],
];
function sanitize(value) {
  if (typeof value === "string") {
    let text = value.replaceAll("\\", "/");
    for (const [from, to] of substitutions) text = text.replaceAll(from.replaceAll("\\", "/"), to);
    return text;
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitize(item)]));
  return value;
}
const safe = sanitize(proof),
  baseRows = sanitize(
    source.history.filter((r) => r.status === "succeeded" && r.selection.webProfile),
  );
assert.equal(baseRows.length, 2);
const originals = new WeakMap();
await runUxBrowserSuite({
  suite:
    "F1 Web bilingual component gallery: controlled visual observations and persistence, NOT native acceptance",
  scenarios: ["en-US", "zh-CN"].map((locale) => ({
    name: "supported Web profile review and reopen " + locale,
    async run({ page, host, url, shotsDir }) {
      const original = originals.get(host) ?? {
        setup: host.bridge.projectSetup,
        recipes: host.bridge.recipes,
      };
      originals.set(host, original);
      let rows = structuredClone(baseRows).map((row) => ({
        ...row,
        status: "review-ready",
        projection: undefined,
        reserved: false,
      }));
      let stored = [],
        digest = "empty",
        verificationHeld = true;
      const commands = [];
      for (const [name, text] of Object.entries({
        "Web/Web.csproj":
          '<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>',
        "Tests/Tests.csproj":
          '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework><IsTestProject>true</IsTestProject></PropertyGroup><ItemGroup><ProjectReference Include="../Web/Web.csproj"/></ItemGroup></Project>',
        "Other/Other.csproj":
          '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework><IsTestProject>true</IsTestProject></PropertyGroup></Project>',
      })) {
        const file = path.join(host.workspaces.A, name);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, text);
      }
      host.bridge.recipes = async (params) => {
        if (params.action === "save") {
          stored = structuredClone(params.recipes);
          digest = createHash("sha256").update(JSON.stringify(stored)).digest("hex");
        }
        return { recipes: structuredClone(stored), digest, sourcePath: ".zcode/config.json" };
      };
      host.bridge.projectSetup = async (input) => {
        if (input.action === "inspection-history")
          return { kind: "inspection-history", records: structuredClone(rows) };
        if (input.action === "web-profile-choices")
          return {
            kind: "web-profile-choices",
            tests: ["Tests/Tests.csproj"],
            issues: ["Other/Other.csproj: not in the completed matching closure"],
          };
        if (input.action === "inspection") {
          commands.push(input.command.action);
          const row = rows.find(
            (row) =>
              row.id === input.command.id ||
              row.selection.project === input.command.selection?.project,
          );
          assert.ok(row);
          if (input.command.action === "review")
            Object.assign(row, { status: "review-ready", reserved: false });
          else if (input.command.action === "start")
            Object.assign(row, { status: "verifying-sources", reserved: true });
          else if (input.command.action === "status" && !verificationHeld)
            Object.assign(
              row,
              baseRows.find((item) => item.id === row.id),
              { status: "succeeded", reserved: false },
            );
          else if (input.command.action === "cancel")
            Object.assign(row, { status: "cancelled", reserved: false });
          return structuredClone(row);
        }
        if (input.action === "prepare-web-profile")
          return {
            kind: "web-profile-proposal",
            scope: safe.scope,
            recipes: safe.recipes,
            sourcePaths: membership.sourcePaths,
            excludedOutputRoots: membership.excludedOutputRoots,
            facts: ["Controlled gallery using the successful synthetic native profile shape"],
          };
        return original.setup(input);
      };
      await page.setViewportSize({ width: 1366, height: 1400 });
      await boot(page, host, url, { locale, theme: "zai-light" });
      await chooseGeneric(page);
      await T(page, "graph-template-setup-checks").click();
      await T(page, "graph-quick-scan").click();
      await T(page, "graph-quick-build").click();
      await page.locator('[role="option"][data-value="Web/Web.csproj"]').click();
      const panel = T(page, "graph-web-profile");
      await panel.getByTestId("graph-web-find").click();
      await until(
        async () => await panel.getByTestId("graph-web-role-web").count(),
        "matching profile",
      );
      const capture = async (name, target = panel) => {
        if (shotsDir) {
          await target.scrollIntoViewIfNeeded();
          await target.screenshot({ path: path.join(shotsDir, `${name}-${locale}.png`) });
        }
      };
      const choices = panel.getByRole("combobox").first();
      await choices.click();
      assert.equal(
        await page.locator('[role="option"][data-value="Other/Other.csproj"]').count(),
        0,
      );
      await page.locator('[role="option"][data-value="Tests/Tests.csproj"]').click();
      const openReview = panel.locator("details[open]").first();
      if (await openReview.count()) await openReview.locator(":scope > summary").click();
      await capture("matching-test-exclusion");
      let inspection = panel.getByTestId("graph-project-inspection");
      await until(
        async () => (await inspection.getAttribute("data-status")) === "review-ready",
        "controlled reviewed request",
      );
      await inspection
        .getByRole("button")
        .filter({
          hasText:
            locale === "en-US"
              ? /^Confirm inspection and request native permission$/
              : /^确认检查并请求原生权限$/,
        })
        .click();
      await until(
        async () => (await inspection.getAttribute("data-status")) === "verifying-sources",
        "verification progress",
      );
      assert.equal(
        await inspection.getByTestId("graph-inspection-permission-instruction").count(),
        0,
      );
      await capture("source-verification-progress");
      verificationHeld = false;
      await until(
        async () => (await inspection.getAttribute("data-status")) === "succeeded",
        "controlled Web success",
      );
      await panel.getByTestId("graph-web-role-test").click();
      inspection = panel.getByTestId("graph-project-inspection");
      await until(
        async () => (await inspection.getAttribute("data-status")) === "review-ready",
        "controlled Test review",
      );
      await inspection
        .getByRole("button")
        .filter({
          hasText:
            locale === "en-US"
              ? /^Confirm inspection and request native permission$/
              : /^确认检查并请求原生权限$/,
        })
        .click();
      await until(
        async () => (await inspection.getAttribute("data-status")) === "succeeded",
        "controlled Test success",
      );
      await panel.getByTestId("graph-web-prepare").click();
      await panel.getByTestId("graph-web-proposal").waitFor();
      await capture("supported-profile-proposal");
      await panel.getByTestId("graph-web-save").click();
      await until(async () => stored.length === 2, "controlled save");
      await page.reload();
      await page.waitForFunction(() => window.__harness?.ready);
      await page.evaluate((locale) => window.__harness.set({ locale }), locale);
      await T(page, "graph-view-setup").click();
      await T(page, "graph-recipe-list").waitFor();
      assert.equal(await T(page, "graph-recipe-row").count(), 2);
      await capture("saved-reopened-profile", T(page, "graph-recipe-list"));
      assert.equal(commands.filter((c) => c === "start").length, 2);
      assert.equal(host.calls.filter((c) => c.op === "graph.run" && c.phase === "start").length, 0);
      host.bridge.projectSetup = original.setup;
      host.bridge.recipes = original.recipes;
    },
  })),
});
