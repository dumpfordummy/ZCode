import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fingerprintBoundedTrees } from "../../packages/shared/src/node/boundedTreeFingerprint.ts";
const limits = { files: 100, bytes: 100000, fileBytes: 10000, depth: 8, elapsedMs: 10000 };
test("exact-root provenance hashes every byte and membership independently of machine path", async () => {
  const a = await mkdtemp(join(tmpdir(), "f1-provenance-a-")),
    b = await mkdtemp(join(tmpdir(), "f1-provenance-b-"));
  for (const root of [a, b]) {
    await mkdir(join(root, "nested"));
    for (let i = 0; i < 40; i++)
      await writeFile(join(root, "nested", `source${i}.txt`), `bytes ${i}`);
  }
  const capture = (root) =>
    fingerprintBoundedTrees({ roots: [{ path: root, label: "$TOOLCHAIN" }], limits });
  const initial = await capture(a);
  assert.equal(initial.files, 40);
  assert.deepEqual(await capture(b), initial);
  await writeFile(join(a, "nested/source39.txt"), "changed");
  assert.notEqual((await capture(a)).digest, initial.digest);
  const changed = await capture(a);
  await rename(join(a, "nested/source39.txt"), join(a, "nested/renamed.txt"));
  assert.notEqual((await capture(a)).digest, changed.digest);
});
test("provenance read respects cancellation and file/byte/depth ceilings without a partial success", async () => {
  const root = await mkdtemp(join(tmpdir(), "f1-provenance-limits-"));
  await mkdir(join(root, "nested"));
  await writeFile(join(root, "nested/a"), "1234");
  await writeFile(join(root, "nested/b"), "5678");
  for (const override of [{ files: 1 }, { bytes: 7 }, { fileBytes: 3 }, { depth: 1 }])
    await assert.rejects(
      fingerprintBoundedTrees({
        roots: [{ path: root, label: "$TEST" }],
        limits: { ...limits, ...override },
      }),
      /limit/,
    );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    fingerprintBoundedTrees({
      roots: [{ path: root, label: "$TEST" }],
      limits,
      signal: controller.signal,
    }),
    /abort/i,
  );
  await assert.rejects(
    fingerprintBoundedTrees({ roots: [{ path: "relative", label: "$TEST" }], limits }),
    /Invalid/,
  );
});

test("only exact declared state roots are excluded; nested same-name inputs and new members remain observed", async () => {
  const root = await mkdtemp(join(tmpdir(), "f1-excluded-"));
  await mkdir(join(root, "nested/.zcode"), { recursive: true });
  await writeFile(join(root, "nested/.zcode/source"), "real input");
  const capture = () =>
    fingerprintBoundedTrees({
      roots: [{ path: root, label: "$WORKSPACE", exclude: [".zcode"] }],
      limits,
    });
  const before = await capture();
  await mkdir(join(root, ".zcode"));
  await writeFile(join(root, ".zcode/state"), "state");
  assert.deepEqual(await capture(), before);
  await writeFile(join(root, "nested/.zcode/source"), "changed input");
  assert.notEqual((await capture()).digest, before.digest);
  const changed = await capture();
  await writeFile(join(root, "nested/future"), "new input");
  assert.notEqual((await capture()).digest, changed.digest);
});
