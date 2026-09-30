import assert from "node:assert/strict";
import test from "node:test";
import type { GraphRun } from "@zcode/services";
import { graphSessionOwner } from "../src/graph-engineering/graphSessionOwner.js";
import { summaryRun } from "./graphRunSummary.fixture.js";

test("a session resolves to the exact run, step and attempt that own it", () => {
  const run = summaryRun();
  assert.deepEqual(graphSessionOwner({ runs: [run] }, "session-task"), {
    runId: "run",
    nodeId: "task",
    attemptId: "task-0",
  });
  assert.equal(graphSessionOwner({ runs: [run] }, "unrelated-session"), null);
});

test("the newest run wins and other runs' sessions never match", () => {
  const older = summaryRun();
  older.id = "older";
  older.createdAt = 1;
  const newer = summaryRun();
  newer.id = "newer";
  newer.createdAt = 10;
  newer.nodeAttempts[0]!.attemptId = "task-new";
  const runs: GraphRun[] = [older, newer];
  assert.equal(graphSessionOwner({ runs }, "session-task")?.runId, "newer");
  assert.equal(graphSessionOwner({ runs }, "session-task")?.attemptId, "task-new");
  assert.equal(graphSessionOwner({ runs: [older] }, "session-of-newer-only"), null);
});

test("tool attempts (Build/Test conversations) resolve to their tool step", () => {
  const run = summaryRun();
  run.toolAttempts = [
    {
      nodeId: "build",
      attemptId: "build-0",
      sessionId: "session-build",
      status: "Completed",
    } as NonNullable<typeof run.toolAttempts>[number],
  ];
  assert.deepEqual(graphSessionOwner({ runs: [run] }, "session-build"), {
    runId: "run",
    nodeId: "build",
    attemptId: "build-0",
  });
});
