import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtemp, mkdir, writeFile, rm, open, readFile, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProjectDiscovery } from "./project-discovery.js";
import { ProjectScanJob } from "./project-scan-job.js";
import { fingerprintDeclaredFiles, observeDeclaredFiles } from "./artifact-files.js";
import { createGraphRecipeStore } from "./recipes.js";
import { literalProject, literalSolution } from "./project-large.fixture.js";
import { revalidateProjectScope } from "./project-scope.js";
import { prepareProjectScope } from "./project-scope.js";
import { createGraphRepository } from "./repository.js";
import { defaultDefinition } from "../domain/definition.js";
import { GRAPH_RECORD_FILE_BYTES, RECIPE_CONFIGURATION_BYTES } from "../domain/project-budgets.js";
import {
  PROJECT_INVENTORY_BUDGET as budget,
  PROJECT_SCOPE_BUDGET,
} from "../domain/project-budgets.js";

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "u3-boundaries-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
test("record/configuration byte budgets reject excess without changing retained bytes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "u3-record-boundary-")),
    target = { workspacePath: root };
  const directory = join(root, "records"),
    repository = createGraphRepository(directory);
  t.after(async () => {
    await repository.dispose?.();
    await rm(root, { recursive: true, force: true });
  });
  const record = { definition: defaultDefinition(), runs: [] };
  await repository.write(target, record);
  const file = join(directory, (await readdir(directory)).find((name) => name.endsWith(".json"))!);
  const bytes = await readFile(file);
  await writeFile(
    file,
    Buffer.concat([bytes, Buffer.alloc(GRAPH_RECORD_FILE_BYTES - bytes.length, 32)]),
  );
  assert.deepEqual(await repository.read(target), record);
  await writeFile(file, " ", { flag: "a" });
  await assert.rejects(() => repository.read(target), /64 MiB/);
  assert.equal((await stat(file)).size, GRAPH_RECORD_FILE_BYTES + 1);
  await mkdir(join(root, ".zcode"));
  const config = join(root, ".zcode/config.json");
  await writeFile(config, "{}" + " ".repeat(RECIPE_CONFIGURATION_BYTES - 2));
  assert.deepEqual((await createGraphRecipeStore().read(target)).recipes, []);
  await writeFile(config, " ", { flag: "a" });
  await assert.rejects(() => createGraphRecipeStore().read(target), /limit/);
  assert.equal((await stat(config)).size, RECIPE_CONFIGURATION_BYTES + 1);
});
test("solution imports are scoped to the solution ancestors; custom global SDK resolution is blocked", async (t) => {
  const root = await fixture(t),
    target = { workspacePath: root },
    scanner = createProjectDiscovery();
  await mkdir(join(root, "solutions"));
  await mkdir(join(root, "app"));
  await writeFile(join(root, "solutions/App.sln"), literalSolution("../app/App.csproj"));
  await writeFile(join(root, "app/App.csproj"), literalProject());
  await writeFile(join(root, "app/Directory.Solution.props"), "<Project />");
  assert.equal(
    (await scanner.scan(target, "sibling", { selectedProject: "solutions/App.sln" })).status,
    "complete",
  );
  await writeFile(join(root, "solutions/Directory.Solution.props"), "<Project />");
  assert.equal(
    (await scanner.scan(target, "solution-import", { selectedProject: "solutions/App.sln" }))
      .prepared,
    undefined,
  );
  assert.equal(
    (await scanner.scan(target, "direct-project", { selectedProject: "app/App.csproj" })).status,
    "complete",
  );
  await rm(join(root, "solutions/Directory.Solution.props"));
  await writeFile(join(root, "solutions/after.App.sln.targets"), "<Project />");
  assert.match(
    (
      await scanner.scan(target, "named-import", { selectedProject: "solutions/App.sln" })
    ).issues.join(" "),
    /solution-specific imports/,
  );
  await writeFile(
    join(root, "global.json"),
    '{"sdk":{"version":"8.0.425","paths":["../external"]}}',
  );
  assert.match(
    (await scanner.scan(target, "external-sdk", { selectedProject: "app/App.csproj" })).issues.join(
      " ",
    ),
    /external\/custom SDK/,
  );
});
test("unreadable local metadata preserves independent inventory; required reads and concurrent membership changes fail closed", async (t) => {
  const root = await fixture(t),
    target = { workspacePath: root };
  await writeFile(join(root, "Bad.csproj"), literalProject());
  await writeFile(join(root, "Good.csproj"), literalProject());
  const job = new ProjectScanJob(target, "unreadable");
  await job.walk(
    "",
    async (path) => {
      if (path === "Bad.csproj")
        throw Object.assign(Error("EACCES: synthetic unreadable metadata"), { code: "EACCES" });
      await job.metadata(path);
    },
    false,
  );
  assert.equal(job.finish().status, "limited");
  assert.ok(job.result.candidates.some((candidate) => candidate.path === "Good.csproj"));
  const required = new ProjectScanJob(target, "required");
  required.metadata = async () => {
    throw Object.assign(Error("EACCES: required metadata"), { code: "EACCES" });
  };
  await assert.rejects(() => prepareProjectScope(required, "Bad.csproj"), /EACCES/);
  assert.equal(required.result.prepared, undefined);
  const changing = new ProjectScanJob(target, "changing");
  await changing.walk("", async () => {}, true);
  await writeFile(join(root, "Added.cs"), "// concurrent addition");
  await assert.rejects(() => changing.verifyDirectories(), /membership changed/);
});
test(
  "20,000 physical inputs prepare completely; one extra input prevents authorization",
  { timeout: 240000 },
  async (t) => {
    const root = await fixture(t),
      target = { workspacePath: root },
      scanner = createProjectDiscovery();
    await writeFile(join(root, "App.csproj"), literalProject());
    let cursor = 0;
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (cursor < PROJECT_SCOPE_BUDGET.sourceFiles - 1) {
          const index = cursor++;
          await writeFile(join(root, `Input${index}.cs`), "// synthetic input\n");
        }
      }),
    );
    const exact = await scanner.scan(target, "exact-source-count", {
      selectedProject: "App.csproj",
    });
    assert.equal(exact.status, "complete", exact.issues.join(" "));
    assert.equal(exact.prepared!.sourcePaths.length, PROJECT_SCOPE_BUDGET.sourceFiles);
    assert.equal(
      (await fingerprintDeclaredFiles(target, exact.prepared!.sourcePaths)).files.length,
      PROJECT_SCOPE_BUDGET.sourceFiles,
    );
    await writeFile(join(root, "Extra.cs"), "// one beyond budget\n");
    const over = await scanner.scan(target, "over-source-count", { selectedProject: "App.csproj" });
    assert.equal(over.status, "limited");
    assert.equal(over.prepared, undefined);
    assert.match(over.issues.join(" "), /Source count budget/);
  },
);
test(
  "exact metadata aggregate and record budgets; one extra record is explicitly limited",
  { timeout: 120000 },
  async (t) => {
    const root = await fixture(t),
      target = { workspacePath: root };
    for (let index = 0; index < 16; index++)
      await writeFile(join(root, `${index}.sln`), "x".repeat(budget.fileBytes));
    const scanner = createProjectDiscovery();
    assert.equal((await scanner.scan(target, "exact-bytes")).status, "complete");
    await writeFile(join(root, "17.sln"), "x");
    assert.equal((await scanner.scan(target, "over-bytes")).status, "limited");
    const countRoot = join(root, "count");
    await mkdir(countRoot);
    for (let index = 0; index < budget.metadataRecords; index++)
      await writeFile(join(countRoot, `${index}.csproj`), literalProject());
    assert.equal(
      (await scanner.scan({ workspacePath: countRoot }, "exact-count")).metadata.length,
      budget.metadataRecords,
    );
    await writeFile(join(countRoot, "extra.csproj"), literalProject());
    const over = await scanner.scan({ workspacePath: countRoot }, "over-count");
    assert.equal(over.status, "limited");
    assert.equal(over.prepared, undefined);
  },
);
test("final depth and entry counter boundaries, deadline, diagnostics and cancellation remain finite", async (t) => {
  const root = await fixture(t),
    target = { workspacePath: root };
  const deep = join(root, ...Array.from({ length: budget.depth }, () => "d"));
  await mkdir(deep, { recursive: true });
  await writeFile(join(deep, "App.csproj"), literalProject());
  const scanner = createProjectDiscovery();
  assert.equal((await scanner.scan(target, "exact-depth")).status, "complete");
  await mkdir(join(deep, "extra"));
  assert.equal((await scanner.scan(target, "over-depth")).status, "limited");
  const job = new ProjectScanJob(target, "counter");
  job.progress.entries = budget.entries - 1;
  await assert.rejects(() => job.walk("", async () => {}, true), /Entry budget/);
  assert.equal(job.progress.entries, budget.entries + 1);
  const timed = new ProjectScanJob(target, "deadline");
  timed.limits.elapsedMs = -1;
  assert.throws(() => timed.check(), /time budget/);
  for (let index = 0; index < 1000; index++) timed.issue(`${index}: ${"x".repeat(2000)}`);
  assert.equal(timed.result.issues.length, budget.diagnostics);
  assert.ok(timed.result.issues.every((issue) => issue.length <= budget.diagnosticCharacters));
});
test("literal duplicate references deduplicate; cycles and missing required projects stay blocked", async (t) => {
  const root = await fixture(t),
    target = { workspacePath: root },
    scanner = createProjectDiscovery();
  await writeFile(
    join(root, "A.csproj"),
    literalProject(
      '<ProjectReference Include="./B.csproj" /><ProjectReference Include="B.csproj" />',
    ),
  );
  await writeFile(join(root, "B.csproj"), literalProject());
  const good = await scanner.scan(target, "duplicate", { selectedProject: "A.csproj" });
  assert.equal(good.status, "complete", good.issues.join(" "));
  assert.equal(good.candidates.length, 2);
  await writeFile(
    join(root, "B.csproj"),
    literalProject('<ProjectReference Include="A.csproj" />'),
  );
  assert.match(
    (await scanner.scan(target, "cycle", { selectedProject: "A.csproj" })).issues.join(" "),
    /Cyclic/,
  );
  await rm(join(root, "B.csproj"));
  assert.equal(
    (await scanner.scan(target, "missing", { selectedProject: "A.csproj" })).prepared,
    undefined,
  );
});
test(
  "32 MiB file and 512 MiB aggregate streamed source boundaries, with unchanged 32-output cap",
  { timeout: 120000 },
  async (t) => {
    const root = await fixture(t),
      target = { workspacePath: root },
      paths: string[] = [];
    for (let index = 0; index < 16; index++) {
      const path = `${index}.cs`;
      paths.push(path);
      const handle = await open(join(root, path), "w");
      await handle.truncate(PROJECT_SCOPE_BUDGET.sourceFileBytes);
      await handle.close();
    }
    const exact = await fingerprintDeclaredFiles(target, paths);
    assert.equal(
      exact.files.reduce((sum, file) => sum + file.bytes, 0),
      PROJECT_SCOPE_BUDGET.sourceBytes,
    );
    await writeFile(join(root, "extra.cs"), "x");
    await assert.rejects(
      () => fingerprintDeclaredFiles(target, [...paths, "extra.cs"]),
      /byte budget/,
    );
    const file = await open(join(root, paths[0]!), "r+");
    await file.truncate(PROJECT_SCOPE_BUDGET.sourceFileBytes + 1);
    await file.close();
    await assert.rejects(() => fingerprintDeclaredFiles(target, [paths[0]!]), /byte budget/);
    await assert.rejects(
      () =>
        observeDeclaredFiles(
          target,
          Array.from({ length: 33 }, (_, i) => `${i}.dll`),
        ),
      /32/,
    );
  },
);
test("large explicit legacy-format arrays survive save/reload without changing their digest scheme", async (t) => {
  const root = await fixture(t),
    target = { workspacePath: root },
    store = createGraphRecipeStore();
  const recipe = {
    id: "large",
    name: "Large explicit scope",
    executable: "dotnet",
    args: [],
    cwd: ".",
    timeoutMs: 1000,
    sourcePaths: Array.from({ length: 5000 }, (_, i) => `s/${i}.cs`),
    expectedOutputs: [],
    verifier: { kind: "command" as const },
  };
  const saved = await store.save(target, [recipe], (await store.read(target)).digest);
  assert.deepEqual((await createGraphRecipeStore().read(target)).recipes, [recipe]);
  assert.equal(saved.recipes[0]!.sourcePaths.length, 5000);
});

test("parsed XML closure includes single-quoted references; unrelated changes do not stale the scope", async (t) => {
  const root = await fixture(t),
    target = { workspacePath: root },
    scanner = createProjectDiscovery();
  for (const folder of ["app", "shared", "unrelated"]) await mkdir(join(root, folder));
  await writeFile(
    join(root, "app/A.csproj"),
    literalProject("<ProjectReference Include='../shared/B.csproj' />"),
  );
  await writeFile(join(root, "shared/B.csproj"), literalProject());
  await writeFile(join(root, "shared/B.cs"), "class B {}");
  await writeFile(join(root, "global.json"), '{"sdk":{"version":"8.0.425"}}');
  const prepared = await scanner.scan(target, "closure", { selectedProject: "app/A.csproj" });
  assert.equal(prepared.status, "complete", prepared.issues.join(" "));
  const scope = prepared.prepared!.scope;
  assert.deepEqual(prepared.prepared!.sourcePaths, [
    "app/A.csproj",
    "global.json",
    "shared/B.cs",
    "shared/B.csproj",
  ]);
  await writeFile(join(root, "unrelated/Directory.Packages.props"), "<Project />");
  await revalidateProjectScope(target, scope);
  await writeFile(
    join(root, "shared/B.csproj"),
    literalProject('<ProjectReference Include="../app/A.csproj" />'),
  );
  await assert.rejects(() => revalidateProjectScope(target, scope), /Cyclic/);
  await writeFile(join(root, "shared/B.csproj"), literalProject());
  await writeFile(join(root, "global.json"), '{"sdk":{"version":"8.0.424"}}');
  await assert.rejects(() => revalidateProjectScope(target, scope), /membership/);
});
