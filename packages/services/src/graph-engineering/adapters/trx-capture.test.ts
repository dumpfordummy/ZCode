import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs, { type FileHandle } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test, { type TestContext } from "node:test";
import type { GraphDotnetTestTarget } from "../dotnet-types.js";
import { GRAPH_ARTIFACT_BYTES } from "../domain/artifacts.js";
import { readDeclaredFileSnapshot } from "./artifact-files.js";
import { createGraphArtifactStore } from "./artifacts.js";
import { createGraphReportCapture } from "./trx-capture.js";

const digest = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const modifiedAt = Date.parse("2026-01-01T00:00:00Z");
const scope: GraphDotnetTestTarget = {
  project: "Fixture.Tests.csproj",
  configuration: "Release",
  framework: "net8.0",
  assembly: "bin/Fixture.Tests.dll",
};
// Deliberately invalid XML for byte/privacy boundary tests; never execution evidence.
const invalidReport = Buffer.from(
  '\uFEFF<?xml version="1.0"?><Unsupported>token=ONLY_SYNTHETIC_SECRET</Unsupported>\r\n',
);

async function fixture(t: TestContext, content = invalidReport) {
  const parent = await fs.realpath(tmpdir());
  const root = await fs.mkdtemp(join(parent, "pre-z8-trx-capture-"));
  assert.equal(dirname(root), parent);
  assert.match(basename(root), /^pre-z8-trx-capture-/);
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const workspacePath = join(root, "workspace"),
    target = { workspacePath };
  await fs.mkdir(join(workspacePath, "reports"), { recursive: true });
  await fs.mkdir(join(workspacePath, "bin"));
  await fs.writeFile(join(workspacePath, scope.assembly), "synthetic assembly bytes");
  const reportPath = "reports/report.trx",
    absolute = join(workspacePath, reportPath);
  await fs.writeFile(absolute, content);
  await fs.utimes(absolute, modifiedAt / 1000, modifiedAt / 1000);
  const capture = (selectedScope = scope, start = modifiedAt - 1, finish = modifiedAt + 1) =>
    createGraphReportCapture().captureTrx(target, reportPath, selectedScope, start, finish);
  return { root, target, reportPath, absolute, capture };
}

function interceptOpen(
  t: TestContext,
  selected: string,
  before?: () => Promise<void>,
  after?: (handle: FileHandle) => Promise<void>,
) {
  const original = fs.open;
  const mocked = t.mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
    const matches = resolve(String(args[0])) === selected;
    if (matches) await before?.();
    const handle = await original(...args);
    if (matches && after) {
      try {
        await after(handle);
      } catch (error) {
        await handle.close();
        throw error;
      }
    }
    return handle;
  });
  syncBuiltinESMExports();
  t.after(() => {
    mocked.mock.restore();
    syncBuiltinESMExports();
  });
}

test("secure snapshot binds exact bytes, including BOM and chunk boundaries", async (t) => {
  const content = Buffer.concat([invalidReport, Buffer.alloc(130_000, 65)]),
    f = await fixture(t, content);
  const snapshot = await readDeclaredFileSnapshot(f.target, f.reportPath, GRAPH_ARTIFACT_BYTES);
  assert.deepEqual(snapshot.content, content);
  assert.equal(snapshot.bytes, content.length);
  assert.equal(snapshot.digest, digest(content));
  assert.equal(snapshot.modifiedAt, modifiedAt);
  await fs.writeFile(f.absolute, "changed later");
  assert.deepEqual(snapshot.content, content);
  assert.notEqual(snapshot.digest, digest(await fs.readFile(f.absolute)));
});

test("original BOM digest remains distinct from decoded-without-BOM and redacted preview", async (t) => {
  const f = await fixture(t),
    result = await f.capture();
  assert.equal(result.report, undefined);
  assert.match(result.issue ?? "", /unsupported root/i);
  assert.equal(result.content.charCodeAt(0), 0xfeff);
  assert.deepEqual(Buffer.from(result.content), invalidReport);
  assert.equal(result.original.digest, digest(invalidReport));
  assert.notEqual(result.original.digest, digest(new TextDecoder().decode(invalidReport)));
  const store = createGraphArtifactStore(join(f.root, "retained"));
  const identity = {
    target: f.target,
    runId: "run",
    nodeId: "test",
    attemptId: "attempt",
    artifactId: "raw",
  };
  const preview = await store.put({
    ...identity,
    type: "text",
    provenance: "workspace-file",
    content: result.content,
    capturedAt: modifiedAt,
  });
  assert.equal(preview.validation, "incomplete");
  assert.equal(preview.redacted, true);
  assert.notEqual(preview.digest, result.original.digest);
  assert.doesNotMatch((await store.read(identity)).content, /ONLY_SYNTHETIC_SECRET/);
});

test("capture rejects invalid UTF-8 without producing normalized assertions", async (t) => {
  const f = await fixture(t, Buffer.from([0xef, 0xbb, 0xbf, 0xc3, 0x28]));
  await assert.rejects(f.capture(), /encoded data|encoding|UTF-8/i);
});

test("snapshot enforces declared path, regular-file and exact byte bounds", async (t) => {
  const f = await fixture(t, Buffer.alloc(GRAPH_ARTIFACT_BYTES, 65));
  assert.equal(
    (await readDeclaredFileSnapshot(f.target, f.reportPath, GRAPH_ARTIFACT_BYTES)).bytes,
    GRAPH_ARTIFACT_BYTES,
  );
  await fs.appendFile(f.absolute, "x");
  await assert.rejects(
    readDeclaredFileSnapshot(f.target, f.reportPath, GRAPH_ARTIFACT_BYTES),
    /limit/,
  );
  for (const path of ["../escape", "C:/escape", "/escape", "reports", "missing.trx"])
    await assert.rejects(
      readDeclaredFileSnapshot(f.target, path, GRAPH_ARTIFACT_BYTES),
      /relative|path|regular|ENOENT/i,
    );
});

test("stale and future report timestamps remain issues with original identity", async (t) => {
  const f = await fixture(t);
  for (const [start, finish] of [
    [modifiedAt + 1, modifiedAt + 10],
    [modifiedAt - 10, modifiedAt - 1],
  ]) {
    const result = await f.capture(scope, start, finish);
    assert.equal(result.report, undefined);
    assert.match(result.issue ?? "", /timestamp.*native command window/);
    assert.equal(result.original.digest, digest(invalidReport));
  }
});

test("capture and snapshot refuse linked report ancestors and workspace aliases", async (t) => {
  const f = await fixture(t),
    outside = join(f.root, "outside");
  await fs.mkdir(outside);
  await fs.writeFile(join(outside, "report.trx"), "isolated outside bytes");
  const linkType = process.platform === "win32" ? "junction" : "dir";
  await fs.symlink(outside, join(f.target.workspacePath, "alias"), linkType);
  await assert.rejects(
    readDeclaredFileSnapshot(f.target, "alias/report.trx", GRAPH_ARTIFACT_BYTES),
    /link|outside|alias/i,
  );
  await assert.rejects(
    createGraphReportCapture().captureTrx(f.target, "alias/report.trx", scope, 0, Date.now()),
    /link|outside|alias/i,
  );
  await fs.symlink(f.target.workspacePath, join(f.root, "workspace-alias"), linkType);
  await assert.rejects(
    readDeclaredFileSnapshot(
      { workspacePath: join(f.root, "workspace-alias") },
      f.reportPath,
      GRAPH_ARTIFACT_BYTES,
    ),
    /link|alias/i,
  );
});

test("replacement after validation and before open cannot reuse original identity", async (t) => {
  const f = await fixture(t);
  interceptOpen(t, f.absolute, async () => {
    await fs.rename(f.absolute, f.absolute + ".previous");
    await fs.writeFile(f.absolute, invalidReport);
    await fs.utimes(f.absolute, modifiedAt / 1000, modifiedAt / 1000);
  });
  await assert.rejects(
    readDeclaredFileSnapshot(f.target, f.reportPath, GRAPH_ARTIFACT_BYTES),
    /changed before capture/,
  );
});

test("replacement after open with identical bytes and timestamp is rejected", async (t) => {
  const f = await fixture(t);
  interceptOpen(t, f.absolute, undefined, async () => {
    await fs.rename(f.absolute, f.absolute + ".previous");
    await fs.writeFile(f.absolute, invalidReport);
    await fs.utimes(f.absolute, modifiedAt / 1000, modifiedAt / 1000);
  });
  await assert.rejects(
    readDeclaredFileSnapshot(f.target, f.reportPath, GRAPH_ARTIFACT_BYTES),
    /changed.*capture/,
  );
});

test("growth during the bounded stream cannot bypass the initial size check", async (t) => {
  const f = await fixture(t, Buffer.alloc(128, 65));
  interceptOpen(t, f.absolute, undefined, async (handle) => {
    const original = handle.read.bind(handle);
    let first = true;
    t.mock.method(handle, "read", async (...args: Parameters<typeof handle.read>) => {
      const result = await original(...args);
      if (first) {
        first = false;
        await fs.appendFile(f.absolute, Buffer.alloc(GRAPH_ARTIFACT_BYTES, 66));
      }
      return result;
    });
  });
  await assert.rejects(
    readDeclaredFileSnapshot(f.target, f.reportPath, GRAPH_ARTIFACT_BYTES),
    /limit/,
  );
});

test("retained genuine reports preserve original digest, assertions and privacy boundary", async (t) => {
  const manifestPath = process.env.PRE_Z8_TRX_FIXTURE_MANIFEST;
  if (!manifestPath) {
    t.skip(
      "Set PRE_Z8_TRX_FIXTURE_MANIFEST to an owned genuine fixture receipt; no native command is run.",
    );
    return;
  }
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  assert.equal(manifest.kind, "pre-z8-genuine-vstest");
  assert.equal(manifest.status, "passed");
  assert.equal(resolve(manifest.fixtureHome), dirname(resolve(manifestPath)));
  assert.deepEqual(
    JSON.parse(await fs.readFile(join(manifest.fixtureHome, "fixture-owner.json"), "utf8")),
    { kind: "pre-z8-dotnet", version: 1 },
  );
  const f = await fixture(t),
    store = createGraphArtifactStore(join(f.root, "genuine-previews"));
  for (const name of [
    "pass-and-skip",
    "actual-failed-assertions",
    "zero-tests-not-adequate",
    "all-skipped-not-adequate",
  ]) {
    const original = manifest.cases.find((item: { name: string }) => item.name === name).result;
    const target = { workspacePath: join(manifest.fixtureHome, "workspace") };
    assert.equal(original.command.cwd, target.workspacePath);
    const assembly = `bin/Release/${original.scope.framework}/${original.scope.project.replace(/\.csproj$/, ".dll")}`;
    const selectedScope = {
      ...original.scope,
      assembly,
      filter: original.scope.filter ?? undefined,
    };
    const captured = await createGraphReportCapture().captureTrx(
      target,
      original.reportPath,
      selectedScope,
      original.command.startedAt,
      original.command.finishedAt,
    );
    assert.equal(captured.issue, undefined);
    assert.deepEqual(captured.report, original.parsedReport);
    assert.equal(captured.original.digest, original.reportDigest);
    assert.equal(captured.original.bytes, original.reportBytes);
    assert.equal(digest(captured.content), original.reportDigest);
    const identity = {
      target: f.target,
      runId: "run",
      nodeId: "test",
      attemptId: name,
      artifactId: `raw-${name}`,
    };
    const preview = await store.put({
      ...identity,
      type: "text",
      provenance: "workspace-file",
      content: captured.content,
      capturedAt: original.command.finishedAt,
    });
    assert.equal(preview.validation, "incomplete");
    assert.equal(preview.redacted, true);
    assert.notEqual(preview.digest, captured.original.digest);
    const mismatch = await createGraphReportCapture().captureTrx(
      target,
      original.reportPath,
      { ...selectedScope, assembly: "bin/Release/net8.0/Synthetic.Missing.dll" },
      original.command.startedAt,
      original.command.finishedAt,
    );
    assert.equal(mismatch.report, undefined);
    assert.ok(mismatch.issue);
    if (original.parsedReport.tests.length) {
      const existingWrongAssembly = await createGraphReportCapture().captureTrx(
        target,
        original.reportPath,
        {
          ...selectedScope,
          assembly: `bin/Release/${original.scope.framework}/PreZ8Fixture.TestAdapter.dll`,
        },
        original.command.startedAt,
        original.command.finishedAt,
      );
      assert.equal(existingWrongAssembly.report, undefined);
      assert.match(existingWrongAssembly.issue ?? "", /assembly identity mismatch/i);
    }
  }
});
