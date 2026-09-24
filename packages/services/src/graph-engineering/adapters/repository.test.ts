import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createGraphRepository } from "./repository.js";
import { defaultDefinition } from "../domain/definition.js";
import type { GraphRun } from "../contract.js";

test("rapid atomic metadata replacement tolerates transient OS reader sharing without losing revisions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "z4-graph-replace-"));
  const repository = createGraphRepository(directory);
  const target = { workspacePath: "C:/synthetic/replacement" };
  const record = { definition: defaultDefinition(), runs: [] };
  let running = true;
  try {
    await repository.write(target, record);
    const [name] = (await readdir(directory)).filter((file) => file.endsWith(".json"));
    const reader = (async () => {
      for (let reads = 0; running && reads < 200; reads++)
        JSON.parse(await readFile(join(directory, name!), "utf8"));
    })();
    try {
      for (let revision = 1; revision <= 100; revision++) {
        record.definition.revision = revision;
        await repository.write(target, record);
      }
    } finally {
      running = false;
      await reader;
    }
    assert.equal((await repository.read(target))?.definition.revision, 100);
  } finally {
    running = false;
    await repository.dispose?.();
    assert.ok(directory.startsWith(join(tmpdir(), "z4-graph-replace-")));
    await rm(directory, { recursive: true, force: true });
  }
});

test("atomic graph metadata files preserve definitions and isolate workspace identities", async () => {
  const directory = await mkdtemp(join(tmpdir(), "z1-graph-repository-"));
  const repository = createGraphRepository(directory);
  try {
    const target = { workspacePath: "C:/synthetic/project", workspaceIdentity: "isolated-one" };
    assert.equal(await repository.read(target), null);
    const record = { definition: defaultDefinition(), runs: [] };
    record.definition.instructions = "synthetic-only-value-20260924";
    await repository.write(target, record);
    assert.deepEqual(await createGraphRepository(directory).read(target), record);
    assert.equal(await repository.read({ ...target, workspaceIdentity: "isolated-two" }), null);
    const files = (await readdir(directory)).filter((name) => name.endsWith(".json"));
    assert.equal(files.length, 1);
    assert.ok(files[0]!.endsWith(".json"));
    const path = join(directory, files[0]!);
    const content = JSON.parse(await readFile(path, "utf8"));
    content.workspaceKey = "different";
    await writeFile(path, JSON.stringify(content));
    await assert.rejects(repository.read(target), /identity mismatch/);
  } finally {
    await repository.dispose?.();
    assert.ok(directory.startsWith(join(tmpdir(), "z1-graph-repository-")));
    await rm(directory, { recursive: true, force: true });
  }
});

test("malformed persisted metadata fails closed instead of inventing an empty graph", async () => {
  const directory = await mkdtemp(join(tmpdir(), "z1-graph-corrupt-"));
  const repository = createGraphRepository(directory);
  try {
    const target = { workspacePath: "C:/synthetic/project" };
    await repository.write(target, { definition: defaultDefinition(), runs: [] });
    const [name] = (await readdir(directory)).filter((name) => name.endsWith(".json"));
    await writeFile(join(directory, name!), '{"version":1');
    await assert.rejects(repository.read(target));
  } finally {
    await repository.dispose?.();
    assert.ok(directory.startsWith(join(tmpdir(), "z1-graph-corrupt-")));
    await rm(directory, { recursive: true, force: true });
  }
});

test("terminal records require correlated proof and coherent identity / timestamps", async () => {
  const directory = await mkdtemp(join(tmpdir(), "z1-graph-proof-"));
  const repository = createGraphRepository(directory);
  try {
    const target = { workspacePath: "C:/synthetic/proof" };
    const run: GraphRun = {
      id: "run",
      attemptId: "attempt",
      requestId: "request",
      target,
      definition: defaultDefinition(),
      modelSelection: { providerId: "fixture", modelId: "fixture" },
      mode: "build",
      commandId: "input",
      inputId: "input",
      sessionId: "session",
      runtimeIdentity: "runtime",
      status: "Completed",
      createdAt: 10,
      updatedAt: 20,
      terminalProof: {
        sourceCommandId: "input",
        state: "completedSuccess",
        logEpoch: "epoch",
        seq: 2,
      },
    };
    const record = { definition: defaultDefinition(), runs: [run] };
    await repository.write(target, record);
    const [name] = (await readdir(directory)).filter((name) => name.endsWith(".json"));
    const path = join(directory, name!);
    const original = JSON.parse(await readFile(path, "utf8"));
    const corruptions = [
      (value: typeof original) => {
        delete value.runs[0].terminalProof;
      },
      (value: typeof original) => {
        value.runs[0].terminalProof.state = "completedInterrupted";
      },
      (value: typeof original) => {
        value.runs[0].terminalProof.sourceCommandId = "other";
      },
      (value: typeof original) => {
        value.runs[0].updatedAt = 9;
      },
      (value: typeof original) => {
        value.runs.push(value.runs[0]);
      },
    ];
    for (const corrupt of corruptions) {
      const value = structuredClone(original);
      corrupt(value);
      await writeFile(path, JSON.stringify(value));
      await assert.rejects(repository.read(target));
    }
  } finally {
    await repository.dispose?.();
    assert.ok(directory.startsWith(join(tmpdir(), "z1-graph-proof-")));
    await rm(directory, { recursive: true, force: true });
  }
});

test("only one Host owns graph metadata until release, with concurrent same-owner acquisition", async () => {
  const directory = await mkdtemp(join(tmpdir(), "z1-graph-owners-"));
  const first = createGraphRepository(directory);
  const second = createGraphRepository(directory);
  const target = { workspacePath: "C:/synthetic/ownership" };
  try {
    assert.deepEqual(
      await Promise.all([first.acquireOwnership!(target), first.acquireOwnership!(target)]),
      [true, true],
    );
    assert.equal(await second.acquireOwnership!(target), false);
    const record = { definition: defaultDefinition(), runs: [] };
    await first.write(target, record);
    assert.deepEqual(await second.read(target), record);
    await assert.rejects(second.write(target, record), /another.*Host|ownership/i);
    await first.dispose!();
    assert.equal(await second.acquireOwnership!(target), true);
    await second.write(target, record);
  } finally {
    await first.dispose!();
    await second.dispose!();
    assert.ok(directory.startsWith(join(tmpdir(), "z1-graph-owners-")));
    await rm(directory, { recursive: true, force: true });
  }
});

test("disposal releases ownership acquired during an in-flight acquisition and rejects later writes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "z1-graph-dispose-"));
  const first = createGraphRepository(directory);
  const second = createGraphRepository(directory);
  const target = { workspacePath: "C:/synthetic/ownership" };
  try {
    const acquiring = first.acquireOwnership!(target);
    await first.dispose!();
    assert.equal(await acquiring, false);
    assert.equal(await second.acquireOwnership!(target), true);
    await assert.rejects(
      first.write(target, { definition: defaultDefinition(), runs: [] }),
      /closed/i,
    );
  } finally {
    await first.dispose!();
    await second.dispose!();
    assert.ok(directory.startsWith(join(tmpdir(), "z1-graph-dispose-")));
    await rm(directory, { recursive: true, force: true });
  }
});

test("repository reuses native abandoned-lock recovery and does not hide filesystem failures", async () => {
  const directory = await mkdtemp(join(tmpdir(), "z1-graph-stale-"));
  const first = createGraphRepository(directory);
  const second = createGraphRepository(directory);
  const target = { workspacePath: "C:/synthetic/ownership" };
  try {
    await first.acquireOwnership!(target);
    const [lockName] = (await readdir(directory)).filter((name) => name.endsWith(".lock"));
    await first.dispose!();
    const staleLock = join(directory, lockName!);
    await mkdir(staleLock);
    await writeFile(
      join(staleLock, "owner-abandoned.json"),
      JSON.stringify({ pid: null, createdAt: 0 }),
    );
    assert.equal(await second.acquireOwnership!(target), true);
    const blockedPath = join(directory, "not-a-directory");
    await writeFile(blockedPath, "synthetic");
    const invalid = createGraphRepository(blockedPath);
    await assert.rejects(invalid.acquireOwnership!(target));
    await invalid.dispose!();
  } finally {
    await first.dispose!();
    await second.dispose!();
    assert.ok(directory.startsWith(join(tmpdir(), "z1-graph-stale-")));
    await rm(directory, { recursive: true, force: true });
  }
});
