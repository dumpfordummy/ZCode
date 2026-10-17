import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createContextPickerHost } from "./context-picker-host.mjs";
import { assertClean } from "./ux-m1-helpers.mjs";

test("history fixture uses the real facade and still rejects inspection commands", async () => {
  const host = await createContextPickerHost();
  try {
    const target = { workspacePath: host.workspaces.A };
    assert.deepEqual(await host.bridge.projectSetup({ action: "inspection-history", target }), {
      kind: "inspection-history",
      records: [],
    });
    assertClean(host);
    for (const action of ["start", "cancel"]) {
      const before = host.calls.length;
      await assert.rejects(
        host.bridge.projectSetup({ action: "inspection", target, command: { action } }),
        /projectSetup reached graph.inspectProject/,
      );
      assert.throws(() => assertClean(host), /unexpected operation inspection/);
      host.calls.splice(before);
    }
  } finally {
    await host.dispose();
  }
});

test("real reference byte limit accepts 102400 and rejects 102401 bytes", async () => {
  const host = await createContextPickerHost();
  try {
    const target = { workspacePath: host.workspaces.A };
    const file = path.join(host.workspaces.A, "boundary.md");
    await fs.writeFile(file, "x".repeat(102400));
    const accepted = await host.bridge.projectSetup({
      action: "validate-reference",
      target,
      path: "boundary.md",
    });
    assert.equal(accepted.bytes, 102400);
    await fs.appendFile(file, "x");
    await assert.rejects(
      host.bridge.projectSetup({ action: "validate-reference", target, path: "boundary.md" }),
      /\(102401 bytes\).*\(102400-byte\) limit/,
    );
  } finally {
    await host.dispose();
  }
});
