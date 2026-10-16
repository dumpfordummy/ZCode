import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { observeFilesystem } from "./eng-p1-io-observer.mjs";
import { largeProjectFixture } from "../../packages/services/src/graph-engineering/adapters/project-large.fixture.ts";
import { createProjectDiscovery } from "../../packages/services/src/graph-engineering/adapters/project-discovery.ts";
import { createRecipeSourceFingerprint } from "../../packages/services/src/graph-engineering/adapters/recipe-sources.ts";
import { captureWebProfileRuntime } from "../../packages/shared/src/node/webProfileProvenance.ts";

assert.equal(process.versions.node, "24.14.0", "Use pinned Node 24.14.0 with --import tsx");
const { values } = parseArgs({
  options: {
    mode: { type: "string", default: "small" },
    repeats: { type: "string", default: "3" },
    executable: { type: "string" },
    "package-root": { type: "string" },
    "system-root": { type: "string" },
  },
});
assert.ok(["small", "large", "provenance"].includes(values.mode));
const repeats = Number(values.repeats);
assert.ok(Number.isInteger(repeats) && repeats >= 1 && repeats <= 3);
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const parent = join(repo, ".tmp/eng-p1");
await mkdir(parent, { recursive: true });
const directory = await mkdtemp(join(parent, `${values.mode}-`));
const workspace = join(directory, "fixture");
await mkdir(workspace);
const summary = {
  status: "RUNNING",
  mode: values.mode,
  node: process.versions.node,
  platform: process.platform,
  clock: "single-process performance.now",
  startedAt: new Date().toISOString(),
  cache: "not flushed; freshly written fixture warms OS cache; repeated reads may be warm",
  contention: "no concurrent work launched by this diagnostic; other system workloads uncontrolled",
  timings:
    "phases disjoint; total inclusive; filesystem apiMs overlap and include instrumentation overhead",
  ioCoverage:
    "fs/promises lstat/realpath/readdir/opendir/readFile/stat/open; handle read/stat/close; streamBytes is a subset of readBytes, not additive; internal Dir iteration syscalls excluded; errors include expected ENOENT probes",
  memory: "sampled RSS per operation; process maxRSS is lifetime high-water, in KiB",
  operations: [],
};
if (values.mode !== "provenance")
  summary.fixture = await largeProjectFixture(
    workspace,
    values.mode === "large" ? 100 : 2,
    values.mode === "large" ? 50 : 20,
  );
else
  for (const key of ["executable", "package-root", "system-root"])
    assert.ok(values[key], `provenance requires explicit --${key}`);

const observer = observeFilesystem();
async function measure(kind, action) {
  const operation = { operationId: randomUUID(), kind, phases: [], startedMs: performance.now() };
  let peakRss = process.memoryUsage().rss;
  const sample = setInterval(() => {
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  }, 20);
  let phase = "overhead",
    phaseStart = performance.now();
  observer.begin();
  const split = (next) => {
    const endedMs = performance.now();
    operation.phases.push({
      phase,
      startedMs: phaseStart,
      endedMs,
      elapsedMs: endedMs - phaseStart,
      io: observer.end(),
    });
    phase = next;
    phaseStart = performance.now();
    observer.begin();
  };
  try {
    const value = await action((event) => {
      if (event.endsWith("-start")) split(event.slice(0, -6));
      if (event.endsWith("-end")) split("overhead");
    });
    operation.status = "PASS";
    return value;
  } catch (error) {
    operation.status = "FAIL";
    operation.error = { name: error.name, code: error.code };
    // Keep arbitrary platform paths out of the shareable diagnostic result.
    console.error(
      `ENG-P1 ${kind} failed (${error.code ?? error.name}); see local terminal for details.`,
    );
    throw error;
  } finally {
    const endedMs = performance.now();
    operation.phases.push({
      phase,
      startedMs: phaseStart,
      endedMs,
      elapsedMs: endedMs - phaseStart,
      io: observer.end(),
    });
    operation.endedMs = endedMs;
    operation.elapsedMs = endedMs - operation.startedMs;
    clearInterval(sample);
    operation.sampledPeakRss = Math.max(peakRss, process.memoryUsage().rss);
    operation.processMaxRssKiB = process.resourceUsage().maxRSS;
    summary.operations.push(operation);
    console.log(
      JSON.stringify({
        operationId: operation.operationId,
        kind,
        status: operation.status,
        elapsedMs: operation.elapsedMs,
      }),
    );
  }
}
try {
  if (values.mode === "provenance") {
    let previous;
    for (let i = 0; i < repeats; i++) {
      const result = await measure("exact-installed-provenance", () =>
        captureWebProfileRuntime({
          workspace,
          executable: resolve(values.executable),
          packageRoot: resolve(values["package-root"]),
          systemRoot: resolve(values["system-root"]),
        }),
      );
      if (previous) assert.deepEqual(result, previous);
      previous = result;
      summary.observedFiles = result.observedFiles;
      summary.observedBytes = result.observedBytes;
      summary.policy = result.policy;
    }
  } else {
    const target = { workspacePath: workspace };
    const prepared = await measure("prepare-selected", async () => {
      const result = await createProjectDiscovery().scan(target, randomUUID(), {
        selectedProject: "Large.sln",
      });
      assert.equal(result.status, "complete", result.issues.join("\n"));
      assert.equal(result.prepared.scope.version, 2);
      return result;
    });
    summary.sourceCount = prepared.prepared.scope.sourceCount;
    let previous;
    for (let i = 0; i < repeats; i++) {
      const result = await measure("fresh-scope-fingerprint", (phase) =>
        createRecipeSourceFingerprint()(target, [], [prepared.prepared.scope], phase),
      );
      if (previous) assert.equal(result.digest, previous);
      previous = result.digest;
      summary.contentBytes = result.files.reduce((sum, file) => sum + file.bytes, 0);
      summary.digest = result.digest;
    }
  }
  summary.status = "PASS";
} catch (error) {
  summary.status = "FAIL";
  summary.error = { name: error.name, code: error.code };
  throw error;
} finally {
  observer.restore();
  await writeFile(join(directory, "profile.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(`ENG-P1 result: ${join(directory, "profile.json")}`);
}
