// 录制 1280x720 的完整交互旅程（合成数据；速度为正常的 0.5 倍以便观看）。
import { _electron as electron } from "playwright-core";
import { mkdir, rename, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../..");
const audit = path.resolve(here, "..");
const videoDir = path.join(audit, "screenshots", "prototype", "_video");
await mkdir(videoDir, { recursive: true });
const app = await electron.launch({
  executablePath: path.join(root, "node_modules/electron/dist/electron.exe"),
  args: [path.join(here, "proto-main.cjs")],
  env: { ...process.env, PROTO_FILE: path.join(audit, "prototype", "index.html") },
  recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } },
});
const page = await app.firstWindow();
await page.waitForLoadState("domcontentloaded");
const win = await app.browserWindow(page);
await win.evaluate((b) => b.setContentSize(1280, 720));
await win.dispose();
await page.waitForFunction(() => innerWidth === 1280 && innerHeight === 720);
const pause = (ms) => page.waitForTimeout(ms);
await page.evaluate(() => {
  window.__proto.S.scenario = "reviewer";
  window.__proto.S.speed = 0.5;
});
await pause(1200);
await page.locator("#req").click();
await page.keyboard.type("Modify zz-demo.txt file content to after", { delay: 35 });
await pause(600);
await page.getByRole("button", { name: /Add file or skill/ }).click();
await pause(600);
await page.getByRole("button", { name: /fixture-guidance/ }).click();
await pause(800);
await page.locator("#req").focus();
await page.keyboard.press("Control+Enter");
await pause(1200);
await page
  .locator("#detail")
  .evaluate((e) => e.scrollTo({ top: e.scrollHeight, behavior: "smooth" }));
await pause(1400);
await page.locator("#ack").check();
await pause(700);
await page.locator("#go-start").click();
for (let i = 0; i < 3; i += 1) {
  await page.waitForFunction(() => window.__proto.S.runs[0].status === "needs-permission", null, {
    timeout: 30000,
  });
  await pause(1300);
  await page.locator("#needs").getByRole("button", { name: "Review in conversation" }).click();
  await pause(1300);
  await page.locator("#conv-confirm").click();
  await pause(900);
  await page.locator("#conv-return").click();
  await pause(600);
}
await page.waitForFunction(() => window.__proto.S.runs[0].status === "stopped-review", null, {
  timeout: 30000,
});
await pause(2200);
await page.getByRole("button", { name: "Inspect reviewer output" }).click();
await pause(2200);
await page.getByRole("button", { name: "Start a new request from this one" }).click();
await pause(2200);
await app.close();
const files = (await readdir(videoDir)).filter((f) => f.endsWith(".webm"));
if (files.length)
  await rename(
    path.join(videoDir, files[0]),
    path.join(audit, "screenshots", "prototype", "journey-1280x720.webm"),
  );
console.log(files.length ? "recorded" : "no video produced");
