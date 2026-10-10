import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir, cpus, totalmem, release } from "node:os";
import path from "node:path";
import { createProjectDiscovery } from "../../packages/services/src/graph-engineering/adapters/project-discovery.ts";
import { createGraphRecipeStore } from "../../packages/services/src/graph-engineering/adapters/recipes.ts";
import { largeProjectFixture } from "../../packages/services/src/graph-engineering/adapters/project-large.fixture.ts";
import { compileDotnetRecipes } from "../../packages/services/src/graph-engineering/domain/dotnet-recipes.ts";

const root = await mkdtemp(path.join(tmpdir(), "u3-measure-"));
const target = { workspacePath: root },
  rows = [];
let peakRss = process.memoryUsage().rss;
const sample = setInterval(() => {
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
}, 10);
try {
  const workload = await largeProjectFixture(root);
  for (let repeat = 0; repeat < 3; repeat++) {
    const row = { repeat: repeat + 1 },
      scanner = createProjectDiscovery(),
      store = createGraphRecipeStore();
    const measure = async (name, action) => {
      const start = performance.now();
      const value = await action();
      row[name] = performance.now() - start;
      return value;
    };
    const inventory = await measure("scanMs", () => scanner.scan(target, "inventory"));
    assert.equal(inventory.status, "complete", inventory.issues.join(" "));
    const prepared = await measure("prepareMs", () =>
      scanner.scan(target, "prepare", { selectedProject: "Large.sln" }),
    );
    assert.equal(prepared.status, "complete", prepared.issues.join(" "));
    const recipes = compileDotnetRecipes({
      idPrefix: "large",
      executable: "dotnet",
      cwd: ".",
      timeoutMs: 120000,
      buildProject: "Large.sln",
      configuration: "Debug",
      sourcePaths: [],
      sourceScope: prepared.prepared.scope,
      expectedOutputs: ["P000/bin/Debug/net8.0/P000.dll"],
      reviewedManifest: true,
      tests: [
        {
          project: "P000/P000.csproj",
          configuration: "Debug",
          framework: "net8.0",
          assembly: "P000/bin/Debug/net8.0/P000.dll",
          minimumTests: 1,
          requiredTests: [],
        },
      ],
    });
    await measure("fingerprintMs", () =>
      store.fingerprint(target, recipes[0].sourcePaths, [prepared.prepared.scope]),
    );
    const previous = await store.read(target);
    const saved = await measure("saveMs", () => store.save(target, recipes, previous.digest));
    assert.deepEqual(await measure("reloadMs", () => createGraphRecipeStore().read(target)), saved);
    row.sourceCount = prepared.prepared.sourcePaths.length;
    row.inventoryBytes = Buffer.byteLength(JSON.stringify(inventory));
    row.preparedBytes = Buffer.byteLength(JSON.stringify(prepared));
    row.recipeBytes = Buffer.byteLength(JSON.stringify(recipes));
    const pending = scanner.scan(target, "cancel");
    while (scanner.progress(target, "cancel").entries < 100)
      await new Promise((resolve) => setTimeout(resolve, 1));
    const cancelAt = performance.now();
    scanner.cancelScan(target, "cancel");
    assert.equal((await pending).status, "cancelled");
    row.cancelMs = performance.now() - cancelAt;
    rows.push(row);
    console.log(JSON.stringify(row));
  }
  const result = {
    machine: {
      platform: process.platform,
      release: release(),
      cpu: cpus()[0]?.model,
      cores: cpus().length,
      memoryBytes: totalmem(),
      node: process.version,
    },
    workload,
    method:
      "Three new scanner/store instances; no discovery cache. OS cache not flushed. RSS sampled every 10 ms; includes fixture generation. Cancellation observed at async IO boundaries, not an OS IO deadline guarantee.",
    peakRssBytes: peakRss,
    rows,
  };
  const destination = process.argv[2] ?? ".tmp/u3-proof/performance.json";
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, JSON.stringify(result, null, 2));
} finally {
  clearInterval(sample);
  await rm(root, { recursive: true, force: true });
}
