import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { root } from "./isolation.mjs";
import { readGraphRecord } from "./z2-native-helpers.mjs";
import { assertU2Profile, u2Sha256 } from "./pre-z8-u2-fixture.mjs";
import { assertU2NoModels } from "./pre-z8-u2-proof.mjs";
import { captureNativeCheckpoint, openU2Details, U2_DIRTY_DESIGN } from "./pre-z8-u2-ui.mjs";

async function selectWorkspace(window, workspace) {
  const item = window.getByTestId(`workspace-item-${workspace}`);
  await item.waitFor();
  // 同一窗口公开侧栏的展开事件承担 workspace 导航；不调用私有 React 或另建 Host。
  if ((await item.getAttribute("aria-expanded")) === "true") await item.click();
  await item.click();
  if (!(await window.getByTestId("graph-engineering-panel").isVisible()))
    await window.getByTestId("graph-engineering-open").click();
  await window.waitForFunction(
    (expected) =>
      document.querySelector('[data-testid="graph-workspace"]')?.textContent === expected,
    workspace,
  );
}

export async function verifyU2ScanSelection(isolation, window, summary) {
  const home = await assertU2Profile(isolation);
  const secondary = path.join(home, "workspace-u2-scan");
  assert.equal(path.dirname(secondary), home);
  await mkdir(secondary);
  const files = {
    ".env": "",
    "AGENTS.md":
      "Inert pre-Z8 U2 metadata fixture. Never restore, build, test, call a model or execute this workspace. Metadata scan and manual UI selection only.\n",
    "Safe.Tests.csproj":
      '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework><IsTestProject>true</IsTestProject></PropertyGroup><ItemGroup><PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.11.1" /><Compile Include="Safe.cs" /></ItemGroup></Project>\n',
    "Other.csproj":
      '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework><IsTestProject>false</IsTestProject></PropertyGroup></Project>\n',
    "Safe.cs": "// Inert discovery metadata fixture; never compiled or executed.\n",
  };
  for (const [file, content] of Object.entries(files))
    await writeFile(path.join(secondary, file), content, { flag: "wx" });
  assert.equal(await realpath(secondary), secondary);
  await promisify(execFile)("git", ["-c", "init.templateDir=", "init", "--quiet", secondary], {
    env: isolation.env,
    windowsHide: true,
  });
  const before = await readGraphRecord(isolation);
  const args = [
    path.join(root, "scripts/graph-engineering/native-bootstrap.cjs"),
    "--open-workspace",
    secondary,
  ];
  const opened = await promisify(execFile)(
    path.join(root, "node_modules/electron/dist/electron.exe"),
    args,
    {
      env: isolation.env,
      cwd: root,
      windowsHide: true,
      timeout: 30000,
    },
  );
  summary.scanOnlyWorkspace = {
    path: secondary,
    publicEntry: args,
    stdout: opened.stdout,
    stderr: opened.stderr,
    sourceFiles: Object.entries(files).map(([file, content]) => ({
      file,
      sha256: u2Sha256(content),
    })),
    execution: "NOT RUN: inert metadata fixture",
  };
  await selectWorkspace(window, secondary);
  await window.getByTestId("graph-view-setup").click();
  await window.getByTestId("graph-project-scan").click();
  await window.locator('[data-testid="graph-project-discovery"][data-state="complete"]').waitFor();
  assert.equal(await window.getByTestId("graph-project-candidate").count(), 2);
  await openU2Details(window.getByTestId("graph-dotnet-preset"));
  assert.equal(await window.getByTestId("graph-dotnet-build-project").inputValue(), "");
  const candidate = window.locator(
    '[data-testid="graph-project-candidate"][data-path="Safe.Tests.csproj"]',
  );
  assert.match(await candidate.innerText(), /vstest.*review-required/is);
  assert.equal(await candidate.getByTestId("graph-project-use-build").isEnabled(), true);
  await candidate.getByTestId("graph-project-use-build").click();
  await candidate.getByRole("combobox").click();
  await window.getByRole("option", { name: "net8.0", exact: true }).click();
  await candidate.getByTestId("graph-project-add-test").click();
  assert.equal(
    await window.getByTestId("graph-dotnet-build-project").inputValue(),
    "Safe.Tests.csproj",
  );
  assert.equal(
    await window.getByTestId("graph-dotnet-test-project-0").inputValue(),
    "Safe.Tests.csproj",
  );
  assert.equal(await window.getByTestId("graph-dotnet-test-framework-0").inputValue(), "net8.0");
  assert.equal(await window.getByTestId("graph-dotnet-review-manifest").isChecked(), false);
  assert.equal(await window.getByTestId("graph-dotnet-generate").isDisabled(), true);
  const secondaryRecord = await readGraphRecord({ ...isolation, workspace: secondary }).catch(
    (error) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    },
  );
  assert.equal(secondaryRecord?.runs.length ?? 0, 0);
  const hasConfiguration = await lstat(path.join(secondary, ".zcode/config.json")).then(
    () => true,
    (error) => {
      if (error.code === "ENOENT") return false;
      throw error;
    },
  );
  assert.equal(hasConfiguration, false, "Discovery/selection must not save a profile.");
  for (const [file, content] of Object.entries(files))
    assert.equal(await readFile(path.join(secondary, file), "utf8"), content);
  await assertU2NoModels(isolation, "inert workspace scan/selection");
  await captureNativeCheckpoint(
    isolation,
    window,
    summary,
    "pre-z8-u2-safe-scan-selection",
    [1920, 1080],
  );
  await selectWorkspace(window, isolation.workspace);
  await window.getByTestId("graph-view-design").click();
  assert.equal(await window.getByTestId("graph-name").inputValue(), U2_DIRTY_DESIGN);
  assert.deepEqual(await readGraphRecord(isolation), before);
  summary.assertions.push(
    "Inert secondary workspace exposes both safe candidates and explicit project/framework selection without saving checks or executing; primary design/history remain unchanged on return.",
  );
}
