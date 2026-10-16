import assert from "node:assert/strict";
import test from "node:test";
import {
  spawnLimitedChild,
  terminateLimitedChild,
} from "../../apps/zcode-cli/packages/adapters/src/exec/windows-limited-child.ts";
import { ChildProcess } from "node:child_process";

test("inspection hard-process capability rejects unsupported platforms before launch", async () => {
  for (const platform of ["linux", "darwin"]) {
    await assert.rejects(
      spawnLimitedChild(process.execPath, ["-e", "throw Error('must not run')"], {}, platform),
      /Hard process limit unavailable/,
    );
  }
});
test("job cancellation cannot target an unrelated child", () => {
  assert.equal(terminateLimitedChild(new ChildProcess()), false);
});
test("bounded argv refuses shell mode and relative executable before binding", async () => {
  await assert.rejects(
    spawnLimitedChild("relative.exe", [], {}, "win32"),
    /absolute argv executable/,
  );
  await assert.rejects(
    spawnLimitedChild(process.execPath, [], { shell: true }, "win32"),
    /absolute argv executable/,
  );
  await assert.rejects(
    spawnLimitedChild(process.execPath, ["bad\0arg"], {}, "win32"),
    /absolute argv executable/,
  );
});
