import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { expected, syntheticPackage } from "./package-fixture.mjs";
import {
  buildCapabilityTable,
  buildEmbeddedIdentity,
  buildReleaseManifest,
  graphBuildEnvironment,
  resolveDistDirName,
  resolvePackagePolicies,
} from "./release-manifest.mjs";
import {
  allRules,
  classifyHits,
  inspectPackage,
  scanText,
  validateExceptions,
} from "./package-inspect.mjs";

const root = path.resolve(import.meta.dirname, "../..");

test("side-by-side output directories are restricted to dist-graph names", () => {
  assert.equal(resolveDistDirName(undefined), "dist-graph");
  assert.equal(resolveDistDirName("dist-graph-b2"), "dist-graph-b2");
  assert.equal(resolveDistDirName("dist-graph-z8.1-a"), "dist-graph-z8.1-a");
  for (const bad of [
    "",
    "dist",
    "../dist-graph",
    "dist-graph/x",
    "dist-graph-",
    "dist-graph b",
    "C:\\x",
  ])
    assert.throws(() => resolveDistDirName(bad), bad);
});

test("recorded build environment contains only the explicit builder settings", () => {
  const environment = graphBuildEnvironment("3.14.3-z8.1", "dist-graph-b1");
  assert.equal(environment.ZCODE_GRAPH_VERSION, "3.14.3-z8.1");
  assert.equal(environment.ZCODE_DESKTOP_DIST_DIR, "dist-graph-b1");
  assert.equal(environment.ZCODE_GRAPH_DISTRIBUTION, "1");
  assert.ok(
    !("PATH" in environment) && !("HOME" in environment) && !("USERPROFILE" in environment),
  );
  assert.ok(!Object.keys(environment).some((key) => /TOKEN|KEY|SECRET|PASSWORD/i.test(key)));
});

test("the package policies come from the same resolvers the runtime uses", async () => {
  const policies = await resolvePackagePolicies(root);
  assert.equal(policies.parallel.mode, "disabled");
  assert.equal(policies.parallel.source, "supported-package");
  assert.deepEqual(policies.automaticTelemetry, {
    enabled: false,
    reportEndpoint: "",
    armsRumEndpoint: "",
  });
});

test("capabilities are never package-verified merely because they are enabled", async () => {
  const policies = await resolvePackagePolicies(root);
  const none = buildCapabilityTable({ policies, packagedCases: {} });
  assert.ok(none.every((c) => c.packageVerified.length === 0));
  const some = buildCapabilityTable({
    policies,
    packagedCases: { "ordinary-chat": "PASS", "z2-complete": "FAIL", "z2-question": "PASS" },
  });
  const byId = Object.fromEntries(some.map((c) => [c.id, c]));
  assert.deepEqual(byId["ordinary-chat"].packageVerified, ["ordinary-chat"]);
  assert.deepEqual(byId["sequential-graph"].packageVerified, ["z2-question"]);
  assert.equal(byId["build-test-checks"].enabled, true);
  assert.deepEqual(byId["build-test-checks"].packageVerified, []);
  assert.equal(byId["parallel-fork-join"].enabled, false);
  assert.equal(byId["parallel-fork-join"].policy.mode, "disabled");
  assert.equal(byId["automatic-telemetry"].enabled, false);
});

test("the embedded identity carries no installer hash and no build-machine path", async () => {
  const policies = await resolvePackagePolicies(root);
  const identity = buildEmbeddedIdentity({
    version: "3.14.3-z8.1",
    baseVersion: "3.14.3",
    source: {
      commit: "a".repeat(40),
      dirty: false,
      mergeBase: "b".repeat(40),
      contentReference: { tag: "v3.14.3", sha: "c".repeat(40), scope: "path-level" },
    },
    toolchain: { zcodeCli: "0.16.9", electron: "41.0.3", electronBuilder: "26.8.1" },
    protocol: { zcode: 1, v4Wire: 3 },
    policies,
    identity: {
      productName: "ZCode Graph",
      appId: "dev.dumpfordummy.zcode.graph",
      flavor: "graph",
    },
  });
  const text = JSON.stringify(identity);
  assert.ok(!text.includes(root) && !text.includes(root.replace(/\\/g, "/")));
  assert.ok(!/installer|sha256|buildTime/i.test(text));
  assert.equal(identity.source.mergeBase, "b".repeat(40));
  assert.notEqual(identity.source.mergeBase, identity.source.contentReference.sha);
  assert.equal(identity.capabilityPolicy.parallel.mode, "disabled");
});

test("content scan finds synthetic canaries, redacts secrets and classifies only exact exceptions", () => {
  const canarySecret = `sk-${"A1b2".repeat(8)}`;
  const text = [
    `const key = "${canarySecret}";`,
    "-----BEGIN PRIVATE KEY-----",
    `load("C:\\Users\\builder\\project\\x.js");`,
    `import "scripts/graph-engineering/native-smoke.mjs";`,
    'const dir = ".zcode-graph-engineering";',
    "fetch('http://192.168.1.50/api');",
  ].join("\n");
  const rules = allRules({ checkoutRoot: "D:\\synthetic\\checkout", userName: "builder" });
  const hits = scanText("app.asar/out/main/x.js", text, rules);
  const byRule = (rule) => hits.filter((h) => h.rule === rule);
  assert.equal(byRule("openai-style-key").length, 1);
  assert.ok(
    !JSON.stringify(hits).includes(canarySecret),
    "secret literal must be redacted in the report",
  );
  assert.equal(byRule("private-key-block").length, 1);
  assert.equal(byRule("windows-user-directory").length, 1);
  assert.equal(byRule("fixture-identifier").length, 1);
  assert.equal(byRule("profile-directory-name").length, 1);
  assert.equal(byRule("private-address").length, 1);
  const profile = byRule("profile-directory-name")[0];
  const exception = {
    rule: "profile-directory-name",
    file: profile.file,
    matches: { [profile.match]: 1 },
    reason: "Fixture: the private profile directory constant, an expected literal.",
  };
  const classified = classifyHits(hits, validateExceptions([exception]));
  assert.equal(classified.explained.length, 1);
  assert.equal(classified.unexplained.length, hits.length - 1);
  // 同一例外不能覆盖第二处出现，也不能覆盖另一个文件。
  const doubled = classifyHits([profile, profile], [exception]);
  assert.equal(doubled.explained.length, 1);
  assert.equal(doubled.unexplained.length, 1);
  const moved = classifyHits([{ ...profile, file: "app.asar/out/main/other.js" }], [exception]);
  assert.equal(moved.explained.length, 0);
  assert.equal(classifyHits([], [exception]).unusedExceptions.length, 1);
});

test("scan exceptions must be narrow and explained", () => {
  const ok = {
    rule: "r",
    file: "a/b.js",
    matches: { m: 1 },
    reason: "Long enough written reason.",
  };
  assert.doesNotThrow(() => validateExceptions([ok]));
  for (const bad of [
    { ...ok, file: "a/*.js" },
    { ...ok, file: "" },
    { ...ok, reason: "short" },
    { ...ok, matches: { m: 0 } },
    { ...ok, matches: {} },
    { ...ok, matches: { "": 1 } },
    { ...ok, matches: undefined },
  ])
    assert.throws(() => validateExceptions([bad]));
});

test("package inspection passes a clean synthetic package and fails on a planted leak", async () => {
  const clean = await mkdtemp(path.join(tmpdir(), "graph-inspect-clean-"));
  const dirty = await mkdtemp(path.join(tmpdir(), "graph-inspect-dirty-"));
  try {
    await syntheticPackage(clean, {});
    const ok = await inspectPackage({
      root,
      distDirectory: clean,
      version: "3.14.3-z8.1",
      exceptions: [],
      expected,
    });
    assert.equal(ok.status, "PASS", JSON.stringify(ok.checks.filter((c) => c.status !== "PASS")));
    await syntheticPackage(dirty, { leak: `${root}\\packages\\desktop` });
    const bad = await inspectPackage({
      root,
      distDirectory: dirty,
      version: "3.14.3-z8.1",
      exceptions: [],
      expected,
    });
    assert.equal(bad.status, "FAIL");
    assert.ok(bad.scan.unexplained.some((h) => h.rule === "build-checkout-path"));
    const wrongVersion = await inspectPackage({
      root,
      distDirectory: clean,
      version: "3.14.3-z8.2",
      exceptions: [],
      expected,
    });
    assert.equal(wrongVersion.status, "FAIL");
  } finally {
    await rm(clean, { recursive: true, force: true });
    await rm(dirty, { recursive: true, force: true });
  }
});

test("the external manifest hashes the installer and components with artifact-relative paths", async () => {
  const dist = await mkdtemp(path.join(tmpdir(), "graph-manifest-"));
  try {
    await syntheticPackage(dist, {});
    const installerBytes = Buffer.from("synthetic installer bytes");
    await writeFile(path.join(dist, "ZCode Graph-3.14.3-z8.1-win-x64.exe"), installerBytes);
    const policies = await resolvePackagePolicies(root);
    const manifest = await buildReleaseManifest({
      root,
      distDirectory: dist,
      distName: "dist-graph-test",
      version: "3.14.3-z8.1",
      baseVersion: "3.14.3",
      source: { commit: "a".repeat(40), dirty: false },
      toolchain: { node: "24.14.0" },
      protocol: { zcode: 1, v4Wire: 3 },
      policies,
      embedded: { product: { productName: "ZCode Graph" } },
    });
    assert.equal(
      manifest.artifact.installer.sha256,
      createHash("sha256").update(installerBytes).digest("hex"),
    );
    assert.equal(manifest.artifact.installer.path, "ZCode Graph-3.14.3-z8.1-win-x64.exe");
    assert.ok(manifest.artifact.components["resources/app.asar"].sha256);
    assert.ok(manifest.artifact.components["resources/glm/"].treeDigest);
    const text = JSON.stringify(manifest);
    assert.ok(!text.includes(dist) && !text.includes(root), "no absolute build or checkout paths");
    assert.equal(manifest.validation.status, "not-recorded");
    const recorded = JSON.parse(
      await readFile(path.join(dist, "unpacked-file-hashes.json"), "utf8"),
    );
    assert.equal(recorded.digest, manifest.artifact.unpackedTree.digest);
  } finally {
    await rm(dist, { recursive: true, force: true });
  }
});

test("the private-address rule ignores digit runs inside longer numbers but still finds real addresses", () => {
  const rules = allRules({});
  const find = (text) =>
    scanText("x", text, rules)
      .filter((h) => h.rule === "private-address")
      .map((h) => h.match);
  assert.deepEqual(find("M10.142.22.65.442 10.399 26.997"), []);
  assert.deepEqual(find("http://10.20.30.40:8080/api"), ["10.20.30.40"]);
  assert.deepEqual(find("a=192.168.1.5,b=172.16.4.4;"), ["192.168.1.5", "172.16.4.4"]);
  assert.deepEqual(find("v1.10.0.0.1x 8.8.8.8"), []);
});

test("the committed scan exceptions are narrow, explained and exact", async () => {
  const file = JSON.parse(
    await readFile(
      path.join(root, "scripts/graph-engineering/package-scan-exceptions.json"),
      "utf8",
    ),
  );
  assert.doesNotThrow(() => validateExceptions(file.exceptions));
  assert.ok(
    file.exceptions.every(
      (e) => e.file.startsWith("app.asar/") || e.file.startsWith("win-unpacked/"),
    ),
  );
  const keys = file.exceptions.map((e) => `${e.rule}|${e.file}`);
  assert.equal(new Set(keys).size, keys.length, "one entry per rule and file");
});

test("recorded protocol and toolchain versions are real numbers and strings, not blanks", async () => {
  const { collectToolchain, protocolVersions } = await import("./release-manifest.mjs");
  const protocol = await protocolVersions(root);
  assert.ok(Number.isInteger(protocol.zcode) && Number.isInteger(protocol.v4Wire));
  const toolchain = await collectToolchain(root, "10.33.2");
  for (const key of ["node", "pnpm", "electron", "electronBuilder", "zcodeCli"])
    assert.match(String(toolchain[key]), /^\d+\.\d+\.\d+/, key);
});

test("source identity lists dirty paths exactly, including a leading-space status line", async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { collectSourceIdentity } = await import("./release-manifest.mjs");
  const run = promisify(execFile);
  const repo = await mkdtemp(path.join(tmpdir(), "graph-source-identity-"));
  try {
    const git = (...args) =>
      run("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", ...args], {
        cwd: repo,
      });
    await git("init", "-q");
    await writeFile(path.join(repo, "tracked.txt"), "one\n");
    await git("add", "tracked.txt");
    await git("commit", "-q", "-m", "init");
    const reference = { contentReference: { tag: "v0", sha: "f".repeat(40), scope: "synthetic" } };
    const clean = await collectSourceIdentity(repo, reference);
    assert.equal(clean.dirty, false);
    assert.equal(clean.mergeBase, "unavailable");
    assert.equal(clean.contentReference.presentInRepository, false);
    await writeFile(path.join(repo, "tracked.txt"), "two\n");
    await writeFile(path.join(repo, "new.txt"), "x\n");
    const dirty = await collectSourceIdentity(repo, reference);
    assert.equal(dirty.dirty, true);
    assert.deepEqual([...dirty.dirtyPaths].sort(), ["new.txt", "tracked.txt"]);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("every development-evidence reference in the capability table points at an existing file", async () => {
  const { access } = await import("node:fs/promises");
  const policies = await resolvePackagePolicies(root);
  for (const capability of buildCapabilityTable({ policies, packagedCases: {} }))
    for (const reference of capability.devVerified)
      await access(path.join(root, reference)).catch(() =>
        assert.fail(`${capability.id}: ${reference}`),
      );
});
