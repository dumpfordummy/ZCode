import assert from "node:assert/strict";
import test from "node:test";
import { readGraphEvidence } from "../src/graph-engineering/graphEvidenceRead.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<T>((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  return { promise, resolve, reject };
}

test("current artifact failures reject for visible local errors, rather than an empty success", async () => {
  const cause = new Error("Retained artifact digest mismatch");
  await assert.rejects(
    readGraphEvidence({
      read: async () => {
        throw cause;
      },
      isCurrent: () => true,
    }),
    (error) => error === cause,
  );
  const complete = { content: "captured immutable bytes" };
  assert.equal(
    await readGraphEvidence({ read: async () => complete, isCurrent: () => true }),
    complete,
  );
});

test("stale scope neither starts a read nor returns late data or failure to another workspace", async () => {
  let reads = 0;
  assert.equal(
    await readGraphEvidence({ read: async () => ++reads, isCurrent: () => false }),
    undefined,
  );
  assert.equal(reads, 0);
  for (const fail of [false, true]) {
    let current = true;
    const operation = deferred<string>();
    const pending = readGraphEvidence({ read: () => operation.promise, isCurrent: () => current });
    current = false;
    if (fail) operation.reject(new Error("Old workspace artifact missing"));
    else operation.resolve("Old workspace artifact bytes");
    assert.equal(await pending, undefined);
  }
});

test("independent evidence reads do not suppress each other or hold an execution lock", async () => {
  const first = deferred<string>();
  const second = deferred<string>();
  const started: string[] = [];
  const older = readGraphEvidence({
    read: () => {
      started.push("artifact");
      return first.promise;
    },
    isCurrent: () => true,
  });
  const newer = readGraphEvidence({
    read: () => {
      started.push("manifest");
      return second.promise;
    },
    isCurrent: () => true,
  });
  assert.deepEqual(started, ["artifact", "manifest"]);
  second.resolve("manifest bytes");
  assert.equal(await newer, "manifest bytes");
  first.resolve("artifact bytes");
  assert.equal(await older, "artifact bytes");
});
