import assert from "node:assert/strict";
import test from "node:test";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { GitGraphWorkspace } from "@zcode/shared";
import type {
  IGitService,
  IZCodeAgentService,
  IZCodeSessionService,
  IModelSelectionService,
} from "../../index.js";
import { sourceFixture } from "../../git/sourceSnapshot.fixture.js";
import { createGraphParallelPort } from "./parallel-workspaces.js";

test("Z7 actual native Git capture refuses undeclared additions and preserves approved full text", async (t) => {
  const f = await sourceFixture(t);
  const workspace = { workspacePath: f.workspacePath } as GitGraphWorkspace;
  const port = createGraphParallelPort({
    gitService: { ...f.service, graphWorkspace: async () => workspace } as IGitService,
    agentService: {} as IZCodeAgentService,
    sessionService: {} as IZCodeSessionService,
    modelSelectionService: {} as IModelSelectionService,
  });
  const child = { id: "a", requestId: "a", selected: true, workspace };
  await writeFile(join(f.workspacePath, "tracked.txt"), "after\n");
  await writeFile(join(f.workspacePath, "new.txt"), "approved new content\n");
  await assert.rejects(port.capture(child, ["tracked.txt"], []), /scope violation/);
  await assert.rejects(port.capture(child, ["tracked.txt", "new.txt"], []), /Unapproved untracked/);
  const proposal = await port.capture(child, ["tracked.txt", "new.txt"], ["new.txt"]);
  assert.deepEqual(
    proposal.files.map((f) => ({ path: f.path, before: f.before, after: f.after, kind: f.kind })),
    [
      { path: "new.txt", before: "", after: "approved new content\n", kind: "add" },
      { path: "tracked.txt", before: "original\n", after: "after\n", kind: "edit" },
    ],
  );
  await f.git("add", "--", "tracked.txt");
  await assert.rejects(
    port.capture(child, ["tracked.txt", "new.txt"], ["new.txt"]),
    /Unsupported staged/,
  );
});
test("Z7 actual binary capture and active native workspace cleanup fail closed", async (t) => {
  const f = await sourceFixture(t);
  const workspace = { workspacePath: f.workspacePath } as GitGraphWorkspace;
  let deletes = 0;
  const port = createGraphParallelPort({
    gitService: {
      ...f.service,
      graphWorkspace: async () => {
        return workspace;
      },
    } as IGitService,
    cleanupWorkspace: async () => {
      deletes++;
      return workspace;
    },
    agentService: {
      collectLocalRuntimeChildProcesses: async () => [{ workspacePath: f.workspacePath }],
    } as unknown as IZCodeAgentService,
    sessionService: {} as IZCodeSessionService,
    modelSelectionService: {} as IModelSelectionService,
  });
  await writeFile(join(f.workspacePath, "tracked.txt"), Buffer.from([0, 1, 2, 3]));
  await assert.rejects(
    port.capture({ id: "a", requestId: "a", selected: true, workspace }, ["tracked.txt"], []),
    /Incomplete|incomplete/,
  );
  await assert.rejects(port.cleanup(workspace, []), /runtime still owns/);
  assert.equal(deletes, 0);
});

test("Z7 complete native Git deletion retains the pinned before text and explicit action", async (t) => {
  const f = await sourceFixture(t);
  const workspace = { workspacePath: f.workspacePath } as GitGraphWorkspace;
  const port = createGraphParallelPort({
    gitService: { ...f.service, graphWorkspace: async () => workspace } as IGitService,
    agentService: {} as IZCodeAgentService,
    sessionService: {} as IZCodeSessionService,
    modelSelectionService: {} as IModelSelectionService,
  });
  await unlink(join(f.workspacePath, "tracked.txt"));
  const proposal = await port.capture(
    { id: "a", requestId: "a", selected: true, workspace },
    ["tracked.txt"],
    [],
  );
  assert.deepEqual(proposal.files, [
    { path: "tracked.txt", before: "original\n", after: "", kind: "delete" },
  ]);
});
