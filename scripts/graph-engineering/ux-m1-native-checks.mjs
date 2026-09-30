// UX-M1.4 journey C: one draft-preserving setup journey over the real recipe store, the real Graph
// Host and a real second workspace. Checks are edited only through the one existing editor; every
// failure below is a real one (a digest conflict from an actual external edit to `.zcode/config.json`,
// a reference file that disappears from disk, a workspace the Host considers occupied).
import assert from "node:assert/strict";
import { rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { addByKeyboard } from "./context-picker-helpers.mjs";
import {
  T,
  allRecipes,
  assertUnchanged,
  finishReceipt,
  focused,
  launchUx,
  observe,
  openNewRun,
  shot,
  shotSizes,
  snapshot,
  step,
} from "./ux-m1-native-common.mjs";
import { workspaceSteps } from "./ux-m1-native-checks-workspace.mjs";
import { occupiedSteps } from "./ux-m1-native-checks-occupied.mjs";
import {
  REQUEST_C,
  alertWith,
  back,
  configDigest,
  configPath,
  draftView,
  editCheck,
  optionValues,
  pickRecipe,
  readConfig,
  recipeFieldName,
  stepRows,
} from "./ux-m1-native-checks-helpers.mjs";

export async function checksJourney() {
  const { isolation, window, receipt, dialogControl } = await launchUx("checks", { dialog: true });
  const ws = isolation.workspace;
  let error;
  try {
    let before;
    await step(
      receipt,
      "C0",
      "Prepare a draft: request, real file, Alternate build and test",
      async () => {
        await openNewRun(window);
        await T(window, "graph-library-entry").click();
        await window.locator('[role="option"][data-value="generic"]').click();
        await T(window, "graph-template-recipe-build").waitFor();
        await T(window, "graph-template-parameter-request").fill(REQUEST_C);
        await addByKeyboard(window, "Notes", "instructions");
        await pickRecipe(window, "graph-template-recipe-build", "alt-build");
        await pickRecipe(window, "graph-template-recipe-test", "alt-test");
        before = await draftView(window);
        assert.deepEqual(
          before.build.map((row) => [row.id, row.state]),
          [["alt-build", "resolved"]],
        );
        assert.deepEqual(
          before.test.map((row) => [row.id, row.state]),
          [["alt-test", "resolved"]],
        );
        assert.match(before.test[0].text, /Alternate test.*Test.*Saved/);
        await shotSizes(isolation, window, receipt, "c-selected-checks", () =>
          T(window, "graph-selected-checks-build").scrollIntoViewIfNeeded(),
        );
      },
    );
    const initial = await snapshot(isolation);
    const initialConfig = await configDigest(ws);

    await step(
      receipt,
      "C1",
      "Edit check opens the intended saved check (keyboard), Back stays reachable",
      async () => {
        await editCheck(window, "test");
        assert.equal(
          await T(window, "graph-guided-recipe").getAttribute("data-recipe-id"),
          "alt-test",
        );
        await window.waitForFunction(() =>
          Boolean(document.activeElement?.closest('[data-testid="graph-recipes-guided"]')),
        );
        await shotSizes(isolation, window, receipt, "c-checks-editor-return", () =>
          window.evaluate(() => {
            const scroller = document.querySelector("[data-view]");
            if (scroller) scroller.scrollTop = scroller.scrollHeight;
          }),
        );
        const box = await T(window, "graph-return-to-workflow").boundingBox();
        const viewport = await window.evaluate(() => [innerWidth, innerHeight]);
        assert.ok(
          box && box.y >= 0 && box.y + box.height <= viewport[1],
          "Back is in view after scrolling",
        );
        assert.equal(await configDigest(ws), initialConfig, "navigation wrote nothing");
        assertUnchanged(initial, await snapshot(isolation), "opening the editor");
      },
    );

    await step(
      receipt,
      "C2",
      "Back returns the same draft and puts focus on the control that opened the editor",
      async () => {
        await back(window);
        assert.deepEqual(await draftView(window), before);
        const now = await focused(window);
        observe(receipt, "focus after Back from Edit check", now);
        assert.equal(now, "graph-selected-check-edit");
      },
    );

    await step(
      receipt,
      "C3",
      "Cancel: an unsaved edit changes neither saved checks nor the draft",
      async () => {
        await editCheck(window, "build");
        const { name } = await recipeFieldName(window);
        await name.fill("Alternate build (unsaved edit)");
        await back(window);
        assert.equal(
          await configDigest(ws),
          initialConfig,
          "cancel wrote nothing to the saved checks",
        );
        assert.deepEqual(await draftView(window), before);
        assertUnchanged(initial, await snapshot(isolation), "cancel");
      },
    );

    await step(
      receipt,
      "C4",
      "A real digest conflict refuses the save and keeps both the external edit and the draft",
      async () => {
        await editCheck(window, "build");
        const { name } = await recipeFieldName(window);
        assert.equal(
          await name.inputValue(),
          "Alternate build (unsaved edit)",
          "unsaved edits are kept on re-entry",
        );
        // 真实的外部修改：在编辑器加载之后直接改写磁盘上的配置。
        const external = await readConfig(ws);
        external.graphRecipes.find((recipe) => recipe.id === "alt-build").name = "Changed outside";
        await writeFile(configPath(ws), JSON.stringify(external));
        const externalDigest = await configDigest(ws);
        await T(window, "graph-save-recipes").click();
        await alertWith(window, /configuration changed/i).waitFor();
        assert.equal(
          await configDigest(ws),
          externalDigest,
          "the external edit was not overwritten",
        );
        assert.equal(await T(window, "graph-recipes-saved").count(), 0);
        await shot(isolation, window, receipt, "c-digest-conflict", [1280, 720]);
        await back(window);
        // UX-M1.4 修复的回归：检查保存失败的原因不能出现在 Review and run 旁边。
        assert.equal(
          await T(window, "graph-new-run-error").count(),
          0,
          "a failed check save is not shown as a Review error",
        );
        await shot(isolation, window, receipt, "c-after-failed-save-back", [1280, 720]);
        assert.deepEqual(await draftView(window), before);
        assertUnchanged(initial, await snapshot(isolation), "failed save");
        // 恢复磁盘上的原始配置，供后续步骤使用。
        await writeFile(configPath(ws), JSON.stringify({ graphRecipes: allRecipes }));
        await T(window, "graph-template-load-recipes").click();
        await window.waitForFunction(
          () =>
            document
              .querySelector('[data-testid="graph-recipe-read-state"]')
              ?.getAttribute("data-state") === "ready",
        );
      },
    );

    await step(
      receipt,
      "C5",
      "Missing and incompatible checks stay visible, block Review and are never replaced",
      async () => {
        const config = await readConfig(ws);
        // 不兼容：同一 id 仍存在，但已不能用于 Build。
        const changed = structuredClone(config);
        const altBuild = changed.graphRecipes.find((recipe) => recipe.id === "alt-build");
        altBuild.verifier = { kind: "command" };
        await writeFile(configPath(ws), JSON.stringify(changed));
        await T(window, "graph-template-load-recipes").click();
        await window.waitForFunction(() => {
          const row = document.querySelector(
            '[data-testid="graph-selected-checks-build"] [data-testid="graph-selected-check"]',
          );
          return row?.getAttribute("data-state") === "incompatible";
        });
        const [incompatible] = await stepRows(window, "build");
        assert.equal(incompatible.id, "alt-build");
        assert.match(incompatible.text, /alt-build is saved but cannot be used for this step/);
        assert.equal(await T(window, "graph-review-run").isDisabled(), true);
        await shot(isolation, window, receipt, "c-incompatible-check-1280x720", [1280, 720]);
        // 缺失：外部删除该检查；另有兼容检查（reviewer-build），也不能被自动选中。
        const removed = structuredClone(config);
        removed.graphRecipes = removed.graphRecipes.filter((recipe) => recipe.id !== "alt-build");
        await writeFile(configPath(ws), JSON.stringify(removed));
        await T(window, "graph-template-load-recipes").click();
        await window.waitForFunction(() => {
          const row = document.querySelector(
            '[data-testid="graph-selected-checks-build"] [data-testid="graph-selected-check"]',
          );
          return row?.getAttribute("data-state") === "missing";
        });
        const [missing] = await stepRows(window, "build");
        assert.equal(missing.id, "alt-build");
        assert.match(missing.text, /alt-build is no longer in the saved checks/);
        assert.equal(await T(window, "graph-review-run").isDisabled(), true);
        assert.ok(
          (await optionValues(window, "graph-template-recipe-build")).includes("reviewer-build"),
        );
        assert.equal(
          (await stepRows(window, "build"))[0].id,
          "alt-build",
          "not replaced by another compatible check",
        );
        assert.match(await T(window, "graph-template-unresolved").innerText(), /Build/);
        // Open Checks（缺失项没有可编辑对象），然后回来：请求与其它选择不变。
        await T(window, "graph-selected-check-open").click();
        await T(window, "graph-project-recipes").waitFor();
        await back(window);
        assert.equal((await draftView(window)).request, REQUEST_C);
        assert.equal((await draftView(window)).instructions, "docs/Notes.md");
        assert.equal((await stepRows(window, "build"))[0].id, "alt-build");
        assertUnchanged(initial, await snapshot(isolation), "missing/incompatible checks");
        // 恢复：用户显式刷新；选择因稳定 id 重新可用（没有任何自动替换）。
        await writeFile(configPath(ws), JSON.stringify(config));
        await T(window, "graph-template-load-recipes").click();
        await window.waitForFunction(() => {
          const row = document.querySelector(
            '[data-testid="graph-selected-checks-build"] [data-testid="graph-selected-check"]',
          );
          return row?.getAttribute("data-state") === "resolved";
        });
        assert.deepEqual(
          (await draftView(window)).build.map((row) => row.id),
          ["alt-build"],
        );
      },
    );

    await step(
      receipt,
      "C6",
      "A real instantiate failure keeps the draft and shows the reason beside the action",
      async () => {
        const notes = path.join(ws, "docs/Notes.md");
        await rename(notes, `${notes}.away`);
        try {
          await T(window, "graph-review-run").click();
          // 等 Host 自己的失败原因（提到该文件），而不是任何已经在屏幕上的旧文字。
          await window.waitForFunction(
            () =>
              /Notes\.md/i.test(
                document.querySelector('[data-testid="graph-new-run-error"]')?.textContent ?? "",
              ),
            undefined,
            { timeout: 30000 },
          );
          const message = await T(window, "graph-new-run-error").innerText();
          observe(receipt, "instantiate failure text", message);
          const box = await T(window, "graph-new-run-error").boundingBox();
          const actions = await T(window, "graph-review-run").boundingBox();
          assert.ok(
            box && actions && Math.abs(box.y - actions.y) < 200,
            "the reason sits beside the primary action",
          );
          assert.deepEqual(await draftView(window), before, "the draft is intact");
          assert.equal(await T(window, "graph-run-confirmation").count(), 0);
          const after = await snapshot(isolation);
          assert.equal(after.runCount, 0);
          assert.deepEqual(after.ledger, []);
          await shot(isolation, window, receipt, "c-instantiate-failure-1280x720", [1280, 720]);
        } finally {
          await rename(`${notes}.away`, notes);
        }
      },
    );

    await workspaceSteps({ isolation, window, receipt, dialogControl, before });
    await occupiedSteps({ isolation, window, receipt });
  } catch (caught) {
    error = caught;
  } finally {
    await finishReceipt(receipt, isolation, window, error);
  }
}
