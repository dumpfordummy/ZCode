import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// 只在已经暂存的、脱离仓库的 resources/glm 上运行；不构建、安装或启动产品。
export async function detachedKoffiSmoke({ entry, runtime }) {
  entry = resolve(entry);
  assert.equal(parse(entry).base, "zcode.cjs");
  for (let dir = dirname(entry); ; dir = dirname(dir)) {
    assert.equal(
      await access(join(dir, ".git")).then(
        () => true,
        () => false,
      ),
      false,
      "smoke entry must have no repository ancestor",
    );
    if (dir !== dirname(entry))
      assert.equal(
        await access(join(dir, "node_modules")).then(
          () => true,
          () => false,
        ),
        false,
        "smoke entry must have no ancestor node_modules",
      );
    if (dirname(dir) === dir) break;
  }
  const bundle = await readFile(entry, "utf8");
  const expression = bundle.match(/\bimport\(["']koffi["']\)/)?.[0];
  assert.ok(expression, "review compiled Koffi import shape before changing smoke");
  const probe = join(dirname(entry), `.koffi-smoke-${process.pid}.cjs`);
  const code = `
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
(async () => {
  assert.ok(process.versions.electron, 'Electron runtime required; Node-only is not proof');
  assert.equal(process.platform, 'win32'); assert.equal(process.arch, 'x64');
  assert.equal(process.env.ELECTRON_RUN_AS_NODE, '1');
  assert.equal(process.env.NODE_PATH, undefined);
  const entry = path.join(__dirname, 'zcode.cjs');
  const req = createRequire(entry);
  const root = path.join(__dirname, 'node_modules/koffi');
  const resolved = req.resolve('koffi');
  assert.equal(fs.realpathSync(resolved), fs.realpathSync(path.join(root, 'index.js')));
  const cjs = req('koffi');
  // Execute the literal import expression extracted from this compiled CLI, from its directory.
  const imported = await (${expression});
  assert.equal(imported.default, cjs);
  const pkg = req('koffi/package.json'); assert.equal(pkg.version, '2.15.6');
  assert.equal(cjs.version, pkg.version);
  const addon = path.join(root, 'build/koffi/win32_x64/koffi.node');
  const loaded = Object.keys(require.cache).filter(p => /koffi\\.node$/i.test(p));
  assert.deepEqual(loaded.map(p => fs.realpathSync(p)), [fs.realpathSync(addon)]);
  const lib = cjs.load('kernel32.dll');
  assert.equal(lib.func('uint32_t GetCurrentProcessId()')(), process.pid);
  const hash = p => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  console.log(JSON.stringify({status:'PASS', platform:process.platform, arch:process.arch,
    versions:process.versions, runtime:process.execPath, runtimeSha256:hash(process.execPath),
    entry, entrySha256:hash(entry), cjsResolved:resolved, compiledImport:${JSON.stringify(expression)},
    version:pkg.version, napiRequired:pkg.cnoke.napi, addon, addonSha256:hash(addon), loaded}));
})().catch(error => { console.error(error); process.exitCode = 1; });
`;
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !["NODE_PATH", "NODE_OPTIONS", "ELECTRON_RUN_AS_NODE"].includes(key.toUpperCase()),
    ),
  );
  try {
    await writeFile(probe, code, { flag: "wx" });
    const child = spawnSync(resolve(runtime), [probe], {
      cwd: dirname(entry),
      env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
      encoding: "utf8",
      windowsHide: true,
      timeout: 30000,
    });
    if (child.error || child.status !== 0)
      throw new Error(
        `detached smoke failed (status ${child.status}): ${child.error?.message ?? child.stderr}`,
      );
    return JSON.parse(child.stdout.trim());
  } finally {
    await rm(probe, { force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(
    process.argv.length,
    4,
    "Usage: node r309-b1-detached-smoke.mjs <resources/glm/zcode.cjs> <existing-electron.exe>",
  );
  console.log(
    JSON.stringify(
      await detachedKoffiSmoke({ entry: process.argv[2], runtime: process.argv[3] }),
      null,
      2,
    ),
  );
}
