// UX audit 的观察工具：只截图和读取 UI 文本，不修改产品状态。
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const auditRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
export let shotsDir = path.join(auditRoot, "screenshots", "audit");
export const useShotsDir = (name) => {
  shotsDir = path.join(auditRoot, "screenshots", name);
};

export async function resize(isolation, window, [width, height]) {
  const nativeWindow = await isolation.app.browserWindow(window);
  try {
    await nativeWindow.evaluate(
      (browserWindow, [w, h]) => {
        if (browserWindow.isMinimized()) browserWindow.restore();
        if (browserWindow.isMaximized()) browserWindow.unmaximize();
        browserWindow.setContentSize(w, h);
      },
      [width, height],
    );
  } finally {
    await nativeWindow.dispose();
  }
  await window.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [width, height]);
  await window.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

/** 用 BrowserWindow.capturePage 截取真实 Electron 窗口内容。 */
export async function shot(isolation, window, name, sizes = [[1280, 720]]) {
  await mkdir(shotsDir, { recursive: true });
  const files = [];
  for (const size of sizes) {
    await resize(isolation, window, size);
    await window.waitForTimeout(400); // 颜色过渡 150ms；截图前等待，避免截到过渡中的选中态
    const nativeWindow = await isolation.app.browserWindow(window);
    try {
      const png = await nativeWindow.evaluate(async (browserWindow) =>
        (await browserWindow.capturePage()).toPNG().toString("base64"),
      );
      const file = path.join(shotsDir, `${name}-${size.join("x")}.png`);
      await writeFile(file, Buffer.from(png, "base64"));
      files.push(file);
    } finally {
      await nativeWindow.dispose();
    }
  }
  return files;
}

export async function visibleTestIds(window) {
  return window.evaluate(() =>
    [...document.querySelectorAll("[data-testid]")]
      .filter((el) => el.getClientRects().length)
      .map((el) => el.getAttribute("data-testid")),
  );
}
