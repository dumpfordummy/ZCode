import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { SOURCE_PATHS, fingerprint } from "./z4-fixture.mjs";
import { ledger, modelCount } from "./z3-native-helpers.mjs";

const hashFile = async (file) =>
  createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
export async function prepareManualSetupCheck(isolation, fresh) {
  const config = path.join(isolation.workspace, ".zcode/config.json");
  const sentinel = path.join(isolation.home, "z4-setup-sentinel.json");
  if (fresh) {
    await mkdir(path.dirname(config), { recursive: true });
    await writeFile(config, JSON.stringify({ graphRecipes: [], z4FixtureSentinel: randomUUID() }));
    await writeFile(
      sentinel,
      JSON.stringify({ fixture: "Z4 isolated setup only", value: randomUUID() }),
    );
  }
  const settings = path.join(isolation.home, "home/.zcode/v2/setting.json");
  const before = {
    source: await fingerprint(isolation, SOURCE_PATHS),
    config: await hashFile(config),
    sentinel: await hashFile(sentinel),
    settings: await hashFile(settings),
  };
  const settingsBefore = JSON.parse(await readFile(settings, "utf8"));
  return async (window) => {
    const screenshot = path.join(
      isolation.home,
      fresh ? "z4-manual-setup.png" : "z4-manual-reopen.png",
    );
    // 通用截图助手会调整窗口尺寸并触发原生设置保存；保留性检查直接截图，不能自行改变待验证设置。
    const nativeWindow = await isolation.app.browserWindow(window);
    try {
      const encoded = await nativeWindow.evaluate(async (browserWindow) =>
        (await browserWindow.capturePage()).toPNG().toString("base64"),
      );
      await writeFile(screenshot, Buffer.from(encoded, "base64"));
    } finally {
      await nativeWindow.dispose();
    }
    assert.equal(modelCount(isolation), 0);
    assert.equal((await ledger(isolation)).length, 0);
    await isolation.stopApp();
    const after = {
      source: await fingerprint(isolation, SOURCE_PATHS),
      config: await hashFile(config),
      sentinel: await hashFile(sentinel),
      settings: await hashFile(settings),
    };
    assert.deepEqual(after.source, before.source);
    assert.equal(after.config, before.config);
    assert.equal(after.sentinel, before.sentinel);
    const settingsAfter = JSON.parse(await readFile(settings, "utf8"));
    await writeFile(
      path.join(isolation.home, fresh ? "z4-setup-settings.json" : "z4-reopen-settings.json"),
      JSON.stringify({ before: settingsBefore, after: settingsAfter }, null, 2),
    );
    if (!fresh) assert.deepEqual(settingsAfter, settingsBefore);
    const result = {
      status: "PASS",
      kind: fresh ? "fresh-setup-only" : "reopen-setup-only",
      home: isolation.home,
      screenshot,
      before,
      after,
      nativeInputs: 0,
      modelRequests: 0,
      userOperatedChecks: "NOT RUN",
    };
    await writeFile(
      path.join(isolation.home, fresh ? "z4-manual-setup.json" : "z4-manual-reopen.json"),
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result, null, 2));
  };
}
