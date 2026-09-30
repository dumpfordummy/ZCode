// UX-M1.4 journey C, workspace switching (drafts stay with their own workspace).
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { addByKeyboard, openPicker } from "./context-picker-helpers.mjs";
import { T, chipValue, flush, observe, openNewRun, shot, step } from "./ux-m1-native-common.mjs";
import { recipes as reviewerRecipes } from "./reviewer-native-fixture.mjs";
import { draftView } from "./ux-m1-native-checks-helpers.mjs";

/** C7 and C7b: a real second workspace; each keeps its own draft. */
export async function workspaceSteps({ isolation, window, receipt, dialogControl, before }) {
  const ws = isolation.workspace;
  const switchTo = async (itemId, expectedPath) => {
    // 用户切换工作区的真实路径：离开 Graph，用该项目行上的“New task”进入那个工作区，再打开 Graph。
    const back = window.getByRole("button", { name: "Back to chat", exact: true });
    if (await back.isVisible()) await back.click();
    await window.getByTestId(itemId).hover();
    const button = await window.evaluateHandle((id) => {
      const el = [...document.querySelectorAll("[data-testid]")].find(
        (e) => e.getAttribute("data-testid") === id,
      );
      const root = el.closest("li,div[role],section") ?? el.parentElement;
      return root.parentElement.querySelector('button[aria-label="New task"]');
    }, itemId);
    await button.asElement().click();
    await T(window, "graph-engineering-open").click();
    await window.waitForFunction(
      (expected) => {
        const text = document.querySelector('[data-testid="graph-workspace"]')?.textContent ?? "";
        return text.includes(expected) && !text.includes(`${expected}-b`);
      },
      expectedPath,
      { timeout: 30000 },
    );
    await openNewRun(window);
  };
  await step(
    receipt,
    "C7",
    "Workspace switch restores each draft in its own workspace",
    async () => {
      const second = path.join(isolation.home, "workspace-b");
      await mkdir(path.join(second, ".zcode"), { recursive: true });
      await writeFile(path.join(second, "AGENTS.md"), "Second disposable workspace.\n");
      await writeFile(
        path.join(second, ".zcode/config.json"),
        JSON.stringify({ graphRecipes: reviewerRecipes }),
      );
      await mkdir(path.join(second, "docs"), { recursive: true });
      await writeFile(path.join(second, "docs/Other.md"), "Other workspace document.\n");
      await dialogControl.set({ open: { path: second } });
      await window.getByTestId("project-add").click();
      await window.getByRole("menuitem", { name: "Open folder" }).click();
      await window.locator('[data-testid^="workspace-item-"]').nth(1).waitFor();
      await dialogControl.set({});
      const items = await window
        .locator('[data-testid^="workspace-item-"]')
        .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-testid")));
      observe(receipt, "workspaces in the sidebar", items);
      const itemB = items.find((id) => id.includes("workspace-b"));
      assert.ok(itemB, "the second workspace was added");
      const itemA = items.find((id) => !id.includes("workspace-b"));
      // 添加文件夹后应用已切换到新工作区。
      await T(window, "graph-engineering-open").click();
      await openNewRun(window);
      const panelB = await T(window, "graph-workspace").innerText();
      assert.match(panelB, /workspace-b/);
      assert.equal(
        await T(window, "graph-template-parameter-request").inputValue(),
        "",
        "B starts empty",
      );
      await T(window, "graph-template-parameter-request").fill("Workspace B request");
      await addByKeyboard(window, "Other", "instructions");
      assert.equal(await chipValue(window, "instructions"), "docs/Other.md");
      await shot(isolation, window, receipt, "c-workspace-b-draft-1280x720", [1280, 720]);
      await switchTo(itemA, ws);
      assert.deepEqual(await draftView(window), before, "A's draft is restored exactly");
      await switchTo(itemB, second);
      assert.equal(
        await T(window, "graph-template-parameter-request").inputValue(),
        "Workspace B request",
      );
      assert.equal(await chipValue(window, "instructions"), "docs/Other.md");
      await switchTo(itemA, ws);
      assert.deepEqual(await draftView(window), before);
    },
  );

  await step(
    receipt,
    "C7b",
    "A native chooser reply held across a workspace switch never writes either workspace's draft",
    async () => {
      // 在 A 里打开选择器并让原生选择器挂起，然后切到 B；晚到的回复既不能写 B，也不能写回 A。
      await dialogControl.set({ open: { pending: true } });
      await openPicker(window);
      await T(window, "graph-context-slot-instructions").check();
      await T(window, "graph-context-native-picker").click();
      const items = await window
        .locator('[data-testid^="workspace-item-"]')
        .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-testid")));
      const itemB = items.find((id) => id.includes("workspace-b"));
      const second = path.join(isolation.home, "workspace-b");
      await switchTo(itemB, second);
      const bBefore = await draftView(window);
      await dialogControl.set({ open: { path: path.join(ws, "docs", "Notes.md") } });
      // 有界的静默观察（回复已释放之后）：B 的草稿不变。
      const deadline = Date.now() + 2500;
      while (Date.now() < deadline) {
        assert.deepEqual(
          await draftView(window),
          bBefore,
          "B's draft is unchanged by A's late chooser reply",
        );
        await flush(window);
      }
      await dialogControl.set({});
      const itemA = items.find((id) => !id.includes("workspace-b"));
      await switchTo(itemA, ws);
      assert.deepEqual(await draftView(window), before, "A's draft is unchanged too");
    },
  );
}
