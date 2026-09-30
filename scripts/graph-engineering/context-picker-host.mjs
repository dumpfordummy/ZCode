// Context picker 浏览器测试的 Node 侧「Host」。
//
// 真实：Graph Host 的 projectSetup 门面与 createProjectSetupPort（validate-reference 的路径规范化、
// 工作区限制、100 KB / 非空 UTF-8 校验、摘要、native-instructions 交付判定）都是仓库里的真实代码，
// 读取的是下面创建的真实临时工作区文件。
// 替身（FIXTURE，已在报告中标注）：① agentService.previewExecutionEnvironment —— Cloud 没有原生运行时，
// 这里按工作区文件生成环境预览（指令摘要取自真实文件）；② 传输层 —— 页面通过 Playwright
// exposeFunction 调用本模块，而不是 RPC；③ fileService.searchWorkspaceFiles —— 对临时工作区做目录遍历。
// 本模块还负责：每次调用的日志、可控的延迟闸门（制造迟到回执）、可注入的失败。
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { projectSetup } from "../../packages/services/src/graph-engineering/app/project-setup.ts";
import { createProjectSetupPort } from "../../packages/services/src/graph-engineering/adapters/project-checks.ts";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const digest64 = (char) => char.repeat(64);

/** 工作区内容。A 与 B 的 docs/Context.md 内容不同，便于确认没有串到另一个工作区。 */
const files = {
  A: {
    "AGENTS.md": "# Project agent guidance (workspace A)\nUse small commits.\n",
    "docs/Context.md": "# Context A\nBackground the agents should read.\n",
    "docs/Extra.md": "# Extra A\nMore background.\n",
    "docs/GameDoc.md": "# GameDoc A\nAuthoritative rules.\n",
    "src/main.cs": "class Main {}\n",
    "empty.md": "   \n",
    "big.md": `${"x".repeat(101 * 1024)}\n`,
  },
  B: {
    "AGENTS.md": "# Guidance for workspace B\n",
    "docs/Context.md": "# Context B\nDifferent content.\n",
    "NOTES.md": "# Notes B\n",
  },
};

async function walk(root, dir = root) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(root, full)));
    else out.push(full);
  }
  return out;
}

export async function createContextPickerHost() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "zcode-context-picker-"));
  const workspaces = {};
  for (const [id, tree] of Object.entries(files)) {
    const dir = path.join(root, `workspace-${id}`);
    for (const [relative, content] of Object.entries(tree)) {
      const full = path.join(dir, ...relative.split("/"));
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, content);
    }
    workspaces[id] = dir;
  }
  // 位于任何工作区之外的文件：用于证明工作区限制由真实 Host 执行。
  const outside = path.join(root, "outside.md");
  await fs.writeFile(outside, "# Outside any workspace\n");

  const calls = [];
  const gates = new Map();
  const failures = new Map();
  let environmentMode = "available";
  let pickedFile = null;

  const log = (op, phase, detail = {}) => calls.push({ seq: calls.length, op, phase, ...detail });
  const gate = async (op) => {
    const state = gates.get(op);
    if (!state?.held) return;
    await new Promise((resolve) => state.waiting.push(resolve));
  };
  const maybeFail = (op) => {
    const message = failures.get(op);
    if (message) throw new Error(message);
  };
  const workspaceName = (target) =>
    Object.entries(workspaces).find(([, dir]) => dir === target)?.[0] ?? "unknown";

  async function previewExecutionEnvironment(target) {
    if (environmentMode === "unknown")
      return {
        version: 1,
        status: "unknown",
        configDigest: digest64("0"),
        executables: [],
        instructions: [],
        skills: [],
        plugins: [],
        hooks: [],
        mcp: [],
        unknowns: ["Fixture: no native runtime has been initialized for this workspace."],
      };
    const instructions = [];
    try {
      const content = await fs.readFile(path.join(target.workspacePath, "AGENTS.md"));
      instructions.push({
        scope: "workspace",
        path: "AGENTS.md",
        digest: sha256(content.toString("utf8")),
        bytes: content.length,
        truncated: false,
      });
    } catch {
      // 没有 AGENTS.md：不声明任何原生指令。
    }
    return {
      version: 1,
      status: "available",
      configDigest: digest64("1"),
      executables: [],
      instructions,
      skills: [
        {
          id: "glm:workspace:fixture-guidance",
          name: "Fixture guidance",
          path: ".agents/skills/fixture-guidance/SKILL.md",
          scope: "workspace",
          enabled: true,
          digest: digest64("b"),
        },
        {
          id: "glm:user:retired-skill",
          name: "Retired skill",
          path: "retired/SKILL.md",
          scope: "user",
          enabled: false,
          digest: digest64("c"),
        },
        {
          id: "glm:plugin:unverifiable",
          name: "Unverifiable skill",
          path: "plugin/SKILL.md",
          scope: "plugin",
          enabled: true,
        },
      ],
      plugins: [],
      hooks: [],
      mcp: [],
      unknowns: [],
    };
  }

  const port = createProjectSetupPort({ agentService: { previewExecutionEnvironment } });
  // graph 只在配置类动作中使用；引用目录/验证不会触及它，触及即失败。
  const graph = new Proxy(
    {},
    {
      get(_, name) {
        throw new Error(`projectSetup reached graph.${String(name)} during a context action`);
      },
    },
  );

  return {
    root,
    workspaces,
    outside,
    calls,
    /** Shared with other harness hosts so their operations can be held, failed and logged the same way. */
    log,
    gate,
    maybeFail,
    /** 让某个操作的回执停在 Host，直到 release()；用于制造迟到回执。 */
    hold(op) {
      gates.set(op, { held: true, waiting: [] });
    },
    waiting: (op) => gates.get(op)?.waiting.length ?? 0,
    release(op) {
      const state = gates.get(op);
      if (!state) return;
      state.held = false;
      for (const resolve of state.waiting.splice(0)) resolve();
    },
    /** 只放行第 index 个等待中的请求，让较旧请求的回执晚于较新请求到达。 */
    releaseOne(op, index) {
      const state = gates.get(op);
      const [resolve] = state?.waiting.splice(index, 1) ?? [];
      resolve?.();
    },
    fail(op, message) {
      if (message) failures.set(op, message);
      else failures.delete(op);
    },
    setEnvironment(mode) {
      environmentMode = mode;
    },
    setPickedFile(file) {
      pickedFile = file;
    },
    reset() {
      calls.length = 0;
      for (const op of gates.keys()) this.release(op);
      gates.clear();
      failures.clear();
      environmentMode = "available";
      pickedFile = null;
    },
    /** 页面通过 exposeFunction 调用的传输层。 */
    bridge: {
      async projectSetup(request) {
        const op = request.action;
        const detail = {
          workspace: workspaceName(request.target?.workspacePath),
          ...(request.path ? { path: request.path } : {}),
        };
        log(op, "start", detail);
        try {
          await gate(op);
          maybeFail(op);
          const result = await projectSetup(request, {
            graph,
            project: port,
            digest: sha256,
          });
          log(op, "done", detail);
          return result;
        } catch (error) {
          log(op, "error", { ...detail, message: String(error?.message ?? error) });
          throw error;
        }
      },
      async searchFiles(params) {
        const op = "searchWorkspaceFiles";
        const detail = { workspace: workspaceName(params.rootPath), query: params.query };
        log(op, "start", detail);
        try {
          await gate(op);
          maybeFail(op);
          const needle = String(params.query ?? "").toLowerCase();
          const all = await walk(params.rootPath);
          const found = all
            .map((full) => ({
              name: path.basename(full),
              path: full,
              relativePath: path.relative(params.rootPath, full).replaceAll("\\", "/"),
              type: "file",
            }))
            .filter((file) => file.relativePath.toLowerCase().includes(needle))
            .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
            .slice(0, params.limit ?? 30);
          log(op, "done", detail);
          return found;
        } catch (error) {
          log(op, "error", { ...detail, message: String(error?.message ?? error) });
          throw error;
        }
      },
      async pickFile() {
        log("selectFile", "start");
        await gate("selectFile");
        log("selectFile", "done");
        return pickedFile;
      },
      record(op, detail) {
        log(op, "record", detail);
      },
    },
    async dispose() {
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}
