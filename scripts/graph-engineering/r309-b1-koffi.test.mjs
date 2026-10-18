import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  stageAgentBundle,
  resolveAgentBundlePaths,
} from "../../packages/desktop/scripts/stage-agent-bundle.mjs";
import {
  cliKoffiExtraResources,
  verifyStagedKoffi,
} from "../../packages/desktop/scripts/koffi-package-assets.mjs";
import { detachedKoffiSmoke } from "./r309-b1-detached-smoke.mjs";

const targetPlatform = { os: "win32", arch: "x64" };
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const put = async (file, data) => {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, data);
};
const metadata = { name: "koffi", version: "2.15.6", main: "./index.js" };

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "r309-b1-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await put(
    join(root, "apps/zcode-cli/packages/adapters/package.json"),
    JSON.stringify({ dependencies: { koffi: "2.15.6" } }),
  );
  await put(
    join(root, "pnpm-lock.yaml"),
    "importers:\n  apps/zcode-cli/packages/adapters:\n    dependencies:\n      koffi:\n        specifier: 2.15.6\n        version: 2.15.6\n",
  );
  await put(
    join(root, "apps/zcode-cli/packages/cli/dist/zcode.cjs"),
    'module.exports = () => import("koffi");\n',
  );
  const source = join(root, "node_modules/koffi");
  await put(join(source, "package.json"), JSON.stringify(metadata));
  await put(join(source, "index.js"), "module.exports = { fixture: true };\n");
  await put(join(source, "LICENSE.txt"), "Structural fixture; not a real native package\n");
  await put(join(source, "vendor/nested/NOTICE"), "Preserve nested notices\n");
  await put(join(source, "indirect.js"), "// preserve additional runtime entry\n");
  // PE header only: this proves structural rejection, never a native load PASS.
  const bytes = Buffer.alloc(128);
  bytes.write("MZ");
  bytes.writeUInt32LE(64, 0x3c);
  bytes.writeUInt32LE(0x4550, 64);
  bytes.writeUInt16LE(0x8664, 68);
  await put(join(source, "build/koffi/win32_x64/koffi.node"), bytes);
  await put(join(source, "build/koffi/linux_x64/koffi.node"), "wrong target");
  const paths = resolveAgentBundlePaths({ repoRoot: root, platformKey: "win32-x64" });
  const stage = () => stageAgentBundle({ repoRoot: root, platformKey: "win32-x64", log() {} });
  const verify = (extra = {}) =>
    verifyStagedKoffi({
      repoRoot: root,
      resourcesDir: dirname(paths.glmDir),
      targetPlatform,
      ...extra,
    });
  return { root, source, ...paths, stage, verify };
}

test("clean and repeat staging own cleanup, lookup, complete files and reproducible hashes", async (t) => {
  const f = await fixture(t);
  await put(join(f.glmDir, "stale.exe"), "old");
  await f.stage();
  assert.deepEqual(await f.verify(), []);
  const first = await readFile(join(f.glmDir, ".koffi-runtime.json"), "utf8");
  const root = join(f.glmDir, "node_modules/koffi");
  assert.equal(createRequire(f.stagedBundlePath).resolve("koffi"), join(root, "index.js"));
  assert.deepEqual(await readdir(join(root, "build/koffi")), ["win32_x64"]);
  assert.match(await readFile(join(root, "vendor/nested/NOTICE"), "utf8"), /nested/);
  await put(join(root, "build/koffi/win32_arm64/koffi.node"), "stale");
  await f.stage();
  assert.deepEqual(await f.verify(), []);
  assert.equal(await readFile(join(f.glmDir, ".koffi-runtime.json"), "utf8"), first);
  await assert.rejects(readFile(join(f.glmDir, "stale.exe")), /ENOENT/);
});

for (const [name, mutate, message] of [
  [
    "missing package",
    (f) => rm(f.source, { recursive: true }),
    /missing installed CLI koffi package|outside the build repository/,
  ],
  [
    "missing addon",
    (f) => rm(join(f.source, "build/koffi/win32_x64/koffi.node")),
    /missing target native addon/,
  ],
  [
    "wrong package name",
    (f) => put(join(f.source, "package.json"), JSON.stringify({ ...metadata, name: "other" })),
    /identity\/version/,
  ],
  [
    "wrong package version",
    (f) => put(join(f.source, "package.json"), JSON.stringify({ ...metadata, version: "2.15.5" })),
    /identity\/version/,
  ],
  [
    "wrong architecture",
    async (f) => {
      const p = join(f.source, "build/koffi/win32_x64/koffi.node");
      const b = await readFile(p);
      b.writeUInt16LE(0xaa64, 68);
      await writeFile(p, b);
    },
    /wrong architecture/,
  ],
  ["missing notice", (f) => rm(join(f.source, "LICENSE.txt")), /missing koffi runtime file/],
  [
    "lock drift",
    (f) => put(join(f.root, "pnpm-lock.yaml"), "importers: {}"),
    /lockfile version mismatch/,
  ],
]) {
  test(`stage rejects ${name} and cannot reuse previous output`, async (t) => {
    const f = await fixture(t);
    await f.stage();
    await mutate(f);
    await assert.rejects(f.stage(), message);
    assert.notDeepEqual(await f.verify(), []);
    await assert.rejects(readFile(join(f.glmDir, ".node-bundle-meta.json")), /ENOENT/);
  });
}

test("verifier rejects plugin-only copy and independently checks plugin runtime", async (t) => {
  const f = await fixture(t);
  await f.stage();
  const plugin = join(f.glmDir, "packages/zcode-cua-plugin");
  await put(
    join(plugin, "package.json"),
    JSON.stringify({ dependencies: { koffi: metadata.version } }),
  );
  await cp(join(f.glmDir, "node_modules/koffi"), join(plugin, "node_modules/koffi"), {
    recursive: true,
  });
  assert.deepEqual(await f.verify(), []);
  await rm(join(f.glmDir, "node_modules"), { recursive: true });
  assert.match((await f.verify()).join("\n"), /CLI koffi/);
  await f.stage();
  await put(
    join(plugin, "package.json"),
    JSON.stringify({ dependencies: { koffi: metadata.version } }),
  );
  assert.match((await f.verify()).join("\n"), /plugin koffi/);
});

test("verifier rejects byte tampering, stale architecture, missing inventory and packed ASAR addon", async (t) => {
  const f = await fixture(t);
  await f.stage();
  await put(join(f.glmDir, "node_modules/koffi/index.js"), "tampered");
  assert.match((await f.verify()).join("\n"), /hash mismatch/);
  await f.stage();
  await put(join(f.glmDir, "node_modules/koffi/build/koffi/win32_arm64/koffi.node"), "stale");
  assert.match((await f.verify()).join("\n"), /wrong-architecture/);
  await f.stage();
  assert.match(
    (
      await f.verify({
        asarEntries: [
          { packState: "pack", path: "/node_modules/koffi/build/koffi/win32_x64/koffi.node" },
        ],
      })
    ).join("\n"),
    /inside ASAR/,
  );
  await rm(join(f.glmDir, ".koffi-runtime.json"));
  assert.match((await f.verify()).join("\n"), /CLI koffi/);
});

test("non-Windows CLI staging needs no Windows dependency", async (t) => {
  const f = await fixture(t);
  await rm(f.source, { recursive: true });
  for (const os of ["linux", "darwin"]) {
    assert.deepEqual(cliKoffiExtraResources({ os, arch: "arm64" }), []);
    await stageAgentBundle({ repoRoot: f.root, platformKey: `${os}-arm64`, log() {} });
    assert.deepEqual(
      await verifyStagedKoffi({
        resourcesDir: join(f.root, "packages/desktop/bundled-agents", `${os}-arm64`),
        targetPlatform: { os, arch: "arm64" },
      }),
      [],
    );
  }
});

test("actual electron-builder resource copy excludes root node_modules; explicit Koffi mapping preserves it", async (t) => {
  const f = await fixture(t);
  await f.stage();
  const fromDesktop = createRequire(join(repo, "packages/desktop/package.json"));
  const fromBuilder = createRequire(fromDesktop.resolve("electron-builder/package.json"));
  const { FileMatcher, copyFiles } = fromBuilder("app-builder-lib/out/fileMatcher.js");
  const resourcesDir = join(f.root, "copy/resources");
  const matcher = (from, to, patterns) => new FileMatcher(from, to, (value) => value, patterns);
  await copyFiles(
    [matcher(f.glmDir, join(resourcesDir, "glm"), ["**/*", "!**/*.map"])],
    null,
    false,
  );
  assert.match((await f.verify({ resourcesDir })).join("\n"), /CLI koffi/);
  await copyFiles(
    cliKoffiExtraResources(targetPlatform).map((asset) =>
      matcher(
        join(f.root, "packages/desktop", asset.from),
        join(resourcesDir, asset.to),
        asset.filter,
      ),
    ),
    null,
    false,
  );
  assert.deepEqual(await f.verify({ resourcesDir }), []);
  assert.equal(
    createRequire(join(resourcesDir, "glm/zcode.cjs")).resolve("koffi"),
    join(resourcesDir, "glm/node_modules/koffi/index.js"),
  );
});

test("real exact-lockfile package stages with original bytes and licenses", async (t) => {
  const f = await fixture(t);
  const actual = dirname(
    createRequire(join(repo, "apps/zcode-cli/packages/adapters/package.json")).resolve(
      "koffi/package.json",
    ),
  );
  await rm(f.source, { recursive: true });
  await cp(actual, f.source, { recursive: true, dereference: true });
  await f.stage();
  assert.deepEqual(await f.verify(), []);
  const manifest = JSON.parse(await readFile(join(f.glmDir, ".koffi-runtime.json"), "utf8"));
  assert.ok(manifest.files["vendor/node-api-headers/LICENSE"]);
  assert.ok(manifest.files["src/cnoke/LICENSE.txt"]);
  assert.deepEqual(
    await readFile(join(f.glmDir, "node_modules/koffi/build/koffi/win32_x64/koffi.node")),
    await readFile(join(actual, "build/koffi/win32_x64/koffi.node")),
  );
  // No attempt to load a Windows addon on other hosts; detached Electron evidence is separate.
});

test("structural fixture native load fails instead of producing false native PASS", async (t) => {
  const f = await fixture(t);
  await f.stage();
  const addon = join(f.glmDir, "node_modules/koffi/build/koffi/win32_x64/koffi.node");
  const child = spawnSync(process.execPath, ["-e", "require(process.argv[1])", addon], {
    encoding: "utf8",
    windowsHide: true,
  });
  assert.notEqual(child.status, 0);
});

test("detached smoke rejects Node-only, failed commands, missing compiled import and repository ancestors", async (t) => {
  const f = await fixture(t);
  await f.stage();
  const detached = await mkdtemp(join(tmpdir(), "r309-b1-smoke-"));
  t.after(() => rm(detached, { recursive: true, force: true }));
  await cp(f.glmDir, join(detached, "resources/glm"), { recursive: true });
  const entry = join(detached, "resources/glm/zcode.cjs");
  await assert.rejects(
    detachedKoffiSmoke({ entry, runtime: process.execPath }),
    /Electron runtime required/,
  );
  await assert.rejects(
    detachedKoffiSmoke({ entry, runtime: join(f.root, "absent.exe") }),
    /detached smoke failed/,
  );
  await put(entry, "// no external import\n");
  await assert.rejects(
    detachedKoffiSmoke({ entry, runtime: process.execPath }),
    /compiled Koffi import shape/,
  );
  await put(join(detached, ".git"), "gitdir: fixture");
  await assert.rejects(
    detachedKoffiSmoke({ entry, runtime: process.execPath }),
    /repository ancestor/,
  );
});
