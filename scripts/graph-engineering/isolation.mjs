import { _electron as electron } from "playwright-core";
import { mkdir, mkdtemp, writeFile, readFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { startFixture, providerConfig } from "./provider-fixture.mjs";
import { createGraphProfile } from "../../packages/desktop/scripts/graph-profile.mjs";

export const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
export const instruction =
  "Z1_SYNTHETIC_TASK: Read fixture.mjs, replace Z1_BEFORE_7391 with Z1_AFTER_7391, and run node --test fixture.test.mjs. Work only in this synthetic workspace.";
export async function createIsolation({
  manual = false,
  noProvider = false,
  profile,
  fixtureFactory = startFixture,
} = {}) {
  const packagedExe = process.env.Z1_PACKAGED_EXE;
  if (packagedExe && (manual || profile))
    throw new Error("Packaged acceptance requires a fresh automated profile.");
  const home = profile
    ? path.resolve(profile)
    : packagedExe
      ? await mkdtemp(path.join(tmpdir(), "zcode-graph-acceptance-"))
      : path.join(
          root,
          ".tmp",
          `z1-${manual ? "manual" : "native"}-${Date.now()}-${randomUUID().slice(0, 6)}`,
        );
  if (profile) {
    const expectedParent = await realpath(path.join(root, ".tmp"));
    const actualHome = await realpath(home);
    if (
      !manual ||
      path.dirname(actualHome) !== expectedParent ||
      !/^z1-manual-\d+-[a-f0-9]{6}$/.test(path.basename(actualHome))
    )
      throw new Error(
        "Only an existing isolated Z1 manual profile below this checkout's .tmp can be reopened.",
      );
    const marker = JSON.parse(await readFile(path.join(home, "profile.json"), "utf8"));
    if (marker.kind !== "z1-isolated-manual" || marker.version !== 1)
      throw new Error("Unrecognized manual profile.");
  }
  const workspace = path.join(home, "workspace");
  if (!profile) {
    for (const name of [
      "home/.zcode/v2",
      "appdata",
      "localappdata",
      "userData",
      "sessionData",
      "data/.zcode/v2",
      "workspace",
      "temp",
      "data/.zcode/workspace/default",
    ])
      await mkdir(path.join(home, name), { recursive: true });
    await writeFile(path.join(workspace, ".env"), "");
    await writeFile(path.join(home, "data/.zcode/workspace/default/.env"), "");
    await writeFile(
      path.join(workspace, "AGENTS.md"),
      "Synthetic Z1 workspace. Modify only fixture.mjs and run node --test fixture.test.mjs. Do not inspect parent directories or external files.\n",
    );
    await writeFile(
      path.join(workspace, "fixture.mjs"),
      "export const marker = 'Z1_BEFORE_7391';\n",
    );
    await writeFile(
      path.join(workspace, "fixture.test.mjs"),
      "import assert from 'node:assert/strict';\nimport test from 'node:test';\nimport { marker } from './fixture.mjs';\ntest('synthetic marker', () => assert.equal(marker, 'Z1_AFTER_7391'));\n",
    );
    if (manual)
      await writeFile(
        path.join(home, "profile.json"),
        JSON.stringify({ kind: "z1-isolated-manual", version: 1 }),
      );
  }
  const fixture = await fixtureFactory(workspace);
  const graphProfile = packagedExe ? createGraphProfile(path.join(home, "home")) : undefined;
  const settingsHome = graphProfile?.env.HOME ?? path.join(home, "home");
  const dataHome = graphProfile?.env.ZCODE_DATA_BASE_DIR ?? path.join(home, "data");
  await mkdir(path.join(dataHome, ".zcode/v2"), { recursive: true });
  if (!manual && !noProvider)
    await writeFile(
      path.join(dataHome, ".zcode/v2/provider_config.json"),
      JSON.stringify(providerConfig(fixture.origin)),
    );
  if (!profile)
    await writeFile(
      path.join(settingsHome, ".zcode/v2/setting.json"),
      JSON.stringify({
        localePreference: "en-US",
        askUserQuestionAutoResolutionEnabled: false,
        providerFamilyDomain: "zai",
        providerFamilyDomainMigrated: true,
        closeToTrayOnWindows: false,
        closeToTrayOnWindowsMigrationInitialized: true,
      }),
    );
  const env = Object.fromEntries(
    [
      "SystemRoot",
      "WINDIR",
      "ComSpec",
      "PATHEXT",
      "PATH",
      "NUMBER_OF_PROCESSORS",
      "PROCESSOR_ARCHITECTURE",
    ].flatMap((key) => (process.env[key] ? [[key, process.env[key]]] : [])),
  );
  Object.assign(env, {
    HOME: path.join(home, "home"),
    USERPROFILE: path.join(home, "home"),
    APPDATA: path.join(home, "appdata"),
    LOCALAPPDATA: path.join(home, "localappdata"),
    TEMP: path.join(home, "temp"),
    TMP: path.join(home, "temp"),
    GIT_CONFIG_GLOBAL: path.join(home, "empty-gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
    ZCODE_DATA_BASE_DIR: path.join(home, "data"),
    ZCODE_DESKTOP_HOME_DIR: path.join(home, "home"),
    ZCODE_DESKTOP_USER_DATA_DIR: path.join(home, "userData"),
    ZCODE_DESKTOP_SESSION_DATA_DIR: path.join(home, "sessionData"),
    ZCODE_ENV: "test",
    ZCODE_E2E_RUN_ID: path.basename(home),
    ZCODE_MODEL_TELEMETRY_ENABLED: "0",
    ZCODE_DISABLE_FIXED_REMOTE_DEBUGGING_PORT: "1",
    ZCODE_BASE_URL: fixture.origin,
    VITE_ZCODE_BASE_URL: fixture.origin,
    ZAI_OAUTH_ORIGIN: fixture.origin,
    ZAI_BUSINESS_BASE_URL: fixture.origin,
    BIGMODEL_API_BASE_URL: fixture.origin,
    ...(manual
      ? { Z1_ALLOW_PROVIDER_NETWORK: "1" }
      : {
          HTTP_PROXY: fixture.origin,
          HTTPS_PROXY: fixture.origin,
          NO_PROXY: "127.0.0.1,localhost",
        }),
  });
  if (!profile) await writeFile(env.GIT_CONFIG_GLOBAL, "");
  // 合成目录建立独立 Git 边界，避免向上发现开发 checkout；不暂存、不提交。
  if (!profile)
    await promisify(execFile)("git", ["-c", "init.templateDir=", "init", "--quiet", workspace], {
      env,
    });
  const lines = [];
  let app;
  const launch = async ({ bootstrapEntry } = {}) => {
    if (packagedExe && bootstrapEntry)
      throw new Error("Packaged acceptance cannot replace the application entry point.");
    app = await electron.launch({
      executablePath: packagedExe ?? path.join(root, "node_modules/electron/dist/electron.exe"),
      args: [
        ...(packagedExe
          ? [`--proxy-server=${fixture.origin}`, "--proxy-bypass-list=127.0.0.1;localhost"]
          : [bootstrapEntry ?? path.join(root, "scripts/graph-engineering/native-bootstrap.cjs")]),
        "--open-workspace",
        workspace,
      ],
      cwd: packagedExe ? workspace : root,
      env,
      timeout: 30000,
    });
    // Manual provider credentials are never copied into test logs.
    if (!manual) {
      app.process().stdout.on("data", (data) => lines.push(data.toString()));
      app.process().stderr.on("data", (data) => lines.push(data.toString()));
    } else {
      app.process().stdout.resume();
      app.process().stderr.resume();
    }
    const window = await app.firstWindow({ timeout: 30000 });
    await window.waitForLoadState("domcontentloaded");
    // 手动 profile 会保留中文设置；以已有 test id 和两种已发布的引导标签识别启动页，不能强制改回英文。
    const onboarding = window.getByRole("button", { name: /^(Exit onboarding|退出引导)$/ });
    const useApiKey = window.getByTestId("login-use-api-key-button");
    await onboarding
      .or(window.getByTestId("v4-composer-input"))
      .or(window.getByTestId("graph-engineering-panel"))
      .or(window.getByTestId("graph-engineering-open"))
      .or(useApiKey)
      .first()
      .waitFor({ timeout: 45000 })
      .catch(async (error) => {
        await window.screenshot({ path: path.join(home, "startup-failure.png") });
        throw new Error(
          `${String(error)}\nNative startup UI: ${await window.locator("body").innerText()}`,
        );
      });
    if (await useApiKey.isVisible()) {
      await useApiKey.click();
      if (manual) return window;
      if (noProvider) await window.getByTestId("login-api-key-skip-button").click();
      await onboarding
        .or(window.getByTestId("graph-engineering-open"))
        .first()
        .waitFor({ timeout: 30000 });
    }
    if (await onboarding.isVisible()) await onboarding.click();
    return window;
  };
  const stopApp = async () => {
    if (app) {
      await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
      await app.close().catch(() => {});
      app = undefined;
    }
  };
  return {
    home,
    workspace,
    fixture,
    env,
    graphProfile,
    launch,
    stopApp,
    get app() {
      return app;
    },
    async close() {
      if (!manual) {
        await writeFile(path.join(home, "native.log"), lines.join(""));
        await writeFile(
          path.join(home, "requests.json"),
          JSON.stringify(fixture.requests, null, 2),
        );
      }
      await stopApp();
      await fixture.close();
    },
    readFixture: () => readFile(path.join(workspace, "fixture.mjs"), "utf8"),
  };
}
