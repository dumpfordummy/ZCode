// UX-M2.2 native acceptance: unsaved check edits over the REAL Checks editor, the REAL recipe store
// (`.zcode/config.json`), the real Graph Host and real preflight. The one external change (digest
// conflict) is a real edit of the file on disk. Runs are real; a run is only stopped with Cancel.
import assert from "node:assert/strict";
import {
  T,
  allRecipes,
  finishReceipt,
  focused,
  launchUx,
  observe,
  prepareNewRun,
  readGraphRecord,
  shot,
  snapshot,
  step,
  waitUntil,
} from "./ux-m2-native-common.mjs";
import { back, configDigest, draftView, editCheck } from "./ux-m1-native-checks-helpers.mjs";
import { lateSteps } from "./ux-m2-native-checks-late.mjs";
import {
  changeRows,
  editRaw,
  noDialog,
  rename,
  savedOnDisk,
} from "./ux-m2-native-checks-helpers.mjs";

const SAVED_TEST = "Test demo content";
const SAVED_BUILD = "Build demo";

export async function checksJourney() {
  const { isolation, window, receipt } = await launchUx("checks", { scenario: "pass" });
  const ws = isolation.workspace;
  let error;
  try {
    let choices, initialConfig, initial;
    await step(
      receipt,
      "K0",
      "Prepare a request with the saved Build and Test checks",
      async () => {
        await prepareNewRun(window);
        choices = await draftView(window);
        assert.match(choices.build[0].text, new RegExp(SAVED_BUILD));
        assert.match(choices.test[0].text, new RegExp(SAVED_TEST));
        initialConfig = await configDigest(ws);
        initial = await snapshot(isolation);
      },
    );

    await step(
      receipt,
      "K1",
      "A. Edit -> Back: immediate, draft kept, disclosed; the saved check is shown and used",
      async () => {
        await rename(window, "test", `${SAVED_TEST} (unsaved edit)`);
        // 名称之外再改命令：审阅按 id 与命令列出检查，只有命令能证明用的是已保存的那一份。
        await editRaw(window, (list) =>
          list.map((recipe) =>
            recipe.id === "reviewer-test"
              ? { ...recipe, args: [...recipe.args, "--edited-flag"] }
              : recipe,
          ),
        );
        assert.match(
          await T(window, "graph-return-unsaved").innerText(),
          /not used by the next run/,
        );
        await shot(isolation, window, receipt, "k-back-bar-unsaved", [1280, 720]);
        await T(window, "graph-return-to-workflow").click();
        await T(window, "graph-new-run-pane").waitFor({ timeout: 5000 });
        await noDialog(window);
        const now = await draftView(window);
        assert.equal(now.request, choices.request, "the request is kept");
        const note = await T(window, "graph-new-run-unsaved-checks").innerText();
        observe(receipt, "New run unsaved-checks line", note);
        assert.match(note, /Review and the next run use the saved checks shown here/);
        assert.match(now.test[0].text, new RegExp(`^${SAVED_TEST} Test · Saved`), "the SAVED name");
        assert.doesNotMatch(now.test[0].text, /unsaved edit\)/);
        const marker = window.locator(
          '[data-testid="graph-selected-checks-test"] [data-testid="graph-selected-check-unsaved"]',
        );
        assert.equal(await marker.getAttribute("data-change"), "modified");
        observe(receipt, "row marker", await marker.innerText());
        await shot(isolation, window, receipt, "k-new-run-unsaved-marker", [1280, 720]);
        // Review 的预检来自 Host 的已保存检查，而不是草稿
        await T(window, "graph-review-run").click();
        await T(window, "graph-run-confirmation").waitFor({ timeout: 30000 });
        const review = await T(window, "graph-run-confirmation").evaluate(
          (node) => node.textContent,
        );
        assert.ok(review.includes("reviewer-test"), "the review lists the selected check");
        assert.ok(review.includes("node test.mjs {operationId}"), "with its SAVED command");
        assert.ok(
          !review.includes("--edited-flag") && !review.includes("unsaved edit"),
          "not the draft",
        );
        observe(
          receipt,
          "review 'Checks that will run'",
          await T(window, "graph-workflow-checks").innerText(),
        );
        const record = await readGraphRecord(isolation);
        const captured = JSON.stringify([record.definition, record.runs]);
        assert.ok(
          !captured.includes("--edited-flag") && !captured.includes("unsaved edit"),
          "nothing in the Host record carries the draft",
        );
        assert.equal(record.runs.length, 0, "review admits nothing");
        assert.equal(await configDigest(ws), initialConfig, "nothing was saved");
        await shot(isolation, window, receipt, "k-review-uses-saved", [1280, 720]);
        await T(window, "graph-new-run").click(); // 离开审阅
      },
    );

    await step(
      receipt,
      "K2",
      "B. Edits on several visits (rename, rename, add, remove) are all in one Save summary",
      async () => {
        // 第 2 次进入：另一个检查改名
        await T(window, "graph-new-run-pane").waitFor();
        await rename(window, "build", `${SAVED_BUILD} (second visit)`);
        await back(window);
        // 第 3 次进入：用高级 JSON 增加一个、删除一个（alt-test）
        await editCheck(window, "test");
        const spare = allRecipes.find((recipe) => recipe.id === "reviewer-build");
        await editRaw(window, (list) => [
          ...list
            .filter((recipe) => recipe.id !== "alt-test")
            .map((recipe) =>
              recipe.id === "reviewer-test"
                ? { ...recipe, args: recipe.args.filter((arg) => arg !== "--edited-flag") }
                : recipe,
            ),
          { ...spare, id: "smoke-new", name: "Smoke check (new)" },
        ]);
        const summary = T(window, "graph-recipe-changes");
        await summary.waitFor();
        assert.deepEqual(await changeRows(window), [
          "added:smoke-new",
          "modified:reviewer-build",
          "modified:reviewer-test",
          "removed:alt-test",
        ]);
        const text = await summary.innerText();
        observe(receipt, "Save summary", text);
        assert.match(
          text,
          /Changed: .*\(unsaved edit\) \(reviewer-test\)/,
          "the edit from visit 1 is listed",
        );
        assert.match(text, /Changed: .*\(second visit\) \(reviewer-build\)/);
        assert.match(text, /Added: Smoke check \(new\) \(smoke-new\)/);
        assert.match(text, /Removed: Alternate test \(alt-test\)/);
        assert.match(text, /not used by the next run/);
        assert.match(text, /writes the whole check list.*also those made earlier/);
        assert.match(
          String(await T(window, "graph-save-recipes").getAttribute("aria-describedby")),
          /graph-recipe-changes/,
        );
        assert.equal(await T(window, "graph-save-recipes").innerText(), "Save checks");
        await shot(isolation, window, receipt, "k-save-summary", [1280, 720]);
        await shot(isolation, window, receipt, "k-save-summary", [1920, 1080]);
        assert.equal(await configDigest(ws), initialConfig, "still nothing saved");
      },
    );

    let expected;
    await step(
      receipt,
      "K3",
      "C. Save writes the whole intended list, clears the dirty state, selection follows stable ids",
      async () => {
        expected = JSON.parse(await T(window, "graph-recipes-json").inputValue());
        await T(window, "graph-save-recipes").click();
        await T(window, "graph-recipes-saved").waitFor({ timeout: 30000 });
        const onDisk = await savedOnDisk(ws);
        assert.deepEqual(
          onDisk.map((recipe) => recipe.id),
          expected.map((recipe) => recipe.id),
        );
        assert.deepEqual(
          onDisk.map((recipe) => recipe.name),
          expected.map((recipe) => recipe.name),
        );
        assert.ok(!onDisk.some((recipe) => recipe.id === "alt-test"), "the removed check is gone");
        assert.ok(
          onDisk.some((recipe) => recipe.id === "smoke-new"),
          "the added check is saved",
        );
        await waitUntil(
          window,
          () => !document.querySelector('[data-testid="graph-recipe-changes"]'),
          undefined,
          "the summary to clear",
        );
        assert.equal(await T(window, "graph-recipe-discard").count(), 0, "no dirty state");
        await back(window);
        assert.equal(await T(window, "graph-new-run-unsaved-checks").count(), 0);
        const now = await draftView(window);
        assert.deepEqual([now.build[0].id, now.test[0].id], ["reviewer-build", "reviewer-test"]);
        assert.match(
          now.test[0].text,
          /\(unsaved edit\)/,
          "the row now shows the saved (renamed) check",
        );
        // Review 在 K1 实例化过定义，所以记录本身不再与 K0 相同；保存只不能带来运行、输入或模型请求。
        const after = await snapshot(isolation);
        assert.equal(after.runCount, 0, "saving admitted no run");
        assert.deepEqual(after.ledger, initial.ledger, "no native input");
        assert.equal(after.models, initial.models, "no model request");
      },
    );

    await step(
      receipt,
      "K4",
      "D. Discard names the whole list; Keep editing changes nothing; Discard resets the entire draft",
      async () => {
        await rename(window, "test", "Discard probe one");
        await back(window);
        await rename(window, "build", "Discard probe two");
        const dirty = await T(window, "graph-recipes-json").inputValue();
        const digest = await configDigest(ws);
        assert.equal(
          await T(window, "graph-recipe-discard").innerText(),
          "Discard all unsaved check edits…",
        );
        await T(window, "graph-recipe-discard").click();
        const confirmation = T(window, "graph-recipe-discard-confirmation");
        await confirmation.waitFor();
        await noDialog(window);
        const text = await confirmation.innerText();
        observe(receipt, "Discard confirmation", text);
        assert.match(
          text,
          /Every check returns to the saved checks, not only the one that is open/,
        );
        assert.match(text, /Discard probe one.*reviewer-test/s);
        assert.match(text, /Discard probe two.*reviewer-build/s);
        assert.equal(await focused(window), "graph-recipe-discard-cancel");
        await shot(isolation, window, receipt, "k-discard-confirmation", [1280, 720]);
        await shot(isolation, window, receipt, "k-discard-confirmation", [1920, 1080]);
        await T(window, "graph-recipe-discard-cancel").click(); // Keep editing
        assert.equal(
          await T(window, "graph-recipes-json").inputValue(),
          dirty,
          "Keep editing changed nothing",
        );
        await waitUntil(
          window,
          () => document.activeElement?.getAttribute("data-testid") === "graph-recipe-discard",
          undefined,
          "focus back on Discard",
        );
        await T(window, "graph-recipe-discard").click();
        await T(window, "graph-recipe-discard-confirm").click();
        await T(window, "graph-recipe-discarded").waitFor();
        const after = JSON.parse(await T(window, "graph-recipes-json").inputValue());
        assert.deepEqual(
          after.map((recipe) => recipe.name),
          (await savedOnDisk(ws)).map((recipe) => recipe.name),
          "the whole draft equals the saved list",
        );
        assert.ok(!(await T(window, "graph-recipes-json").inputValue()).includes("Discard probe"));
        assert.equal(await configDigest(ws), digest, "Discard never writes");
        assert.equal(await T(window, "graph-recipe-changes").count(), 0);
        await back(window);
        assert.equal(await T(window, "graph-new-run-unsaved-checks").count(), 0);
      },
    );

    await lateSteps({ isolation, window, receipt });
  } catch (caught) {
    error = caught;
  } finally {
    await finishReceipt(receipt, isolation, window, error);
  }
}
