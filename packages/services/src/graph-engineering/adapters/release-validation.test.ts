import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { GraphLegacyRun } from "../contract.js";
import { defaultDefinition } from "../domain/definition.js";
import { recordSchema } from "../domain/record.js";
import { createGraphRepository } from "./repository.js";

import { target, settings, recordFixture } from "./release-validation.fixture.js";

test("persisted missing, copied, or mismatched release proof cannot unlock a run", async () => {
  const directory = await mkdtemp(join(tmpdir(), "z2-release-audit-"));
  const repository = createGraphRepository(directory);
  const original = recordFixture();
  try {
    await repository.write(target, { definition: original.definition, runs: original.runs });
    const path = join(
      directory,
      `${createHash("sha256").update(target.workspaceIdentity).digest("hex")}.json`,
    );
    const disk = await readFile(path, "utf8");
    const corruptions: Array<[string, (record: ReturnType<typeof recordFixture>) => void]> = [
      [
        "missing attempt",
        (r) => {
          r.runs[0]!.release!.inspection.attempts.pop();
        },
      ],
      [
        "duplicate attempt",
        (r) => {
          r.runs[0]!.release!.inspection.attempts[1] = structuredClone(
            r.runs[0]!.release!.inspection.attempts[0]!,
          );
        },
      ],
      [
        "foreign attempt",
        (r) => {
          r.runs[0]!.release!.inspection.attempts[1]!.attemptId = "foreign";
        },
      ],
      [
        "active run",
        (r) => {
          r.runs[0]!.status = "Running";
        },
      ],
      [
        "copied terminal",
        (r) => {
          r.runs[0]!.release!.inspection.attempts[1]!.proof = structuredClone(
            r.runs[0]!.release!.inspection.attempts[0]!.proof,
          );
        },
      ],
      [
        "wrong runtime",
        (r) => {
          Object.assign(r.runs[0]!.release!.inspection.attempts[1]!.proof!, {
            runtimeIdentity: "another-runtime",
          });
        },
      ],
      [
        "wrong workspace",
        (r) => {
          Object.assign(r.runs[0]!.release!.inspection.attempts[1]!.proof!, {
            workspaceKey: "another-workspace",
          });
        },
      ],
      [
        "claimed never sent",
        (r) => {
          r.runs[0]!.release!.inspection.attempts[1]!.proof = {
            kind: "never-submitted",
            commandId: "command-b",
            dispatchPhase: "accepted",
          };
        },
      ],
      [
        "wrong never-sent phase",
        (r) => {
          r.runs[0]!.release!.inspection.attempts[1]!.proof = {
            kind: "never-submitted",
            commandId: "command-b",
            dispatchPhase: "planned",
          };
        },
      ],
      [
        "wrong handoff source",
        (r) => {
          r.runs[0]!.nodeAttempts[1]!.bindings![0]!.sourceSessionId = "foreign-session";
        },
      ],
    ];
    for (const [label, change] of corruptions) {
      const candidate = JSON.parse(disk) as ReturnType<typeof recordFixture>;
      change(candidate);
      await writeFile(path, JSON.stringify(candidate));
      await assert.rejects(repository.read(target), label);
    }
    await writeFile(path, disk);
    assert.deepEqual(await repository.read(target), {
      definition: original.definition,
      runs: original.runs,
    });
  } finally {
    await repository.dispose?.();
    assert.ok(directory.startsWith(join(tmpdir(), "z2-release-audit-")));
    await rm(directory, { recursive: true, force: true });
  }
});

test("terminal release proof must match session, command, input, epoch and frozen terminal", () => {
  for (const change of [
    (p: Record<string, unknown>) => {
      p.sessionId = "foreign";
    },
    (p: Record<string, unknown>) => {
      p.inputId = "foreign";
    },
    (p: Record<string, unknown>) => {
      p.commandId = "foreign";
    },
    (p: Record<string, unknown>) => {
      p.runtimeIdentity = "foreign";
    },
    (p: Record<string, unknown>) => {
      (p.terminalProof as Record<string, unknown>).sourceCommandId = "foreign";
    },
    (p: Record<string, unknown>) => {
      (p.terminalProof as Record<string, unknown>).logEpoch = "foreign";
    },
    (p: Record<string, unknown>) => {
      (p.terminalProof as Record<string, unknown>).turnId = "foreign";
    },
    (p: Record<string, unknown>) => {
      (p.terminalProof as Record<string, unknown>).seq = 99;
    },
    (p: Record<string, unknown>) => {
      (p.terminalProof as Record<string, unknown>).state = "failed";
    },
  ]) {
    const candidate = structuredClone(recordFixture());
    change(
      candidate.runs[0]!.release!.inspection.attempts[0]!.proof as unknown as Record<
        string,
        unknown
      >,
    );
    assert.equal(recordSchema.safeParse(candidate).success, false);
  }
});

test("an interrupted exact warm terminal may release without rewriting the unknown attempt", () => {
  const record = structuredClone(recordFixture());
  record.runs[0]!.release!.inspection.attempts[1]!.proof = {
    kind: "input-terminal",
    runtimeIdentity: "runtime-b",
    sessionId: "session-b",
    inputId: "command-b",
    commandId: "command-b",
    terminalProof: {
      state: "completedSuccess",
      sourceCommandId: "command-b",
      logEpoch: "epoch-b",
      seq: 8,
      turnId: "turn-b",
    },
  };
  assert.equal(recordSchema.parse(record).runs[0]!.status, "Interrupted");
  assert.equal(record.runs[0]!.nodeAttempts[1]!.status, "Unknown");
});

test("never-submitted proof accepts only matching pre-send phases and excludes admitted evidence", () => {
  for (const phase of ["planned", "creating", "created"] as const) {
    const record = structuredClone(recordFixture());
    const node = record.runs[0]!.nodeAttempts[1]!;
    node.dispatchPhase = phase;
    delete node.observationEpoch;
    if (phase !== "created") {
      delete node.sessionId;
      delete node.runtimeIdentity;
    }
    record.runs[0]!.release!.inspection.attempts[1]!.proof = {
      kind: "never-submitted",
      commandId: node.commandId,
      dispatchPhase: phase,
    };
    assert.equal(recordSchema.safeParse(record).success, true);
    node.observationEpoch = "epoch-b";
    assert.equal(recordSchema.safeParse(record).success, false);
  }
});

test("unchanged Z1 history remains valid, while new legacy release requires exact proof", () => {
  const run: GraphLegacyRun = {
    id: "legacy",
    attemptId: "legacy-attempt",
    requestId: "legacy-request",
    target,
    definition: defaultDefinition(),
    ...settings,
    commandId: "legacy-command",
    inputId: "legacy-command",
    sessionId: "legacy-session",
    runtimeIdentity: "legacy-runtime",
    status: "Completed",
    createdAt: 1,
    updatedAt: 3,
    terminalProof: {
      sourceCommandId: "legacy-command",
      state: "completedSuccess",
      logEpoch: "legacy-epoch",
      seq: 3,
    },
  };
  const record = {
    version: 1,
    workspaceKey: target.workspaceIdentity,
    definition: run.definition,
    runs: [run],
  };
  assert.deepEqual(recordSchema.parse(record), record);
  run.status = "Interrupted";
  delete run.terminalProof;
  run.release = {
    releasedAt: 4,
    reason: "Inspected legacy native terminal",
    inspection: {
      inspectedAt: 4,
      state: "inactive",
      reason: "Exact original input",
      attempts: [
        {
          attemptId: run.attemptId,
          state: "inactive",
          reason: "Native terminal",
          proof: {
            kind: "input-terminal",
            runtimeIdentity: run.runtimeIdentity!,
            sessionId: run.sessionId!,
            inputId: run.inputId,
            commandId: run.commandId,
            terminalProof: {
              sourceCommandId: run.commandId,
              state: "completedInterrupted",
              logEpoch: "legacy-epoch",
              seq: 4,
            },
          },
        },
      ],
    },
  };
  assert.equal(recordSchema.safeParse(record).success, true);
  run.release.inspection.attempts[0]!.proof = {
    kind: "never-submitted",
    commandId: run.commandId,
    dispatchPhase: "planned",
  };
  assert.equal(recordSchema.safeParse(record).success, false);
});
