// First-use journey: 新 profile + 无已保存 checks 的合成 workspace。不提交任何任务，不调用模型。
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createIsolation, root } from "../../../../scripts/graph-engineering/isolation.mjs";
import { startZ6Fixture } from "../../../../scripts/graph-engineering/z6-provider-fixture.mjs";
import { reviewerNativeResponse } from "../../../../scripts/graph-engineering/reviewer-native-responses.mjs";
import { shot, visibleTestIds, auditRoot } from "./audit-common.mjs";

const isolation = await createIsolation({
  fixtureFactory: (workspace) => startZ6Fixture(workspace, "pass", reviewerNativeResponse),
});
const notes = {};
let window;
try {
  window = await isolation.launch();
  await shot(isolation, window, "fu-01-chat-home");
  notes.chatHome = await window.locator("body").innerText();
  await window.getByTestId("graph-engineering-open").click();
  await window.getByTestId("graph-engineering-panel").waitFor();
  await shot(isolation, window, "fu-02-graph-landing", [
    [1280, 720],
    [1920, 1080],
  ]);
  notes.landing = await window.getByTestId("graph-engineering-panel").innerText();
  notes.landingIds = await visibleTestIds(window);
  for (const view of ["workflows", "design", "runs", "setup"]) {
    const tab = window.getByTestId(`graph-view-${view}`);
    if (await tab.count()) {
      await tab.click();
      await window.waitForTimeout(400);
      await shot(isolation, window, `fu-03-${view}`, [[1280, 720]]);
      notes[view] = await window.getByTestId("graph-engineering-panel").innerText();
      notes[`${view}Ids`] = await visibleTestIds(window);
    } else notes[view] = "TAB NOT FOUND";
  }
} catch (error) {
  notes.error = error.stack ?? String(error);
  if (window) await shot(isolation, window, "fu-error").catch(() => {});
} finally {
  await writeFile(
    path.join(auditRoot, "tools", "first-use-notes.json"),
    JSON.stringify(notes, null, 2),
  );
  await isolation.close();
  console.log(notes.error ?? "ok", isolation.home, root);
}
