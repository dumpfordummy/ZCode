// UX-M1.4 journey C, a real occupied workspace: saving checks is refused, then works once released.
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { instantiateReviewer } from "./reviewer-native-ui.mjs";
import { startNativeTemplate } from "./z6-native-ui.mjs";
import {
  SECOND_REQUEST,
  T,
  assertUnchanged,
  flush,
  invokeHandler,
  observe,
  openNewRun,
  pendingPermission,
  shot,
  snapshot,
  step,
  waitRecord,
} from "./ux-m1-native-common.mjs";
import {
  back,
  configDigest,
  editCheck,
  pickRecipe,
  readConfig,
  recipeFieldName,
  stepRows,
} from "./ux-m1-native-checks-helpers.mjs";

/** C8, C9 and C10. */
export async function occupiedSteps({ isolation, window, receipt }) {
  const ws = isolation.workspace;
  let firstRunId, historicalRun, occupiedDigest;
  await step(
    receipt,
    "C8",
    "While a real run is unresolved, Save checks is refused; nothing on disk changes",
    async () => {
      const summary = { assertions: [], screenshots: [] };
      await instantiateReviewer(isolation, window, summary, false);
      const run = await startNativeTemplate(isolation, window, summary);
      firstRunId = run.id;
      await waitRecord(isolation, pendingPermission, "a native permission wait");
      const digest = await configDigest(ws);
      const snap = await snapshot(isolation);
      await openNewRun(window);
      await editCheck(window, "test");
      assert.equal(await T(window, "graph-save-recipes").isDisabled(), true);
      const reason = await window.locator("#graph-recipe-save-reason").innerText();
      assert.match(reason, /blocked while a run is unresolved/);
      const { id, name } = await recipeFieldName(window);
      await name.fill(`${id} (edited while occupied)`);
      assert.equal(await invokeHandler(window, "graph-save-recipes"), "invoked");
      await flush(window);
      assert.equal(await configDigest(ws), digest, "no save reached the recipe store");
      assert.equal(await T(window, "graph-recipes-saved").count(), 0);
      assertUnchanged(snap, await snapshot(isolation), "refused save");
      occupiedDigest = digest;
      observe(receipt, "occupied save refusal reason", reason);
      await shot(isolation, window, receipt, "c-save-refused-while-occupied-1280x720", [1280, 720]);
      await back(window);
    },
  );

  await step(
    receipt,
    "C9",
    "After the run is released, an explicit save works and the selection follows the stable id",
    async () => {
      // 释放：取消真实运行。
      await T(window, "graph-view-current-run").click();
      await T(window, "graph-cancel").click();
      const { record } = await waitRecord(
        isolation,
        (item) => ["Cancelled", "Interrupted"].includes(item.runs.at(-1).status),
        "the run to stop",
      );
      historicalRun = structuredClone(record.runs.at(-1));
      await openNewRun(window);
      // 草稿现在是 instantiateReviewer 用过的（reviewer-*）；换成 alt-test 后改名并保存。
      await pickRecipe(window, "graph-template-recipe-test", "alt-test");
      const beforeSave = await readConfig(ws);
      assert.equal(
        await configDigest(ws),
        occupiedDigest,
        "releasing the run saved nothing by itself",
      );
      await editCheck(window, "test");
      const { id, name } = await recipeFieldName(window);
      assert.equal(id, "alt-test");
      await window.waitForFunction(
        () => !document.querySelector('[data-testid="graph-save-recipes"]')?.disabled,
      );
      assert.match(
        await T(window, "graph-project-recipes").innerText(),
        /Unsaved project-check edits/,
        "retained edits are disclosed",
      );
      await name.fill("Alternate test (renamed)");
      await T(window, "graph-save-recipes").click();
      await T(window, "graph-recipes-saved").waitFor();
      const afterSave = await readConfig(ws);
      assert.equal(
        afterSave.graphRecipes.find((recipe) => recipe.id === "alt-test").name,
        "Alternate test (renamed)",
      );
      // 占用期间留下的未保存编辑（reviewer-test 的改名）按设计作为草稿保留，随这次显式保存一起写入；
      // 其余检查必须逐字节不变。
      const changed = afterSave.graphRecipes
        .filter(
          (recipe) =>
            !isDeepStrictEqual(
              recipe,
              beforeSave.graphRecipes.find((item) => item.id === recipe.id),
            ),
        )
        .map((recipe) => recipe.id)
        .sort();
      // alt-build：C3 里“取消”的编辑；reviewer-test：C8 占用期间的编辑；alt-test：本次编辑。
      // Back 不是丢弃：编辑器草稿按设计保留，并在提示条中披露，随下一次显式保存一起写入。
      assert.deepEqual(changed, ["alt-build", "alt-test", "reviewer-test"]);
      observe(
        receipt,
        "checks written by the explicit save: this edit plus two retained, disclosed draft edits",
        changed,
      );
      await back(window);
      const [test] = await stepRows(window, "test");
      assert.deepEqual([test.id, test.state], ["alt-test", "resolved"]);
      assert.match(test.text, /Alternate test \(renamed\)/);
    },
  );

  await step(
    receipt,
    "C10",
    "The historical run keeps its captured checks and evidence",
    async () => {
      const record = await (await import("./ux-m1-native-common.mjs")).readGraphRecord(isolation);
      const kept = record.runs.find((run) => run.id === firstRunId);
      assert.deepEqual(
        kept,
        historicalRun,
        "the stopped run's record is unchanged by the later save",
      );
      assert.deepEqual(kept.definition.template.bindings.recipes, {
        build: "reviewer-build",
        test: "reviewer-test",
      });
      assert.ok(SECOND_REQUEST);
    },
  );
}
