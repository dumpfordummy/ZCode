import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createNodeExecutionAdapter } from "@zcode/adapters/exec";
import {
  builtInTools,
  createToolExecutor,
  createToolRegistry,
  PermissionService,
  ToolScheduler,
} from "@zcode/core";
import {
  createRootTraceContext,
  type SessionId,
  type ToolCallId,
  type PermissionBrokerRequest,
} from "@zcode/contracts";
import { createNativeRecipeOperations } from "./native-recipe-operations.js";

async function fixture(options: { failPersistence?: boolean; omitExitObservation?: boolean } = {}) {
  const cwd = await mkdtemp(join(tmpdir(), "zcode-z4-native-"));
  const sessionId = "z4-native-fixture" as SessionId;
  const traceContext = createRootTraceContext({ sessionId });
  const execution = createNodeExecutionAdapter({
    outputRootDir: join(cwd, "native-output"),
    processEnv: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      TEMP: cwd,
      TMP: cwd,
      HOME: cwd,
      USERPROFILE: cwd,
      Z4_SYNTHETIC_SECRET: "z4-synthetic-sensitive-value",
    },
  });
  const registry = createToolRegistry();
  const scheduler = new ToolScheduler();
  const requests: PermissionBrokerRequest[] = [];
  let answer: (decision: "allow" | "deny" | "modify", modifiedInput?: unknown) => void = () => {
    throw new Error("No pending permission");
  };
  const executor = createToolExecutor({
    registry,
    permissionService: new PermissionService(),
    sessionId,
    executionPort: options.omitExitObservation
      ? {
          run: async (request, runOptions) => ({
            ...(await execution.run(request, runOptions)),
            processExitObserved: false,
          }),
        }
      : execution,
    workingDirectory: cwd,
    workspaceRoot: cwd,
    emitEvent: async () => {},
    permissionBroker: {
      requestPermission: (request, options) => {
        requests.push(request);
        return new Promise((resolve) => {
          answer = (decision, modifiedInput) => resolve({ decision, modifiedInput });
          options?.signal?.addEventListener("abort", () => resolve({ decision: "deny" }), {
            once: true,
          });
        });
      },
    },
  });
  const operations = createNativeRecipeOperations({
    sessionId,
    workingDirectory: cwd,
    traceContext,
    env: { Z4_SYNTHETIC_SECRET: "z4-synthetic-sensitive-value" },
    runtime: {
      getToolRegistry: () => registry,
      getActiveTurnInfo: () => undefined,
      trackResidencyBlockingWork: (work) => work,
      ensureSessionPersistedForExternalActivity: async () => {
        if (options.failPersistence) throw new Error("Injected native session persistence failure");
      },
      scheduleTools: async (calls) =>
        scheduler.schedule(
          calls.map((call) => ({
            toolCallId: call.id as ToolCallId,
            toolName: call.name,
            dependsOn: [],
            readOnly: false,
            destructive: false,
            concurrentSafe: false,
            sideEffectScope: "system",
          })),
        ),
      executeTools: async (calls, schedule, options) => {
        const iterator = executor.executeSchedule(calls, schedule, {
          signal: options?.signal,
          traceContext,
        });
        for (;;) {
          const next = await iterator.next();
          if (next.done) return { results: next.value, events: [] };
        }
      },
    },
  });
  const request = (args: string[] = ["-e", "process.stdout.write('native-ok')"]) => ({
    operationId: crypto.randomUUID(),
    recipe: {
      id: "fixture",
      executable: process.execPath,
      args,
      cwdRelative: ".",
      timeoutMs: 5000,
    },
  });
  const until = async (condition: () => boolean) => {
    for (let i = 0; i < 500 && !condition(); i++)
      await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(condition(), "Expected native condition within 5 seconds");
  };
  const finish = async (id: string) => {
    await until(() => !!operations.inspect(id).completedAt);
    return operations.inspect(id);
  };
  return {
    cwd,
    operations,
    request,
    requests,
    until,
    finish,
    registry,
    answer: (decision: "allow" | "deny" | "modify", modifiedInput?: unknown) =>
      answer(decision, modifiedInput),
    async close() {
      await operations.close();
      await execution.close?.();
      await rm(cwd, { recursive: true, force: true });
    },
  };
}

test("native argv recipe waits for separate permission, runs once, and preserves immutable result", async () => {
  const f = await fixture();
  try {
    const request = f.request();
    const [initial, competing] = await Promise.all([
      f.operations.start(request),
      f.operations.start(request),
    ]);
    assert.equal(initial.requestDigest, competing.requestDigest);
    assert.equal(initial.status, "awaiting_permission");
    await f.until(() => f.requests.length === 1);
    assert.equal(f.operations.inspect(request.operationId).processStarted, false);
    assert.deepEqual(await f.operations.start(request), f.operations.inspect(request.operationId));
    assert.equal(f.requests.length, 1);
    await assert.rejects(
      f.operations.start({ ...request, recipe: { ...request.recipe, args: ["--version"] } }),
      /conflict/i,
    );
    f.answer("allow");
    const result = await f.finish(request.operationId);
    assert.equal(result.status, "completed");
    assert.equal(result.processStarted, true);
    assert.equal(result.result?.exitCode, 0);
    assert.equal(result.result?.processExitObserved, true);
    assert.equal(result.result?.stdout.text, "native-ok");
    result.result!.stdout.text = "tampered caller copy";
    assert.equal(f.operations.inspect(request.operationId).result?.stdout.text, "native-ok");
    assert.equal(f.operations.inspect(crypto.randomUUID()).status, "unknown");
  } finally {
    await f.close();
  }
});

test("native denied and cancelled commands cannot start or cancel another operation", async () => {
  const f = await fixture();
  try {
    const denied = f.request();
    await f.operations.start(denied);
    await f.until(() => f.requests.length === 1);
    f.answer("deny");
    assert.equal((await f.finish(denied.operationId)).processStarted, false);
    const running = f.request([
      "-e",
      "process.stdout.write('started'); setTimeout(()=>process.exit(0),4000)",
    ]);
    await f.operations.start(running);
    await f.until(() => f.requests.length === 2);
    f.answer("allow");
    await f.until(() => f.operations.inspect(running.operationId).processStarted);
    assert.equal(f.operations.cancel(crypto.randomUUID()).status, "unknown");
    assert.equal(f.operations.inspect(running.operationId).status, "running");
    f.operations.cancel(running.operationId);
    assert.equal((await f.finish(running.operationId)).result?.cancelled, true);
  } finally {
    await f.close();
  }
});

test("native output caps and configured synthetic secret references remain explicit", async () => {
  const f = await fixture();
  try {
    const secret = {
      ...f.request(["-e", "process.stdout.write(process.env.Z4_SYNTHETIC_SECRET)"]),
      recipe: {
        ...f.request().recipe,
        args: ["-e", "process.stdout.write(process.env.Z4_SYNTHETIC_SECRET)"],
        redactEnvironmentVariables: ["Z4_SYNTHETIC_SECRET"],
      },
    };
    await f.operations.start(secret);
    await f.until(() => f.requests.length === 1);
    f.answer("allow");
    assert.equal((await f.finish(secret.operationId)).result?.stdout.text, "[redacted]");
    const huge = f.request(["-e", "process.stdout.write('x'.repeat(300000))"]);
    await f.operations.start(huge);
    await f.until(() => f.requests.length === 2);
    f.answer("allow");
    const result = await f.finish(huge.operationId);
    assert.equal(result.status, "failed");
    assert.equal(result.result?.stdout.truncated, true);
  } finally {
    await f.close();
  }
});

test("native recipe rejects traversal, outside cwd, shell and reparse entry", async () => {
  const f = await fixture();
  try {
    for (const cwdRelative of ["../outside", f.cwd, "a/../b"])
      await assert.rejects(
        f.operations.start({ ...f.request(), recipe: { ...f.request().recipe, cwdRelative } }),
        /cwd|relative|traversal/i,
      );
    for (const executable of ["cmd.exe", "powershell.exe", "pwsh", "bash", "a.cmd"])
      await assert.rejects(
        f.operations.start({ ...f.request(), recipe: { ...f.request().recipe, executable } }),
        /shell|batch/i,
      );
    await mkdir(join(f.cwd, "inside"));
    await symlink(
      join(f.cwd, "inside"),
      join(f.cwd, "link"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await assert.rejects(
      f.operations.start({
        ...f.request(),
        recipe: { ...f.request().recipe, cwdRelative: "link" },
      }),
      /symlink|reparse/i,
    );
    await writeFile(join(f.cwd, "file"), "data");
    await assert.rejects(
      f.operations.start({
        ...f.request(),
        recipe: { ...f.request().recipe, cwdRelative: "file" },
      }),
      /directory/i,
    );
    assert.equal(f.requests.length, 0);
  } finally {
    await f.close();
  }
});

test("native permission input changes cannot replace configured argv", async () => {
  const f = await fixture();
  try {
    const request = f.request();
    await f.operations.start(request);
    await f.until(() => f.requests.length === 1);
    const preview = f.requests[0].input as Record<string, unknown>;
    f.answer("modify", { ...preview, args: ["-e", "process.exit(0)"] });
    const result = await f.finish(request.operationId);
    assert.equal(result.status, "failed");
    assert.equal(result.processStarted, false);
  } finally {
    await f.close();
  }
});

test("native parent session persistence failure prevents permission and process start", async () => {
  const f = await fixture({ failPersistence: true });
  try {
    const request = f.request();
    await f.operations.start(request);
    const result = await f.finish(request.operationId);
    assert.equal(result.status, "failed");
    assert.equal(result.processStarted, false);
    assert.equal(f.requests.length, 0);
    assert.match(result.error!, /persistence failure/);
  } finally {
    await f.close();
  }
});

test("missing actual exit observation preserves unknown and blocks another operation", async () => {
  const f = await fixture({ omitExitObservation: true });
  try {
    const request = f.request();
    await f.operations.start(request);
    await f.until(() => f.requests.length === 1);
    f.answer("allow");
    const result = await f.finish(request.operationId);
    assert.equal(result.processStarted, true);
    assert.equal(result.result?.exitCode, 0);
    assert.equal(result.result?.processExitObserved, false);
    assert.equal(result.status, "unknown");
    await assert.rejects(f.operations.start(f.request()), /uncertain work/);
    assert.equal(f.operations.cancel(request.operationId).status, "unknown");
  } finally {
    await f.close();
  }
});

test("native truncated stream withholds a secret cut across the collector boundary", async () => {
  const f = await fixture();
  try {
    const request = f.request([
      "-e",
      "process.stdout.write('x'.repeat(65530)+process.env.Z4_SYNTHETIC_SECRET)",
    ]);
    const configured = {
      ...request,
      recipe: { ...request.recipe, redactEnvironmentVariables: ["Z4_SYNTHETIC_SECRET"] },
    };
    await f.operations.start(configured);
    await f.until(() => f.requests.length === 1);
    f.answer("allow");
    const result = await f.finish(request.operationId);
    assert.equal(result.status, "failed");
    assert.equal(result.result?.stdout.truncated, true);
    assert.equal(result.result?.stdout.bytes, 65530 + "z4-synthetic-sensitive-value".length);
    assert.equal(result.result?.stdout.text, "[output withheld: native capture was truncated]");
  } finally {
    await f.close();
  }
});

test("native revalidates cwd after permission and preserves existing agent tool contracts", async () => {
  const f = await fixture();
  try {
    for (const tool of builtInTools) f.registry.register(tool);
    const contracts = f.registry.toContracts();
    await mkdir(join(f.cwd, "selected"));
    await mkdir(join(f.cwd, "other"));
    const request = f.request();
    const configured = { ...request, recipe: { ...request.recipe, cwdRelative: "selected" } };
    await f.operations.start(configured);
    await f.until(() => f.requests.length === 1);
    assert.deepEqual(f.registry.toContracts(), contracts);
    await rm(join(f.cwd, "selected"), { recursive: true });
    await symlink(
      join(f.cwd, "other"),
      join(f.cwd, "selected"),
      process.platform === "win32" ? "junction" : "dir",
    );
    f.answer("allow");
    const result = await f.finish(request.operationId);
    assert.equal(result.processStarted, false);
    assert.equal(result.status, "failed");
    assert.deepEqual(f.registry.toContracts(), contracts);
  } finally {
    await f.close();
  }
});
