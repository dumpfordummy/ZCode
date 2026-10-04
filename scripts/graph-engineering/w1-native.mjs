// Z8.3-W1 packaged-app cases. Run through w1-suite.mjs (it sets Z1_PACKAGED_EXE to the detached, hash-verified copy).
//   --case=tool-only-support   R-2 Tool-only run (no provider) + S-1..S-4 support bundle (real Save dialog)
//   --case=n1                  N-1/N-2 automatic-request gates, Feedback absence, explicit catalog action, loopback model
import assert from "node:assert/strict";
import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { driveOsDialog } from "./ux-m2-native-common.mjs";
import {
  createW1Isolation,
  finish,
  listTree,
  packagedExe,
  sanitize,
  sha256,
} from "./w1-common.mjs";
import {
  createToolOnlyGraph,
  prepareToolFixture,
  TOOL_OUTPUT,
  WORKFLOW_CANARY,
} from "./w1-tool-graph.mjs";
import {
  allowTool,
  openToolPermission,
  waitTool,
  waitStatus,
  ledger,
  modelCount,
} from "./z4-native-helpers.mjs";
import { instruction } from "./isolation.mjs";

const arg = (name) =>
  process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
const caseName = arg("case");
const mode = arg("mode");
assert.ok(["tool-only-support", "n1"].includes(caseName), "unknown --case");

const CANARIES = [
  WORKFLOW_CANARY,
  "W1_CANARY_CREDENTIAL_b81d3c92",
  "W1_CANARY_LOG_LINE_77aa1e04",
  "W1_CANARY_SOURCE_CONTENT_0c5e9d31",
];

const exe = packagedExe();
const provider = caseName === "n1";
const isolation = await createW1Isolation({ provider });
const summary = { case: caseName, mode, assertions: [], notes: [], screenshots: [] };

async function positiveControls() {
  // The recorder must demonstrably see (a) a cleartext request and (b) an HTTPS-proxy CONNECT before a zero is trusted.
  const origin = new URL(isolation.fixture.origin);
  const startCount = isolation.fixture.requests.length;
  await fetch(`${isolation.fixture.origin}/w1-positive-control/http`);
  await new Promise((resolve) => {
    const request = http.request({
      host: origin.hostname,
      port: origin.port,
      method: "CONNECT",
      path: "w1-positive-control.invalid:443",
    });
    request.on("connect", (_response, socket) => {
      socket.destroy();
      resolve();
    });
    request.on("error", () => resolve());
    request.on("response", () => resolve());
    request.end();
  });
  await new Promise((resolve) => setTimeout(resolve, 200));
  const added = isolation.fixture.requests.slice(startCount).map((item) => item.path);
  assert.ok(
    added.some((item) => item.includes("/w1-positive-control/http")),
    "positive control (HTTP) not recorded",
  );
  assert.ok(
    added.includes("CONNECT w1-positive-control.invalid:443"),
    "positive control (CONNECT) not recorded",
  );
  summary.positiveControl = { recorded: added };
  // Control traffic is not application traffic: drop it so the application readings stay clean.
  isolation.fixture.requests.splice(startCount, added.length);
  return added;
}

async function launchAndIdentify() {
  const window = await isolation.launch();
  summary.packagedIdentity = await isolation.app.evaluate(({ app }) => ({
    name: app.getName(),
    isPackaged: app.isPackaged,
    version: app.getVersion(),
  }));
  assert.equal(summary.packagedIdentity.name, "ZCode Graph");
  assert.equal(summary.packagedIdentity.isPackaged, true);
  return window;
}

let window;
let failure;
try {
  summary.executable = { file: path.basename(exe), sha256: sha256(await readFile(exe)) };
  summary.agentBundle = {
    file: "resources/glm/zcode.cjs",
    sha256: sha256(await readFile(path.join(path.dirname(exe), "resources", "glm", "zcode.cjs"))),
  };
  await positiveControls();

  if (caseName === "tool-only-support") {
    await prepareToolFixture(isolation);
    // Canaries (synthetic, planted only inside the throw-away profile / workspace).
    const dataHome = isolation.graphProfile.env.ZCODE_DATA_BASE_DIR;
    await mkdir(path.join(dataHome, ".zcode", "v2", "logs"), { recursive: true });
    await writeFile(
      path.join(dataHome, ".zcode", "v2", "credentials.json"),
      JSON.stringify({ token: CANARIES[1] }),
    );
    await writeFile(path.join(dataHome, ".zcode", "v2", "logs", "w1.log"), `${CANARIES[2]}\n`);
    await writeFile(path.join(isolation.workspace, "canary-source.txt"), `${CANARIES[3]}\n`);
    window = await launchAndIdentify();
    const ids = await createToolOnlyGraph(window, summary);
    assert.equal(
      await window.getByTestId("graph-run-button").isDisabled(),
      false,
      "Run must be enabled for the Tool-only workflow",
    );
    const requestsBefore = modelCount(isolation);
    await window.getByTestId("graph-run-button").click();

    {
      await openToolPermission(isolation, window, summary, ids.build, "w1-build");
      assert.equal(
        modelCount(isolation),
        requestsBefore,
        "no model request before the Tool permission",
      );
      await allowTool(window);
      const built = await waitTool(
        isolation,
        ids.build,
        (attempt) => attempt.status === "Completed",
      );
      assert.equal(built.attempt.operation.processStarted, true);
      assert.equal(built.attempt.operation.result.exitCode, 0);
      assert.equal(built.attempt.verification.acceptancePassed, true);
      await waitStatus(window, isolation, "Completed");
      const receipt = JSON.parse(
        await readFile(path.join(isolation.workspace, TOOL_OUTPUT), "utf8"),
      );
      assert.equal(receipt.ran, true);
      assert.equal(
        receipt.operationId,
        built.attempt.operationId,
        "the fixture output belongs to this exact native operation",
      );
      assert.equal(modelCount(isolation), 0);
      assert.equal((await ledger(isolation)).length, 0);
      summary.toolRun = {
        runStatus: "Completed",
        operationStatus: built.attempt.operation.status,
        exitCode: built.attempt.operation.result.exitCode,
        processStarted: built.attempt.operation.processStarted,
        acceptancePassed: built.attempt.verification.acceptancePassed,
        modelRequests: modelCount(isolation),
        agentInputs: 0,
      };
      summary.assertions.push(
        "Tool-only Graph workflow executed a real native recipe process (real permission, real session, zero model requests).",
      );

      await supportBundleFlow();
    }
  }

  if (caseName === "n1") await n1Flow();
} catch (error) {
  failure = error;
}

async function supportBundleFlow() {
  const requestsBefore = isolation.fixture.requests.length;
  const home = isolation.shellHome ?? path.join(isolation.home, "home");
  const folders = ["Desktop", "Documents", "Downloads"].map((name) => path.join(home, name));
  const treeBefore = await Promise.all(folders.map(listTree));

  // The Help menu lives in the workspace header; leave the Graph panel first.
  const back = window.getByRole("button", { name: "Back to chat", exact: true });
  if (await back.isVisible()) await back.click();
  await window.getByTestId("workspace-help-menu-trigger").first().click();
  const menu = window.locator('[role="menu"]');
  await menu.waitFor();
  summary.helpMenu = (await menu.locator('[role="menuitem"]').allInnerTexts()).map((text) =>
    text.trim(),
  );
  assert.equal(
    summary.helpMenu.some((text) =>
      /feedback|report.*(issue|bug)|feature request|submit/i.test(text),
    ),
    false,
    `Feedback entry visible: ${summary.helpMenu}`,
  );
  await window.getByTestId("graph-support-bundle-menu-item").click();
  const dialog = window.getByTestId("graph-support-bundle-dialog");
  await dialog.waitFor();
  await window.getByTestId("graph-support-bundle-preview").waitFor({ timeout: 30000 });
  // The menu content unmounts after its exit animation; wait for that, then record how long it took.
  const menuClosedAt = Date.now();
  await window
    .waitForFunction(() => document.querySelectorAll('[role="menu"]').length === 0, undefined, {
      timeout: 8000,
    })
    .catch(() => {});
  summary.menuStillPresentMsAfterDialog = Date.now() - menuClosedAt;
  assert.equal(await menu.count(), 0, "the Help menu closed");
  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert.equal(await dialog.isVisible(), true, "the dialog stays open after the menu closed");
  const preview = await window.getByTestId("graph-support-bundle-preview").textContent();
  const sizeText = await window.getByTestId("graph-support-bundle-size").innerText();
  const sections = await window
    .getByTestId("graph-support-bundle-sections")
    .locator("li")
    .allInnerTexts();
  const displayed = Number(/(\d[\d,]*)/.exec(sizeText)?.[1].replaceAll(",", ""));
  const previewBytes = Buffer.from(preview, "utf8");
  assert.ok(sections.length >= 5, `included categories render: ${sections.length}`);
  assert.equal(
    displayed,
    previewBytes.length,
    "displayed byte count equals the UTF-8 length of the preview",
  );
  const parsed = JSON.parse(preview);
  assert.equal(parsed.schema, "zcode.graph.support-bundle");
  summary.support = {
    sections,
    displayedBytes: displayed,
    previewBytes: previewBytes.length,
    previewSha256: sha256(previewBytes),
    schemaVersion: parsed.schemaVersion,
  };
  await window.screenshot({ path: path.join(isolation.home, "w1-support-dialog.png") });
  summary.screenshots.push(path.join(isolation.home, "w1-support-dialog.png"));

  // Cancel the REAL Save dialog: nothing is written.
  await window.getByTestId("graph-support-bundle-save").click();
  summary.cancelDialog = await driveOsDialog(isolation, "cancel");
  assert.equal(summary.cancelDialog.ok, true);
  await window.waitForFunction(
    () => !document.querySelector('[data-testid="graph-support-bundle-save"]')?.disabled,
    undefined,
    { timeout: 15000 },
  );
  assert.equal(
    await window.getByTestId("graph-support-bundle-saved").count(),
    0,
    "cancel shows no saved confirmation",
  );
  const treeAfterCancel = await Promise.all(folders.map(listTree));
  assert.deepEqual(treeAfterCancel, treeBefore, "cancel wrote nothing");
  summary.assertions.push(
    "Cancelling the real OS Save dialog left no file and no saved confirmation.",
  );

  // Save through the REAL Save dialog.
  const destination = path.join(home, "Documents", "w1-support-bundle.json");
  await window.getByTestId("graph-support-bundle-save").click();
  summary.saveDialog = await driveOsDialog(isolation, "select", destination);
  assert.equal(summary.saveDialog.ok, true);
  await window.getByTestId("graph-support-bundle-saved").waitFor({ timeout: 20000 });
  // Z8.4-I1：在来宾里，真实保存对话框接受了输入的路径，但应用报告的保存位置是对话框默认文件夹里的默认文件名。
  // 已安装模式下读取应用自己报告的路径，并如实记录两者不同；其余模式仍要求落在输入的路径。
  let savedPath = destination;
  if (isolation.installedProfile) {
    const reported = /Saved to\s+(.+)/
      .exec(await window.getByTestId("graph-support-bundle-saved").innerText())?.[1]
      ?.trim();
    summary.saveDialog.reportedPath = reported;
    if (reported && reported !== destination) {
      summary.notes.push(
        "The OS dialog accepted the typed destination, but the app reported a different saved path; the reported path was read.",
      );
      savedPath = reported;
    }
  }
  const saved = await readFile(savedPath);
  assert.equal(saved.length, displayed, "saved byte length equals the displayed byte count");
  assert.ok(saved.equals(previewBytes), "saved bytes equal the previewed payload exactly");
  summary.support.savedBytes = saved.length;
  summary.support.savedSha256 = sha256(saved);
  summary.assertions.push(
    "The real OS Save dialog wrote exactly the previewed UTF-8 bytes; the displayed count equals the file length.",
  );

  // Canaries and original paths must be absent from the saved bytes.
  const text = saved.toString("utf8");
  const needles = [
    ...CANARIES,
    isolation.home,
    isolation.workspace,
    path.dirname(exe),
    isolation.home.replaceAll("\\", "/"),
    isolation.workspace.replaceAll("\\", "/"),
    isolation.home.replaceAll("\\", "\\\\"),
    isolation.workspace.replaceAll("\\", "\\\\"),
    "AppData",
    "credentials",
  ];
  const leaked = needles.filter((needle) => text.includes(needle));
  summary.support.scan = {
    needlesChecked: needles.length,
    leaked: leaked.map((item) => sanitize(item, isolation)),
  };
  assert.deepEqual(leaked, [], "no canary or original path in the saved bundle");
  assert.equal(
    (text.match(/[A-Za-z]:[\\/]/g) ?? []).length,
    0,
    "no drive-letter path in the bundle",
  );
  await window.screenshot({ path: path.join(isolation.home, "w1-support-saved.png") });
  summary.screenshots.push(path.join(isolation.home, "w1-support-saved.png"));

  const added = isolation.fixture.requests.slice(requestsBefore);
  summary.support.requestsDuringGenerationAndSave = added.map((item) => item.path);
  assert.deepEqual(
    added,
    [],
    "generation and saving triggered no request at all (so no Feedback upload)",
  );
  summary.assertions.push(
    "Generation and saving produced no recorded request (recorder positive control passed at start).",
  );
  await window.keyboard.press("Escape");
}

async function n1Flow() {
  const quiet = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  window = await launchAndIdentify();
  // --idle-seconds=70 also spans the 60 s background check of the built-in catalog (default keeps the case short).
  await quiet(Number(arg("idle-seconds") ?? 6) * 1000);
  const stages = (summary.stages = {});
  const mark = (name) => (stages[name] = isolation.fixture.requests.map((item) => item.path));
  mark("coldStart");
  // Help menu and Feedback entry points.
  await window.getByTestId("workspace-help-menu-trigger").first().click();
  const menu = window.locator('[role="menu"]');
  await menu.waitFor();
  summary.helpMenu = (await menu.locator('[role="menuitem"]').allInnerTexts()).map((text) =>
    text.trim(),
  );
  assert.equal(
    summary.helpMenu.some((text) =>
      /feedback|report.*(issue|bug)|feature request|submit/i.test(text),
    ),
    false,
    `Feedback entry visible: ${summary.helpMenu}`,
  );
  await window.keyboard.press("Escape");
  await quiet(1500);
  mark("helpMenu");
  // Plugin Store: open settings -> plugins -> browse store.
  await window.getByTestId("task-settings-button").first().click();
  await window.getByTestId("settings-page").waitFor();
  await window.getByTestId("settings-page").getByText("Plugins", { exact: true }).first().click();
  await window.getByTestId("plugin-store-browse").click();
  await window.getByTestId("plugin-store-refresh").waitFor();
  await quiet(4000);
  mark("pluginStoreOpened");
  const automatic = isolation.fixture.requests.filter(
    (item) => !item.path.startsWith("/w1-positive-control"),
  );
  summary.automaticRequests = automatic.map((item) => ({
    method: item.method ?? "HTTP",
    path: item.path,
    userAgent: item.userAgent,
    client: item.client,
  }));
  const covered = automatic.filter((item) =>
    /\/api\/v1\/client\/(configs|scenes)|builtin|marketplace|catalog|provider-config/i.test(
      item.path,
    ),
  );
  // Keep going after a violation so that the explicit-action and model-traffic evidence is still collected.
  summary.violations = covered.map((item) => ({
    path: item.path,
    userAgent: item.userAgent,
    at: item.at,
    client: item.client,
  }));
  if (!covered.length)
    summary.assertions.push(
      "Cold start, Help menu and Plugin Store entry produced no covered automatic config/catalog request; Feedback entries are absent from the Help menu.",
    );
  // Explicit catalog action (separately): the Plugin Store refresh button.
  const beforeExplicit = isolation.fixture.requests.length;
  await window.getByTestId("plugin-store-refresh").click();
  await quiet(6000);
  const explicit = isolation.fixture.requests.slice(beforeExplicit);
  summary.explicitCatalogRequests = explicit.map((item) => ({
    method: item.method ?? "HTTP",
    path: item.path,
  }));
  summary.notes.push(
    explicit.length
      ? "The explicit refresh reached the loopback recorder."
      : "The explicit refresh produced no request that the recorder can observe (UNVERIFIED for this action).",
  );
  // User-selected loopback model traffic: ordinary chat.
  await window.getByText("New task", { exact: true }).first().click();
  const composer = window.getByTestId("v4-composer-input");
  await composer.waitFor({ timeout: 30000 });
  const modelBefore = modelCount(isolation);
  await composer.fill(instruction);
  await window.getByTestId("v4-composer-send").click();
  await window.waitForFunction(
    () =>
      document.querySelector('[data-permission-option-kind="allowOnce"]') ||
      document.body.innerText.includes("Allow"),
    undefined,
    { timeout: 60000 },
  );
  assert.ok(
    modelCount(isolation) > modelBefore,
    "the user-selected loopback model endpoint received chat traffic",
  );
  summary.modelRequestsAfterChat = modelCount(isolation) - modelBefore;
  summary.assertions.push(
    "User-selected loopback model traffic still reaches the fixture (chat request recorded).",
  );
  assert.deepEqual(
    summary.violations,
    [],
    "covered automatic config/catalog requests stay blocked",
  );
}

await finish(isolation, summary, window, failure);
