import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  createGraphWindowsAsarIntegrityLifecycle,
  GRAPH_WINDOWS_ELECTRON_FUSES,
} from "../../packages/desktop/scripts/windows-asar-integrity.mjs";
import {
  builderContext,
  desktopRoot,
  EXE_NAME,
  execFileAsync,
  flipFuses,
  PlatformPackager,
  packSyntheticAsar,
  rejectsWithCode,
  requireFromDesktop,
  stalePackage,
} from "./z8-3-a-synthetic-fixtures.mjs";

/** Z8.3-A：生命周期排序与 Graph-only 配置的测试。夹具均为 SYNTHETIC。 */
// --- 生命周期：窗口配置与排序 ------------------------------------------------------------------

test("lifecycle order: rewrite -> refresh -> builder flips fuses -> final assertion passes", async (t) => {
  const { appOutDir } = await stalePackage(t); // 此时归档已经是 afterPack 重写后的最终版本
  const events = [];
  const lifecycle = createGraphWindowsAsarIntegrityLifecycle({ enabled: true, log: () => {} });
  await lifecycle.refreshAfterFinalAsarRewrite(builderContext(appOutDir));
  events.push("afterPack:refresh");
  const exePath = path.join(appOutDir, EXE_NAME);
  const config = PlatformPackager.prototype.generateFuseConfig.call(null, lifecycle.electronFuses);
  await flipFuses(exePath, config);
  events.push("builder:flipFuses");
  await lifecycle.assertAfterFuses({ arch: 1, targetPresentableName: "nsis" });
  events.push("artifactBuildStarted:assert");
  assert.deepEqual(events, [
    "afterPack:refresh",
    "builder:flipFuses",
    "artifactBuildStarted:assert",
  ]);
});

test("lifecycle refuses wrong orders: archive rewritten after the refresh, assertion before refresh, fuse never flipped", async (t) => {
  const stale = await stalePackage(t);
  const lifecycle = createGraphWindowsAsarIntegrityLifecycle({ enabled: true, log: () => {} });
  // 断言先于刷新：没有刷新记录，必须失败而不是跳过
  await rejectsWithCode(
    lifecycle.assertAfterFuses({ arch: 1, targetPresentableName: "nsis" }),
    "refresh-not-run",
  );
  await lifecycle.refreshAfterFinalAsarRewrite(builderContext(stale.appOutDir));
  const config = PlatformPackager.prototype.generateFuseConfig.call(null, lifecycle.electronFuses);
  // fuse 未翻转：fuse-off
  await rejectsWithCode(
    lifecycle.assertAfterFuses({ arch: 1, targetPresentableName: "nsis" }),
    "fuse-off",
  );
  await flipFuses(stale.exePath, config);
  // 刷新之后又重写了归档（刷新不是最后一步）：record-stale
  await packSyntheticAsar(stale.appOutDir, "rewritten-after-refresh");
  await rejectsWithCode(
    lifecycle.assertAfterFuses({ arch: 1, targetPresentableName: "nsis" }),
    "record-stale",
  );
  // 另一个 arch 没有刷新记录
  await rejectsWithCode(
    lifecycle.assertAfterFuses({ arch: 3, targetPresentableName: "nsis" }),
    "refresh-not-run",
  );
});

test("disabled lifecycle is inert: no fuses, no file access", async () => {
  const lifecycle = createGraphWindowsAsarIntegrityLifecycle({ enabled: false, log: () => {} });
  assert.equal(lifecycle.electronFuses, undefined);
  assert.equal(await lifecycle.refreshAfterFinalAsarRewrite(builderContext("/nonexistent")), null);
  assert.equal(await lifecycle.assertAfterFuses({ arch: 1 }), null);
});

test("real electron-builder.config.js: Graph+Windows only gets the one fuse and the hooks", async () => {
  const probe = `
    const config = (await import(${JSON.stringify(path.join(desktopRoot, "electron-builder.config.js"))})).default;
    process.stdout.write("@@PROBE@@" + JSON.stringify({
      productName: config.productName,
      electronFuses: config.electronFuses ?? null,
      hasArtifactBuildStarted: typeof config.artifactBuildStarted === "function",
      hasAfterPack: typeof config.afterPack === "function",
    }));
  `;
  const run = async (env) => {
    const { stdout } = await execFileAsync(process.execPath, ["--input-type=module", "-e", probe], {
      cwd: desktopRoot,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        ZCODE_ENV: "test",
        ...env,
      },
      maxBuffer: 8 * 1024 * 1024,
    });
    return JSON.parse(
      stdout.slice(stdout.lastIndexOf("@@PROBE@@") + "@@PROBE@@".length).split("\n")[0],
    );
  };
  const graph = { ZCODE_GRAPH_DISTRIBUTION: "1", ZCODE_GRAPH_VERSION: "3.14.3-z8.3" };
  const graphWindows = await run({ ...graph, ZCODE_TARGET_OS: "win", ZCODE_TARGET_ARCH: "x64" });
  assert.equal(graphWindows.productName, "ZCode Graph");
  assert.deepEqual(graphWindows.electronFuses, { enableEmbeddedAsarIntegrityValidation: true });
  assert.equal(graphWindows.hasArtifactBuildStarted, true);
  assert.equal(graphWindows.hasAfterPack, true);
  for (const [label, env] of [
    ["graph-linux", { ...graph, ZCODE_TARGET_OS: "linux", ZCODE_TARGET_ARCH: "x64" }],
    ["graph-macos", { ...graph, ZCODE_TARGET_OS: "mac", ZCODE_TARGET_ARCH: "arm64" }],
    ["preview-windows", { ZCODE_TARGET_OS: "win", ZCODE_TARGET_ARCH: "x64" }],
    [
      "production-windows",
      { ZCODE_ENV: "production", ZCODE_TARGET_OS: "win", ZCODE_TARGET_ARCH: "x64" },
    ],
  ]) {
    const other = await run(env);
    assert.equal(other.electronFuses, null, `${label}: no fuse configuration`);
    assert.equal(other.hasArtifactBuildStarted, false, `${label}: no artifactBuildStarted hook`);
    assert.equal(other.hasAfterPack, true, `${label}: existing afterPack untouched`);
  }
  // 配置只含这一项：其余 fuse（含 RunAsNode）不被配置触及。
  assert.deepEqual(Object.keys(GRAPH_WINDOWS_ELECTRON_FUSES), [
    "enableEmbeddedAsarIntegrityValidation",
  ]);
  assert.equal(Object.isFrozen(GRAPH_WINDOWS_ELECTRON_FUSES), true);
});

test("source order guards: config calls refresh after the last asar rewrite; installed electron-builder still orders afterPack -> fuses -> sign -> target.build -> artifactBuildStarted", async () => {
  // 源码文本断言：不是行为测试，只防止有人把刷新挪到重写步骤之前，或升级 builder 后顺序变化。
  const config = await readFile(path.join(desktopRoot, "electron-builder.config.js"), "utf8");
  const afterPack = config.slice(
    config.indexOf("afterPack: async (context)"),
    config.indexOf("extraResources: ["),
  );
  const position = (needle) => {
    const index = afterPack.indexOf(needle);
    assert.notEqual(index, -1, `afterPack must contain ${needle}`);
    return index;
  };
  const inject = position("injectHoistedRuntimeModulesIntoAsar(context)");
  const strip = position("stripPackagedSourcemapReferences(context)");
  const refresh = position("refreshAfterFinalAsarRewrite(context)");
  assert.ok(inject < strip && strip < refresh, "refresh follows both asar rewrites");
  assert.ok(
    afterPack.lastIndexOf("replaceAppAsarFromStaging") === -1,
    "afterPack body does not rewrite the archive itself",
  );
  assert.ok(
    refresh > position("writeWindowsInstallManifest(context)"),
    "refresh is the last afterPack step",
  );
  assert.ok(!/afterSign\s*:/.test(config), "no afterSign hook is introduced");

  const builderDir = path.dirname(requireFromDesktop.resolve("app-builder-lib/package.json"));
  const platformPackager = await readFile(path.join(builderDir, "out/platformPackager.js"), "utf8");
  const order = [
    "emitAfterPack(packContext)",
    "this.doAddElectronFuses(packContext)",
    "this.doSignAfterPack(outDir",
  ].map((needle) => {
    const index = platformPackager.indexOf(needle);
    assert.notEqual(index, -1, `platformPackager must contain ${needle}`);
    return index;
  });
  assert.deepEqual(
    [...order].sort((a, b) => a - b),
    order,
    "afterPack, then fuses, then signing",
  );
  assert.ok(
    platformPackager.indexOf("await this.doPack({") <
      platformPackager.indexOf("this.packageInDistributableFormat(appOutDir"),
    "targets build after doPack",
  );
  const nsis = await readFile(path.join(builderDir, "out/targets/nsis/NsisTarget.js"), "utf8");
  assert.ok(
    nsis.includes("emitArtifactBuildStarted({"),
    "NSIS target emits artifactBuildStarted from build()",
  );
  assert.ok(
    platformPackager.indexOf("framework.beforeCopyExtraFiles") < order[0],
    "builder writes the (stale) record in beforeCopyExtraFiles, before afterPack",
  );
});
