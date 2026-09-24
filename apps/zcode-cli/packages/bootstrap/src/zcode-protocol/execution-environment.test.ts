import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { ZCodeProtocolAgentServer } from "./server.js";
import { zcodeExecutionEnvironmentPreviewSchema } from "@zcode/shared";

const SECRET = "SYNTHETIC_SECRET_MUST_NOT_LEAK";

async function child() {
  const root = process.cwd();
  const workspace = join(root, "workspace"),
    home = process.env.HOME!;
  const plugin = join(workspace, "fixture-plugin"),
    skill = join(workspace, ".agents", "skills", "fixture", "SKILL.md");
  const disabledSkill = join(home, ".agents", "skills", "disabled", "SKILL.md");
  for (const directory of [
    workspace,
    join(workspace, ".git"),
    join(workspace, ".zcode"),
    join(plugin, ".zcode-plugin"),
    join(plugin, "skills", "plugin-skill"),
    join(workspace, ".agents", "skills", "fixture"),
    join(home, ".zcode", "cli"),
    join(home, ".agents", "skills", "disabled"),
  ])
    await mkdir(directory, { recursive: true });
  await writeFile(join(workspace, "AGENTS.md"), `Workspace instructions ${SECRET}`);
  await writeFile(join(home, ".zcode", "AGENTS.md"), `User instructions ${SECRET}`);
  const content = (name: string) =>
    `---\nname: ${name}\ndescription: Synthetic fixture\n---\nPrivate content ${SECRET}\n`;
  await writeFile(skill, content("fixture"));
  await writeFile(disabledSkill, content("disabled"));
  await writeFile(join(plugin, "skills", "plugin-skill", "SKILL.md"), content("plugin-skill"));
  await writeFile(
    join(plugin, ".zcode-plugin", "plugin.json"),
    JSON.stringify({
      name: "fixture",
      version: "1.2.3",
      commands: { generated: { description: "Fixture", prompt: SECRET } },
      mcpServers: { fixture: { type: "stdio", command: "must-never-execute", args: [SECRET] } },
      hooks: { Stop: [{ hooks: [{ type: "command", command: `echo ${SECRET}` }] }] },
    }),
  );
  const userConfigPath = join(home, ".zcode", "cli", "config.json");
  const userConfig = JSON.stringify({
    storage: { dir: join(root, "storage") },
    plugins: { dirs: [plugin], enabledPlugins: { "zcode-cua@zcode-plugins-official": false } },
    skill: { [disabledSkill]: { enable: false } },
    mcp: {
      servers: {
        web: {
          type: "http",
          url: `https://user:${SECRET}@example.invalid/private?key=${SECRET}`,
          headers: { Authorization: SECRET },
        },
      },
    },
  });
  await writeFile(userConfigPath, userConfig);
  await writeFile(
    join(workspace, ".zcode", "config.json"),
    JSON.stringify({
      hooks: {
        enabled: true,
        events: { PreToolUse: [{ hooks: [{ type: "command", command: `echo ${SECRET}` }] }] },
      },
    }),
  );
  let created = 0;
  const server = new ZCodeProtocolAgentServer({
    cwd: workspace,
    env: process.env,
    createZCodeApp: () => {
      created++;
      throw new Error("Preview must never create a native session");
    },
  });
  const request = {
    id: "preview",
    method: "workspace/previewExecutionEnvironment",
    params: {
      workspace: { workspacePath: workspace, workspaceKey: "synthetic-preview" },
      executables: [process.execPath, "z6-nonexistent-fixture-compiler"],
    },
  };
  try {
    const response = await server.handleMessage(request);
    assert.ok(response && "result" in response, JSON.stringify(response));
    const result = zcodeExecutionEnvironmentPreviewSchema.parse(response.result);
    assert.equal(result.status, "available");
    assert.deepEqual(
      result.executables.map((entry) => entry.status),
      ["available", "missing"],
    );
    assert.equal(result.executables[0]?.path, process.execPath);
    assert.deepEqual(
      result.instructions.map((item) => item.scope),
      ["user", "workspace"],
    );
    assert.ok(result.instructions.every((item) => item.digest.length === 64 && !item.truncated));
    assert.equal(result.skills.find((item) => item.name === "fixture")?.enabled, true);
    assert.equal(result.skills.find((item) => item.name === "disabled")?.enabled, false);
    assert.equal(result.plugins.find((item) => item.name === "fixture")?.version, "1.2.3");
    assert.ok(result.hooks.some((item) => item.event === "PreToolUse" && item.enabled));
    assert.equal(
      result.mcp.find((item) => item.name === "web")?.destination,
      "https://example.invalid",
    );
    assert.ok(
      result.mcp.some((item) => item.transport === "stdio" && item.destination.includes("Unknown")),
    );
    assert.ok(!JSON.stringify(result).includes(SECRET));
    assert.equal(
      await readFile(userConfigPath, "utf8"),
      userConfig,
      "metadata preview must not persist legacy migration",
    );
    await assert.rejects(readdir(join(root, "storage")), { code: "ENOENT" });
    const pluginStorage = join(root, "storage", "cli", "plugins");
    await mkdir(pluginStorage, { recursive: true });
    const interruptedBackup = join(pluginStorage, ".installed_plugins.json.backup");
    const interruptedMarker = join(pluginStorage, ".installed_plugins.json.transaction.json");
    await writeFile(interruptedBackup, JSON.stringify({ version: 1, plugins: [] }));
    await writeFile(
      interruptedMarker,
      JSON.stringify({ version: 1, stageName: ".installed_plugins.json.stage-fixture" }),
    );
    await writeFile(skill, `${content("fixture")}Changed instruction`);
    const changedResponse = await server.handleMessage({ ...request, id: "changed" });
    assert.ok(changedResponse && "result" in changedResponse);
    const changed = zcodeExecutionEnvironmentPreviewSchema.parse(changedResponse.result);
    assert.equal(
      changed.configDigest,
      result.configDigest,
      "Unchanged configuration has a stable digest",
    );
    assert.equal(
      await readFile(interruptedBackup, "utf8"),
      JSON.stringify({ version: 1, plugins: [] }),
    );
    assert.equal(
      await readFile(interruptedMarker, "utf8"),
      JSON.stringify({ version: 1, stageName: ".installed_plugins.json.stage-fixture" }),
    );
    await assert.rejects(readFile(join(pluginStorage, "installed_plugins.json")), {
      code: "ENOENT",
    });
    assert.notEqual(
      changed.skills.find((item) => item.name === "fixture")?.digest,
      result.skills.find((item) => item.name === "fixture")?.digest,
    );
    await mkdir(join(root, "storage", "v2"), { recursive: true });
    const statePath = join(root, "storage", "v2", "agents-state.json");
    const state = JSON.stringify({
      builtInModelSelectionOverrides: {
        Explore: { providerId: "fixture-provider", modelId: "fixture-model" },
      },
    });
    await writeFile(statePath, state);
    const overrideResponse = await server.handleMessage({ ...request, id: "subagent-drift" });
    assert.ok(overrideResponse && "result" in overrideResponse);
    const overridden = zcodeExecutionEnvironmentPreviewSchema.parse(overrideResponse.result);
    assert.notEqual(overridden.configDigest, changed.configDigest);
    assert.equal(await readFile(statePath, "utf8"), state);
    assert.ok(!JSON.stringify(overridden).includes("fixture-provider"));
    const invalid = await server.handleMessage({
      ...request,
      id: "invalid",
      params: { ...request.params, execute: true },
    });
    assert.ok(invalid && "error" in invalid);
    assert.equal(created, 0);
    assert.throws(() =>
      zcodeExecutionEnvironmentPreviewSchema.parse({ ...result, apiKey: SECRET }),
    );
    process.stdout.write("Z6_NATIVE_METADATA_PREVIEW_PASS\n");
  } finally {
    await server.shutdown();
    server.disposeProjections();
  }
}

if (process.env.Z6_PREVIEW_FIXTURE_CHILD === "1") await child();
else
  test("native metadata preview preserves files, redacts secrets, detects drift and never creates a session", async () => {
    const root = await mkdtemp(join(tmpdir(), "zcode-z6-preview-"));
    const env: NodeJS.ProcessEnv = Object.fromEntries(
      ["SystemRoot", "WINDIR", "ComSpec", "PATHEXT", "PATH"].flatMap((key) =>
        process.env[key] ? [[key, process.env[key]!]] : [],
      ),
    );
    Object.assign(env, {
      Z6_PREVIEW_FIXTURE_CHILD: "1",
      HOME: join(root, "home"),
      USERPROFILE: join(root, "home"),
      APPDATA: join(root, "appdata"),
      LOCALAPPDATA: join(root, "localappdata"),
      TEMP: join(root, "temp"),
      TMP: join(root, "temp"),
      ZCODE_DATA_BASE_DIR: join(root, "data"),
      ZCODE_MODEL_TELEMETRY_ENABLED: "0",
      HTTP_PROXY: "http://127.0.0.1:1",
      HTTPS_PROXY: "http://127.0.0.1:1",
    });
    try {
      const result = await promisify(execFile)(
        process.execPath,
        ["--import", import.meta.resolve("tsx"), fileURLToPath(import.meta.url)],
        { cwd: root, env, windowsHide: true, timeout: 45_000, maxBuffer: 1024 * 1024 },
      );
      assert.match(result.stdout, /Z6_NATIVE_METADATA_PREVIEW_PASS/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
