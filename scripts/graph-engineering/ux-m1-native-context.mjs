// UX-M1.4 journey A: the Context picker over the real Host, real workspace files, real Windows paths,
// the real native skill catalogue and the Electron file chooser (through the repository's supported
// controlled-dialog seam: the OS dialog itself is not automatable and stays on the manual checklist).
import assert from "node:assert/strict";
import path from "node:path";
import { openPicker, search, until, optionCount } from "./context-picker-helpers.mjs";
import {
  chipStatus,
  optionValues,
  pickByValue,
  popoverClosed,
} from "./ux-m1-native-context-helpers.mjs";
import { reviewAndRequired } from "./ux-m1-native-context-late.mjs";
import {
  T,
  assertUnchanged,
  chipValue,
  finishReceipt,
  flush,
  focused,
  launchUx,
  observe,
  openNewRun,
  shot,
  shotSizes,
  snapshot,
  step,
} from "./ux-m1-native-common.mjs";

export async function contextPicker() {
  const { isolation, window, receipt, files, dialogControl } = await launchUx("context-picker", {
    dialog: true,
  });
  let error;
  const ws = isolation.workspace;
  const abs = (relative) => path.join(ws, ...relative.split("/"));
  try {
    await step(receipt, "A0", "Open New run with the Sequential engineering workflow", async () => {
      await openNewRun(window);
      await T(window, "graph-library-entry").click();
      await window.locator('[role="option"][data-value="generic"]').click();
      await T(window, "graph-template-recipe-build").waitFor();
      await T(window, "graph-template-parameter-request").fill(
        "Context journey: no run is started here",
      );
      await shot(isolation, window, receipt, "a-new-run-empty-context", [1280, 720]);
    });
    const before = await snapshot(isolation);

    await step(
      receipt,
      "A1",
      "Add a real workspace file by search and keyboard: canonical path, explicit read",
      async () => {
        await pickByValue(window, { slot: "instructions", query: "Notes", includes: "Notes.md" });
        await popoverClosed(window);
        const value = await chipValue(window, "instructions");
        assert.equal(value, "docs/Notes.md", "the Host's canonical workspace-relative path");
        assert.equal(await chipStatus(window, "instructions"), "explicit-read");
        observe(receipt, "instructions chip", {
          value,
          status: await chipStatus(window, "instructions"),
        });
        await shotSizes(isolation, window, receipt, "a-selected-context", () =>
          T(window, "graph-context-chips").scrollIntoViewIfNeeded(),
        );
      },
    );

    await step(receipt, "A2", "Replace touches only that role; the notice says so", async () => {
      await openPicker(window);
      await T(window, "graph-context-slot-instructions").check();
      await T(window, "graph-context-replace-notice").waitFor();
      await search(window, "Extra");
      await until(async () => (await optionCount(window)) > 0, "results for Extra");
      const values = await optionValues(window);
      const index = values.findIndex((value) => value?.includes("Extra.md"));
      for (let count = 0; count <= index; count += 1) await window.keyboard.press("ArrowDown");
      await window.keyboard.press("Enter");
      await popoverClosed(window);
      assert.equal(await chipValue(window, "instructions"), "docs/Extra.md");
    });

    await step(receipt, "A3", "Select a real enabled skill from the native catalogue", async () => {
      await pickByValue(window, { slot: "skill", query: "fixture", includes: "fixture-guidance" });
      await popoverClosed(window);
      const value = await chipValue(window, "skill");
      // Windows：技能 id 内含带盘符的绝对路径，反斜杠原样保留。
      assert.equal(value, `glm:workspace:${abs(".agents/skills/fixture-guidance/SKILL.md")}`);
      assert.match(value, /^glm:workspace:[A-Za-z]:\\/);
      observe(receipt, "skill chip", { value, status: await chipStatus(window, "skill") });
      assert.equal(
        await chipValue(window, "instructions"),
        "docs/Extra.md",
        "the other role is untouched",
      );
    });

    await step(
      receipt,
      "A4",
      "The catalogue lists real plugin skills as well and marks their enablement",
      async () => {
        await openPicker(window);
        await T(window, "graph-context-slot-skill").check();
        await search(window, "browser");
        await until(async () => (await optionCount(window)) > 0, "browser skills listed");
        const rows = await window
          .locator('[data-testid^="graph-context-option-"]')
          .evaluateAll((items) =>
            items.map((item) => ({
              value: item.getAttribute("data-value"),
              disabled: item.getAttribute("aria-disabled") === "true",
              text: item.innerText.replace(/\s+/g, " ").trim(),
            })),
          );
        observe(
          receipt,
          "skills matching 'browser'",
          rows.map((row) => ({ text: row.text, disabled: row.disabled })),
        );
        assert.ok(rows.length > 0);
        await window.keyboard.press("Escape");
        await popoverClosed(window);
        assert.equal(
          await focused(window),
          "graph-context-add",
          "Escape returns focus to the opener",
        );
      },
    );

    await step(
      receipt,
      "A4b",
      "Native instruction (AGENTS.md) and an identical ordinary file are distinguished honestly",
      async () => {
        await openPicker(window);
        await T(window, "graph-context-slot-instructions").check();
        await search(window, "AGENTS");
        await until(async () => (await optionCount(window)) > 0, "results for AGENTS");
        const rows = await window
          .locator('[data-testid^="graph-context-option-"]')
          .evaluateAll((items) =>
            items.map((item) => ({
              value: item.getAttribute("data-value"),
              group: item.getAttribute("data-group"),
            })),
          );
        observe(receipt, "AGENTS results (value, group)", rows);
        // 目录里的原生指令条目携带带盘符的绝对路径；选中后由 Host 规范成工作区相对路径。
        const native = rows.findIndex(
          (row) => row.group === "instruction" && /[\\/]AGENTS\.md$/.test(row.value ?? ""),
        );
        assert.ok(native >= 0, "the workspace AGENTS.md is offered");
        for (let count = 0; count <= native; count += 1) await window.keyboard.press("ArrowDown");
        await window.keyboard.press("Enter");
        await popoverClosed(window);
        assert.equal(await chipValue(window, "instructions"), "AGENTS.md");
        const nativeStatus = await chipStatus(window, "instructions");
        const nativeText = await T(window, "graph-context-status-instructions").innerText();
        observe(receipt, "AGENTS.md chip", { status: nativeStatus, text: nativeText });
        assert.match(nativeStatus, /native-instructions|explicit-read/);
        // 字节相同的普通文件：仍是显式读取，绝不显示为“已作为原生指令送达”。
        await pickByValue(window, {
          slot: "instructions",
          query: "same-content",
          includes: "same-content.md",
        });
        await popoverClosed(window);
        assert.equal(await chipValue(window, "instructions"), "docs/same-content.md");
        assert.equal(await chipStatus(window, "instructions"), "explicit-read");
        observe(
          receipt,
          "identical-content ordinary file chip",
          await T(window, "graph-context-status-instructions").innerText(),
        );
      },
    );

    await step(
      receipt,
      "A5",
      "Native chooser: Windows absolute paths (backslash and forward slash) are canonicalized",
      async () => {
        const results = [];
        for (const [label, chosen] of [
          ["backslash absolute", abs("docs/Notes.md")],
          ["forward-slash absolute", abs("docs/Extra.md").replaceAll("\\", "/")],
        ]) {
          await dialogControl.set({ open: { path: chosen } });
          await openPicker(window);
          await T(window, "graph-context-slot-instructions").check();
          await T(window, "graph-context-native-picker").click();
          await popoverClosed(window);
          const value = await chipValue(window, "instructions");
          results.push({ label, chosen, value });
          assert.match(value, /^docs\/(Notes|Extra)\.md$/, `${label}: canonical relative path`);
          assert.equal(
            value,
            path.basename(chosen) === "Notes.md" ? "docs/Notes.md" : "docs/Extra.md",
          );
        }
        observe(receipt, "native chooser canonicalization", results);
      },
    );

    await step(
      receipt,
      "A6",
      "Failed selections keep the previous binding: outside the workspace, empty, oversized",
      async () => {
        const previous = await chipValue(window, "instructions");
        const cases = [];
        // 工作区外文件：经原生选择器。
        await dialogControl.set({ open: { path: files.outside } });
        await openPicker(window);
        await T(window, "graph-context-slot-instructions").check();
        await T(window, "graph-context-native-picker").click();
        await T(window, "graph-context-validation-error").waitFor();
        cases.push({
          case: "outside workspace",
          error: await T(window, "graph-context-validation-error").innerText(),
        });
        assert.equal(await chipValue(window, "instructions"), previous);
        await shot(isolation, window, receipt, "a-validation-error-outside-1280x720");
        // 空文件与超过 100 KB：经搜索结果。
        for (const [label, query, includes] of [
          ["empty file", "empty", "empty.md"],
          ["over 100 KB", "big", "big.txt"],
        ]) {
          await search(window, query);
          await until(async () => (await optionCount(window)) > 0, `results for ${query}`);
          const values = await optionValues(window);
          const index = values.findIndex((value) => value?.includes(includes));
          assert.ok(index >= 0, `${label}: listed`);
          for (let count = 0; count <= index; count += 1) await window.keyboard.press("ArrowDown");
          await window.keyboard.press("Enter");
          await T(window, "graph-context-validation-error").waitFor();
          cases.push({
            case: label,
            error: await T(window, "graph-context-validation-error").innerText(),
          });
          assert.equal(
            await chipValue(window, "instructions"),
            previous,
            `${label}: previous binding kept`,
          );
        }
        observe(receipt, "Host rejections shown beside the slot", cases);
        // 取消选择器与选择器失败：同样不改变绑定。
        await dialogControl.set({ open: { cancel: true } });
        await T(window, "graph-context-native-picker").click();
        assert.equal(
          await chipValue(window, "instructions"),
          previous,
          "cancelled chooser keeps the binding",
        );
        await dialogControl.set({ open: { fail: "Synthetic chooser failure" } });
        await T(window, "graph-context-native-picker").click();
        await flush(window);
        assert.equal(
          await chipValue(window, "instructions"),
          previous,
          "a failed chooser keeps the binding",
        );
        await window.keyboard.press("Escape");
        await popoverClosed(window);
        await dialogControl.set({});
        assertUnchanged(
          before,
          await snapshot(isolation),
          "context selection is read-only for the Host",
        );
      },
    );

    await step(receipt, "A7", "Remove an optional reference deletes only that role", async () => {
      await T(window, "graph-context-remove-skill").click();
      assert.equal(await T(window, "graph-context-chip-skill").count(), 0);
      assert.equal(await T(window, "graph-context-chip-instructions").count(), 1);
    });

    await step(
      receipt,
      "A8",
      "The draft survives Workflows and Checks and returns unchanged",
      async () => {
        const value = await chipValue(window, "instructions");
        for (const destination of ["design", "setup"]) {
          await T(window, `graph-view-${destination}`).click();
          await flush(window);
          await T(window, "graph-view-runs").click();
          await T(window, "graph-new-run").click();
          await T(window, "graph-template-parameter-request").waitFor();
          assert.equal(await chipValue(window, "instructions"), value, `after ${destination}`);
          assert.equal(
            await T(window, "graph-template-parameter-request").inputValue(),
            "Context journey: no run is started here",
          );
        }
      },
    );

    await reviewAndRequired({ isolation, window, receipt, dialogControl, abs });
  } catch (caught) {
    error = caught;
  } finally {
    await finishReceipt(receipt, isolation, window, error);
  }
}
