import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildReleaseManifest, resolvePackagePolicies } from "./release-manifest.mjs";
import { syntheticPackage } from "./package-fixture.mjs";

const root = path.resolve(import.meta.dirname, "../..");

test("retained comparison data reconciles into disjoint, summing accounts", async () => {
  const { reconcileComparison, reconcileTree } = await import("./reconcile-comparison.mjs");
  const retained = JSON.parse(
    await readFile(
      path.join(root, "docs/graph-engineering/z8/evidence/build-comparison.json"),
      "utf8",
    ),
  );
  const accounting = reconcileComparison(retained);
  const asar = accounting.appAsar;
  assert.equal(asar.membersInA, 27573);
  assert.equal(asar.pathsPresentInBoth, 27562);
  assert.equal(asar.byteIdenticalSamePath, 27553);
  assert.equal(asar.changedSamePath, 9);
  assert.equal(asar.pathsOnlyInA, 11);
  assert.equal(asar.pathsOnlyInB, 11);
  assert.equal(asar.normalizedDiagnostic.changedSamePathIdenticalAfterNormalizing, 9);
  assert.equal(asar.normalizedDiagnostic.onlyInOneSidePairsIdenticalAfterNormalizing, 11);
  assert.equal(accounting.winUnpacked.byteIdenticalSamePath, 84);
  assert.equal(accounting.winUnpacked.changedSamePath, 2);
  assert.equal(accounting.installerByteIdentical, false);
  // 不闭合的数据必须报错，而不是被悄悄接受。
  assert.throws(
    () =>
      reconcileTree({
        label: "x",
        filesA: 10,
        filesB: 10,
        onlyInA: ["a"],
        onlyInB: [],
        differentFiles: [],
      }),
    /do not reconcile/,
  );
});

test("package hash verification passes on the manifest's own bytes and fails when a component changes", async () => {
  const { verifyPackageHashes } = await import("./verify-package-hashes.mjs");
  const dist = await mkdtemp(path.join(tmpdir(), "graph-hash-verify-"));
  try {
    await syntheticPackage(dist, {});
    await writeFile(
      path.join(dist, "ZCode Graph-3.14.3-z8.1-win-x64.exe"),
      "synthetic installer bytes",
    );
    const policies = await resolvePackagePolicies(root);
    const manifest = await buildReleaseManifest({
      root,
      distDirectory: dist,
      distName: "dist-graph-test",
      version: "3.14.3-z8.1",
      baseVersion: "3.14.3",
      source: { commit: "a".repeat(40), dirty: false },
      toolchain: {},
      protocol: {},
      policies,
      embedded: { product: { productName: "ZCode Graph" } },
    });
    await writeFile(path.join(dist, "RELEASE_MANIFEST.json"), JSON.stringify(manifest));
    const ok = await verifyPackageHashes(dist);
    assert.equal(ok.ok, true, JSON.stringify(ok.mismatches));
    assert.equal(ok.installer.sha256, manifest.artifact.installer.sha256);
    // 改一个字节（agent 包里的一个文件）：必须被发现，且指出是哪个组件。
    await writeFile(path.join(dist, "win-unpacked/resources/glm/zcode.cjs"), "// tampered\n");
    const bad = await verifyPackageHashes(dist);
    assert.equal(bad.ok, false);
    assert.ok(bad.mismatches.some((m) => m.name.startsWith("resources/glm/")));
    // 清单本身不被改写。
    assert.equal(
      JSON.parse(await readFile(path.join(dist, "RELEASE_MANIFEST.json"), "utf8")).version,
      "3.14.3-z8.1",
    );
  } finally {
    await rm(dist, { recursive: true, force: true });
  }
});

test("B1 controlled build preflight rejects each ssh2 metadata class without touching runtime files", async () => {
  const { mkdir, access } = await import("node:fs/promises");
  const { assertCleanSsh2BuildMetadata } = await import("./windows-build-preflight.mjs");
  const owned = await mkdtemp(path.join(tmpdir(), "b1-preflight-"));
  try {
    const build = path.join(owned, "lib/protocol/crypto/build");
    await mkdir(build, { recursive: true });
    const runtime = path.join(build, "sshcrypto.node");
    await writeFile(runtime, "synthetic runtime binary retained");
    assert.equal((await assertCleanSsh2BuildMetadata(owned)).status, "PASS");
    for (const name of [
      "sshcrypto.node.recipe",
      "Cl.items.tlog",
      "link.secondary.1.tlog",
      "sshcrypto.lastbuildstate",
      "sshcrypto.vcxproj",
      "sshcrypto.vcxproj.filters",
    ]) {
      const file = path.join(build, name);
      await writeFile(file, "synthetic unwanted metadata");
      await assert.rejects(assertCleanSsh2BuildMetadata(owned), /Unintended ssh2 build metadata/);
      await access(file);
      await access(runtime);
      await rm(file);
    }
  } finally {
    await rm(owned, { recursive: true, force: true });
  }
});

test("B1 placeholder exception is exact and does not hide seeded checkout or user paths", async () => {
  const { allRules, scanText, classifyHits, validateExceptions } =
    await import("./package-inspect.mjs");
  const data = JSON.parse(
    await readFile(
      path.join(root, "scripts/graph-engineering/package-scan-exceptions.json"),
      "utf8",
    ),
  );
  const entries = validateExceptions(data.exceptions);
  for (const file of [
    "app.asar/out/renderer/assets/IntlProvider-CVTNn1Pi.js",
    "app.asar/out/renderer/assets/IntlProvider-DyoQwIj1.js",
  ]) {
    const text = "192.168.1.100 192.168.1.100";
    const rules = allRules({
      checkoutRoot: "C:\\Users\\SyntheticBuilder\\checkout",
      userName: "SyntheticBuilder",
    });
    assert.equal(classifyHits(scanText(file, text, rules), entries).unexplained.length, 0);
    for (const [name, body] of [
      [file, text + " 192.168.1.100"],
      [file, text + " 192.168.1.101"],
      [file + "-other", text],
      [file, text + " C:\\Users\\SyntheticBuilder\\checkout\\private.txt"],
      [
        "app.asar/node_modules/ssh2/lib/protocol/crypto/build/sshcrypto.vcxproj",
        "C:\\Users\\SyntheticBuilder\\checkout",
      ],
    ])
      assert.ok(classifyHits(scanText(name, body, rules), entries).unexplained.length > 0);
  }
  for (const locale of ["en-US", "zh-CN"]) {
    const source = await readFile(
      path.join(root, "packages/ui/src/i18n/locales", locale + ".ts"),
      "utf8",
    );
    assert.match(source, /"ssh\.hostPlaceholder": "[^"]*192\.168\.1\.100"/);
  }
});
