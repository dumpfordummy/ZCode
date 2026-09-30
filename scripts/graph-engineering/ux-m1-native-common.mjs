// UX-M1.4 native acceptance: shared driver pieces. Real Electron app, real Graph Host, real native
// sessions and permissions, a loopback controlled provider and a disposable workspace. Nothing here
// answers a permission or approval except where a step explicitly names it as a synthetic decision test.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { createIsolation, root } from "./isolation.mjs";
import { startZ6Fixture } from "./z6-provider-fixture.mjs";
import { reviewerNativeResponse } from "./reviewer-native-responses.mjs";
import {
  prepareReviewerFixture,
  recipes as reviewerRecipes,
  REQUEST,
} from "./reviewer-native-fixture.mjs";
import { ledger, modelCount, readGraphRecord } from "./z5-native-observe.mjs";
import { slotRecipes } from "./z6-fixture.mjs";
import { GAME_DOC } from "./z6-slot-source.mjs";

export { REQUEST, ledger, modelCount, readGraphRecord };
export const T = (window, id) => window.getByTestId(id);
export const SIZES = [
  [1280, 720],
  [1920, 1080],
];
// 受控 provider 只接受包含 REQUEST 的提示词（否则记为夹具契约错误）；第二个请求保留它并追加不同的内容。
export const SECOND_REQUEST = `${REQUEST} (second task: also read docs/Notes.md)`;
export const OUTSIDE_NAME = "outside-secret.md";

/** Extra saved checks: same commands, different stable ids and names, so a draft can select others. */
export const altRecipes = reviewerRecipes.map((recipe) => ({
  ...recipe,
  id: recipe.id.replace("reviewer-", "alt-"),
  name: recipe.verifier.kind === "build" ? "Alternate build" : "Alternate test",
}));
export const allRecipes = [...reviewerRecipes, ...altRecipes, ...slotRecipes()];

export const unresolvedStatuses = new Set([
  "Running",
  "WaitingForPermission",
  "WaitingForUser",
  "WaitingForApproval",
  "Pending",
]);

/** Step recorder: a failed step is kept in the receipt with its error and a screenshot, and stops the journey. */
export function createReceipt(journey, isolation) {
  return {
    journey,
    home: isolation.home,
    workspace: isolation.workspace,
    startedAt: new Date().toISOString(),
    steps: [],
    screenshots: [],
    observations: [],
    notRun: [],
  };
}
export async function step(receipt, id, title, run) {
  const entry = { id, title, status: "RUNNING", startedAt: Date.now() };
  receipt.steps.push(entry);
  try {
    entry.detail = (await run()) ?? undefined;
    entry.status = "PASS";
  } catch (error) {
    entry.status = "FAIL";
    entry.error = error instanceof Error ? (error.stack ?? String(error)) : String(error);
    throw error;
  } finally {
    entry.finishedAt = Date.now();
  }
}
export const observe = (receipt, text, data) =>
  receipt.observations.push(data === undefined ? text : { text, data });

/** Fixture workspace: the reviewer fixture plus real documents, real skill, and an out-of-workspace file. */
export async function prepareUxWorkspace(isolation, { extraSkill = true } = {}) {
  await prepareReviewerFixture(isolation);
  const ws = isolation.workspace;
  await writeFile(
    path.join(ws, ".zcode/config.json"),
    JSON.stringify({ graphRecipes: allRecipes }),
  );
  await mkdir(path.join(ws, "docs"), { recursive: true });
  await writeFile(
    path.join(ws, "docs/Notes.md"),
    "UX_M1_NOTES: Second-task guidance. Only relevant to the next request.\n",
  );
  await writeFile(
    path.join(ws, "docs/Extra.md"),
    "UX_M1_EXTRA: Additional project guidance for replacement tests.\n",
  );
  await writeFile(path.join(ws, "GameDoc.md"), GAME_DOC);
  // 与 AGENTS.md 字节相同的普通文件：原生指令与显式读取必须能被区分（U3 驱动的原意）。
  await writeFile(
    path.join(ws, "docs/same-content.md"),
    await readFile(path.join(ws, "AGENTS.md")),
  );
  await writeFile(path.join(ws, "docs/empty.md"), "");
  await writeFile(path.join(ws, "docs/big.txt"), `${"x".repeat(101 * 1024)}\n`);
  if (extraSkill) {
    await mkdir(path.join(ws, ".agents/skills/fixture-guidance"), { recursive: true });
    await writeFile(
      path.join(ws, ".agents/skills/fixture-guidance/SKILL.md"),
      "---\nname: fixture-guidance\ndescription: UX-M1 native acceptance skill; guidance only.\n---\nUX_M1_SKILL_AUTHORITY: preserve the configured Build/Test; change only the requested file.\n",
    );
  }
  const outside = path.join(isolation.home, "outside");
  await mkdir(outside, { recursive: true });
  await writeFile(path.join(outside, OUTSIDE_NAME), "Outside the workspace on purpose.\n");
  return { outside: path.join(outside, OUTSIDE_NAME) };
}

export async function reloadToWorkspace(window) {
  // 重新加载后应用有时先落在欢迎（连接账户）页，再次重新加载即可回到工作区；最多三次，仍回不来才算失败。
  for (let attempt = 1; ; attempt += 1) {
    await window.reload();
    await window.waitForLoadState("domcontentloaded");
    try {
      await T(window, "graph-engineering-open").waitFor({ timeout: 20000 });
      return;
    } catch (error) {
      if (attempt >= 3) throw error;
    }
  }
}

/** Launch one fresh isolated app. `scale` uses a Chromium switch inside the test process only. */
export async function launchUx(journey, options = {}) {
  const {
    scenario = "pass",
    locale = "en-US",
    theme,
    scale,
    dialog = false,
    extraSkill = true,
    responder = reviewerNativeResponse,
  } = options;
  const controlFile = dialog
    ? path.join(root, ".tmp", `ux-m1-dialog-${process.pid}-${Date.now()}.json`)
    : undefined;
  const isolation = await createIsolation({
    fixtureFactory: (workspace) => startZ6Fixture(workspace, scenario, responder),
    extraEnv: {
      ...(controlFile ? { ZCODE_GRAPH_DIALOG_CONTROL: controlFile } : {}),
      ...(scale ? { UX_M1_DEVICE_SCALE_FACTOR: String(scale) } : {}),
    },
  });
  if (controlFile) await writeFile(controlFile, "{}");
  const files = await prepareUxWorkspace(isolation, { extraSkill });
  if (locale !== "en-US") {
    const settingPath = path.join(isolation.home, "home/.zcode/v2/setting.json");
    const setting = JSON.parse(await readFile(settingPath, "utf8"));
    await writeFile(settingPath, JSON.stringify({ ...setting, localePreference: locale }));
  }
  const receipt = createReceipt(journey, isolation);
  receipt.options = { scenario, locale, theme, scale, dialog };
  receipt.evidenceDir = path.join(
    root,
    "docs/graph-engineering/ux-audit/evidence/ux-m1-windows",
    `${journey}-${path.basename(isolation.home)}`,
  );
  await mkdir(receipt.evidenceDir, { recursive: true });
  const window = await isolation.launch({
    bootstrapEntry: path.join(root, "scripts/graph-engineering/ux-m1-native-bootstrap.cjs"),
  });
  if (theme) {
    await window.evaluate((value) => localStorage.setItem("zcode-theme", value), theme);
    // 重新加载后应用有时先落在欢迎（连接账户）页，再次重新加载即可回到工作区（UX-M4 最终构建的观察，
    // 与 Graph 界面无关）。最多重试三次；始终回不来才算真正的失败。
    for (let attempt = 1; ; attempt += 1) {
      await window.reload();
      await window.waitForLoadState("domcontentloaded");
      try {
        await T(window, "graph-engineering-open").waitFor({ timeout: 20000 });
        break;
      } catch (error) {
        if (attempt >= 3) throw error;
      }
    }
  }
  const dialogControl = controlFile
    ? {
        file: controlFile,
        set: (value) => writeFile(controlFile, JSON.stringify(value)),
      }
    : undefined;
  return { isolation, window, receipt, files, dialogControl };
}

export async function openNewRun(window) {
  if (!(await T(window, "graph-engineering-panel").isVisible()))
    await T(window, "graph-engineering-open").click();
  await T(window, "graph-view-runs").click();
  await T(window, "graph-new-run").click();
  await T(window, "graph-template-parameter-request").waitFor();
}

/** The canonical stored value of a context chip (the chip's title attribute), not its display label. */
export const chipValue = (window, role) =>
  T(window, `graph-context-value-${role}`).getAttribute("title");

export const sha256 = (value) => createHash("sha256").update(value).digest("hex");

/** Everything a draft must not touch: the persisted Graph record, native inputs and model requests. */
export async function snapshot(isolation) {
  // 第一次实例化之前 Graph 记录文件还不存在：那本身就是「什么都没有发生」的事实。
  const record = await readGraphRecord(isolation).catch((error) => {
    if (error.code === "ENOENT") return { runs: [], absent: true };
    throw error;
  });
  return {
    record,
    recordDigest: sha256(JSON.stringify(record)),
    runCount: record.runs?.length ?? 0,
    ledger: await ledger(isolation),
    models: modelCount(isolation),
  };
}
export function assertUnchanged(before, after, what) {
  assert.equal(after.runCount, before.runCount, `${what}: no second run`);
  assert.equal(after.recordDigest, before.recordDigest, `${what}: Graph record is byte-identical`);
  assert.deepEqual(after.ledger, before.ledger, `${what}: no native input`);
  assert.equal(after.models, before.models, `${what}: no model request`);
}

/** Poll the persisted record until it satisfies `predicate` (event-driven by the Host's own writes). */
export async function waitRecord(isolation, predicate, what, timeout = 120000) {
  const deadline = Date.now() + timeout;
  let record;
  do {
    record = await readGraphRecord(isolation).catch(() => undefined);
    const value = record && predicate(record);
    if (value) return { record, value };
    await wait(50);
  } while (Date.now() < deadline);
  throw new Error(
    `Timed out waiting for ${what}: ${JSON.stringify(record?.runs?.at(-1) ?? null).slice(0, 800)}`,
  );
}
export const pendingPermission = (record) =>
  record.runs
    ?.at(-1)
    ?.nodeAttempts?.concat(record.runs.at(-1)?.toolAttempts ?? [])
    .find((item) => item.status === "WaitingForPermission");

/** Screenshot the real window content at an exact content size. */
export async function shot(isolation, window, receipt, name, size) {
  const nativeWindow = await isolation.app.browserWindow(window);
  try {
    if (size) {
      await nativeWindow.evaluate((browserWindow, [width, height]) => {
        if (browserWindow.isMinimized()) browserWindow.restore();
        if (browserWindow.isMaximized()) browserWindow.unmaximize();
        browserWindow.setContentSize(width, height);
      }, size);
      await window.waitForFunction(
        ([width, height]) =>
          Math.abs(innerWidth - width) <= 2 && Math.abs(innerHeight - height) <= 2,
        size,
      );
    }
    await window.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await window.waitForFunction(
      () =>
        !document
          .getAnimations()
          .some(
            (animation) =>
              animation.playState === "running" &&
              Number.isFinite(animation.effect?.getComputedTiming().endTime),
          ),
    );
    const encoded = await nativeWindow.evaluate(async (browserWindow) =>
      (await browserWindow.capturePage()).toPNG().toString("base64"),
    );
    const file = path.join(
      receipt.evidenceDir,
      `${name}${size ? `-${size[0]}x${size[1]}` : ""}.png`,
    );
    await writeFile(file, Buffer.from(encoded, "base64"));
    receipt.screenshots.push(path.basename(file));
    return file;
  } finally {
    await nativeWindow.dispose();
  }
}
/** One screenshot per required size; `prepare(size)` runs after the resize (for example a scroll). */
export async function shotSizes(isolation, window, receipt, name, prepare) {
  for (const size of SIZES) {
    // 先调整尺寸，再让调用方滚动到目标控件，最后截图。
    const nativeWindow = await isolation.app.browserWindow(window);
    try {
      await nativeWindow.evaluate((browserWindow, [width, height]) => {
        if (browserWindow.isMaximized()) browserWindow.unmaximize();
        browserWindow.setContentSize(width, height);
      }, size);
    } finally {
      await nativeWindow.dispose();
    }
    await window.waitForFunction(
      ([width, height]) => Math.abs(innerWidth - width) <= 2 && Math.abs(innerHeight - height) <= 2,
      size,
    );
    if (prepare) await prepare(size);
    await shot(isolation, window, receipt, name, size);
  }
}

export const focused = (window) =>
  window.evaluate(
    () => document.activeElement?.getAttribute("data-testid") ?? document.activeElement?.tagName,
  );
export const flush = (window) =>
  window.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
/** Invoke a control's React onClick directly, as any alternate control or script would. */
export const invokeHandler = (window, testId) =>
  window.evaluate((id) => {
    const element = document.querySelector(`[data-testid="${id}"]`);
    if (!element) return "absent";
    const key = Object.keys(element).find((name) => name.startsWith("__reactProps"));
    element[key].onClick({ preventDefault() {}, stopPropagation() {}, currentTarget: element });
    return "invoked";
  }, testId);

/**
 * Bounded quiet-window observation. This is NOT a synchronization wait: it is used only to check a
 * negative ("nothing started") after the positive event it follows has already been observed.
 */
export async function quietWindow(isolation, before, ms = 1500, what = "quiet window") {
  const deadline = Date.now() + ms;
  do {
    assertUnchanged(before, await snapshot(isolation), what);
    await wait(150);
  } while (Date.now() < deadline);
}

export async function finishReceipt(receipt, isolation, window, error) {
  receipt.status = error ? "FAIL" : "PASS";
  receipt.finishedAt = new Date().toISOString();
  if (error) {
    receipt.error = error instanceof Error ? (error.stack ?? String(error)) : String(error);
    receipt.body = await window
      ?.locator("body")
      .innerText()
      .catch(() => "Unavailable");
    if (window) await shot(isolation, window, receipt, "failure").catch(() => {});
    process.exitCode = 1;
  }
  receipt.finalRecord = await readGraphRecord(isolation).catch(() => undefined);
  receipt.nativeLedger = await ledger(isolation).catch(() => undefined);
  receipt.providerRequests = isolation.fixture.requests.length;
  receipt.providerErrors = isolation.fixture.errors;
  await writeFile(path.join(receipt.evidenceDir, "receipt.json"), JSON.stringify(receipt, null, 2));
  const { finalRecord: _record, nativeLedger: _ledger, body: _body, ...brief } = receipt;
  console.log(JSON.stringify(brief, null, 2));
  await isolation.close();
}

export async function listEvidence(dir) {
  return (await readdir(dir)).sort();
}
