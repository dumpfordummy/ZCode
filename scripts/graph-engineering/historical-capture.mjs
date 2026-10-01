import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

/**
 * Z8.2：从已发布的旧 Graph 版本捕获「旧二进制真正写下的」数据。
 *   node scripts/graph-engineering/historical-capture.mjs prepare <z2.2|z7.5>
 *   node scripts/graph-engineering/historical-capture.mjs run <fixtureId>
 * 安装包只做只读解压（仓库自带的 7za），从不执行；旧 harness 取自同一个发布标签（各版本界面不同），
 * 放在 .tmp 的临时目录里运行。唯一的改动是给临时目录里的 isolation.mjs 的 stopApp 加一个「停止后复制 Graph 配置」
 * 钩子（环境变量 Z8_CAPTURE_DIR），其余旧 harness 与旧二进制逐字节不变。数据永远不用当前代码构造。
 */
const root = path.resolve(import.meta.dirname, "../..");
const scratch = path.join(root, ".tmp/z8-2");
const requireFromRoot = createRequire(path.join(root, "package.json"));
const sevenZip = path.join(root, "node_modules/7zip-bin/win/x64/7za.exe");

export const RELEASES = {
  "z2.2": {
    tag: "graph-v3.14.0-z2.2",
    version: "3.14.0-z2.2",
    asset: "ZCode.Graph-3.14.0-z2.2-win-x64.exe",
  },
  "z7.5": {
    tag: "graph-v3.14.0-z7.5",
    version: "3.14.0-z7.5",
    asset: "ZCode.Graph-3.14.0-z7.5-win-x64.exe",
  },
};

/** fixtureId → 旧版本自己的驱动与参数，以及取哪一次「停止后」的复制（stop-N 或 final）。 */
export const FIXTURES = {
  "z22-completed-sequential": {
    release: "z2.2",
    script: "z2-native-smoke.mjs",
    args: ["--scenario=complete"],
    take: "final",
  },
  "z22-permission-pending-prereconcile": {
    release: "z2.2",
    script: "z2-native-smoke.mjs",
    args: ["--scenario=restart-permission"],
    take: "stop-1",
  },
  "z22-permission-interrupted-after-old-restart": {
    release: "z2.2",
    script: "z2-native-smoke.mjs",
    args: ["--scenario=restart-permission"],
    take: "final",
  },
  "z22-question-pending-prereconcile": {
    release: "z2.2",
    script: "z2-native-smoke.mjs",
    args: ["--scenario=restart-interrupted"],
    take: "stop-1",
  },
  "z22-cancelled-terminal": {
    release: "z2.2",
    script: "z2-native-smoke.mjs",
    args: ["--scenario=cancel-permission"],
    take: "final",
  },
  "z22-z1-literal-completed": {
    release: "z2.2",
    script: "z2-z1-regression.mjs",
    args: [],
    take: "final",
  },
  "z75-sequential-completed": {
    release: "z7.5",
    script: "z2-native-smoke.mjs",
    args: ["--scenario=complete"],
    take: "final",
  },
  "z75-approval-pending-prereconcile": {
    release: "z7.5",
    script: "z3-native-smoke.mjs",
    args: ["--scenario=restart-pending"],
    take: "stop-1",
  },
  "z75-approval-after-old-restart": {
    release: "z7.5",
    script: "z3-native-smoke.mjs",
    args: ["--scenario=restart-pending"],
    take: "final",
  },
  "z75-approval-rejected-terminal": {
    release: "z7.5",
    script: "z3-native-smoke.mjs",
    args: ["--scenario=reject"],
    take: "final",
  },
  "z75-build-test-completed": {
    release: "z7.5",
    script: "z4-native-smoke.mjs",
    args: ["--scenario=complete"],
    take: "final",
  },
  "z75-test-failure-despite-model-pass": {
    release: "z7.5",
    script: "z4-native-smoke.mjs",
    args: ["--scenario=model-pass"],
    take: "final",
  },
  "z75-needs-human-exhausted": {
    release: "z7.5",
    script: "z5-native-smoke.mjs",
    args: ["--scenario=exhausted"],
    take: "final",
  },
  "z75-needs-human-condition-missing": {
    release: "z7.5",
    script: "z5-native-smoke.mjs",
    args: ["--scenario=condition-missing"],
    take: "final",
  },
  "z75-reviewer-pass-over-failing-test-needs-human": {
    release: "z7.5",
    script: "z5-native-smoke.mjs",
    args: ["--scenario=reviewer-pass"],
    take: "final",
  },
  "z75-library-user-versions": {
    release: "z7.5",
    script: "z6-native-library.mjs",
    args: [],
    take: "final",
  },
};

/**
 * 旧 harness 里仅有的、与产品无关的适配（只改测试脚本，不改旧二进制）。每一项都会记录在来源证明里：
 * z6-native-library 是为开发构建写的，假定「已有记录文件」且把库文件放在 data/ 目录；打包应用的私有配置不在那里。
 */
export const HARNESS_PATCHES = {
  "z7.5": [
    {
      file: "scripts/graph-engineering/z2-native-helpers.mjs",
      find: `export async function readGraphRecord(isolation) {
  return JSON.parse(await readFile(acceptancePaths(isolation).record, "utf8"));
}`,
      replace: `export async function readGraphRecord(isolation) {
  try {
    return JSON.parse(await readFile(acceptancePaths(isolation).record, "utf8"));
  } catch (error) {
    // Z8.2 适配：尚未保存任何设计时没有记录文件；返回空壳以便驱动继续（旧 harness 假定开发构建里已有记录）。
    if (error.code === "ENOENT") return { definition: null, runs: [] };
    throw error;
  }
}`,
    },
    {
      file: "scripts/graph-engineering/z6-native-library.mjs",
      find: `const libraryPath = path.join(
  isolation.home,
  "data/.zcode/v2/graph-engineering/workflow-library.json",
);`,
      replace: `const libraryPath = path.join(
  path.dirname(acceptancePaths(isolation).record),
  "workflow-library.json",
); // Z8.2 适配：打包应用的库文件在私有配置里，不在开发构建的 data/ 下`,
      extraImport: 'import { acceptancePaths } from "./acceptance-paths.mjs";',
    },
  ],
};

const HOOK_MARKER = "// Z8_CAPTURE_HOOK";
const STOP_APP = `  const stopApp = async () => {
    if (app) {
      await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
      await app.close().catch(() => {});
      app = undefined;
    }
  };`;
const HOOKED_STOP_APP = `  let z8Stops = 0; ${HOOK_MARKER}
  const stopApp = async () => {
    if (app) {
      await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
      await app.close().catch(() => {});
      app = undefined;
      if (process.env.Z8_CAPTURE_DIR) {
        // 停止后立即复制 Graph 配置与工作区（不含 Electron 缓存/凭据以外的会话数据），再被下一次 launch 使用。
        const { cp: copy, mkdir: makeDir } = await import("node:fs/promises");
        const target = path.join(process.env.Z8_CAPTURE_DIR, \`stop-\${++z8Stops}\`);
        await makeDir(target, { recursive: true });
        await copy(path.join(home, "home", ".zcode-graph-engineering", "home"), path.join(target, "profile-home"), { recursive: true });
        await copy(workspace, path.join(target, "workspace"), { recursive: true });
      }
    }
  };`;

const sha256File = async (file) =>
  createHash("sha256")
    .update(await readFile(file))
    .digest("hex");

export async function prepare(key) {
  const release = RELEASES[key];
  const directory = path.join(scratch, "historical", key);
  const installer = path.join(directory, release.asset);
  const expected = (await readFile(path.join(directory, "SHA256SUMS.txt"), "utf8")).split(/\s+/)[0];
  const actual = await sha256File(installer);
  if (expected !== actual)
    throw new Error(`Installer hash mismatch for ${key}: ${actual} != ${expected}`);
  const appDirectory = path.join(directory, "app");
  if (!(await stat(path.join(appDirectory, "ZCode Graph.exe")).catch(() => null))) {
    // 7z 只读解压：安装包内含 7z 数据，不会被执行。
    const code = await new Promise((resolve) =>
      spawn(sevenZip, ["x", "-y", `-o${appDirectory}`, installer], {
        stdio: "ignore",
        windowsHide: true,
      }).on("close", resolve),
    );
    if (code !== 0)
      throw new Error(
        `7za could not extract ${key} without executing it (exit ${code}); blocked for Z8.4.`,
      );
  }
  const asar = requireFromRoot("@electron/asar");
  const identity = JSON.parse(
    asar.extractFile(path.join(appDirectory, "resources/app.asar"), "package.json"),
  );
  // 旧 harness：取自同一发布标签。
  const harness = path.join(scratch, "harness", key);
  await mkdir(harness, { recursive: true });
  const run = promisify(execFile);
  const archive = await run(
    "git",
    [
      "archive",
      release.tag,
      "scripts/graph-engineering",
      "scripts/spawn-command.mjs",
      "packages/desktop/scripts",
    ],
    {
      cwd: root,
      encoding: "buffer",
      maxBuffer: 256_000_000,
    },
  );
  await new Promise((resolve, reject) => {
    const tar = spawn("tar", ["-x", "-C", harness], { stdio: ["pipe", "ignore", "inherit"] });
    tar.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`tar exit ${code}`))));
    tar.stdin.end(archive.stdout);
  });
  const isolationFile = path.join(harness, "scripts/graph-engineering/isolation.mjs");
  let text = await readFile(isolationFile, "utf8");
  if (!text.includes(HOOK_MARKER)) {
    if (!text.includes(STOP_APP))
      throw new Error(`stopApp not found in ${key} harness; cannot add the capture hook.`);
    text = text.replace(STOP_APP, HOOKED_STOP_APP);
    await writeFile(isolationFile, text);
  }
  const patches = [];
  for (const patch of HARNESS_PATCHES[key] ?? []) {
    const file = path.join(harness, patch.file);
    let source = await readFile(file, "utf8");
    if (!source.includes(patch.replace.slice(0, 60))) {
      if (!source.includes(patch.find))
        throw new Error(`Harness patch target not found in ${patch.file}`);
      source = source.replace(patch.find, patch.replace);
      if (patch.extraImport && !source.includes(patch.extraImport))
        source = `${patch.extraImport}
${source}`;
      await writeFile(file, source);
    }
    patches.push({ file: patch.file, patchedSha256: await sha256File(file) });
  }
  return {
    release: key,
    tag: release.tag,
    tagCommit: (
      await run("git", ["rev-parse", `${release.tag}^{commit}`], { cwd: root })
    ).stdout.trim(),
    installer: { asset: release.asset, bytes: (await stat(installer)).size, sha256: actual },
    app: {
      name: identity.name,
      version: identity.version,
      flavor: identity.zcodeProductFlavor,
      main: identity.main,
    },
    harness: {
      patchedFile: "scripts/graph-engineering/isolation.mjs",
      patchedSha256: await sha256File(isolationFile),
      additionalPatches: patches,
    },
  };
}

async function listFiles(directory) {
  const out = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else out.push(full);
    }
  }
  await walk(directory);
  return out;
}

export async function runFixture(fixtureId) {
  const fixture = FIXTURES[fixtureId];
  if (!fixture) throw new Error(`Unknown fixture ${fixtureId}`);
  const release = RELEASES[fixture.release];
  const base = await prepare(fixture.release);
  // Z8_CAPTURE_ROOT 让重跑写到独立目录，不覆盖原始 fixture 的捕获。
  const out = path.join(process.env.Z8_CAPTURE_ROOT ?? path.join(scratch, "profiles"), fixtureId);
  await mkdir(out, { recursive: true });
  const captureDir = path.join(out, "captures");
  const exe = path.join(scratch, "historical", fixture.release, "app", "ZCode Graph.exe");
  const harness = path.join(
    scratch,
    "harness",
    fixture.release,
    "scripts/graph-engineering",
    fixture.script,
  );
  const environment = { ...process.env, Z1_PACKAGED_EXE: exe, Z8_CAPTURE_DIR: captureDir };
  delete environment.ZCODE_ENV;
  let stdout = "";
  let stderr = "";
  const exit = await new Promise((resolve) => {
    const child = spawn(process.execPath, [harness, ...fixture.args], {
      cwd: root,
      env: environment,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", resolve);
  });
  // 旧驱动的完整输出随捕获保存，失败时才有可诊断的原因。
  await writeFile(path.join(out, "old-driver.stdout.txt"), stdout);
  await writeFile(path.join(out, "old-driver.stderr.txt"), stderr);
  const summary = (() => {
    try {
      return JSON.parse(stdout.slice(stdout.indexOf("{")));
    } catch {
      return undefined;
    }
  })();
  const stops = (await readdir(captureDir).catch(() => []))
    .filter((n) => /^stop-\d+$/.test(n))
    .sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)));
  const chosen = fixture.take === "final" ? stops.at(-1) : fixture.take;
  if (!chosen || !stops.includes(chosen))
    throw new Error(`No capture ${fixture.take} for ${fixtureId}; got ${stops.join(",")}`);
  const kept = path.join(out, "kept");
  await cp(path.join(captureDir, chosen), kept, { recursive: true });
  const graphDirectory = path.join(kept, "profile-home/.zcode/v2/graph-engineering");
  const graphFiles = [];
  for (const file of await listFiles(graphDirectory)) {
    const bytes = await readFile(file);
    graphFiles.push({
      profileRelative: path
        .relative(path.join(kept, "profile-home"), file)
        .split(path.sep)
        .join("/"),
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  const provenance = {
    fixtureId,
    sourceRelease: release.tag,
    installer: base.installer,
    oldAppIdentity: base.app,
    scenario: {
      script: fixture.script,
      args: fixture.args,
      oldDriverExitCode: exit,
      oldDriverStatus: summary?.status,
      captureTaken: chosen,
      allCaptures: stops,
    },
    graphFiles,
    byteForByteProducedByOldApp: true,
    sanitization: "none",
    harnessPatch: base.harness,
  };
  await writeFile(path.join(out, "capture.json"), `${JSON.stringify(provenance, null, 2)}\n`);
  return provenance;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const [command, argument] = process.argv.slice(2);
  if (command !== "prepare" && command !== "run")
    throw new Error("usage: historical-capture.mjs prepare <z2.2|z7.5> | run <fixtureId>");
  const result = command === "prepare" ? await prepare(argument) : await runFixture(argument);
  process.stdout.write(`${JSON.stringify(result, null, 2)}
`);
}
