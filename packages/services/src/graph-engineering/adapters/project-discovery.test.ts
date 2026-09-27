import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProjectDiscovery } from "./project-discovery.js";

test("discovery lists every literal scope and uncertainty without executing project metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "graph-project-scan-"));
  try {
    await mkdir(join(root, "tests"));
    await writeFile(
      join(root, "One.sln"),
      'Project("x") = "Tests", "tests/Tests.csproj", "x"\nEndProject',
    );
    await writeFile(
      join(root, "Two.slnx"),
      '<Solution><Project Path="tests/Tests.csproj" /></Solution>',
    );
    await writeFile(
      join(root, "tests", "Tests.csproj"),
      '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFrameworks>net8.0;net6.0</TargetFrameworks><IsTestProject>true</IsTestProject></PropertyGroup><ItemGroup><PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.11.1" /></ItemGroup><Target Name="NeverRun"><Exec Command="must-never-execute" /></Target></Project>',
    );
    await writeFile(join(root, "tests", "Cases.cs"), "// independent test authority");
    await writeFile(
      join(root, "Mtp.csproj"),
      "<Project><PropertyGroup><TargetFramework>net8.0</TargetFramework><UseMicrosoftTestingPlatformRunner>true</UseMicrosoftTestingPlatformRunner></PropertyGroup></Project>",
    );
    await mkdir(join(root, "obj"));
    await writeFile(join(root, "obj", "Ignore.csproj"), "<Project />");
    const result = await createProjectDiscovery().scan({ workspacePath: root }, "scan-one");
    assert.equal(result.status, "complete");
    assert.equal(result.candidates.length, 4);
    const tests = result.candidates.find((c) => c.path === "tests/Tests.csproj")!;
    assert.deepEqual(tests.frameworks, ["net8.0", "net6.0"]);
    assert.equal(tests.runner, "vstest");
    assert.equal(tests.coverage, "unsupported");
    assert.match(tests.issues.join(" "), /custom|Target/i);
    assert.ok(tests.sourcePaths.includes("tests/Cases.cs"));
    assert.equal(result.candidates.find((c) => c.path === "Mtp.csproj")!.runner, "mtp");
    assert.ok(result.excluded.includes("obj"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("cancelled, limited and linked scans never become a complete empty inventory", async () => {
  const root = await mkdtemp(join(tmpdir(), "graph-project-scan-"));
  const outside = await mkdtemp(join(tmpdir(), "graph-project-outside-"));
  try {
    await writeFile(
      join(root, "Tests.csproj"),
      '<Project><TargetFramework>$(Dynamic)</TargetFramework><ProjectReference Include="../private.csproj" /></Project>',
    );
    const port = createProjectDiscovery({ maximumFiles: 1 });
    await writeFile(join(root, "Extra.cs"), "// source");
    const limited = await port.scan({ workspacePath: root }, "limit");
    assert.equal(limited.status, "limited");
    const cancellable = createProjectDiscovery();
    const pending = cancellable.scan({ workspacePath: root }, "cancel");
    cancellable.cancelScan({ workspacePath: root }, "cancel");
    assert.equal((await pending).status, "cancelled");
    await symlink(outside, join(root, "linked"), process.platform === "win32" ? "junction" : "dir");
    const linked = await cancellable.scan({ workspacePath: root }, "linked");
    assert.match(linked.issues.join(" "), /link|reparse/i);
    assert.equal(linked.candidates[0]!.coverage, "unsupported");
    assert.match(linked.candidates[0]!.issues.join(" "), /dynamic|external/i);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
