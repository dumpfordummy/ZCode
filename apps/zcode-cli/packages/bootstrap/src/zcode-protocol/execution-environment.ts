import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createConfig, resolvePath } from "@zcode/adapters/config";
import { resolveNativeInstructionSources } from "@zcode/adapters/context";
import { createNodeSkillAdapter } from "@zcode/adapters/skills";
import { previewExecutable } from "@zcode/adapters/exec";
import type { HookMatcherConfig, SkillMetadata } from "@zcode/contracts";
import {
  zcodeExecutionEnvironmentPreviewParamsSchema,
  zcodeExecutionEnvironmentPreviewSchema,
  type ZCodeExecutionEnvironmentPreview,
} from "@zcode/shared";
import { resolveZCodePlugins } from "../plugins.js";
import { collectDisabledPaths } from "../skill-command-overrides.js";
import { getCliStorageRoot, getPluginStorageRoot } from "../app/paths.js";
import { loadZCodeAgentProfiles, loadPluginAgentProfiles } from "../subagents.js";
import type { ZCodeProtocolAgentServerContext } from "./server-types.js";

const MAX_SKILL_BYTES = 100_000;
const MAX_ITEMS = 512;
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

export async function previewExecutionEnvironment(
  context: Pick<ZCodeProtocolAgentServerContext, "deps">,
  rawParams: unknown,
): Promise<ZCodeExecutionEnvironmentPreview> {
  const { workspace, executables = [] } =
    zcodeExecutionEnvironmentPreviewParamsSchema.parse(rawParams);
  const env = context.deps.env ?? process.env;
  const home = env.HOME?.trim() || env.USERPROFILE?.trim() || homedir();
  const config = createConfig({
    env,
    workingDirectory: workspace.workspacePath,
    workspaceIdentity: workspace.workspaceKey,
    userConfigPath: join(home, ".zcode", "cli", "config.json"),
    metadataOnly: true,
  });
  const storageRoot = getPluginStorageRoot(
    getCliStorageRoot(resolvePath(config.config.storage.dir)),
  );
  const plugins = resolveZCodePlugins({
    configResult: config,
    env,
    workingDirectory: workspace.workspacePath,
    pluginStorageRoot: storageRoot,
    metadataOnly: true,
  });
  const result: ZCodeExecutionEnvironmentPreview = {
    version: 1,
    status: "available",
    configDigest: "0".repeat(64),
    executables: await Promise.all(
      executables.map((executable) =>
        previewExecutable(executable, { cwd: workspace.workspacePath, env }),
      ),
    ),
    instructions: [],
    skills: [],
    plugins: [],
    hooks: [],
    mcp: [],
    unknowns: [
      "Provider-side routing, web destinations and script behavior are not verified by local metadata.",
      "Native subagent model overrides and runtime-added integrations are not inventoried; no migration or connection was attempted.",
      "Bundled assets are not seeded by preview; missing caches and disabled-plugin skill contents remain unknown.",
      "Hook trust and MCP live connections are unknown; configured declarations do not establish execution safety.",
    ],
  };
  const subagents = await loadZCodeAgentProfiles({
    storageRoot: resolvePath(config.config.storage.dir),
    workingDirectory: workspace.workspacePath,
    metadataOnly: true,
  });
  const pluginSubagents = loadPluginAgentProfiles({
    plugins: plugins.plugins,
    reservedProfileNames: subagents.profiles.map((profile) => profile.name),
    modelSelectionOverrides: subagents.pluginAgentModelSelectionOverrides,
  });
  const manifests = await Promise.all(
    plugins.plugins.map(async (plugin) => ({
      id: plugin.id,
      digest: await fileDigest(plugin.manifestPath),
    })),
  );
  result.configDigest = hash(
    stable({ config: config.config, subagents, pluginSubagents, manifests }),
  );
  const instructionSource = await resolveNativeInstructionSources(
    { workingDirectory: workspace.workspacePath },
    env,
  );
  result.instructions = (instructionSource.instructions?.sources ?? []).map((source) => ({
    scope: source.scope,
    path: source.filePath,
    digest: hash(source.content),
    bytes: source.bytesRead,
    truncated: source.truncated,
  }));
  if (instructionSource.diagnostics.length)
    result.unknowns.push("One or more native instruction files could not be read.");
  const skillPort = createNodeSkillAdapter({
    homeDirectory: home,
    extraRoots: config.config.skills.roots,
    extraResolvedRoots: plugins.skillRoots,
  });
  const discovered = await skillPort.discoverSkills({ workingDirectory: workspace.workspacePath });
  const disabled = new Set(
    await Promise.all(collectDisabledPaths(config.config.skillOverrides).map(canonical)),
  );
  for (const skill of discovered.skills.slice(0, MAX_ITEMS)) {
    const entry = await skillMetadata(
      skill,
      config.config.features.skill &&
        config.config.skills.enabled &&
        !disabled.has(await canonical(skill.path)),
    );
    result.skills.push(entry);
    if (!entry.digest) result.unknowns.push(`Skill content digest unavailable: ${entry.name}`);
  }
  if (discovered.diagnostics.length)
    result.unknowns.push(
      "Native skill discovery reported diagnostics; some references may be unresolved.",
    );
  result.plugins = plugins.plugins.slice(0, MAX_ITEMS).map((plugin) => ({
    id: plugin.id,
    name: plugin.name,
    enabled: plugin.enabled,
    source: plugin.source,
    ...(plugin.version ? { version: plugin.version } : {}),
  }));
  addHooks(result, config.config.hooks.events, config.config.hooks.enabled);
  addHooks(result, plugins.hooks, true);
  for (const hook of config.sources.project.workspaceHookSnapshot?.hooks ?? [])
    result.hooks.push({
      event: hook.event,
      enabled: hook.configuredEnabled,
      source: "project",
      trust: "unknown",
      digest: hook.hookDeclarationDigest,
    });
  const mcpServers = { ...plugins.mcpServers, ...config.config.mcp.servers };
  for (const [name, server] of Object.entries(mcpServers).slice(0, MAX_ITEMS))
    result.mcp.push({
      name,
      transport: server.type,
      destination: "url" in server ? origin(server.url) : "Unknown (stdio process)",
      enabled: config.config.features.mcp && server.enabled !== false,
      status: "unknown",
      digest: hash(JSON.stringify(server)),
    });
  if (
    plugins.diagnostics.length ||
    config.sources.user.diagnostics.length ||
    config.sources.project.diagnostics.length
  )
    result.unknowns.push(
      "Native configuration/plugin diagnostics require review in existing Settings; raw diagnostic content is withheld.",
    );
  if (
    discovered.skills.length > MAX_ITEMS ||
    plugins.plugins.length > MAX_ITEMS ||
    Object.keys(mcpServers).length > MAX_ITEMS
  )
    result.unknowns.push("Inventory exceeds the bounded preview; additional entries are unknown.");
  return zcodeExecutionEnvironmentPreviewSchema.parse(result);
}

function origin(value: string): string {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.origin : "Unknown";
  } catch {
    return "Unknown";
  }
}
async function canonical(value: string) {
  try {
    return await realpath(value);
  } catch {
    return resolve(value);
  }
}
async function skillMetadata(
  skill: SkillMetadata,
  enabled: boolean,
): Promise<ZCodeExecutionEnvironmentPreview["skills"][number]> {
  const digest = await fileDigest(skill.path);
  return {
    id: `glm:${skill.source === "plugin" ? "plugin" : skill.scope === "project" ? "workspace" : "user"}:${skill.path}`,
    name: skill.qualifiedName ?? skill.name,
    path: skill.path,
    scope: skill.source === "plugin" ? "plugin" : skill.scope === "project" ? "workspace" : "user",
    enabled,
    ...(skill.pluginName ? { plugin: skill.pluginName } : {}),
    ...(digest ? { digest } : {}),
  };
}
async function fileDigest(path: string): Promise<string | undefined> {
  try {
    if ((await stat(path)).size <= MAX_SKILL_BYTES) return hash(await readFile(path));
  } catch {
    /* Missing content remains an explicit unresolved reference. */
  }
  return undefined;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

function addHooks(
  result: ZCodeExecutionEnvironmentPreview,
  events: Partial<Record<string, HookMatcherConfig[]>>,
  enabled: boolean,
) {
  for (const [event, matchers] of Object.entries(events))
    for (const matcher of matchers ?? [])
      for (const hook of matcher.hooks)
        result.hooks.push({
          event,
          enabled: enabled && hook.enabled !== false,
          source: hook.plugin?.id ?? hook.source?.kind ?? "unknown",
          trust: "unknown",
          digest: hash(JSON.stringify({ event, matcher: matcher.matcher, hook })),
        });
}
