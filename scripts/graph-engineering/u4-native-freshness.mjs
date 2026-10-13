import assert from "node:assert/strict";
import { readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { readGraphRecord, modelCount } from "./z5-native-observe.mjs";
import { T } from "./ux-m1-native-common.mjs";

/** Explicit UI reviews on the disposable fixture. No native command is authorized by this helper. */
export async function verifyU4Freshness(isolation, window, summary) {
  await T(window, "graph-quick-save").click();
  await T(window, "graph-quick-saved").waitFor();
  for (const file of [
    "Tests/data/content.txt",
    "shared/Shared.cs",
    "metadata/inputs.props",
    "Tests/data/later.txt",
  ]) {
    const panel = T(window, "graph-check-preview");
    await T(window, "graph-check-prepare").click();
    await panel.waitFor();
    const preview = JSON.parse(await T(window, "graph-check-preview-snapshot").textContent());
    assert.equal(preview.recipes[0].sourceScope.sourceCount, 5013);
    const before = await readGraphRecord(isolation).catch((error) => {
      if (error.code === "ENOENT") return { runs: [] };
      throw error;
    });
    const target = path.join(isolation.workspace, file);
    const original = await readFile(target, "utf8").catch((error) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    try {
      await writeFile(
        target,
        original === undefined ? "new default/glob member\n" : original + "\n",
      );
      await T(window, "graph-check-ack").setChecked(true);
      await T(window, "graph-check-confirm").click();
      await T(window, "graph-check-preview-error").waitFor({ timeout: 120000 });
      await window.waitForFunction(
        () => document.querySelector('[data-testid="graph-check-confirm"]')?.disabled,
        undefined,
        { timeout: 120000 },
      );
      const after = await readGraphRecord(isolation).catch((error) => {
        if (error.code === "ENOENT") return { runs: [] };
        throw error;
      });
      assert.deepEqual(after.runs, before.runs);
      assert.equal(modelCount(isolation), 0);
      summary.cases.push({
        name: `stale-${file}`,
        status: "PASS",
        sourceCount: 5013,
        newRuns: 0,
        error: await T(window, "graph-check-preview-error").innerText(),
      });
    } finally {
      if (original === undefined) await unlink(target);
      else await writeFile(target, original);
    }
    await panel.getByRole("button", { name: "Close", exact: true }).click();
  }
}
