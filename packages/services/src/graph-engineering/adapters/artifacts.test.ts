import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  readdir,
  symlink,
  rm,
  utimes,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGraphArtifactStore } from "./artifacts.js";
import { fingerprintDeclaredFiles, observeDeclaredFiles } from "./artifact-files.js";

async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const root = await mkdtemp(join(tmpdir(), "z4-artifact-")),
    workspacePath = join(root, "workspace"),
    directory = join(root, "data");
  await mkdir(workspacePath);
  t.after(() => rm(root, { recursive: true, force: true }));
  const identity = {
    target: { workspacePath },
    runId: "run-1",
    nodeId: "node-1",
    attemptId: "attempt-1",
    artifactId: "artifact-1",
  };
  return { root, workspacePath, directory, identity, store: createGraphArtifactStore(directory) };
}
test("artifact immutable retry, ownership and tamper detection", async (t) => {
  const f = await fixture(t),
    input = {
      ...f.identity,
      type: "text" as const,
      provenance: "native-agent-final" as const,
      content: "Hello",
      capturedAt: 1,
    };
  const first = await f.store.put(input);
  assert.deepEqual(await f.store.put(input), first);
  assert.equal((await f.store.read(f.identity)).content, "Hello");
  await assert.rejects(f.store.put({ ...input, content: "changed" }), /immutable/);
  await assert.rejects(f.store.read({ ...f.identity, attemptId: "other" }), /ownership/);
  await assert.rejects(f.store.read({ ...f.identity, runId: "other" }));
  const files = await readdir(f.directory, { recursive: true });
  const file = files.find((value) => value.endsWith(".json"))!;
  const path = join(f.directory, file),
    data = JSON.parse(await readFile(path, "utf8"));
  data.content = "tampered";
  await writeFile(path, JSON.stringify(data));
  await assert.rejects(f.store.read(f.identity), /digest/);
});
test("declared capture retains HTML as data and displays unsafe/binary/oversized failures", async (t) => {
  const f = await fixture(t);
  await writeFile(
    join(f.workspacePath, "page.html"),
    '<script>throw new Error("never execute")</script>',
  );
  const html = await f.store.captureFile({ ...f.identity, path: "page.html", capturedAt: 1 });
  assert.equal(html.validation, "valid");
  assert.match((await f.store.read(f.identity)).content, /<script>/);
  await writeFile(join(f.workspacePath, "binary"), Buffer.from([0, 255]));
  await writeFile(join(f.workspacePath, "huge"), "a".repeat(262145));
  for (const [index, path] of [
    "../outside",
    "/absolute",
    "C:/outside",
    "https://invalid/x",
    "binary",
    "huge",
  ].entries()) {
    const result = await f.store.captureFile({
      ...f.identity,
      artifactId: `a-${index}`,
      path,
      capturedAt: 1,
    });
    assert.equal(result.validation, "incomplete", path);
    assert.ok(result.issue);
  }
});
test("workspace junction capture and fingerprint refuse external files", async (t) => {
  const f = await fixture(t),
    outside = join(f.root, "outside");
  await mkdir(outside);
  await writeFile(join(outside, "file"), "private synthetic");
  await symlink(
    outside,
    join(f.workspacePath, "alias"),
    process.platform === "win32" ? "junction" : "dir",
  );
  assert.equal(
    (await f.store.captureFile({ ...f.identity, path: "alias/file", capturedAt: 1 })).validation,
    "incomplete",
  );
  await assert.rejects(
    fingerprintDeclaredFiles(f.identity.target, ["alias/file"]),
    /link|outside/i,
  );
});
test("secret-bearing retained copy is marked incomplete, while binary fingerprints retain only metadata", async (t) => {
  const f = await fixture(t),
    artifact = await f.store.put({
      ...f.identity,
      type: "command",
      provenance: "native-command",
      content: "token=synthetic-secret-123",
      capturedAt: 1,
    });
  assert.equal(artifact.redacted, true);
  assert.equal(artifact.validation, "incomplete");
  assert.doesNotMatch((await f.store.read(f.identity)).content, /synthetic-secret/);
  await writeFile(join(f.workspacePath, "build.dll"), Buffer.from([0, 255, 20]));
  const fingerprint = await fingerprintDeclaredFiles(f.identity.target, ["build.dll"]);
  assert.equal(fingerprint.files[0]?.bytes, 3);
  assert.equal(fingerprint.files[0]?.digest.length, 64);
  assert.equal("content" in fingerprint.files[0]!, false);
});

test("file observations distinguish missing, stale and refreshed output without changing content digest", async (t) => {
  const f = await fixture(t),
    target = f.identity.target;
  assert.deepEqual(await observeDeclaredFiles(target, ["bin/build.dll"]), [
    { path: "bin/build.dll", exists: false },
  ]);
  await mkdir(join(f.workspacePath, "bin"));
  const path = join(f.workspacePath, "bin", "build.dll");
  await writeFile(path, Buffer.from([0, 255, 20]));
  await utimes(path, 1000, 1000);
  const before = await observeDeclaredFiles(target, ["bin/build.dll"]);
  const first = await fingerprintDeclaredFiles(target, ["bin/build.dll"]);
  assert.deepEqual(await observeDeclaredFiles(target, ["bin/build.dll"]), before);
  await utimes(path, 2000, 2000);
  const after = await observeDeclaredFiles(target, ["bin/build.dll"]);
  const second = await fingerprintDeclaredFiles(target, ["bin/build.dll"]);
  assert.equal(after[0]?.exists, true);
  assert.equal(before[0]?.exists, true);
  assert.notEqual(after[0]?.modifiedAt, before[0]?.modifiedAt);
  assert.equal(first.digest, second.digest);
  assert.equal(first.files[0]?.digest, second.files[0]?.digest);
  assert.notEqual(first.files[0]?.modifiedAt, second.files[0]?.modifiedAt);
  await assert.rejects(observeDeclaredFiles(target, ["../missing"]), /relative|path/i);
  const empty = await fingerprintDeclaredFiles(target, []);
  assert.deepEqual(empty.files, []);
  assert.equal(empty.digest.length, 64);
});

test("explicit declared diff snapshots retain exact inert text under the same capture rules", async (t) => {
  const f = await fixture(t),
    content = "--- a/example.txt\n+++ b/example.txt\n@@ -1 +1 @@\n-old\n+new\n";
  await writeFile(join(f.workspacePath, "change.patch"), content);
  const artifact = await f.store.captureFile({
    ...f.identity,
    path: "change.patch",
    capturedAt: 1,
  });
  assert.equal(artifact.type, "diff");
  assert.equal(artifact.provenance, "workspace-file");
  assert.equal(artifact.validation, "valid");
  assert.equal((await f.store.read(f.identity)).content, content);
  assert.equal(artifact.bytes, Buffer.byteLength(content));
});

test("native JSON formatting normalization preserves exact pretty report bytes without marking redacted", async (t) => {
  const f = await fixture(t);
  const content =
    '{\r\n  "format": "zcode-test-v1",\r\n  "tests": [{"name":"synthetic","status":"passed"}]\r\n}';
  await writeFile(join(f.workspacePath, "report.json"), content);
  const artifact = await f.store.captureFile({ ...f.identity, path: "report.json", capturedAt: 1 });
  assert.equal(artifact.validation, "valid");
  assert.equal(artifact.redacted, undefined);
  assert.equal((await f.store.read(f.identity)).content, content);
  assert.equal(artifact.bytes, Buffer.byteLength(content));
});

test("semantic redaction preservation cannot restore actual secrets or duplicate-hidden secrets", async (t) => {
  const f = await fixture(t);
  for (const [index, content] of [
    '{\n "password": "ONLY_SYNTHETIC_SECRET"\n}',
    '{"note":"password=ONLY_SYNTHETIC_SECRET","note":"safe"}',
  ].entries()) {
    const identity = { ...f.identity, artifactId: `redacted-${index}` };
    const artifact = await f.store.put({
      ...identity,
      type: "json",
      provenance: "native-agent-final",
      content,
      capturedAt: 1,
    });
    assert.equal(artifact.validation, "incomplete");
    assert.equal(artifact.redacted, true);
    assert.equal((await f.store.read(identity)).content.includes("ONLY_SYNTHETIC_SECRET"), false);
  }
});
