import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { ProviderRegistry } from "@zcode/provider";
import { zcodeSessionStateSnapshotSchema } from "@zcode/shared";
import { ZCodeProtocolAgentServer } from "../zcode-protocol/server.js";
import { createZCodeApp } from "./create-app.js";

async function createWithoutProvider(): Promise<void> {
  const registry = new ProviderRegistry([]);
  const server = new ZCodeProtocolAgentServer({
    cwd: process.cwd(),
    env: process.env,
    createZCodeApp: (options) =>
      createZCodeApp({ ...options, env: process.env, providerRegistry: registry }),
  });
  try {
    const response = await server.handleMessage({
      id: "native-session-without-provider",
      method: "session/create",
      params: {
        workspace: { workspacePath: process.cwd(), workspaceKey: process.cwd() },
        persistence: "deferred",
        mode: "edit",
        titleGenerationEnabled: false,
      },
    });
    assert.ok(response && "result" in response, JSON.stringify(response));
    const snapshot = zcodeSessionStateSnapshotSchema.parse(response.result);
    assert.equal(registry.listProviders().length, 0);
    assert.equal(snapshot.session.status, "idle");
    assert.equal(snapshot.session.model, undefined);
    assert.equal(snapshot.settings.model.current, undefined);
    assert.deepEqual(snapshot.settings.model.available, []);
    assert.deepEqual(snapshot.messages, []);
    process.stdout.write("Z4_EMPTY_PROVIDER_SESSION_PASS\n");
  } finally {
    await server.shutdown();
    server.disposeProjections();
  }
}

if (process.env.Z4_EMPTY_PROVIDER_TEST_CHILD === "1") {
  await createWithoutProvider();
} else {
  test("real native session/create supports an empty registry without model input", async () => {
    const home = await mkdtemp(join(tmpdir(), "zcode-z4-empty-provider-"));
    const workspace = join(home, "workspace");
    for (const name of ["home/.zcode/v2", "data", "appdata", "localappdata", "temp", "workspace"])
      await mkdir(join(home, name), { recursive: true });
    await writeFile(join(workspace, ".env"), "");
    await writeFile(join(home, "empty-gitconfig"), "");
    await writeFile(join(workspace, "AGENTS.md"), "Isolated empty-provider session fixture.\n");
    const env: NodeJS.ProcessEnv = Object.fromEntries(
      ["SystemRoot", "WINDIR", "ComSpec", "PATHEXT", "PATH"].flatMap((key) =>
        process.env[key] ? [[key, process.env[key]!]] : [],
      ),
    );
    Object.assign(env, {
      Z4_EMPTY_PROVIDER_TEST_CHILD: "1",
      HOME: join(home, "home"),
      USERPROFILE: join(home, "home"),
      APPDATA: join(home, "appdata"),
      LOCALAPPDATA: join(home, "localappdata"),
      TEMP: join(home, "temp"),
      TMP: join(home, "temp"),
      ZCODE_DATA_BASE_DIR: join(home, "data"),
      ZCODE_MODEL_TELEMETRY_ENABLED: "0",
      GIT_CONFIG_GLOBAL: join(home, "empty-gitconfig"),
      GIT_CONFIG_NOSYSTEM: "1",
      HTTP_PROXY: "http://127.0.0.1:1",
      HTTPS_PROXY: "http://127.0.0.1:1",
      ZCODE_BASE_URL: "http://127.0.0.1:1",
      ZAI_OAUTH_ORIGIN: "http://127.0.0.1:1",
      ZAI_BUSINESS_BASE_URL: "http://127.0.0.1:1",
      BIGMODEL_API_BASE_URL: "http://127.0.0.1:1",
    });
    try {
      await promisify(execFile)("git", ["-c", "init.templateDir=", "init", "--quiet", workspace], {
        env,
        windowsHide: true,
      });
      const result = await promisify(execFile)(
        process.execPath,
        ["--import", import.meta.resolve("tsx"), fileURLToPath(import.meta.url)],
        { cwd: workspace, env, windowsHide: true, timeout: 45_000, maxBuffer: 1024 * 1024 },
      );
      assert.match(result.stdout, /Z4_EMPTY_PROVIDER_SESSION_PASS/);
    } finally {
      // home is the exact fresh mkdtemp fixture; no installed profile is read or removed.
      await rm(home, { recursive: true, force: true });
    }
  });
}
