// UX-M3 presentation acceptance in the real Electron window: Workflows library, Versions, Save current
// design, Export, Import preview, Advanced, the New-run workflow/version line and the unavailable
// historical pin notice, at 1280x720 and 1920x1080, in Zai Dark and Zai Light, English and Simplified
// Chinese (one launch per language; the theme switches by reload; the Host state persists).
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { acceptancePaths } from "./acceptance-paths.mjs";
import { root } from "./isolation.mjs";
import {
  T,
  cancelRun,
  chooseEntry,
  chooseVersion,
  closeLibrary,
  driveOsDialog,
  duplicateWorkflow,
  finishReceipt,
  launchUx,
  observe,
  openAdvanced,
  openLibrary,
  openShare,
  pinDesign,
  readGraphRecord,
  shotSizes,
  startFromNewRun,
  step,
} from "./ux-m3-native-common.mjs";
import { reloadToWorkspace } from "./ux-m1-native-common.mjs";

const HAN = /[一-鿿]/;
const reveal = (window, id) =>
  T(window, id).evaluate((el) => el.scrollIntoView({ block: "center" }));
async function fits(window, what, ids = []) {
  const overflow = await window.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(overflow <= 1, `${what}: no horizontal overflow (${overflow}px)`);
  for (const id of ids) {
    const box = await T(window, id).boundingBox();
    const [width] = await window.evaluate(() => [innerWidth]);
    assert.ok(
      box && box.x >= 0 && box.x + box.width <= width,
      `${what}: ${id} is inside the viewport width`,
    );
  }
}

async function surfaces(ctx, tag, zh, state) {
  const { isolation, window, receipt } = ctx;
  await step(receipt, `${tag}-library`, `${tag}: Workflow library and Versions`, async () => {
    await openLibrary(window);
    await chooseEntry(window, state.mine.id);
    const text = await T(window, "graph-library-dialog").innerText();
    assert.ok(text.includes("Team flow"), "the workflow name is raw");
    if (zh) assert.match(text, HAN);
    await shotSizes(isolation, window, receipt, `${tag}-library-versions`, async () => {
      await reveal(window, "graph-library-versions");
      await fits(window, "library", ["graph-library-dialog"]);
    });
  });
  await step(
    receipt,
    `${tag}-save`,
    `${tag}: Save current design with its unsaved-edit disclosure`,
    async () => {
      await closeLibrary(window);
      await T(window, "graph-view-design").click();
      await T(window, "graph-name").fill("Edited on the canvas");
      await openLibrary(window);
      await openShare(window);
      const text = await T(window, "graph-save-unsaved").innerText();
      if (zh) assert.match(text, HAN);
      await shotSizes(isolation, window, receipt, `${tag}-save-design`, async () => {
        await reveal(window, "graph-save-unsaved");
        await fits(window, "save design", ["graph-save-unsaved"]);
      });
    },
  );
  await step(
    receipt,
    `${tag}-export`,
    `${tag}: Export names the exact workflow and version`,
    async () => {
      await chooseEntry(window, state.mine.id);
      await chooseVersion(window, 1);
      await openShare(window);
      await T(window, "graph-library-export").click();
      await T(window, "graph-export-preview-result").waitFor();
      await shotSizes(isolation, window, receipt, `${tag}-export`, async () => {
        await reveal(window, "graph-export-subject");
        await fits(window, "export", ["graph-export-subject"]);
      });
    },
  );
  await step(
    receipt,
    `${tag}-import`,
    `${tag}: Import preview through the real Open dialog`,
    async () => {
      await T(window, "graph-template-import-file").click();
      assert.equal((await driveOsDialog(isolation, "select", state.exported)).ok, true);
      await T(window, "graph-import-preview-result").waitFor({ timeout: 20000 });
      await shotSizes(isolation, window, receipt, `${tag}-import-preview`, async () => {
        await reveal(window, "graph-import-preview-result");
        await fits(window, "import preview", ["graph-import-preview-result"]);
      });
    },
  );
  await step(receipt, `${tag}-advanced`, `${tag}: Advanced`, async () => {
    await openAdvanced(window);
    await shotSizes(isolation, window, receipt, `${tag}-advanced`, async () => {
      await reveal(window, "graph-library-digest");
      await fits(window, "advanced", ["graph-library-digest"]);
    });
    await closeLibrary(window);
  });
  await step(
    receipt,
    `${tag}-new-run`,
    `${tag}: New run names the workflow and version it will use`,
    async () => {
      await T(window, "graph-view-runs").click();
      await T(window, "graph-new-run").click();
      await chooseEntry(window, state.mine.id);
      const line = await T(window, "graph-new-run-version-line").innerText();
      observe(receipt, `${tag} version line`, line);
      assert.ok(line.includes("Team flow"));
      await shotSizes(isolation, window, receipt, `${tag}-new-run-line`, async () => {
        await reveal(window, "graph-new-run-version-line");
        await fits(window, "new run line", ["graph-new-run-version-line"]);
      });
    },
  );
  await step(receipt, `${tag}-pin`, `${tag}: the unavailable historical pin notice`, async () => {
    await T(window, "graph-view-runs").click();
    await window.locator(`[data-testid="graph-run"][data-run-id="${state.run}"]`).click();
    await T(window, "graph-run-again").click();
    await T(window, "graph-historical-pin").waitFor({ timeout: 20000 });
    const text = await T(window, "graph-historical-pin").innerText();
    observe(receipt, `${tag} pin notice`, text.replace(/\s+/g, " "));
    if (zh) assert.match(text, HAN);
    await shotSizes(isolation, window, receipt, `${tag}-pin-notice`, async () => {
      await reveal(window, "graph-historical-pin");
      await fits(window, "pin notice", ["graph-historical-pin"]);
    });
  });
}

export async function presentationJourney(locale = "en-US") {
  const ctx = await launchUx(`presentation-${locale}`, {
    scenario: "pass",
    locale,
    theme: "zai-dark",
    dialog: true,
  });
  const { isolation, receipt } = ctx;
  let error;
  const state = {};
  try {
    await step(
      receipt,
      "P0",
      `${locale}: a Yours workflow with two versions, an exported file and one historical run`,
      async () => {
        const { window } = ctx;
        await openLibrary(window);
        state.mine = await duplicateWorkflow(window, isolation, "generic", "Team flow");
        await closeLibrary(window);
        await pinDesign(window, isolation, state.mine.id);
        await openLibrary(window);
        await openShare(window);
        await T(window, "graph-library-capture").click();
        await T(window, "graph-save-reviewed").click();
        await T(window, "graph-save-confirm").click();
        await T(window, "graph-library-result").waitFor({ timeout: 30000 });
        await chooseVersion(window, 1);
        await openShare(window);
        await T(window, "graph-library-export").click();
        await T(window, "graph-export-reviewed").click();
        state.exported = path.join(
          isolation.home,
          "home",
          "Documents",
          "team-flow.zcode-workflow.json",
        );
        await T(window, "graph-template-export-file").click();
        assert.equal((await driveOsDialog(isolation, "select", state.exported)).ok, true);
        await T(window, "graph-template-file-saved").waitFor({ timeout: 20000 });
        await closeLibrary(window);
        const run = await startFromNewRun(isolation, window);
        state.run = run.id;
        await cancelRun(isolation, window, run.id);
        await isolation.stopApp();
        const file = acceptancePaths(isolation).record;
        const record = JSON.parse(await readFile(file, "utf8"));
        // definition and frozen provenance must stay identical, or the Host rejects the record (see the pins journey)
        const target = record.runs.find((item) => item.id === run.id);
        for (const template of [target.definition.template, target.provenance.template]) {
          template.version = 1;
          template.digest = "e".repeat(64);
        }
        await writeFile(file, JSON.stringify(record, null, 2));
        ctx.window = await isolation.launch({
          bootstrapEntry: path.join(root, "scripts/graph-engineering/ux-m1-native-bootstrap.cjs"),
        });
        if (!(await ctx.window.getByTestId("graph-engineering-panel").isVisible()))
          await ctx.window.getByTestId("graph-engineering-open").click();
        assert.ok((await readGraphRecord(isolation)).runs.length === 1);
      },
    );
    const name = `presentation-${locale}`;
    await surfaces(ctx, `${name}-dark`, locale === "zh-CN", state);
    const { window } = ctx;
    await window.evaluate((value) => localStorage.setItem("zcode-theme", value), "zai-light");
    await reloadToWorkspace(window);
    assert.match(await window.evaluate(() => document.documentElement.className), /light/);
    await surfaces(ctx, `${name}-light`, locale === "zh-CN", state);
  } catch (caught) {
    error = caught;
  } finally {
    await finishReceipt(receipt, isolation, ctx.window, error);
  }
}
