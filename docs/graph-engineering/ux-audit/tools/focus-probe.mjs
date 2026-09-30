// 键盘焦点探针：用真实键盘事件把焦点移到 Graph 导航，记录样式并截取该区域。
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createIsolation } from "../../../../scripts/graph-engineering/isolation.mjs";
import { startZ6Fixture } from "../../../../scripts/graph-engineering/z6-provider-fixture.mjs";
import { reviewerNativeResponse } from "../../../../scripts/graph-engineering/reviewer-native-responses.mjs";
import { prepareReviewerFixture } from "../../../../scripts/graph-engineering/reviewer-native-fixture.mjs";
import { resize, shotsDir, auditRoot } from "./audit-common.mjs";

const isolation = await createIsolation({
  fixtureFactory: (workspace) => startZ6Fixture(workspace, "pass", reviewerNativeResponse),
});
const notes = {};
try {
  await prepareReviewerFixture(isolation);
  const window = await isolation.launch();
  await window.getByTestId("graph-engineering-open").click();
  await window.getByTestId("graph-engineering-panel").waitFor();
  await resize(isolation, window, [1280, 720]);
  await window.getByRole("button", { name: /Back to chat/ }).focus();
  await window.keyboard.press("Shift"); // 标记为键盘模态，使 :focus-visible 生效
  const seq = [];
  for (let i = 0; i < 8; i += 1) {
    await window.keyboard.press("Tab");
    await window.waitForTimeout(400); // 按钮有 150ms 颜色过渡，立即读取会得到过渡起点
    seq.push(
      await window.evaluate(() => {
        const el = document.activeElement;
        const s = getComputedStyle(el);
        const box = el.getBoundingClientRect();
        return {
          testid: el.getAttribute("data-testid"),
          text: (el.textContent || "").trim().slice(0, 32),
          focusVisible: el.matches(":focus-visible"),
          outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`,
          boxShadow: s.boxShadow.slice(0, 80),
          border: `${s.borderTopWidth} ${s.borderTopColor}`,
          bg: s.backgroundColor,
          rect: [
            Math.round(box.x),
            Math.round(box.y),
            Math.round(box.width),
            Math.round(box.height),
          ],
        };
      }),
    );
  }
  notes.sequence = seq;
  await mkdir(shotsDir, { recursive: true });
  const target = seq.find((s) => s.testid === "graph-view-runs") ?? seq[2];
  await window.screenshot({
    path: path.join(shotsDir, "focus-probe-nav-1280x720.png"),
    clip: { x: 270, y: 60, width: 720, height: 90 },
  });
  notes.clipTarget = target;
} catch (error) {
  notes.error = error.stack ?? String(error);
} finally {
  await writeFile(
    path.join(auditRoot, "tools", "focus-probe-notes.json"),
    JSON.stringify(notes, null, 2),
  );
  await isolation.close();
  console.log(notes.error ?? "ok");
}
