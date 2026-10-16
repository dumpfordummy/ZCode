import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNodeExecutionAdapter } from "@zcode/adapters/exec";

const windows = process.platform === "win32";
test(
  "bounded inspection adapter rejects unavailable platform before process start",
  { skip: windows },
  async () => {
    const adapter = createNodeExecutionAdapter();
    try {
      const result = await adapter.run({
        command: {
          mode: "argv",
          file: process.execPath,
          args: ["-e", "throw Error('must not run')"],
        },
        processLimit: { maxActiveProcesses: 1 },
      });
      assert.equal(result.status, "spawn_error");
      assert.equal(result.pid, undefined);
      assert.match(result.error?.message ?? "", /process limit.*unavailable/i);
    } finally {
      await adapter.close?.();
    }
  },
);
test(
  "bounded native argv preserves Unicode and exact arguments and observes exit",
  { skip: !windows },
  async () => {
    const adapter = createNodeExecutionAdapter();
    try {
      const args = ["space value", 'quote"value', "tail\\", "中文", ""];
      const result = await adapter.run({
        command: {
          mode: "argv",
          file: process.execPath,
          args: ["-e", "console.log(JSON.stringify(process.argv.slice(1)))", "--", ...args],
        },
        processLimit: { maxActiveProcesses: 1 },
        timeoutMs: 5000,
      });
      assert.equal(result.status, "completed", JSON.stringify(result));
      assert.equal(result.processExitObserved, true);
      assert.deepEqual(JSON.parse(result.stdout.text), args);
    } finally {
      await adapter.close?.();
    }
  },
);
test(
  "hard limit blocks an immediate descendant before any marker write",
  { skip: !windows },
  async () => {
    const cwd = await mkdtemp(join(tmpdir(), "zcode-owned-limit-"));
    const marker = join(cwd, "forbidden-child.txt");
    const adapter = createNodeExecutionAdapter();
    try {
      const script = `const {spawnSync}=require('node:child_process');const r=spawnSync(process.execPath,['-e',${JSON.stringify(`require('node:fs').writeFileSync(${JSON.stringify(marker)},'escaped')`)}]); console.log(JSON.stringify({blocked:!!r.error}));`;
      const result = await adapter.run({
        command: { mode: "argv", file: process.execPath, args: ["-e", script] },
        cwd,
        processLimit: { maxActiveProcesses: 1 },
        timeoutMs: 5000,
      });
      assert.equal(result.status, "completed", JSON.stringify(result));
      assert.equal(JSON.parse(result.stdout.text).blocked, true);
      await assert.rejects(readFile(marker), { code: "ENOENT" });
    } finally {
      await adapter.close?.();
      await rm(cwd, { recursive: true, force: true });
    }
  },
);
test(
  "bounded native cancellation and timeout observe the owned process exit",
  { skip: !windows },
  async () => {
    for (const cancel of [false, true]) {
      const adapter = createNodeExecutionAdapter();
      const controller = new AbortController();
      try {
        const result = await adapter.run(
          {
            command: {
              mode: "argv",
              file: process.execPath,
              args: ["-e", "setInterval(()=>{},100)"],
            },
            processLimit: { maxActiveProcesses: 1 },
            timeoutMs: cancel ? 5000 : 150,
          },
          {
            signal: controller.signal,
            onEvent: (event) => {
              if (cancel && event.type === "started") controller.abort();
            },
          },
        );
        assert.equal(result.status, cancel ? "cancelled" : "timed_out", JSON.stringify(result));
        assert.equal(result.processExitObserved, true);
      } finally {
        await adapter.close?.();
      }
    }
  },
);

test(
  "executor death closes its non-inherited job and kills only its owned process",
  { skip: !windows, timeout: 15000 },
  async () => {
    const cwd = await mkdtemp(join(tmpdir(), "zcode-executor-loss-"));
    const marker = join(cwd, "owned-pid.txt");
    const runner = join(cwd, "owner.mjs");
    const limitedModule = new URL(
      "../../../adapters/dist/exec/windows-limited-child.js",
      import.meta.url,
    ).href;
    await writeFile(
      runner,
      `import {spawnLimitedChild} from ${JSON.stringify(limitedModule)}; await spawnLimitedChild(process.execPath,['-e',${JSON.stringify(`require('node:fs').writeFileSync(${JSON.stringify(marker)},String(process.pid));setInterval(()=>{},100);`)}],{},process.platform);`,
    );
    const owner = spawn(process.execPath, [runner], { stdio: "ignore", windowsHide: true });
    const unrelated = spawn(process.execPath, ["-e", "setInterval(()=>{},100)"], {
      stdio: "ignore",
      windowsHide: true,
    });
    const ownerClosed = once(owner, "close"),
      unrelatedClosed = once(unrelated, "close");
    let ownedPid: number | undefined;
    const deadline = Date.now() + 6000;
    try {
      while (Date.now() < deadline) {
        try {
          ownedPid = Number(await readFile(marker, "utf8"));
          break;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.ok(ownedPid, "owned process was observed before killing the executor");
      owner.kill();
      await ownerClosed;
      let ended = false;
      while (Date.now() < deadline) {
        try {
          process.kill(ownedPid, 0);
        } catch {
          ended = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.equal(ended, true, "Job handle closure must terminate the owned process");
      assert.equal(unrelated.exitCode, null, "unrelated process must remain alive");
      process.kill(unrelated.pid!, 0);
    } finally {
      owner.kill();
      unrelated.kill();
      await Promise.all([ownerClosed, unrelatedClosed]);
      await rm(cwd, { recursive: true, force: true });
    }
  },
);
