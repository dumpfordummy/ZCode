// 补充观察：最终人工 gate、new request、Project setup 已保存 checks、键盘/焦点探针、zh-CN 文本长度。
// --mode=gate   : 跑到 Final human review，观察 gate / new request / setup / a11y。
// --mode=locale : 仅实例化（不执行），用 zh-CN 语言观察布局。
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createIsolation } from "../../../../scripts/graph-engineering/isolation.mjs";
import { startZ6Fixture } from "../../../../scripts/graph-engineering/z6-provider-fixture.mjs";
import { reviewerNativeResponse } from "../../../../scripts/graph-engineering/reviewer-native-responses.mjs";
import {
  prepareReviewerFixture,
  REQUEST,
} from "../../../../scripts/graph-engineering/reviewer-native-fixture.mjs";
import {
  readGraphRecord,
  selectNode,
  selectValue,
  showGraph,
} from "../../../../scripts/graph-engineering/z5-native-observe.mjs";
import { approveNativePermissionOnce } from "../../../../scripts/graph-engineering/native-permission.mjs";
import { shot, auditRoot } from "./audit-common.mjs";

const mode = process.argv.find((a) => a.startsWith("--mode="))?.slice(7) ?? "gate";
const isolation = await createIsolation({
  fixtureFactory: (workspace) => startZ6Fixture(workspace, "pass", reviewerNativeResponse),
});
const notes = { mode };
let window;
const p = mode === "locale" ? "zh" : "ex";
try {
  await prepareReviewerFixture(isolation);
  if (mode === "locale") {
    const file = path.join(isolation.home, "home", ".zcode/v2/setting.json");
    const settings = JSON.parse(await readFile(file, "utf8"));
    await writeFile(file, JSON.stringify({ ...settings, localePreference: "zh-CN" }));
  }
  window = await isolation.launch();
  await window.getByTestId("graph-engineering-open").click();
  await window.getByTestId("graph-engineering-panel").waitFor();

  // 键盘 / 语义探针：Tab 顺序、tab 语义、焦点可见性、最小点击目标
  notes.a11y = await window.evaluate(() => {
    const nav = [...document.querySelectorAll('[data-testid^="graph-view-"]')];
    const small = [...document.querySelectorAll('[data-testid="graph-engineering-panel"] button')]
      .filter((el) => el.getClientRects().length)
      .map((el) => ({
        text: (el.textContent || "").trim().slice(0, 40),
        h: Math.round(el.getBoundingClientRect().height),
      }))
      .filter((item) => item.h < 28);
    return {
      navigation: nav.map((el) => ({
        id: el.dataset.testid,
        role: el.getAttribute("role"),
        ariaSelected: el.getAttribute("aria-selected"),
        ariaCurrent: el.getAttribute("aria-current"),
        ariaPressed: el.getAttribute("aria-pressed"),
        parentRole: el.parentElement?.getAttribute("role"),
      })),
      buttonsBelow28px: small.slice(0, 30),
      landmarks: [...document.querySelectorAll("main, nav, [role=tablist], [role=region]")].map(
        (el) => el.tagName + ":" + (el.getAttribute("role") ?? ""),
      ),
    };
  });
  const stops = [];
  await window.getByTestId("graph-engineering-open").focus();
  for (let i = 0; i < 16; i += 1) {
    await window.keyboard.press("Tab");
    stops.push(
      await window.evaluate(() => {
        const el = document.activeElement;
        const style = getComputedStyle(el);
        return {
          tag: el.tagName,
          testid: el.getAttribute("data-testid"),
          text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 40),
          outline: style.outlineStyle + " " + style.outlineWidth,
          shadow: style.boxShadow === "none" ? "none" : "has-shadow",
        };
      }),
    );
  }
  notes.tabStops = stops;

  await window.getByTestId("graph-view-workflows").click();
  await selectValue(window, "graph-library-entry", "generic");
  await window.getByTestId("graph-template-parameter-request").fill(REQUEST);
  await window.getByTestId("graph-template-load-recipes").click();
  await window.locator('[data-testid="graph-recipe-read-state"][data-state="ready"]').waitFor();
  await selectValue(window, "graph-template-recipe-build", "reviewer-build");
  await selectValue(window, "graph-template-recipe-test", "reviewer-test");
  await window.getByTestId("graph-library-instantiate").click();
  await window.getByTestId("graph-name").waitFor();
  await window.getByTestId("graph-view-workflows").click();
  await window.getByTestId("graph-workflow-summary").waitFor();
  await shot(isolation, window, `${p}-01-workflows`, [
    [1280, 720],
    [1920, 1080],
  ]);
  await window.getByTestId("graph-view-setup").click();
  await window.getByTestId("graph-recipe-list").waitFor();
  await shot(isolation, window, `${p}-02-setup-list`, [
    [1280, 720],
    [1920, 1080],
  ]);
  await window.getByTestId("graph-view-design").click();
  await window.getByTestId("graph-name").waitFor();
  const repeat = window.getByTestId("graph-repeat-request");
  if (await repeat.count()) {
    await repeat.locator(":scope > summary").click();
    await shot(isolation, window, `${p}-03-design-new-request`, [[1280, 720]]);
    notes.newRequest = await repeat.innerText();
  }
  if (mode === "locale") {
    await window.getByTestId("graph-view-runs").click();
    await shot(isolation, window, `${p}-04-runs-empty`, [[1280, 720]]);
  }
  if (mode === "gate") {
    await window.getByTestId("graph-view-workflows").click();
    await window.getByTestId("graph-workflow-run").click();
    await window.getByTestId("graph-run-confirmation").waitFor({ timeout: 30000 });
    // 预检对话框：滚动到底部，观察确认动作是否可见
    const dialog = window.getByTestId("graph-run-confirmation");
    notes.preflightGeometry = await dialog.evaluate((el) => {
      const scroller = [el, ...el.querySelectorAll("*")].find(
        (n) => n.scrollHeight > n.clientHeight + 40 && getComputedStyle(n).overflowY !== "visible",
      );
      const confirm = document.querySelector('[data-testid="graph-confirm-run"]');
      const ack = document.querySelector('[data-testid="graph-preflight-ack"]');
      const rect = (n) => (n ? n.getBoundingClientRect().toJSON() : null);
      return {
        viewport: [innerWidth, innerHeight],
        dialogScrollHeight: scroller?.scrollHeight,
        dialogClientHeight: scroller?.clientHeight,
        confirm: rect(confirm),
        ack: rect(ack),
        confirmDisabled: confirm?.disabled,
      };
    });
    await shot(isolation, window, `${p}-05-preflight-top`, [[1280, 720]]);
    await window.getByTestId("graph-preflight-ack").scrollIntoViewIfNeeded();
    await shot(isolation, window, `${p}-06-preflight-bottom`, [[1280, 720]]);
    await window.getByTestId("graph-preflight-ack").setChecked(true);
    await window.getByTestId("graph-confirm-run").click();
    await showGraph(window);
    const handled = new Set();
    const deadline = Date.now() + 180000;
    let run;
    while (Date.now() < deadline) {
      run = (await readGraphRecord(isolation)).runs.at(-1);
      if (run && ["Failed", "WaitingForApproval", "NeedsHuman", "Completed"].includes(run.status))
        break;
      const pending = run
        ? [...run.nodeAttempts, ...(run.toolAttempts ?? [])].find(
            (a) => a.status === "WaitingForPermission" && !handled.has(a.attemptId),
          )
        : undefined;
      if (pending) {
        handled.add(pending.attemptId);
        await showGraph(window);
        await selectNode(window, pending.nodeId);
        await selectValue(window, "graph-attempt-select", pending.attemptId);
        await window.getByTestId("graph-open-conversation").click();
        await window
          .getByRole("option", { name: "Allow", exact: true })
          .waitFor({ timeout: 30000 });
        await approveNativePermissionOnce(window);
        await showGraph(window);
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    notes.finalStatus = run?.status;
    await showGraph(window);
    await window.getByTestId("graph-run-review-gate").click();
    await window.waitForTimeout(600);
    await shot(isolation, window, `${p}-07-final-gate`, [
      [1280, 720],
      [1920, 1080],
    ]);
    notes.gateText = await window.getByTestId("graph-engineering-panel").innerText();
    // 运行中 / 结束后再看 Workflows 与 new request：重复任务入口
    await window.getByTestId("graph-view-workflows").click();
    await shot(isolation, window, `${p}-08-workflows-after-run`, [[1280, 720]]);
    notes.workflowsAfterRun = await window.getByTestId("graph-engineering-panel").innerText();
  }
} catch (error) {
  notes.error = error.stack ?? String(error);
  if (window) await shot(isolation, window, `${p}-error`).catch(() => {});
} finally {
  await writeFile(
    path.join(auditRoot, "tools", `extras-notes-${mode}.json`),
    JSON.stringify(notes, null, 2),
  );
  await isolation.close();
  console.log(notes.error ?? "ok", notes.finalStatus ?? "", isolation.home);
}
