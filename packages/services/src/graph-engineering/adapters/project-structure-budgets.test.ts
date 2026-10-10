import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseProjectXml } from "../domain/project-xml.js";
import { parseBoundedGraphJson } from "../domain/artifacts.js";
import {
  RECIPE_CONFIGURATION_BYTES,
  RECIPE_CONFIGURATION_MEMBERS,
} from "../domain/project-budgets.js";
import { ProjectScanJob } from "./project-scan-job.js";
import { literalProject, literalSolution } from "./project-large.fixture.js";
import { createProjectDiscovery } from "./project-discovery.js";

test("project XML structure budgets accept their boundary and reject one more", () => {
  const parse = (text: string) => parseProjectXml(Buffer.from(text));
  assert.equal(parse(`<R>${"<X/>".repeat(32767)}</R>`).children.length, 32767);
  assert.throws(() => parse(`<R>${"<X/>".repeat(32768)}</R>`), /element/);
  const attributes = (count: number) =>
    Array.from({ length: count }, (_, i) => ` a${i}="x"`).join("");
  assert.equal(Object.keys(parse(`<R${attributes(32)}/>`).attributes).length, 32);
  assert.throws(() => parse(`<R${attributes(33)}/>`), /attribute limit/);
  assert.equal(parse(`<R>${`<X${attributes(32)}/>`.repeat(2048)}</R>`).children.length, 2048);
  assert.throws(
    () => parse(`<R a="x">${`<X${attributes(32)}/>`.repeat(2048)}</R>`),
    /attribute limit/,
  );
  assert.equal(parse(`<R a="${"x".repeat(8192)}"/>`).attributes.a?.length, 8192);
  assert.throws(() => parse(`<R a="${"x".repeat(8193)}"/>`), /oversized attribute/);
  parse("<R>".repeat(16) + "</R>".repeat(16));
  assert.throws(() => parse("<R>".repeat(17) + "</R>".repeat(17)), /depth/);
  parse("<R>" + "x".repeat(4 * 1024 * 1024 - 7) + "</R>");
  assert.throws(() => parse("<R>" + "x".repeat(4 * 1024 * 1024 - 6) + "</R>"), /4 MiB/);
  assert.throws(() => parse('<!DOCTYPE R SYSTEM "external"><R/>'), /unsupported|declaration/i);
});

test("dedicated configuration member budget does not enlarge ordinary artifact JSON", () => {
  const limits = { bytes: RECIPE_CONFIGURATION_BYTES, members: RECIPE_CONFIGURATION_MEMBERS };
  const value = `[${"0,".repeat(RECIPE_CONFIGURATION_MEMBERS - 2)}0]`;
  assert.equal(
    (parseBoundedGraphJson(value, limits) as unknown[]).length,
    RECIPE_CONFIGURATION_MEMBERS - 1,
  );
  assert.throws(() => parseBoundedGraphJson(value.slice(0, -1) + ",0]", limits), /700000-member/);
  assert.throws(() => parseBoundedGraphJson(value), /256 KiB/);
});

test("reference edges and accumulated metadata DTOs retain independent finite budgets", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "u3-structures-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const references = (count: number, prefix = "P") =>
    Array.from(
      { length: count },
      (_, i) => `<ProjectReference Include="${prefix}${i}.csproj"/>`,
    ).join("");
  await writeFile(join(root, "A.csproj"), literalProject(references(16384)));
  await writeFile(join(root, "B.csproj"), literalProject(references(1)));
  const edges = new ProjectScanJob({ workspacePath: root }, "edges");
  assert.equal((await edges.metadata("A.csproj"))?.projects.length, 16384);
  await assert.rejects(() => edges.metadata("B.csproj"), /16384 edges/);
  await writeFile(join(root, "C.csproj"), literalProject(references(1700, "P".repeat(1000))));
  await writeFile(join(root, "D.csproj"), literalProject(references(500, "Q".repeat(1000))));
  const bytes = new ProjectScanJob({ workspacePath: root }, "dto");
  assert.ok(await bytes.metadata("C.csproj"));
  await assert.rejects(() => bytes.metadata("D.csproj"), /2 MiB/);
});

test("standard solution folders do not become build dependencies or hide real projects", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "u3-solution-folder-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "Tests.csproj"), literalProject("", true));
  await writeFile(
    join(root, "Folder.sln"),
    literalSolution().replace(
      "\nGlobal\n",
      '\nProject("{2150E333-8FDC-42A3-9474-1A3956D46DE8}") = "Sources", "Sources", "{22222222-2222-4222-8222-222222222222}"\nEndProject\nGlobal\n',
    ),
  );
  const result = await createProjectDiscovery().scan({ workspacePath: root }, "folder", {
    selectedProject: "Folder.sln",
  });
  assert.equal(result.status, "complete", result.issues.join(" "));
  assert.deepEqual(result.prepared?.sourcePaths, ["Folder.sln", "Tests.csproj"]);
});
