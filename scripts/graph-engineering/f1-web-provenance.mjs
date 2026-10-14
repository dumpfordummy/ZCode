import assert from "node:assert/strict";
import { readFile, writeFile, stat, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fingerprintBoundedTrees } from "../../packages/shared/src/node/boundedTreeFingerprint.ts";
const fixture = process.env.F1_WEB_ORACLE;
assert.ok(fixture, "Explicit successful synthetic Web oracle required");
const oracle = JSON.parse(await readFile(path.join(fixture, "oracle.json"), "utf8"));
assert.equal(oracle.status, "PASS");
const assets = JSON.parse(
  await readFile(path.join(fixture, "workspace/Tests/obj/project.assets.json"), "utf8"),
);
assert.equal(Object.keys(assets.packageFolders).length, 1);
const cache = Object.keys(assets.packageFolders)[0];
const dotnet = "C:/Program Files/dotnet";
const roots = [
  ["dotnet", path.join(dotnet, "dotnet.exe")],
  ["sdk", path.join(dotnet, "sdk/8.0.426")],
  ["net-reference", path.join(dotnet, "packs/Microsoft.NETCore.App.Ref/8.0.32")],
  ["aspnet-reference", path.join(dotnet, "packs/Microsoft.AspNetCore.App.Ref/8.0.32")],
  ["apphost", path.join(dotnet, "packs/Microsoft.NETCore.App.Host.win-x64/8.0.32")],
  ["net-runtime", path.join(dotnet, "shared/Microsoft.NETCore.App/8.0.32")],
  ["aspnet-runtime", path.join(dotnet, "shared/Microsoft.AspNetCore.App/8.0.32")],
  ["host-fxr", path.join(dotnet, "host/fxr/10.0.12")],
];
const limits = {
  files: 50000,
  bytes: 2 * 1024 * 1024 * 1024,
  fileBytes: 256 * 1024 * 1024,
  depth: 32,
  elapsedMs: 120000,
};
const summary = {
  status: "RUNNING",
  roots: [],
  packages: [],
  resolverDirectoryMembership: {},
  source: "retained public package fixture and installed toolchain; no installation/download",
  startedAt: new Date().toISOString(),
};
const begin = performance.now();
try {
  for (const [label, root] of roots) {
    const start = performance.now();
    const observed = await fingerprintBoundedTrees({
      roots: [{ path: path.resolve(root), label: "$ROOT" }],
      limits,
    });
    summary.roots.push({
      label,
      relativePath: path.relative(dotnet, root).replaceAll("\\", "/"),
      ...observed,
      elapsedMs: performance.now() - start,
    });
  }
  for (const parent of [
    "host/fxr",
    "shared/Microsoft.NETCore.App",
    "shared/Microsoft.AspNetCore.App",
    "packs/Microsoft.NETCore.App.Ref",
    "packs/Microsoft.AspNetCore.App.Ref",
    "packs/Microsoft.NETCore.App.Host.win-x64",
  ])
    summary.resolverDirectoryMembership[parent] = (await readdir(path.join(dotnet, parent))).sort();
  for (const [id, entry] of Object.entries(assets.libraries)) {
    if (entry.type !== "package") continue;
    assert.match(entry.path, /^[a-z0-9._-]+\/[a-z0-9._+-]+$/);
    const root = path.join(cache, entry.path),
      [name, version] = entry.path.split("/");
    const archive = path.join(root, `${name}.${version}.nupkg`);
    assert.ok((await stat(archive)).size < 64 * 1024 * 1024);
    const archiveSha512 = createHash("sha512")
      .update(await readFile(archive))
      .digest("base64");
    assert.equal(archiveSha512, (await readFile(archive + ".sha512", "utf8")).trim(), id);
    const metadata = JSON.parse(await readFile(path.join(root, ".nupkg.metadata"), "utf8"));
    const source = metadata.source.replace(/\\+/g, "/").replace(/\/+$/, "").toLowerCase();
    assert.ok(
      [
        "https://api.nuget.org/v3/index.json",
        "c:/program files (x86)/microsoft sdks/nugetpackages",
      ].includes(source),
      `Unrecognized retained package origin: ${id}`,
    );
    assert.equal(metadata.contentHash, entry.sha512);
    const observed = await fingerprintBoundedTrees({
      roots: [{ path: path.resolve(root), label: "$ROOT" }],
      limits,
    });
    summary.packages.push({
      id,
      path: entry.path,
      sha512: entry.sha512,
      archiveSha512,
      origin: source.startsWith("https:") ? "nuget.org" : "installed-Microsoft-SDK-cache",
      ...observed,
    });
  }
  summary.status = "PASS";
} catch (e) {
  summary.status = "FAIL";
  summary.error = String(e.stack ?? e);
  process.exitCode = 1;
}
summary.elapsedMs = performance.now() - begin;
await writeFile(
  path.join(fixture, `provenance-${Date.now()}.json`),
  JSON.stringify(summary, null, 2),
);
console.log(
  JSON.stringify({
    status: summary.status,
    roots: summary.roots.length,
    packages: summary.packages.length,
    elapsedMs: summary.elapsedMs,
    error: summary.error,
  }),
);
