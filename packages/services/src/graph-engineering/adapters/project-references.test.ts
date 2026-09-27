import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unknownExecutionEnvironment, type ZCodeExecutionEnvironmentPreview } from "@zcode/shared";
import { createProjectSetupPort } from "./project-checks.js";
import { projectSetup } from "../app/project-setup.js";
import { workflowDigest } from "./workflow-preflight.js";

test("reference catalog uses existing-only metadata without recipe or execution access, including Unknown", async () => {
  const target = {
    workspacePath: "synthetic-unused-root",
    workspaceIdentity: "fixture:references",
  };
  const environment = unknownExecutionEnvironment("Cold fixture runtime");
  let calls = 0;
  const project = createProjectSetupPort({
    agentService: {
      previewExecutionEnvironment: async (received) => {
        assert.deepEqual(received, { ...target, executables: [] });
        calls++;
        return environment;
      },
    },
  });
  const graph = {
    getWorkspace: async () => {
      throw new Error("Reference lookup must not read run state");
    },
    recipes: async () => {
      throw new Error("Reference lookup must not load project checks");
    },
  };
  const result = await projectSetup(
    { action: "reference-catalog", target },
    { project, graph, digest: workflowDigest },
  );
  assert.equal(result.kind, "reference-catalog");
  assert.ok(result.kind === "reference-catalog" && result.status === "unknown");
  assert.ok(
    result.kind === "reference-catalog" && result.unknowns.some((x) => /initialize|Chat/i.test(x)),
  );
  assert.equal(calls, 1);
});

test("reference selection requires bounded safe UTF-8 workspace files and exact native metadata identity", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "graph-reference-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, "workspace");
  await mkdir(workspace);
  const target = { workspacePath: workspace, workspaceIdentity: "fixture:reference-files" };
  const content = "Independent synthetic project guidance.\n";
  await writeFile(join(workspace, "AGENTS.md"), content);
  await writeFile(join(root, "outside.md"), "out of workspace");
  await writeFile(join(workspace, "empty.md"), "");
  await writeFile(join(workspace, "large.md"), "a".repeat(102401));
  await writeFile(join(workspace, "invalid.md"), Buffer.from([0xff, 0xfe]));
  const environment: ZCodeExecutionEnvironmentPreview = {
    ...unknownExecutionEnvironment("fixture"),
    status: "available",
    instructions: [
      {
        scope: "workspace",
        path: join(workspace, "AGENTS.md"),
        digest: workflowDigest(content),
        bytes: Buffer.byteLength(content),
        truncated: false,
      },
    ],
  };
  let lookups = 0;
  const port = createProjectSetupPort({
    agentService: {
      previewExecutionEnvironment: async ({ executables }) => {
        assert.deepEqual(executables, []);
        lookups++;
        return structuredClone(environment);
      },
    },
  });
  const selected = await port.validateReference(target, join(workspace, "AGENTS.md"));
  assert.deepEqual(selected, {
    kind: "reference-validation",
    path: "AGENTS.md",
    digest: workflowDigest(content),
    bytes: Buffer.byteLength(content),
    delivery: "native-instructions",
    issues: [],
  });
  assert.equal((await port.validateReference(target, "AGENTS.md")).delivery, "native-instructions");
  environment.instructions[0]!.truncated = true;
  assert.equal((await port.validateReference(target, "AGENTS.md")).delivery, "explicit-read");
  environment.instructions[0]!.truncated = false;
  environment.instructions[0]!.digest = "a".repeat(64);
  assert.equal((await port.validateReference(target, "AGENTS.md")).delivery, "explicit-read");
  environment.instructions[0]!.digest = workflowDigest(content);
  environment.instructions[0]!.path = join(root, "AGENTS.md");
  assert.equal((await port.validateReference(target, "AGENTS.md")).delivery, "explicit-read");
  environment.instructions[0]!.path = join(workspace, "AGENTS.md");
  environment.status = "unknown";
  const unknown = await port.validateReference(target, "AGENTS.md");
  assert.equal(unknown.delivery, "explicit-read");
  assert.ok(unknown.issues.length);
  const before = lookups;
  for (const path of [
    join(root, "outside.md"),
    "../outside.md",
    "missing.md",
    "empty.md",
    "large.md",
    "invalid.md",
    "",
    "a\0b",
  ]) {
    await assert.rejects(port.validateReference(target, path));
  }
  assert.equal(lookups, before, "Rejected files do not query native metadata");
  await mkdir(join(root, "linked"));
  await writeFile(join(root, "linked", "rules.md"), "linked rules");
  await symlink(
    join(root, "linked"),
    join(workspace, "alias"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await assert.rejects(port.validateReference(target, "alias/rules.md"), /link|reparse/);
});
